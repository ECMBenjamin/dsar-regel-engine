# Changelog

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionen nach [SemVer](https://semver.org/lang/de/).

## [8.1.0] – 2026-11-12

### Geändert
- Code in Module unter `src/` aufgeteilt; `build.js` erzeugt daraus `dist/index.html`.
- Testsuite (Node Test Runner, Headless-DOM) ins Projekt übernommen.

### Behoben
- Antworten auf ausgeblendete Folgefragen wurden nach dem Zurückändern weiter als bestätigt gewertet.
- Bestätigte Parser-Vorschläge erschienen im Evaluation State weiter als unbestätigt.
- Typwechsel ließ Parser-Vorschläge und Begründung stehen.
- Vollauskunft kündigte eine Datenkopie „anbei“ an, auch wenn keine eingebunden war.
- Doppelte Ausführung der Aktion bei schnellem Doppelklick.
- Dieselbe Datei ließ sich nicht zweimal nacheinander auswählen.
- Landesfeiertage wurden rückwirkend auf Jahre vor ihrer Einführung angewandt.

### Hinzugefügt
- SHA-256-Self-Test beim Start; bei Fehlschlag startet die Anwendung nicht.
- Hinweis zur Fristberechnung (BGB / VO 1182/71) und zu den Grenzen der Hash-Kette.
