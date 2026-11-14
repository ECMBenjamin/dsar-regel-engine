# DSAR Regel-Engine

**Powered by Universal Rules Infrastructure**

Deterministische Regel-Engine für DSGVO-Pflichten. Regeln entscheiden, Aktionen setzen durch: Ein Dokument entsteht erst, wenn die Engine die Aktion freigibt.

## Rule Packs

| Pack | Inhalt | Ergebnis der Aktion |
|---|---|---|
| `dsar-gdpr-de` | Betroffenenanfragen: Auskunft (Art. 15), Löschung (Art. 17), Fristverlängerung (Art. 12 Abs. 3) | Antwortschreiben an die betroffene Person |
| `breach-gdpr-de` | Datenpannen: Meldung an die Aufsichtsbehörde (Art. 33), Benachrichtigung der Betroffenen (Art. 34) | Meldungsentwurf, Benachrichtigung bzw. öffentliche Bekanntmachung und interner Vermerk nach Art. 33 Abs. 5 |

Beide Packs laufen auf derselben Engine. Das zweite Pack kam hinzu, ohne die Engine zu ändern; ein Test prüft das über den SHA-256-Hash von `src/core/engine.js`.

Ausgeliefert wird eine einzige HTML-Datei ohne Abhängigkeiten, die vollständig offline im Browser läuft: [`dist/index.html`](dist/index.html).

> Workflow-Assistent, keine Rechtsberatung.

## Benutzen

`dist/index.html` im Browser öffnen. Es wird nichts installiert und nichts übertragen.

## Aufbau

| Baustein | Datei | Aufgabe |
|---|---|---|
| Rulebooks | `src/rulepacks/` | Regeln, Quellen und Outcomes als reine Daten, eine Datei je Pack |
| Rules Engine | `src/core/engine.js` | Lädt und prüft ein Rulebook, wertet Fakten aus, entscheidet `PERMITTED` / `MANUAL_REVIEW` / `BLOCKED`, schreibt den Audit-Log |
| Crypto | `src/core/crypto.js` | SHA-256, kanonisches JSON, Self-Test |
| Actions | `src/actions/` | Gemeinsamer Ablauf (`create-action.js`: freigeben, erzeugen, hashen, protokollieren) und die Textbausteine je Pack |
| Parser | `src/ingestion/` | Vorschläge aus E-Mail bzw. Vorfallbericht; nie Fakten |
| Fristenrechner | `src/domain/deadline.js` | Monatsfrist mit Wochenend- und Feiertagslogik für 16 Bundesländer |
| Oberfläche | `src/ui/` | HTML, CSS, Anbindung an das DOM; `packs.js` registriert die Packs |

Die Engine enthält keine DSGVO-Logik. Ein weiteres Rechtsgebiet ist ein weiteres Rulebook.

### Ein neues Rule Pack hinzufügen

1. Rulebook unter `src/rulepacks/` anlegen (Regeln, Outcomes, Aktion mit Eingabefeldern).
2. Textbausteine unter `src/actions/` mit `createAction()` definieren.
3. Optional einen Parser unter `src/ingestion/` schreiben.
4. Das Pack in `src/ui/packs.js` eintragen und die Dateien in `build.js` aufnehmen.

Die Tests in `test/rulepacks.test.js` gelten automatisch für jedes eingetragene Pack: Jeder mögliche Antwortpfad muss in einem Outcome enden und ein lückenloses Dokument erzeugen.

## Entwickeln

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install     # nur für die Tests (Headless-DOM)
npm run build   # erzeugt dist/index.html aus src/
npm test        # baut und führt alle Tests aus
```

Der Build ist ein kurzes Skript ohne Bundler (`build.js`): Die Module werden in fester Reihenfolge zusammengefügt. `dist/index.html` wird nicht von Hand bearbeitet.

## Grenzen

- Die Hash-Kette des Audit Trails erkennt nachträgliche Änderungen, ist aber nicht signiert und liegt bis zum Export nur im Arbeitsspeicher des Browsers.
- Die Fristberechnung ist ein Orientierungswert nach BGB / VO 1182/71.
- Zwei Einträge der Fallbeispiel-Datenbank sind als „Fundstelle ungeprüft“ markiert.

## Lizenz

MIT, siehe [LICENSE](LICENSE). Entwickelt mit AI-Unterstützung.

Änderungen: [CHANGELOG.md](CHANGELOG.md).
