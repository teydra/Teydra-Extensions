import assert from 'node:assert/strict';
import test from 'node:test';

import { compareVersions, validatePublisherChange } from './publisher-ownership.mjs';

function entry(version = '1.0.0') {
  return {
    manifest: {
      id: 'alice.todo',
      version,
      repository: 'https://github.com/alice/todo-extension',
      publisher: { id: 'alice', githubOwner: 'alice' },
    },
    release: { installMode: 'host-package' },
  };
}

test('SemVer-Vorrang behandelt Releases und Vorabversionen richtig', () => {
  assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta.2'), 1);
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1);
});

test('Publisher darf eine eigene Extension hinzufügen und nur mit neuer Version aktualisieren', () => {
  assert.doesNotThrow(() => validatePublisherChange({
    actor: 'Alice', path: 'entries/alice/todo.json', status: 'added', baseEntry: null,
    candidateEntry: entry(),
  }));
  assert.doesNotThrow(() => validatePublisherChange({
    actor: 'alice', path: 'entries/alice/todo.json', status: 'modified', baseEntry: entry(),
    candidateEntry: entry('1.1.0'),
  }));
  assert.throws(() => validatePublisherChange({
    actor: 'alice', path: 'entries/alice/todo.json', status: 'modified', baseEntry: entry(),
    candidateEntry: entry(),
  }), /muss neuer/);
});

test('Ein GitHub-Nutzer kann keine fremde Extension ändern', () => {
  assert.throws(() => validatePublisherChange({
    actor: 'mallory', path: 'entries/alice/todo.json', status: 'modified', baseEntry: entry(),
    candidateEntry: entry('2.0.0'),
  }), /Publisher-Eigentum/);
});

test('Identität, Repository, Installationsart und Pfad bleiben über Updates stabil', () => {
  for (const mutate of [
    (next) => { next.manifest.id = 'alice.other'; },
    (next) => { next.manifest.publisher.id = 'other'; },
    (next) => { next.manifest.repository = 'https://github.com/alice/other'; },
    (next) => { next.release.installMode = 'bundled-adapter'; },
  ]) {
    const next = structuredClone(entry('1.1.0'));
    mutate(next);
    assert.throws(() => validatePublisherChange({
      actor: 'alice', path: 'entries/alice/todo.json', status: 'modified', baseEntry: entry(),
      candidateEntry: next,
    }));
  }
  assert.throws(() => validatePublisherChange({
    actor: 'alice', path: 'entries/alice/todo.json', status: 'renamed',
    previousPath: 'entries/alice/old.json', baseEntry: entry(), candidateEntry: entry('1.1.0'),
  }), /nicht renamed|nicht verschoben/);
});
