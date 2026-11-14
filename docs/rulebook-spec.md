# Rulebook-Format `uri.rulebook/v1`

Ein Rulebook beschreibt ein Rechtsgebiet oder eine Richtlinie vollständig als Daten: welche Fragen gestellt werden, wie die Antworten das Risiko beeinflussen, welche Entscheidung daraus folgt und welche Aktion sie freigibt. Die Engine (`src/core/engine.js`) führt Rulebooks nur aus; sie enthält selbst keine Fachlogik.

- Maschinenlesbare Strukturbeschreibung: [`rulebook.schema.json`](rulebook.schema.json) (JSON Schema 2020-12).
- Maßgeblich zur Laufzeit ist `UniversalRulesEngine.validateRulebook()`. Sie prüft zusätzlich die Querbezüge, die ein Schema nicht ausdrücken kann (siehe Abschnitt 7).
- Vollständiges Beispiel zum Ausprobieren: [`examples/example-rulebook.json`](examples/example-rulebook.json). Es lässt sich im Entwickler-Tab der Anwendung importieren.

Ein Rulebook muss `JSON.stringify` unverändert überstehen: keine Funktionen, keine `undefined`-Werte, keine Datumsobjekte.

## 1. Aufbau

| Feld | Pflicht | Inhalt |
|---|---|---|
| `metadata` | ja | Name, Version, Bewertungsmodell, Entscheidungsregeln, Aktionen |
| `requestTypes` | ja | Arten von Vorgängen, z.B. Auskunft und Löschung |
| `rules` | ja | Fragen mit Antworten, Risikofaktoren und Quelle |
| `outcomes` | ja | Entscheidungstabelle: welche Faktenlage zu welchem Ergebnis führt |
| `tests` | nein, aber empfohlen | Selbsttests: Fakten rein, erwartete Entscheidung raus |

## 2. `metadata`

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `schema` | ja | Immer `uri.rulebook/v1` |
| `id` | ja | Eindeutige Kennung aus Kleinbuchstaben, Ziffern und Bindestrichen, z.B. `breach-gdpr-de` |
| `name` | ja | Anzeigename |
| `version` | ja | Semantische Version `MAJOR.MINOR.PATCH`. Jede inhaltliche Änderung erhöht sie. |
| `domain`, `jurisdiction`, `language`, `description` | nein | Beschreibende Angaben für Oberfläche und Prüfer |
| `answerLabels` | nein | Anzeigetexte für Antwortwerte, z.B. `{ "yes": "Ja", "no": "Nein" }` |
| `scoring` | ja | `model` (nur `multiplicative`), `description` und `thresholds` mit `green` und `yellow` für die Ampel |
| `decisionPolicy` | ja | `defaultDecision` (immer `BLOCKED`), `blockAtOrBelow` und `reviewBelow`, beide zwischen 0 und 1 |
| `actions` | ja | Aktionen, die Outcomes freigeben können |

Eine Aktion hat:

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Kennung, auf die Outcomes über `action` verweisen |
| `label` | nein | Anzeigename |
| `requiresStatus` | ja | Status, bei denen die Aktion ausgeführt werden darf: `COMPLIANT` und/oder `REVIEW_COMPLETED` |
| `inputs` | nein | Je Eingabefeld ein `hint` (Hinweis unter dem Feld), `placeholder` und `defaultValue` (sichtbare Vorbelegung, die der Nutzer überschreiben kann) |

## 3. `requestTypes`

Liste aus `id` und `label`. Jede Regel und jedes Outcome gehört über `scope` zu genau einem Typ.

## 4. `rules`

Eine Regel ist eine Frage an den Menschen. Ihre Antwort wird erst durch Klick zum Fakt.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Eindeutige Kennung, z.B. `BRE-04` |
| `scope` | ja | Zugehöriger Anfrage-Typ |
| `fact` | ja | Name des Fakts, der gesetzt wird; innerhalb eines `scope` eindeutig |
| `question` | ja | Die Frage, wie sie der Nutzer sieht |
| `answers` | ja | Mindestens zwei erlaubte Werte, z.B. `["yes", "no"]` |
| `risk` | ja | Faktor zwischen 0 und 1 je Antwort. 1 = kein Einfluss, 0 = Verstoß |
| `showIf` | nein | `{ "fact": …, "equals": … }`: Die Regel ist nur aktiv, wenn die **früher definierte** Regel mit diesem `fact` aktiv ist und mit dem Wert aus `equals` beantwortet wurde |
| `provenance` | ja | Herkunft der Regel: `source` (Pflicht, z.B. `Art. 33 Abs. 1 DSGVO`), `quote` (kurzer Auszug aus dem Normtext), `note` (Erläuterung), `url` (Link zur Quelle), `asOf` (Datum, an dem die Quelle geprüft wurde) |

Reihenfolge zählt: Regeln werden in der Reihenfolge der Liste ausgewertet. Eine Regel, deren `showIf` nicht erfüllt ist, gilt als nicht gestellt; ihre Antwort wird ignoriert und in der Oberfläche gelöscht.

## 5. `outcomes`

Die Entscheidungstabelle. **Das erste Outcome, dessen `when` zur bestätigten Faktenlage passt, gilt.** Speziellere Einträge gehören deshalb vor allgemeinere.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Eindeutige Kennung |
| `scope` | ja | Zugehöriger Anfrage-Typ |
| `when` | ja | Fakten, die alle zutreffen müssen, z.B. `{ "risk_likely": "yes" }` |
| `effect` | ja | `ALLOW` (Aktion möglich) oder `DENY` (Aktion blockiert) |
| `action`, `template` | bei `ALLOW` | Freigegebene Aktion und der Textbaustein, den sie verwendet |
| `blockReason` | bei `DENY` | Begründung, die der Nutzer sieht |
| `label`, `verdict` | nein | Anzeigename der geplanten Aktion und Kurzergebnis für den Audit Trail |
| `requiresReview`, `reviewReason` | nein | Erzwingt eine manuelle Prüfung unabhängig vom Score, mit Begründung |
| `acceptsAttachment` | nein | Die Aktion nimmt eine Datenkopie als Anlage an |
| `legalBasis` | ja | Rechtsgrundlagen bzw. Quellen des Ergebnisses |
| `conditionalBasis` | nein | Weitere Grundlagen, nur wenn ihr `when` zutrifft: Liste aus `when` und `basis` |
| `requiredInputs` | nein | Pflichtangaben der Aktion: `field`, `label`, optional `when`. Die Engine gibt die Aktion erst frei, wenn alle ausgefüllt sind. |
| `optionalInputs` | nein | Wie `requiredInputs`, aber nur für die Oberfläche; die Engine erzwingt sie nicht |
| `obligations` | nein | Auflagen, die der Nutzer vor dem Versand erledigen muss: `id`, `text`, optional `when` |

## 6. Wie die Engine entscheidet

1. Alle aktiven Regeln des Anfrage-Typs müssen bestätigt sein. Sonst: `BLOCKED`, Status `INCOMPLETE` (Default-Deny).
2. Der Score ist das Produkt der Faktoren aller bestätigten Antworten, auf vier Stellen gerundet.
3. Das erste passende Outcome wird gesucht. Gibt es keins: `BLOCKED`, Status `NON_COMPLIANT`.
4. `DENY` oder Score ≤ `blockAtOrBelow`: `BLOCKED`, Status `NON_COMPLIANT`.
5. Score < `reviewBelow` oder `requiresReview`: `MANUAL_REVIEW`, Status `REVIEW_REQUIRED`; nach dem Sign-off eines Menschen `REVIEW_COMPLETED`. Der Sign-off gilt nur für genau diese Faktenlage und diesen Vorgang.
6. Sonst: `PERMITTED`, Status `COMPLIANT`.

Eine Aktion wird nur ausgeführt, wenn der Status in ihrem `requiresStatus` steht, das Outcome sie vorsieht und alle Pflichtangaben vorliegen.

## 7. Was `validateRulebook()` über das Schema hinaus prüft

- Eindeutige IDs von Regeln und Outcomes; jeder Fakt höchstens einmal je `scope`.
- `scope` verweist auf einen vorhandenen Anfrage-Typ.
- `showIf` verweist auf einen früher definierten Fakt und einen erlaubten Wert.
- Jeder Schlüssel in `when` (auch in `conditionalBasis`, `requiredInputs`, `obligations`) ist ein bekannter Fakt, jeder Wert eine erlaubte Antwort.
- `risk` enthält für jede Antwort einen Faktor zwischen 0 und 1.
- `ALLOW`-Outcomes verweisen auf eine definierte Aktion und nennen ein Template; `DENY`-Outcomes haben eine `blockReason`.

## 8. Selbsttests (`tests`)

Testfälle halten fest, was ein Rulebook entscheiden **soll**. Sie laufen bei jedem Laden auf einer eigenen Engine-Instanz. Schlägt ein Fall fehl, wird das Pack nicht aktiviert, und der Fehler steht im Audit Trail (`RULEBOOK_SELFTEST`) und im Entwickler-Tab.

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Eindeutige Kennung, z.B. `T-BRE-05` |
| `description` | nein | Was der Fall absichert, in einem Satz |
| `requestType` | ja | Anfrage-Typ |
| `facts` | ja | Bestätigte Antworten, z.B. `{ "breach_confirmed": "no" }` |
| `expect` | ja | Erwartetes Ergebnis. `decision` ist Pflicht; `status`, `outcome` und `score` sind optional. Nur angegebene Felder werden verglichen. |

Erlaubte Werte: `decision` ∈ `PERMITTED`, `MANUAL_REVIEW`, `BLOCKED`; `status` ∈ `INCOMPLETE`, `COMPLIANT`, `REVIEW_REQUIRED`, `REVIEW_COMPLETED`, `NON_COMPLIANT`; `outcome` ist eine Outcome-ID oder `null`; `score` eine Zahl oder `null` (bei unvollständigen Fakten).

### Testfälle schreiben: Anleitung

Testfälle schreibt am besten, wer das Fachgebiet kennt. Programmierkenntnisse braucht es nicht.

1. **Einen Fall aus der Praxis nehmen.** Zum Beispiel: „Ein unverschlüsselter Laptop wurde gestohlen, wir haben es nach vier Tagen bemerkt, es sind Bankdaten drauf."
2. **Die Fragen so beantworten, wie der Fall es verlangt,** und nur die Fragen, die dabei tatsächlich gestellt werden. Welche das sind, zeigt die Anwendung; die Fakten-Namen stehen im Rulebook unter `fact`.
3. **Aufschreiben, was herauskommen muss:** Muss ein Mensch prüfen (`MANUAL_REVIEW`)? Welches Outcome? Den Score rechnet man aus den Faktoren nach (Produkt der Faktoren der gegebenen Antworten).
4. **Eintragen:**

   ```json
   {
     "id": "T-BRE-05",
     "description": "Verspätete Meldung verlangt Prüfung",
     "requestType": "breach",
     "facts": { "breach_confirmed": "yes", "role_controller": "yes", "risk_likely": "yes",
                "within_72h": "no", "facts_complete": "yes", "high_risk": "no" },
     "expect": { "decision": "MANUAL_REVIEW", "outcome": "BRE-NOTIFY-AUTHORITY", "score": 0.4 }
   }
   ```

5. **Prüfen:** `npm test` ausführen oder die Datei im Entwickler-Tab importieren. Der Selbsttest zeigt jede Abweichung mit dem betroffenen Feld.

Faustregeln:

- **Jedes Outcome braucht mindestens einen Testfall.** Die Anwendung meldet Outcomes ohne Testfall („Ohne Testfall: …"); die Tests der mitgelieferten Packs verlangen volle Abdeckung.
- **Grenzfälle gezielt testen:** einen Score genau auf `reviewBelow` (z.B. 0.8: bleibt freigegeben) und einen leeren Fall `{}` (muss `BLOCKED` mit Status `INCOMPLETE` ergeben).
- **Ein Testfall, der nach einer Regeländerung fehlschlägt, ist ein Hinweis, kein Hindernis:** Entweder war die Änderung ein Fehler, oder die Erwartung muss bewusst angepasst werden. Im zweiten Fall Version erhöhen und Änderung im Changelog begründen.

## 9. Import in der Anwendung

Im Entwickler-Tab unter „Selbsttests & Import" lässt sich ein Rulebook als `.json` laden. Die Anwendung prüft Struktur und Querbezüge, lehnt bereits geladene IDs ab und führt die Selbsttests aus. Nur wenn alle bestehen, wird das Pack aktiviert.

Für importierte Rulebooks gilt:

- Sie gelten nur für die laufende Sitzung und verschwinden beim Neuladen.
- Sie sind als „importiert, ungeprüft" gekennzeichnet. Die Prüfung stellt Widerspruchsfreiheit gegenüber den eigenen Testfällen fest, nicht die fachliche Richtigkeit.
- Sie haben keinen Parser (keine Vorschläge) und dürfen nur eine Aktion verwenden. Diese erzeugt ein neutrales Entscheidungsprotokoll statt eines Schreibens an Dritte.
- Eine Signaturprüfung gibt es noch nicht.

## 10. Versionierung

- **PATCH:** Textkorrekturen ohne Auswirkung auf Entscheidungen.
- **MINOR:** neue Regeln, Outcomes, Testfälle oder Felder, bestehende Entscheidungen unverändert.
- **MAJOR:** Änderungen, die bestehende Entscheidungen ändern (andere Faktoren, Schwellen, Outcome-Reihenfolge).

Der Rulebook-Hash (SHA-256 über das kanonische JSON) steht in jeder Entscheidung. Damit ist nachvollziehbar, welche Fassung zu welchem Ergebnis geführt hat.
