# Teydra Extensions

Öffentlicher Katalog für Extensions, die Agenten und Werkzeuge mit Teydra
verbinden. Jeder kann eine Extension in einem eigenen GitHub-Repository bauen
und sie hier per Pull Request einreichen.

Die drei eigenen Extensions **Standard**, **Claude Code** und **Codex** stehen
ebenfalls in diesem Katalog. Sie werden auf einem neuen Teydra-PC vorinstalliert,
bleiben aber wie Katalog-Extensions deaktivierbar, deinstallierbar und erneut
installierbar. Als verifizierte Teydra-Pakete durchlaufen sie denselben Download-,
Hash- und Archiv-Prüfpfad wie spätere Community-Extensions.

## Wie eine Extension in die App kommt

1. Die Extension wird als unveränderliches ZIP in einem GitHub Release veröffentlicht.
2. Ein Eintrag unter `entries/<publisher>/<name>.json` verweist auf dieses Paket.
3. Der Pull Request prüft Manifest, Paketgröße, SHA-256, Archivpfade, verbotene
   Binärdateien, verdächtige Geheimnisse und bekannte Schadsoftware.
4. Ein Mensch prüft Zweck, angeforderte Rechte und Quell-Repository.
5. Erst nach dem Merge wird der Eintrag Teil von `registry.json` und damit sichtbar.

Ein fehlgeschlagener oder noch nicht geprüfter Pull Request erscheint niemals im
Katalog. Automatische Prüfungen können Schadsoftware nicht mathematisch
ausschließen; deshalb werden fremder Code, Publisher-Vertrauen und Laufzeitrechte
als drei getrennte Grenzen behandelt.

## Vertrauen

- **Gebündelt:** Wird mit Teydra ausgeliefert. Keine Publisher-Frage.
- **Verifiziert:** Der Publisher steht in der geschützten Allowlist und das Paket
  stammt aus seinem dort gebundenen GitHub-Namensraum. Keine Publisher-Frage.
- **Nicht verifiziert:** Darf nach erfolgreicher Prüfung gelistet werden, braucht
  vor der Installation eine deutliche Zustimmung.

Auch gebündelte oder verifizierte Extensions erhalten nicht automatisch Datei-,
Netzwerk- oder Prozessrechte. Diese werden aus dem Manifest angezeigt und vom
PC zur Laufzeit begrenzt.

## Mitmachen

Die vollständige Anleitung steht in [CONTRIBUTING.md](CONTRIBUTING.md). Ein
Beispiel liegt unter [examples/todo-agent.json](examples/todo-agent.json).
Sicherheitsprobleme bitte nicht als öffentlichen Issue melden, sondern nach
[SECURITY.md](SECURITY.md).

Lizenz: MIT für den Registry-Code und die Metadaten dieses Repositories. Jede
Extension behält ihre eigene, im Manifest angegebene Lizenz.
