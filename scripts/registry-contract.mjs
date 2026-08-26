import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const REGISTRY_REPOSITORY = 'https://github.com/teydra/Teydra-Extensions';
export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

const EXTENSION_ID = /^[a-z0-9][a-z0-9-]{0,62}\.[a-z0-9][a-z0-9-]{0,62}$/;
const LOCAL_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const COMMAND = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ACCENT_COLOR = /^#[0-9a-fA-F]{6}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SAFE_MAIN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.(?:c?js|mjs)$/;

const CAPABILITIES = new Set([
  'chat',
  'models',
  'access',
  'activity',
  'skills.read',
  'skills.write',
  'custom-actions',
]);
const ICONS = new Set(['desktop', 'play', 'settings', 'sparkles']);

function plainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} enthält unbekannte Felder: ${unknown.join(', ')}.`);
}

function text(value, maximum, label) {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} ist kein gültiger kurzer Text.`);
  }
  return value;
}

function uniqueStrings(values, maximumItems, validate, label) {
  if (!Array.isArray(values) || values.length > maximumItems) {
    throw new Error(`${label} ist keine gültige Liste.`);
  }
  const parsed = values.map((value, index) => validate(value, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} enthält Duplikate.`);
  return parsed;
}

function httpsUrl(value, label) {
  const raw = text(value, 500, label);
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} muss eine HTTPS-Adresse ohne Zugangsdaten oder Fragment sein.`);
  }
  return parsed;
}

function parseOption(raw, label) {
  if (!plainObject(raw)) throw new Error(`${label} ist keine Option.`);
  exactKeys(raw, ['id', 'label', 'description'], label);
  const id = text(raw.id, 64, `${label}.id`);
  if (!LOCAL_ID.test(id)) throw new Error(`${label}.id ist ungültig.`);
  return {
    id,
    label: text(raw.label, 80, `${label}.label`),
    ...(raw.description === undefined
      ? {}
      : { description: text(raw.description, 240, `${label}.description`) }),
  };
}

function parseControl(raw, label) {
  if (!plainObject(raw)) throw new Error(`${label} ist kein Control.`);
  exactKeys(raw, ['id', 'kind', 'label', 'description', 'placement', 'icon', 'options'], label);
  const id = text(raw.id, 64, `${label}.id`);
  if (!LOCAL_ID.test(id) || raw.placement !== 'chat.composer') {
    throw new Error(`${label} hat eine ungültige ID oder Platzierung.`);
  }
  const base = {
    id,
    kind: raw.kind,
    label: text(raw.label, 80, `${label}.label`),
    ...(raw.description === undefined
      ? {}
      : { description: text(raw.description, 240, `${label}.description`) }),
    placement: 'chat.composer',
    ...(raw.icon === undefined ? {} : { icon: raw.icon }),
  };
  if (base.icon !== undefined && !ICONS.has(base.icon)) throw new Error(`${label}.icon ist unbekannt.`);
  if (raw.kind === 'action') {
    if (raw.options !== undefined) throw new Error(`${label}.options ist bei Actions nicht erlaubt.`);
    return base;
  }
  if (raw.kind !== 'choice') throw new Error(`${label}.kind ist unbekannt.`);
  if (!Array.isArray(raw.options) || raw.options.length > 50) {
    throw new Error(`${label}.options ist keine gültige Liste.`);
  }
  const options = raw.options.map((value, index) => parseOption(value, `${label}.options[${index}]`));
  if (options.length === 0) throw new Error(`${label} braucht mindestens eine Option.`);
  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new Error(`${label}.options enthält doppelte IDs.`);
  }
  return { ...base, options };
}

function parsePermissions(raw) {
  if (!plainObject(raw)) throw new Error('manifest.permissions fehlt.');
  exactKeys(raw, ['workspace', 'networkHosts', 'commands'], 'manifest.permissions');
  if (!['none', 'read', 'write'].includes(raw.workspace)) {
    throw new Error('manifest.permissions.workspace ist ungültig.');
  }
  const networkHosts = uniqueStrings(
    raw.networkHosts,
    20,
    (value, label) => {
      const host = text(value, 253, label).toLowerCase();
      if (!HOSTNAME.test(host)) throw new Error(`${label} ist kein exakter Hostname.`);
      return host;
    },
    'manifest.permissions.networkHosts',
  );
  const commands = uniqueStrings(
    raw.commands,
    20,
    (value, label) => {
      const command = text(value, 80, label);
      if (!COMMAND.test(command)) throw new Error(`${label} darf kein Pfad oder Befehlstext sein.`);
      return command;
    },
    'manifest.permissions.commands',
  );
  return { workspace: raw.workspace, networkHosts, commands };
}

export function parseManifest(raw) {
  if (!plainObject(raw)) throw new Error('manifest fehlt.');
  exactKeys(
    raw,
    [
      'id', 'protocolVersion', 'name', 'shortName', 'description', 'accentColor', 'iconUrl',
      'trust', 'capabilities', 'version',
      'publisher', 'hostApiVersion', 'main', 'categories', 'repository', 'homepage',
      'license', 'permissions', 'contributes',
    ],
    'manifest',
  );
  const id = text(raw.id, 127, 'manifest.id');
  const version = text(raw.version, 64, 'manifest.version');
  if (!EXTENSION_ID.test(id) || !SEMVER.test(version)) throw new Error('Manifest-ID oder Version ist ungültig.');
  if (raw.protocolVersion !== 1 || raw.hostApiVersion !== 1) {
    throw new Error('Nur Extension- und Host-API-Version 1 werden unterstützt.');
  }
  if (raw.trust !== 'unverified') throw new Error('Ein Eintrag darf Vertrauen nicht selbst vergeben.');
  if (!plainObject(raw.publisher) || raw.publisher.verified !== false) {
    throw new Error('Publisher müssen ungeprüft eingereicht werden.');
  }
  exactKeys(raw.publisher, ['id', 'name', 'githubOwner', 'verified'], 'manifest.publisher');
  const publisherId = text(raw.publisher.id, 63, 'manifest.publisher.id').toLowerCase();
  const githubOwner = text(raw.publisher.githubOwner, 39, 'manifest.publisher.githubOwner');
  if (!LOCAL_ID.test(publisherId) || !GITHUB_OWNER.test(githubOwner)) throw new Error('Publisher-ID oder GitHub-Owner ist ungültig.');
  if (id.split('.')[0] !== publisherId || publisherId !== githubOwner.toLowerCase()) {
    throw new Error('ID-Namensraum muss dem GitHub-Owner entsprechen.');
  }
  const capabilities = uniqueStrings(
    raw.capabilities,
    CAPABILITIES.size,
    (value, label) => {
      const capability = text(value, 40, label);
      if (!CAPABILITIES.has(capability)) throw new Error(`${label} ist unbekannt.`);
      return capability;
    },
    'manifest.capabilities',
  );
  const categories = uniqueStrings(
    raw.categories,
    10,
    (value, label) => text(value, 40, label),
    'manifest.categories',
  );
  if (!plainObject(raw.contributes)) throw new Error('manifest.contributes fehlt.');
  exactKeys(raw.contributes, ['controls'], 'manifest.contributes');
  if (!Array.isArray(raw.contributes.controls) || raw.contributes.controls.length > 30) {
    throw new Error('manifest.contributes.controls ist keine gültige Liste.');
  }
  const controls = raw.contributes.controls.map((value, index) =>
    parseControl(value, `manifest.contributes.controls[${index}]`));
  if (new Set(controls.map((control) => control.id)).size !== controls.length) {
    throw new Error('manifest.contributes.controls enthält doppelte IDs.');
  }
  const main = text(raw.main, 160, 'manifest.main');
  if (!SAFE_MAIN.test(main) || main.includes('\\')) throw new Error('manifest.main ist kein sicherer relativer JS-Pfad.');
  const repository = httpsUrl(raw.repository, 'manifest.repository');
  if (repository.hostname !== 'github.com') throw new Error('Extension-Repositories müssen auf github.com liegen.');
  const repositoryParts = repository.pathname.split('/').filter(Boolean);
  if (
    repositoryParts.length !== 2 ||
    repositoryParts[0].toLowerCase() !== githubOwner.toLowerCase() ||
    repositoryParts[1].endsWith('.git')
  ) {
    throw new Error('manifest.repository muss dem angegebenen GitHub-Owner gehören.');
  }
  return {
    id,
    protocolVersion: 1,
    name: text(raw.name, 80, 'manifest.name'),
    ...(raw.shortName === undefined ? {} : { shortName: text(raw.shortName, 20, 'manifest.shortName') }),
    description: text(raw.description, 300, 'manifest.description'),
    ...(raw.accentColor === undefined
      ? {}
      : ACCENT_COLOR.test(raw.accentColor)
        ? { accentColor: raw.accentColor.toUpperCase() }
        : (() => { throw new Error('manifest.accentColor ist ungültig.'); })()),
    ...(raw.iconUrl === undefined ? {} : { iconUrl: httpsUrl(raw.iconUrl, 'manifest.iconUrl').toString() }),
    trust: 'unverified',
    capabilities,
    version,
    publisher: {
      id: publisherId,
      name: text(raw.publisher.name, 80, 'manifest.publisher.name'),
      githubOwner,
      verified: false,
    },
    hostApiVersion: 1,
    main,
    categories,
    repository: repository.toString().replace(/\/$/, ''),
    ...(raw.homepage === undefined ? {} : { homepage: httpsUrl(raw.homepage, 'manifest.homepage').toString() }),
    license: text(raw.license, 80, 'manifest.license'),
    permissions: parsePermissions(raw.permissions),
    contributes: { controls },
  };
}

export function parseEntry(raw) {
  if (!plainObject(raw)) throw new Error('Registry-Eintrag ist kein Objekt.');
  exactKeys(raw, ['manifest', 'release'], 'Registry-Eintrag');
  const manifest = parseManifest(raw.manifest);
  if (!plainObject(raw.release)) throw new Error('release fehlt.');
  exactKeys(raw.release, ['version', 'installMode', 'downloadUrl', 'sha256', 'sizeBytes'], 'release');
  const version = text(raw.release.version, 64, 'release.version');
  const sha256 = text(raw.release.sha256, 64, 'release.sha256');
  const sizeBytes = raw.release.sizeBytes;
  if (
    version !== manifest.version ||
    !SHA256.test(sha256) ||
    (raw.release.installMode !== 'bundled-adapter' && raw.release.installMode !== 'host-package')
  ) {
    throw new Error('Release-Version, Installationsart oder SHA-256 passt nicht.');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_PACKAGE_BYTES) {
    throw new Error(`Paketgröße muss zwischen 1 und ${MAX_PACKAGE_BYTES} Bytes liegen.`);
  }
  const downloadUrl = httpsUrl(raw.release.downloadUrl, 'release.downloadUrl');
  const repository = new URL(manifest.repository);
  const releasePrefix = `${repository.pathname}/releases/download/`;
  if (downloadUrl.hostname !== 'github.com' || !downloadUrl.pathname.startsWith(releasePrefix)) {
    throw new Error('Release-Asset muss aus demselben GitHub-Repository stammen.');
  }
  return {
    manifest,
    release: {
      version,
      installMode: raw.release.installMode,
      downloadUrl: downloadUrl.toString(),
      sha256,
      sizeBytes,
    },
  };
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function findEntryFiles(directory) {
  const found = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, item.name);
    if (item.isDirectory()) found.push(...(await findEntryFiles(full)));
    else if (item.isFile() && item.name.endsWith('.json')) found.push(full);
  }
  return found.sort();
}

export function parseTrustedPublishersPolicy(raw) {
  if (!plainObject(raw)) throw new Error('Publisher-Policy ist kein Objekt.');
  exactKeys(raw, ['schemaVersion', 'publishers'], 'Publisher-Policy');
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.publishers) || raw.publishers.length > 1000) {
    throw new Error('Publisher-Policy ist ungültig.');
  }
  const publishers = raw.publishers.map((publisher, index) => {
    const label = `Publisher-Policy.publishers[${index}]`;
    if (!plainObject(publisher)) throw new Error(`${label} ist kein Objekt.`);
    exactKeys(publisher, ['id', 'name', 'githubOwners', 'reason'], label);
    const id = text(publisher.id, 63, `${label}.id`).toLowerCase();
    if (!LOCAL_ID.test(id)) throw new Error(`${label}.id ist ungültig.`);
    const githubOwners = uniqueStrings(
      publisher.githubOwners,
      20,
      (value, ownerLabel) => {
        const owner = text(value, 39, ownerLabel);
        if (!GITHUB_OWNER.test(owner)) throw new Error(`${ownerLabel} ist ungültig.`);
        return owner.toLowerCase();
      },
      `${label}.githubOwners`,
    );
    if (githubOwners.length === 0) throw new Error(`${label}.githubOwners darf nicht leer sein.`);
    return {
      id,
      name: text(publisher.name, 80, `${label}.name`),
      githubOwners,
      reason: text(publisher.reason, 300, `${label}.reason`),
    };
  });
  if (new Set(publishers.map((publisher) => publisher.id)).size !== publishers.length) {
    throw new Error('Publisher-Policy enthält doppelte IDs.');
  }
  return { schemaVersion: 1, publishers };
}

export function parseBlockedExtensionsPolicy(raw) {
  if (!plainObject(raw)) throw new Error('Blocklist-Policy ist kein Objekt.');
  exactKeys(raw, ['schemaVersion', 'blocked'], 'Blocklist-Policy');
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.blocked) || raw.blocked.length > 10_000) {
    throw new Error('Blocklist-Policy ist ungültig.');
  }
  const blocked = raw.blocked.map((entry, index) => {
    const label = `Blocklist-Policy.blocked[${index}]`;
    if (!plainObject(entry)) throw new Error(`${label} ist kein Objekt.`);
    exactKeys(entry, ['id', 'reason'], label);
    const id = text(entry.id, 127, `${label}.id`);
    if (!EXTENSION_ID.test(id)) throw new Error(`${label}.id ist ungültig.`);
    return { id, reason: text(entry.reason, 300, `${label}.reason`) };
  });
  if (new Set(blocked.map((entry) => entry.id)).size !== blocked.length) {
    throw new Error('Blocklist-Policy enthält doppelte IDs.');
  }
  return { schemaVersion: 1, blocked };
}

export function applyTrust(entry, policy) {
  const publisher = policy.publishers.find((candidate) => candidate.id === entry.manifest.publisher.id);
  const owner = entry.manifest.publisher.githubOwner.toLowerCase();
  const verified = publisher?.githubOwners.some((candidate) => candidate.toLowerCase() === owner) === true;
  return {
    ...entry,
    manifest: {
      ...entry.manifest,
      trust: verified ? 'verified' : 'unverified',
      publisher: { ...entry.manifest.publisher, verified },
    },
  };
}

export function registrySnapshot(entries) {
  const revision = createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 16);
  return {
    schemaVersion: 1,
    revision,
    source: { kind: 'github', repository: REGISTRY_REPOSITORY },
    entries,
  };
}

export function blocklistSnapshot(blocked) {
  const revision = createHash('sha256').update(JSON.stringify(blocked)).digest('hex').slice(0, 16);
  return { schemaVersion: 1, revision, blocked };
}
