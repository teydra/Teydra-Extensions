import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyTrust,
  parseBlockedExtensionsPolicy,
  parseEntry,
  parseTrustedPublishersPolicy,
  readJson,
  registrySnapshot,
} from './registry-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const example = await readJson(join(root, 'examples', 'todo-agent.json'));

test('Beispieleintrag erfüllt den Vertrag', () => {
  assert.equal(parseEntry(example).manifest.id, 'example.todo-agent');
});

test('Ein Publisher kann Vertrauen nicht selbst vergeben', () => {
  const changed = structuredClone(example);
  changed.manifest.trust = 'verified';
  changed.manifest.publisher.verified = true;
  assert.throws(() => parseEntry(changed), /Vertrauen|ungeprüft/);
});

test('Release und Repository müssen demselben GitHub-Owner gehören', () => {
  const changed = structuredClone(example);
  changed.release.downloadUrl =
    'https://github.com/another/todo-agent/releases/download/v1.0.0/todo-agent.zip';
  assert.throws(() => parseEntry(changed), /demselben GitHub-Repository/);
});

test('Doppelte Control- und Options-IDs werden abgelehnt', () => {
  const duplicateOption = structuredClone(example);
  duplicateOption.manifest.contributes.controls[0].options[1].id = 'short';
  assert.throws(() => parseEntry(duplicateOption), /doppelte IDs/);

  const duplicateControl = structuredClone(example);
  duplicateControl.manifest.contributes.controls.push(
    structuredClone(duplicateControl.manifest.contributes.controls[0]),
  );
  assert.throws(() => parseEntry(duplicateControl), /doppelte IDs/);
});

test('Vertrauen wird nur aus der geschützten Policy und dem passenden Owner abgeleitet', () => {
  const entry = parseEntry(example);
  const matching = parseTrustedPublishersPolicy({
    schemaVersion: 1,
    publishers: [{
      id: 'example',
      name: 'Example',
      githubOwners: ['example'],
      reason: 'Test-Publisher',
    }],
  });
  assert.equal(applyTrust(entry, matching).manifest.publisher.verified, true);

  const wrongOwner = structuredClone(matching);
  wrongOwner.publishers[0].githubOwners = ['someone-else'];
  assert.equal(applyTrust(entry, wrongOwner).manifest.publisher.verified, false);
});

test('Policies und Registry-Ausgabe sind strikt und deterministisch', () => {
  assert.throws(
    () => parseTrustedPublishersPolicy({ schemaVersion: 1, publishers: [], extra: true }),
    /unbekannte Felder/,
  );
  assert.deepEqual(
    parseBlockedExtensionsPolicy({ schemaVersion: 1, blocked: [] }),
    { schemaVersion: 1, blocked: [] },
  );
  const entries = [parseEntry(example)];
  assert.deepEqual(registrySnapshot(entries), registrySnapshot(entries));
});
