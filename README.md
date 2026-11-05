# tinyDiff

[Im Browser öffnen](https://simonwaldherr.github.io/tinyDiff/) · [Quellcode](https://github.com/SimonWaldherr/tinyDiff)

Dateien und Texte vergleichen – lokal im Browser, ohne Konto, Upload oder Tracking.
Statische Website ohne Backend, npm-Installation oder CDN. Parser werden vor dem Deployment geladen.

## Funktionen

- **Text:** Wörter, Zeichen, Zeilen und Sätze; optional Leerraum oder Groß-/Kleinschreibung ignorieren.
- **Daten:** JSON, JSON Lines, XML, CSV/TSV, INI/.env und Zeilen ohne Reihenfolge. JSON/XML auch formatieren und minifizieren.
- **Quellcode:** Syntaxvergleich für Python, Go, C, C++, Rust, JavaScript und TypeScript mit lokalen Tree-sitter-Parsern.
- **Office:** Text aus DOCX, PPTX und XLSX vergleichen; Folien und Tabellenblätter direkt anspringen.
- **Bilder:** Pixel- und EXIF-Vergleich, Toleranz, proportionale Größenanpassung, Überlagerung und drehbarer Wischvergleich.
- **Dateien:** Binär-/Hex-Ansicht und Ordnervergleich mit Textvorschau.
- **Export:** Unified-Diff für Text, Differenzbild als PNG und eigenständiger HTML-Bericht. EXIF im Bericht nur nach ausdrücklicher Auswahl.

Deutsch, Englisch, Italienisch, Spanisch und Französisch; helles und dunkles Design.
**Ctrl/⌘+Enter** vergleicht, **F7 / Umschalt+F7** springt zwischen Änderungen.

## Lokal starten

```sh
npm run prepare:parsers  # einmalig mit Node.js ab Version 22, npm und tar
python3 -m http.server 8080 --bind 127.0.0.1 --directory site
```

[localhost:8080](http://localhost:8080) öffnen. ES-Module und Worker benötigen einen
Webserver; ein Doppelklick auf `index.html` genügt nicht. Nach der Vorbereitung ist zum Betrieb kein Node.js nötig.

## Datenschutz und Grenzen

Inhalte bleiben im Arbeitsspeicher des Browsers; Neuladen verwirft sie. Die Website
lädt ausschließlich eigene Dateien, einschließlich der bei Bedarf geladenen AST-Parser.
GitHub verarbeitet beim Abruf der Website übliche Verbindungsdaten.
Exportierte Berichte enthalten die verglichenen Inhalte und bei gewähltem EXIF-Export
auch mögliche GPS-Daten – vor der Weitergabe prüfen.

- Text: UTF-8, bis 2 MiB je Seite und insgesamt 20.000 Zeilen; Zeilenenden werden als LF verglichen.
- AST vergleicht Syntax an positionsabhängigen Pfaden, keine semantische Gleichheit. Keine Codeausführung, Typprüfung oder TSX-Unterstützung.
- Office vergleicht extrahierte Inhalte, kein Layout. Formeln werden nicht neu berechnet; alte und verschlüsselte Office-Formate werden nicht unterstützt.
- Bilder: bis 20 MiB und 4 Millionen Pixel je Seite; bei Animationen zählt das erste Bild. EXIF-Vergleich umfasst keine XMP-/ICC-Daten.
- Browser: aktuelle Version mit Modul-Workern, WebAssembly und `DecompressionStream`. Praktisch in Chromium geprüft; keine vollständige Safari-/Firefox- oder Barrierefreiheitsprüfung.

## Entwicklung und Veröffentlichung

```sh
npm run prepare:parsers   # feste Parser-Versionen laden und SHA-256 prüfen
npm test                 # anschließend ohne Netzwerk oder Paketinstallation
npm run test:patch       # zusätzliche Patch-Kompatibilitätsprüfung mit Git
# Browser-Prüfungen: tests/browser.html und site/ gemeinsam lokal bereitstellen
```

`site/` ist nach `prepare:parsers` die fertige Website. Der generierte Ordner
`site/vendor/` bleibt außerhalb des Repositorys. Der Workflow lädt Parser und Lizenzen
vor den Tests; im Browser kommen sie weiterhin vom eigenen Host. Der [Pages-Workflow](.github/workflows/pages.yml)
prüft Änderungen und veröffentlicht den Standardbranch unter
[simonwaldherr.github.io/tinyDiff](https://simonwaldherr.github.io/tinyDiff/).
Im Repository unter **Settings → Pages → Source** einmalig **GitHub Actions** wählen;
siehe [GitHub-Anleitung](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Lizenz

[MIT](LICENSE) · [Tree-sitter-Komponenten und Lizenzen](scripts/PARSERS.md)

Verwandtes Projekt: [git-iso-29500](https://github.com/SimonWaldherr/git-iso-29500).
