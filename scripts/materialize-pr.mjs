import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const token = process.env.GITHUB_TOKEN;
if (!event.pull_request || !token) throw new Error('Pull-Request-Ereignis oder GitHub-Token fehlt.');

const actor = String(event.pull_request.user?.login ?? '').toLowerCase();
const protectedActors = new Set(['teydra', 'dependabot[bot]']);
const headRepository = event.pull_request.head.repo.full_name;
const headSha = event.pull_request.head.sha;
const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Teydra-Registry-Review/1',
};

async function github(path) {
  const response = await fetch(`${api}${path}`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`);
  return response.json();
}

async function content(path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const value = await github(`/repos/${headRepository}/contents/${encodedPath}?ref=${headSha}`);
  if (Array.isArray(value) || value.type !== 'file' || value.encoding !== 'base64') {
    throw new Error(`Pull-Request-Datei ist nicht lesbar: ${path}`);
  }
  return Buffer.from(value.content.replace(/\s/g, ''), 'base64');
}

const files = [];
for (let page = 1; page <= 4; page += 1) {
  const batch = await github(
    `/repos/${event.repository.full_name}/pulls/${event.pull_request.number}/files?per_page=100&page=${page}`,
  );
  files.push(...batch);
  if (batch.length < 100) break;
}
if (files.length === 0 || files.length > 300) throw new Error('Pull Request hat keine oder zu viele Dateien.');

const entryPattern = /^entries\/[a-z0-9][a-z0-9-]{0,62}\/[a-z0-9][a-z0-9-]{0,62}\.json$/;
const entryFiles = files.filter((file) => entryPattern.test(file.filename));
const registryFile = files.find((file) => file.filename === 'registry.json');
const unexpected = files.filter(
  (file) => !entryPattern.test(file.filename) && file.filename !== 'registry.json',
);
if (unexpected.length > 0 && !protectedActors.has(actor)) {
  throw new Error(`Community-Pull-Requests dürfen nur entries/**/*.json und registry.json ändern: ${unexpected.map((file) => file.filename).join(', ')}`);
}
if (entryFiles.some((file) => file.status === 'removed')) {
  throw new Error('Community-Einreichungen dürfen bestehende Extensions nicht löschen. Nutze eine Sicherheitsmeldung.');
}
if (entryFiles.length > 0 && !registryFile) {
  throw new Error('registry.json fehlt. Bitte npm run build ausführen und mit einchecken.');
}

const candidateEntries = join(root, 'candidate-entries');
await cp(join(root, 'entries'), candidateEntries, { recursive: true });
for (const file of entryFiles) {
  const relativePath = file.filename.slice('entries/'.length);
  const target = join(candidateEntries, ...relativePath.split('/'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await content(file.filename));
}
if (registryFile) await writeFile(join(root, 'candidate-registry.json'), await content('registry.json'));
else await cp(join(root, 'registry.json'), join(root, 'candidate-registry.json'));
await writeFile(
  join(root, 'candidate-changed.json'),
  `${JSON.stringify(entryFiles.map((file) => file.filename), null, 2)}\n`,
  'utf8',
);
process.stdout.write(`PR als Datenmaterial vorbereitet: ${entryFiles.length} Extension-Einträge.\n`);
