# Sicherheit

Bitte Sicherheitslücken nicht als öffentlichen Issue und nicht in einem Pull
Request mit Exploit veröffentlichen.

Melde sie über GitHubs private Sicherheitsmeldung unter **Security → Advisories →
New draft security advisory** in diesem Repository. Falls das nicht möglich ist,
verwende die Kontaktadresse aus dem Profil des Repository-Owners.

## Reaktion auf schädliche Extensions

Bestätigte schädliche oder kompromittierte Extensions werden in
`policy/blocked-extensions.json` eingetragen. Der veröffentlichte Katalog enthält
sie danach nicht mehr. Teydra-PCs sollen die Blockliste zusätzlich abrufen und
bereits installierte Treffer deaktivieren, bevor deren Code erneut startet.

Automatische Scanner sind eine Filterstufe, kein Unbedenklichkeitsbeweis. Eine
Extension läuft deshalb ausschließlich am PC, nie im Handy, und erhält nur die
zur Laufzeit ausdrücklich erlaubten Rechte.
