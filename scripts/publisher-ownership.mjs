const ENTRY_PATH = /^entries\/([a-z0-9][a-z0-9-]{0,62})\/([a-z0-9][a-z0-9-]{0,62})\.json$/;

function comparableVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) throw new Error(`Ungültige Version: ${value}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  };
}

export function compareVersions(left, right) {
  const a = comparableVersion(left);
  const b = comparableVersion(right);
  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) return Math.sign(a.core[index] - b.core[index]);
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length === 0 ? 1 : -1;
  }
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Math.sign(Number(leftPart) - Number(rightPart));
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function unchanged(label, before, after) {
  if (before !== after) throw new Error(`${label} darf bei einem Update nicht geändert werden.`);
}

/**
 * Ein Pull Request darf nur den Namensraum seines GitHub-Autors verändern.
 * Der Registry-Maintainer kann Einträge sperren, aber keine fremde Version als
 * deren Publisher unterschieben; damit bleibt die Herkunftskette überprüfbar.
 */
export function validatePublisherChange({ actor, path, status, previousPath, baseEntry, candidateEntry }) {
  const normalizedActor = String(actor).toLowerCase();
  const match = ENTRY_PATH.exec(path);
  if (!match) throw new Error(`Ungültiger Extension-Pfad: ${path}`);
  if (status !== 'added' && status !== 'modified') {
    throw new Error(`Extension-Einträge dürfen nicht ${status} werden; nur Hinzufügen und Aktualisieren sind erlaubt.`);
  }
  if (previousPath) throw new Error('Extension-Einträge dürfen nicht verschoben oder umbenannt werden.');

  const [, pathOwner, pathName] = match;
  const publisherOwner = candidateEntry.manifest.publisher.githubOwner.toLowerCase();
  const [publisherId, extensionName] = candidateEntry.manifest.id.split('.');
  if (
    normalizedActor !== publisherOwner ||
    pathOwner !== publisherOwner ||
    publisherId !== publisherOwner ||
    pathName !== extensionName
  ) {
    throw new Error(
      `Publisher-Eigentum verletzt: ${normalizedActor} darf nur entries/${normalizedActor}/<name>.json für den eigenen GitHub-Namensraum ändern.`,
    );
  }

  if (!baseEntry) {
    if (status !== 'added') throw new Error('Ein Update verweist auf keinen vorhandenen Registry-Eintrag.');
    return;
  }
  if (status !== 'modified') throw new Error('Eine vorhandene Extension muss als Update geändert werden.');

  unchanged('manifest.id', baseEntry.manifest.id, candidateEntry.manifest.id);
  unchanged('publisher.id', baseEntry.manifest.publisher.id, candidateEntry.manifest.publisher.id);
  unchanged(
    'publisher.githubOwner',
    baseEntry.manifest.publisher.githubOwner.toLowerCase(),
    candidateEntry.manifest.publisher.githubOwner.toLowerCase(),
  );
  unchanged('manifest.repository', baseEntry.manifest.repository, candidateEntry.manifest.repository);
  unchanged('release.installMode', baseEntry.release.installMode, candidateEntry.release.installMode);
  if (compareVersions(candidateEntry.manifest.version, baseEntry.manifest.version) <= 0) {
    throw new Error(
      `Update-Version ${candidateEntry.manifest.version} muss neuer als ${baseEntry.manifest.version} sein.`,
    );
  }
}
