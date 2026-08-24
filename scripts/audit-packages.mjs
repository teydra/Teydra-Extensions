import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  MAX_PACKAGE_BYTES,
  findEntryFiles,
  parseEntry,
  parseManifest,
  readJson,
} from './registry-contract.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auditRoot = join(root, '.registry-audit');
const unpackedRoot = join(auditRoot, 'unpacked');
const MAX_UNPACKED_BYTES = 150 * 1024 * 1024;
const MAX_FILES = 2000;
const FORBIDDEN_SUFFIXES = [
  '.exe', '.dll', '.so', '.dylib', '.node', '.msi', '.appx', '.apk', '.jar',
  '.ps1', '.bat', '.cmd', '.com', '.scr', '.vbs', '.sh', '.bash', '.zsh',
  '.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz',
];
const TEXT_SUFFIXES = ['.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.yml', '.yaml'];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/,
];

function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  const value = process.argv[at + 1];
  if (!value) throw new Error(`${name} braucht einen Pfad.`);
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function safeArchivePath(path) {
  if (
    !path ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    /^[A-Za-z]:/.test(path) ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    return false;
  }
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== '.' && part !== '..');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

async function download(entry, zipPath) {
  const response = await fetch(entry.release.downloadUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'Teydra-Extension-Audit/1' },
  });
  if (!response.ok) throw new Error(`Download fehlgeschlagen: HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PACKAGE_BYTES) throw new Error('Paket ist laut Server zu groß.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== entry.release.sizeBytes) throw new Error('Geladene Paketgröße stimmt nicht mit dem Eintrag überein.');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== entry.release.sha256) throw new Error('Geladene SHA-256 stimmt nicht mit dem Eintrag überein.');
  await writeFile(zipPath, bytes);
}

async function inspectArchive(zipPath) {
  let namesOutput;
  let detailOutput;
  let listOutput;
  try {
    namesOutput = (await run('unzip', ['-Z1', zipPath], { maxBuffer: 4 * 1024 * 1024 })).stdout;
    detailOutput = (await run('zipinfo', ['-l', zipPath], { maxBuffer: 8 * 1024 * 1024 })).stdout;
    listOutput = (await run('unzip', ['-l', zipPath], { maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch {
    throw new Error('ZIP-Inhalt konnte nicht sicher aufgelistet werden.');
  }
  const names = namesOutput.split(/\r?\n/).filter(Boolean);
  if (names.length === 0 || names.length > MAX_FILES) throw new Error('ZIP enthält keine oder zu viele Dateien.');
  const folded = new Set();
  for (const name of names) {
    if (!safeArchivePath(name)) throw new Error(`Unsicherer ZIP-Pfad: ${name}`);
    const key = name.replaceAll('\\', '/').toLowerCase();
    if (folded.has(key)) throw new Error(`Doppelter ZIP-Pfad: ${name}`);
    folded.add(key);
  }
  if (detailOutput.split(/\r?\n/).some((line) => /^l[rwx-]{9}\s/.test(line))) {
    throw new Error('Symlinks sind in Extension-Paketen nicht erlaubt.');
  }
  let total = 0;
  let listed = 0;
  for (const line of listOutput.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(.+)$/);
    if (!match) continue;
    total += Number(match[1]);
    listed += 1;
  }
  if (listed === 0 || total > MAX_UNPACKED_BYTES) throw new Error('Entpackte Größe fehlt oder überschreitet die Grenze.');
  return names;
}

async function walk(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, item.name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error(`Symlink nach dem Entpacken gefunden: ${relative(directory, full)}`);
    if (info.isDirectory()) files.push(...(await walk(full)));
    else if (info.isFile()) files.push({ path: full, size: info.size });
    else throw new Error('Unbekannter Dateityp im Paket.');
  }
  return files;
}

async function inspectFiles(entry, directory) {
  const files = await walk(directory);
  if (files.length === 0 || files.length > MAX_FILES) throw new Error('Entpacktes Paket hat keine oder zu viele Dateien.');
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_UNPACKED_BYTES) throw new Error('Entpacktes Paket überschreitet die Größenbegrenzung.');
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (FORBIDDEN_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
      throw new Error(`Verbotener Dateityp: ${relative(directory, file.path)}`);
    }
    if (!TEXT_SUFFIXES.some((suffix) => lower.endsWith(suffix)) || file.size > 2 * 1024 * 1024) continue;
    const content = await readFile(file.path, 'utf8');
    if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
      throw new Error(`Mögliches Geheimnis in ${relative(directory, file.path)}.`);
    }
  }
  const packageManifest = parseManifest(await readJson(join(directory, 'extension.json')));
  if (JSON.stringify(canonical(packageManifest)) !== JSON.stringify(canonical(entry.manifest))) {
    throw new Error('extension.json im Paket entspricht nicht dem Registry-Eintrag.');
  }
  const mainPath = resolve(directory, ...entry.manifest.main.split('/'));
  if (!mainPath.startsWith(`${resolve(directory)}${sep}`)) throw new Error('Haupteinstieg verlässt das Paket.');
  const mainInfo = await lstat(mainPath);
  if (!mainInfo.isFile()) throw new Error('Der deklarierte Haupteinstieg fehlt.');
  try {
    const packageJson = await readJson(join(directory, 'package.json'));
    const scripts = packageJson?.scripts;
    for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
      if (scripts?.[name] !== undefined) throw new Error(`npm-Lifecycle-Skript ${name} ist nicht erlaubt.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const entriesDirectory = argument('--entries', join(root, 'entries'));
const changedPath = argument('--changed', null);
let files = await findEntryFiles(entriesDirectory);
if (changedPath) {
  const changed = await readJson(changedPath);
  if (!Array.isArray(changed)) throw new Error('Changed-Liste ist ungültig.');
  const wanted = new Set(changed.map((path) => path.replace(/^entries\//, '').replaceAll('/', sep)));
  files = files.filter((file) => wanted.has(relative(entriesDirectory, file)));
}

await rm(auditRoot, { recursive: true, force: true });
await mkdir(unpackedRoot, { recursive: true });
for (const file of files) {
  const entry = parseEntry(await readJson(file));
  const extensionRoot = join(unpackedRoot, entry.manifest.id);
  await mkdir(extensionRoot, { recursive: true });
  const zipPath = join(auditRoot, `${entry.manifest.id}.zip`);
  await download(entry, zipPath);
  await inspectArchive(zipPath);
  try {
    await run('unzip', ['-qq', zipPath, '-d', extensionRoot], { maxBuffer: 4 * 1024 * 1024 });
  } catch {
    throw new Error(`Paket ${entry.manifest.id} konnte nicht sicher entpackt werden.`);
  }
  await inspectFiles(entry, extensionRoot);
  process.stdout.write(`Paket geprüft: ${entry.manifest.id}\n`);
}
process.stdout.write(`Paketprüfung abgeschlossen: ${files.length} Pakete.\n`);
