# Eine Extension einreichen

## Voraussetzungen

- Eigenes öffentliches GitHub-Repository für die Extension.
- Ein unveränderliches ZIP als GitHub-Release-Asset.
- Im ZIP liegen `extension.json` und der gebaute Code; Installationsskripte und
  native Binärdateien sind in Version 1 nicht erlaubt.
- Die Extension führt erst nach einer ausdrücklichen Nutzeraktion etwas aus.

## Ablauf

1. Repository forken.
2. `examples/todo-agent.json` nach `entries/<publisher>/<name>.json` kopieren.
3. IDs, Beschreibung, Rechte, Release-Adresse, Paketgröße und SHA-256 ersetzen.
4. `npm run build` ausführen und das aktualisierte `registry.json` mit einchecken.
5. `npm run check` ausführen.
6. Pull Request öffnen und die Prüfliste vollständig beantworten.

Die stabile ID lautet `<publisher>.<name>`. `publisher.id` entspricht dem
kleingeschriebenen GitHub-Owner des Extension-Repositories. Eine ID wird nach
dem ersten Merge nicht umbenannt; Anzeigename und Beschreibung dürfen sich ändern.

## Was die Prüfung ablehnt

- HTTP-Downloads, mutable Branch-/Raw-Links oder Releases aus einem anderen Repository.
- Falsche Größe oder SHA-256.
- Absolute Archivpfade, `..`, Symlinks oder übergroße Archive.
- `.exe`, `.dll`, `.so`, `.dylib`, `.node`, Shell-/PowerShell-/Batch-Dateien.
- npm-Lifecycle-Skripte wie `preinstall`, `install`, `postinstall` oder `prepare`.
- Offensichtliche private Schlüssel oder bekannte Token-Formate.
- Ein Manifest im ZIP, das nicht exakt zum Registry-Eintrag passt.
- Publisher, die sich selbst als verifiziert oder gebündelt markieren.

## Verifizierung

Verifizierung ist keine Checkbox im Pull Request. Nur Maintainer ändern
`policy/trusted-publishers.json`. Dabei wird ein Publisher an einen oder mehrere
GitHub-Owner gebunden. Eine verifizierte Extension muss aus genau einem dieser
Repositories und Release-Namensräume stammen.

Verifizierung ersetzt keine Rechteprüfung und ist kein Versprechen, dass Code
fehlerfrei ist. Sie bedeutet: bekannte Herkunft, menschlich geprüft und von uns
ausdrücklich freigegeben.
