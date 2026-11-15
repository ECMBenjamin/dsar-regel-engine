# Changelog

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionen nach [SemVer](https://semver.org/lang/de/).

## [8.4.2] – 2026-11-15

### Geändert
- Projektseite (DE/EN) übernimmt das Designsystem der Anwendung, damit Projektseite und Demo gleich aussehen; „Demo öffnen“ steht als erster Reiter.

## [8.4.1] – 2026-11-15

### Geändert
- Projektseite ruhiger gestaltet (weniger Kästen, gemeinsames Stylesheet `docs/assets/site.css`).

### Hinzugefügt
- Englische Projektseite `docs/en/index.html` mit Sprachumschalter DE/EN.
- `CHECKLISTE.md` mit allen offenen Schritten bis zur Veröffentlichung.

## [8.4.0] – 2026-11-15

### Hinzugefügt
- Projektseite `docs/index.html` für GitHub Pages; die Anwendung läuft dort unter `app/`.
- Automatischer Testlauf bei jedem Push (GitHub Actions).

## [8.3.0] – 2026-11-14

### Hinzugefügt
- Spezifikation des Rulebook-Formats `uri.rulebook/v1` (`docs/rulebook-spec.md`) mit JSON Schema und Anleitung zum Schreiben von Testfällen.
- Selbsttests im Rulebook (Feld `tests`): Sie laufen beim Laden auf einer eigenen Engine-Instanz; ein fehlschlagender Fall verhindert die Aktivierung. Ergebnis im Entwickler-Tab und als Audit-Eintrag `RULEBOOK_SELFTEST`.
- Testfälle für beide mitgelieferten Packs (14 bzw. 9), die jedes Outcome abdecken.
- Import fremder Rulebooks im Entwickler-Tab: Strukturprüfung, Selbsttests, eindeutige ID; gilt nur für die Sitzung und ist als ungeprüft gekennzeichnet. Importierte Packs erzeugen ein neutrales Entscheidungsprotokoll.
- Beispiel-Rulebook `docs/examples/example-rulebook.json`.

### Geändert
- Rulebook `dsar-gdpr-de` 1.2.0 und `breach-gdpr-de` 1.1.0: nur Testfälle ergänzt, Entscheidungen unverändert.

### Unverändert
- `src/core/engine.js` (Universal Rules Engine 8.1.0).

## [8.2.0] – 2026-11-14

### Hinzugefügt
- Zweites Rule Pack `breach-gdpr-de` für Datenpannen: Meldepflicht nach Art. 33 DSGVO, Benachrichtigung nach Art. 34 DSGVO, Mitteilung des Auftragsverarbeiters nach Art. 33 Abs. 2 und interner Vermerk nach Art. 33 Abs. 5. Die Pflichtangaben hängen von der bestätigten Faktenlage ab (verspätete Meldung, schrittweise Meldung, Ausnahmen nach Art. 34 Abs. 3).
- Parser für Vorfallberichte; er liefert nur Vorschläge und wertet „verschlüsselt“ wegen Ransomware bewusst nicht als Schutzmaßnahme.
- Auswahl des Rule Packs in der Oberfläche; Eingabefelder der Aktion werden aus dem Rulebook erzeugt.
- Gemeinsamer Ablauf für alle Aktionen (`createAction`).
- Tests, die für jedes Pack alle Antwortpfade durchspielen (53 Pfade), und ein Test, der die Engine-Datei per Hash gegen Änderungen sichert.

### Geändert
- Rulebook `dsar-gdpr-de` 1.1.0: Hinweise und Vorbelegungen der Eingabefelder stehen jetzt im Rulebook statt im HTML.
- Parser, DOM-Helfer und Aufbereitung der Datenkopie in eigene Module ausgelagert.

### Behoben
- Lange Hash-Werte und Trennlinien liefen auf schmalen Bildschirmen über den Rand.

### Unverändert
- `src/core/engine.js` (Universal Rules Engine 8.1.0).

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
