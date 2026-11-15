# Checkliste: Vom lokalen Projekt zum veröffentlichten Werk

Für dich als Einsteiger geschrieben. Hake ab, was erledigt ist. Wo „Claude" steht, genügt es, mir im Chat Bescheid zu geben; den Rest erledigst du im Browser.

## A. Veröffentlichen (ca. 15 Minuten)

- [ ] **GitHub-Konto prüfen.** Du brauchst ein Konto mit dem Namen `ECMBenjamin` (so ist der Name in README und Projektseite fest eingetragen).
- [ ] **Leeres Repository anlegen.** Auf github.com oben rechts auf **+** → **New repository**. Name: `dsar-regel-engine`. Sichtbarkeit: **Public**. **Keine** Haken bei „Add a README", „.gitignore" oder „license" setzen, das Projekt bringt alles mit. Dann **Create repository**.
- [ ] **Mir „fertig" schreiben.** Ich lade den kompletten Verlauf hoch.
- [ ] **GitHub Pages einschalten.** Im Repository: **Settings** → **Pages** → bei „Build and deployment" als Quelle **Deploy from a branch**, Branch **main**, Ordner **/docs**, dann **Save**. Nach 1–2 Minuten ist die Seite unter `https://ecmbenjamin.github.io/dsar-regel-engine/` online.
- [ ] **Alles testen.** Seite öffnen, auf „Im Browser ausprobieren" klicken, oben rechts auf **EN** wechseln und zurück, einmal am Handy ansehen.
- [ ] **E-Mail bei GitHub hinterlegen.** **Settings** → **Emails** → `hi@benjaminthyssen.com` hinzufügen und per Mail bestätigen. Erst dann werden die Commits deinem Profil zugeordnet.
- [ ] **Grünes Häkchen prüfen.** Im Reiter **Actions** sollte der Testlauf „Tests" grün sein.

## B. Rechtliches (vor der Werbung!)

- [ ] **Impressum und Datenschutzerklärung** auf benjaminthyssen.com anlegen und von der Projektseite verlinken. In Deutschland sind sie für eine öffentliche Seite mit geschäftlichem Bezug in aller Regel nötig. Ich bin kein Anwalt; ein Generator eines Fachverbands oder eine kurze anwaltliche Prüfung ist hier gut investiert. Sag mir die Links, dann baue ich sie in den Footer ein.
- [ ] **benjaminthyssen.com füllen.** Aktuell steht dort „im Aufbau". Mindestens: wer du bist, ein Satz zum Projekt, Link zur Projektseite.
- [ ] **Den Abschnitt „Warum ich es so gebaut habe" durchlesen.** Er steht in Ich-Form. Jeder Satz muss für dich stimmen; streich oder ändere, was nicht passt.
- [ ] **Entscheiden, ob die E-Mail-Adresse öffentlich sein soll.** Sie steckt in den Commits. Wer das nicht will, nutzt bei GitHub die `noreply`-Adresse; sag mir Bescheid, dann stelle ich es um.

## C. Qualität (macht das Projekt glaubwürdig)

- [ ] **Schritt 6: Quellen prüfen.** Normtexte wörtlich abgleichen, die zwei ungeprüften Fallbeispiele klären, Quellenangaben mit Link und Stand ergänzen. Erst danach große Werbung.
- [ ] **Fachprüfung suchen.** Eine Datenschutzjuristin oder einen Datenschutzbeauftragten bitten, die Regeln gegenzulesen. Das ist der größte Glaubwürdigkeitsgewinn überhaupt. Sag mir, dann bereite ich ein Prüfpaket (Schritt 11) vor.
- [ ] **Rückmeldungen sammeln.** Jede Kritik als Issue auf GitHub festhalten und beantworten.

## D. Bekannt machen (nach A, B und mindestens Schritt 6)

- [ ] **LinkedIn-Beitrag** mit 30–60 Sekunden Bildschirmvideo: Das Schreiben ist gesperrt, bis die offene Frage beantwortet ist. Link zur Projektseite. (Texthilfe: Schritt 12.)
- [ ] **2–3 Datenschutzbeauftragte direkt anschreiben** und um ehrliche Kritik an den Regeln bitten.
- [ ] **In Profilen verlinken:** LinkedIn „Projekte", GitHub-Profil (angeheftetes Repository), Hackathon-Vorstellung, benjaminthyssen.com.
- [ ] **Bei Hackathons und Treffen** die Live-Version zeigen und ein eigenes Regelwerk live importieren lassen.
- [ ] **GitHub-Themen (Topics)** setzen: `gdpr`, `dsgvo`, `legal-tech`, `rules-engine`, `policy-as-code`, `privacy`. Im Repository oben rechts beim Zahnrad neben „About".
- [ ] **Englische Fassung der App** (Schritt 10), bevor du das internationale Publikum rund um KI-Agenten ansprichst.

## E. Technischer Ausbau (ich mache das, du entscheidest)

Reihenfolge laut `UEBERGABE.md`: Schritt 6 Quellen → 5 Signaturen → 7 lokale Ablage → 13 Agenten-Regelwerk → 8 MCP-Schnittstelle → 9 Doku und Vergleich mit OPA/Cedar → 10 Englisch → 11 Prüfpaket → 12 Artikel und Demo-Video. Schreib einfach „weiter".

## Wenn etwas hakt

- **Seite zeigt 404:** Pages-Einstellung prüfen (main, /docs) und 2 Minuten warten.
- **Roter Haken bei Actions:** Reiter öffnen, auf den Lauf klicken und mir den Fehlertext schicken.
- **Alles andere:** einfach im Chat fragen.
