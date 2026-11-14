# DSAR Regel-Engine

**Powered by Universal Rules Infrastructure**

Deterministische Regel-Engine für DSGVO-Betroffenenanfragen (Auskunft nach Art. 15, Löschung nach Art. 17, Fristverlängerung nach Art. 12 Abs. 3). Regeln entscheiden, Aktionen setzen durch: Das Antwortschreiben entsteht erst, wenn die Engine die Aktion freigibt.

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
