import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyTrust,
  blocklistSnapshot,
  findEntryFiles,
  parseBlockedExtensionsPolicy,
  parseEntry,
  parseTrustedPublishersPolicy,
  readJson,
  registrySnapshot,
} from './registry-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  const value = process.argv[at + 1];
  if (!value) throw new Error(`${name} braucht einen Pfad.`);
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

const entriesDirectory = argument('--entries', join(root, 'entries'));
const outputPath = argument('--output', join(root, 'registry.json'));
const checkOnly = process.argv.includes('--check');
const policy = parseTrustedPublishersPolicy(await readJson(join(root, 'policy', 'trusted-publishers.json')));
const blockedPolicy = parseBlockedExtensionsPolicy(await readJson(join(root, 'policy', 'blocked-extensions.json')));

const blockedIds = new Set(blockedPolicy.blocked.map((entry) => entry.id));
const entries = [];
for (const file of await findEntryFiles(entriesDirectory)) {
  const parsed = parseEntry(await readJson(file));
  if (!blockedIds.has(parsed.manifest.id)) entries.push(applyTrust(parsed, policy));
}
entries.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
const ids = entries.map((entry) => entry.manifest.id);
if (new Set(ids).size !== ids.length) throw new Error('Doppelte Extension-ID in der Registry.');

const serialized = `${JSON.stringify(registrySnapshot(entries), null, 2)}\n`;
if (checkOnly) {
  const existing = await readFile(outputPath, 'utf8');
  if (existing !== serialized) throw new Error('registry.json ist nicht deterministisch aus entries/ gebaut. npm run build ausführen.');
} else {
  await writeFile(outputPath, serialized, 'utf8');
}

if (entriesDirectory === join(root, 'entries') && outputPath === join(root, 'registry.json')) {
  const blocklist = `${JSON.stringify(blocklistSnapshot(blockedPolicy.blocked), null, 2)}\n`;
  const blocklistPath = join(root, 'blocklist.json');
  if (checkOnly) {
    if ((await readFile(blocklistPath, 'utf8')) !== blocklist) throw new Error('blocklist.json ist veraltet. npm run build ausführen.');
  } else {
    await writeFile(blocklistPath, blocklist, 'utf8');
  }
}

process.stdout.write(`Registry geprüft: ${entries.length} sichtbare Extensions.\n`);
