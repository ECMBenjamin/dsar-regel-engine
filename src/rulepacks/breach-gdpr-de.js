/**
 * @file Domain Rule Pack: Datenpannen – Meldung (Art. 33) und Benachrichtigung (Art. 34 DSGVO)
 * Reines Datenobjekt. Kein ausführbarer Code, keine Funktionen.
 * Zweites Rule Pack der Universal Rules Infrastructure: läuft auf der unveränderten Engine.
 * - rules:    Frage, Risikofaktoren je Antwort, Rechtsquelle, Abhängigkeit (showIf)
 * - outcomes: Entscheidungstabelle; der erste passende Eintrag gilt
 * @author benthy
 * @license MIT
 */

export const BreachRulebook = {
    metadata: {
        schema: 'uri.rulebook/v1',
        id: 'breach-gdpr-de',
        name: 'Datenpannen: Meldung und Benachrichtigung',
        version: '1.1.0',
        domain: 'Datenschutz / Verletzung des Schutzes personenbezogener Daten',
        jurisdiction: 'EU (Verordnung (EU) 2016/679)',
        language: 'de',
        description: 'Datenpannen: Meldepflicht gegenüber der Aufsichtsbehörde (Art. 33) und Benachrichtigung der betroffenen Personen (Art. 34 DSGVO).',
        answerLabels: { yes: 'Ja', no: 'Nein' },
        scoring: {
            model: 'multiplicative',
            description: 'Score = Produkt der Risikofaktoren aller aktiven, bestätigten Regeln.',
            thresholds: { green: 0.8, yellow: 0.5 }
        },
        decisionPolicy: {
            defaultDecision: 'BLOCKED',
            blockAtOrBelow: 0,
            reviewBelow: 0.8
        },
        actions: [
            {
                id: 'generate_breach_documents',
                label: 'Meldung und Dokumentation erzeugen',
                requiresStatus: ['COMPLIANT', 'REVIEW_COMPLETED'],
                // Hinweise für die Eingabefelder der Aktion. Nichts wird vorbelegt.
                inputs: {
                    incident: { placeholder: 'Was ist passiert? Welche Systeme und welche Art von Verletzung (Verlust, unbefugter Zugang, Offenlegung, Veränderung)?' },
                    awareness: { placeholder: 'z.B. 12.11.2026, 09:30 Uhr, durch Meldung der IT-Abteilung', hint: 'Ab diesem Zeitpunkt läuft die 72-Stunden-Frist.' },
                    scope: { placeholder: 'z.B. ca. 1.200 Kundinnen und Kunden; Stammdaten und E-Mail-Adressen; ca. 1.200 Datensätze' },
                    contact: { placeholder: 'Name, Funktion, E-Mail, Telefon' },
                    consequences: { placeholder: 'z.B. Phishing-Versuche, Identitätsmissbrauch, finanzielle Nachteile' },
                    measures: { placeholder: 'z.B. Zugang gesperrt, Passwörter zurückgesetzt, Systeme forensisch untersucht' },
                    delay_reason: { hint: 'Die Meldung erfolgt nach Ablauf von 72 Stunden. Die Verzögerung ist gegenüber der Aufsichtsbehörde zu begründen.' },
                    assessment_reason: { hint: 'Die Begründung muss so konkret sein, dass die Aufsichtsbehörde die Bewertung nachprüfen kann.' },
                    controller_name: { placeholder: 'Name des Auftraggebers, für den Sie die Daten verarbeiten' }
                }
            }
        ]
    },

    requestTypes: [
        { id: 'breach', label: 'Verletzung des Schutzes personenbezogener Daten (Art. 33 / 34 DSGVO)' }
    ],

    rules: [
        {
            id: 'BRE-01', scope: 'breach', fact: 'breach_confirmed',
            question: 'Liegt eine Verletzung des Schutzes personenbezogener Daten vor?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            provenance: {
                source: 'Art. 4 Nr. 12 DSGVO',
                quote: 'zur Vernichtung, zum Verlust, zur Veränderung',
                note: 'Erfasst sind Vernichtung, Verlust, Veränderung, unbefugte Offenlegung und unbefugter Zugang, gleich ob unbeabsichtigt oder unrechtmäßig. Bei "Nein" endet die Prüfung mit einem internen Vermerk.'
            }
        },
        {
            id: 'BRE-02', scope: 'breach', fact: 'role_controller',
            question: 'Handeln Sie für diese Daten als Verantwortlicher (nicht als Auftragsverarbeiter)?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            showIf: { fact: 'breach_confirmed', equals: 'yes' },
            provenance: {
                source: 'Art. 33 Abs. 2 DSGVO',
                quote: 'meldet er diese dem Verantwortlichen unverzüglich',
                note: 'Der Auftragsverarbeiter meldet nicht an die Aufsichtsbehörde, sondern unverzüglich an den Verantwortlichen. Beide Rollen sind zulässig (Faktor 1.0).'
            }
        },
        {
            id: 'BRE-03', scope: 'breach', fact: 'risk_likely',
            question: 'Führt die Verletzung voraussichtlich zu einem Risiko für die Rechte und Freiheiten natürlicher Personen?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            showIf: { fact: 'role_controller', equals: 'yes' },
            provenance: {
                source: 'Art. 33 Abs. 1 DSGVO',
                quote: 'voraussichtlich nicht zu einem Risiko für die Rechte und Freiheiten natürlicher Personen',
                note: 'Die Meldepflicht entfällt nur, wenn ein Risiko voraussichtlich ausgeschlossen ist. Der Verzicht auf die Meldung verlangt immer eine manuelle Prüfung.'
            }
        },
        {
            id: 'BRE-04', scope: 'breach', fact: 'within_72h',
            question: 'Sind seit dem Bekanntwerden weniger als 72 Stunden vergangen?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 0.4 },
            showIf: { fact: 'risk_likely', equals: 'yes' },
            provenance: {
                source: 'Art. 33 Abs. 1 DSGVO',
                quote: 'unverzüglich und möglichst binnen 72 Stunden',
                note: 'Nach Ablauf von 72 Stunden bleibt die Meldung Pflicht, ihr ist aber eine Begründung für die Verzögerung beizufügen (Satz 2).'
            }
        },
        {
            id: 'BRE-05', scope: 'breach', fact: 'facts_complete',
            question: 'Liegen alle Angaben für die Meldung bereits vollständig vor?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 0.9 },
            showIf: { fact: 'risk_likely', equals: 'yes' },
            provenance: {
                source: 'Art. 33 Abs. 3 und 4 DSGVO',
                quote: 'ohne unangemessene weitere Verzögerung schrittweise zur Verfügung stellen',
                note: 'Fehlende Angaben sind kein Grund, die Meldung aufzuschieben. Sie werden als Erstmeldung abgegeben und nachgereicht.'
            }
        },
        {
            id: 'BRE-06', scope: 'breach', fact: 'high_risk',
            question: 'Hat die Verletzung voraussichtlich ein hohes Risiko zur Folge (z.B. besondere Kategorien, Finanz- oder Zugangsdaten)?',
            answers: ['yes', 'no'], risk: { yes: 0.7, no: 1.0 },
            showIf: { fact: 'risk_likely', equals: 'yes' },
            provenance: {
                source: 'Art. 34 Abs. 1 DSGVO',
                quote: 'voraussichtlich ein hohes Risiko für die persönlichen Rechte und Freiheiten',
                note: 'Bei hohem Risiko sind zusätzlich die betroffenen Personen unverzüglich zu benachrichtigen.'
            }
        },
        {
            id: 'BRE-07', scope: 'breach', fact: 'data_unintelligible',
            question: 'Waren die betroffenen Daten für Unbefugte unzugänglich, etwa durch wirksame Verschlüsselung?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            showIf: { fact: 'high_risk', equals: 'yes' },
            provenance: {
                source: 'Art. 34 Abs. 3 lit. a DSGVO',
                quote: 'unzugänglich gemacht werden, etwa durch Verschlüsselung',
                note: 'Dann entfällt die Benachrichtigung der Betroffenen. Die Meldung an die Aufsichtsbehörde bleibt bestehen.'
            }
        },
        {
            id: 'BRE-08', scope: 'breach', fact: 'risk_mitigated',
            question: 'Stellen nachträgliche Maßnahmen sicher, dass das hohe Risiko aller Wahrscheinlichkeit nach nicht mehr besteht?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            showIf: { fact: 'data_unintelligible', equals: 'no' },
            provenance: {
                source: 'Art. 34 Abs. 3 lit. b DSGVO',
                quote: 'aller Wahrscheinlichkeit nach nicht mehr besteht',
                note: 'Auch dann entfällt die Benachrichtigung der Betroffenen. Die Maßnahmen sind zu dokumentieren.'
            }
        },
        {
            id: 'BRE-09', scope: 'breach', fact: 'disproportionate_effort',
            question: 'Wäre die individuelle Benachrichtigung mit einem unverhältnismäßigen Aufwand verbunden?',
            answers: ['yes', 'no'], risk: { yes: 0.8, no: 1.0 },
            showIf: { fact: 'risk_mitigated', equals: 'no' },
            provenance: {
                source: 'Art. 34 Abs. 3 lit. c DSGVO',
                quote: 'stattdessen eine öffentliche Bekanntmachung oder eine ähnliche Maßnahme',
                note: 'Die Betroffenen müssen dann auf anderem Weg vergleichbar wirksam informiert werden.'
            }
        }
    ],

    outcomes: [
        {
            id: 'BRE-NO-BREACH', scope: 'breach', when: { breach_confirmed: 'no' },
            effect: 'ALLOW', action: 'generate_breach_documents', template: 'record_no_breach',
            label: 'Keine Datenpanne: internen Vermerk erstellen', verdict: 'Keine Verletzung',
            legalBasis: ['Art. 4 Nr. 12 DSGVO', 'Art. 5 Abs. 2 DSGVO'],
            requiredInputs: [
                { field: 'incident', label: 'Sachverhalt' },
                { field: 'assessment_reason', label: 'Begründung der Bewertung' }
            ],
            obligations: [
                { id: 'OBL-BRE-DOC', text: 'Vermerk zur Vorfallsakte nehmen.' }
            ]
        },
        {
            id: 'BRE-PROCESSOR', scope: 'breach', when: { role_controller: 'no' },
            effect: 'ALLOW', action: 'generate_breach_documents', template: 'processor_notice',
            label: 'Verantwortlichen unverzüglich informieren', verdict: 'Meldung an den Verantwortlichen',
            legalBasis: ['Art. 33 Abs. 2 DSGVO'],
            requiredInputs: [
                { field: 'controller_name', label: 'Verantwortlicher (Auftraggeber)' },
                { field: 'awareness', label: 'Zeitpunkt des Bekanntwerdens' },
                { field: 'incident', label: 'Art der Verletzung' },
                { field: 'contact', label: 'Ansprechpartner für Rückfragen' }
            ],
            optionalInputs: [
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze' },
                { field: 'measures', label: 'Ergriffene oder vorgeschlagene Maßnahmen' }
            ],
            obligations: [
                { id: 'OBL-BRE-PROC-1', text: 'Mitteilung unverzüglich an den Verantwortlichen senden.' },
                { id: 'OBL-BRE-PROC-2', text: 'Meldefristen und Mitwirkungspflichten aus dem Auftragsverarbeitungsvertrag prüfen.' }
            ]
        },
        {
            id: 'BRE-NO-RISK', scope: 'breach', when: { risk_likely: 'no' },
            effect: 'ALLOW', action: 'generate_breach_documents', template: 'record_no_notification',
            label: 'Keine Meldung: Verletzung intern dokumentieren', verdict: 'Keine Meldepflicht',
            requiresReview: true,
            reviewReason: 'Das Outcome verzichtet auf die Meldung an die Aufsichtsbehörde.',
            legalBasis: ['Art. 33 Abs. 1 DSGVO', 'Art. 33 Abs. 5 DSGVO'],
            requiredInputs: [
                { field: 'awareness', label: 'Zeitpunkt des Bekanntwerdens' },
                { field: 'incident', label: 'Art der Verletzung' },
                { field: 'assessment_reason', label: 'Begründung, warum voraussichtlich kein Risiko besteht' },
                { field: 'measures', label: 'Ergriffene oder vorgeschlagene Maßnahmen' }
            ],
            obligations: [
                { id: 'OBL-BRE-DOC', text: 'Vermerk zur Vorfallsakte nehmen.' },
                { id: 'OBL-BRE-REASSESS', text: 'Bewertung wiederholen, sobald neue Erkenntnisse zum Vorfall vorliegen.' }
            ]
        },
        {
            id: 'BRE-NOTIFY-SUBJECTS', scope: 'breach',
            when: { risk_likely: 'yes', high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'no' },
            effect: 'ALLOW', action: 'generate_breach_documents', template: 'authority_and_subjects',
            label: 'Aufsichtsbehörde melden und Betroffene benachrichtigen', verdict: 'Meldung und Benachrichtigung',
            legalBasis: ['Art. 33 Abs. 1 DSGVO', 'Art. 33 Abs. 3 DSGVO', 'Art. 34 Abs. 1 DSGVO', 'Art. 34 Abs. 2 DSGVO', 'Art. 33 Abs. 5 DSGVO'],
            conditionalBasis: [
                { when: { within_72h: 'no' }, basis: 'Art. 33 Abs. 1 S. 2 DSGVO' },
                { when: { facts_complete: 'no' }, basis: 'Art. 33 Abs. 4 DSGVO' }
            ],
            requiredInputs: [
                { field: 'awareness', label: 'Zeitpunkt des Bekanntwerdens' },
                { field: 'delay_reason', label: 'Begründung der Verzögerung', when: { within_72h: 'no' } },
                { field: 'incident', label: 'Art der Verletzung (Art. 33 Abs. 3 lit. a)' },
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (lit. a)', when: { facts_complete: 'yes' } },
                { field: 'contact', label: 'Datenschutzbeauftragter oder Anlaufstelle (lit. b)' },
                { field: 'consequences', label: 'Wahrscheinliche Folgen der Verletzung (lit. c)' },
                { field: 'measures', label: 'Ergriffene oder vorgeschlagene Maßnahmen (lit. d)' }
            ],
            optionalInputs: [
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (lit. a)', when: { facts_complete: 'no' } }
            ],
            obligations: [
                { id: 'OBL-BRE-AUTH', text: 'Meldung über den Meldeweg der zuständigen Aufsichtsbehörde einreichen.' },
                { id: 'OBL-BRE-SUBJ', text: 'Betroffene unverzüglich in klarer und einfacher Sprache benachrichtigen.' },
                { id: 'OBL-BRE-FOLLOWUP', text: 'Fehlende Angaben ohne unangemessene weitere Verzögerung nachmelden.', when: { facts_complete: 'no' } },
                { id: 'OBL-BRE-DOC', text: 'Vermerk zur Vorfallsakte nehmen.' }
            ]
        },
        {
            id: 'BRE-NOTIFY-PUBLIC', scope: 'breach',
            when: { risk_likely: 'yes', high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'yes' },
            effect: 'ALLOW', action: 'generate_breach_documents', template: 'authority_and_public',
            label: 'Aufsichtsbehörde melden und öffentlich bekannt machen', verdict: 'Meldung und öffentliche Bekanntmachung',
            legalBasis: ['Art. 33 Abs. 1 DSGVO', 'Art. 33 Abs. 3 DSGVO', 'Art. 34 Abs. 1 DSGVO', 'Art. 34 Abs. 3 lit. c DSGVO', 'Art. 33 Abs. 5 DSGVO'],
            conditionalBasis: [
                { when: { within_72h: 'no' }, basis: 'Art. 33 Abs. 1 S. 2 DSGVO' },
                { when: { facts_complete: 'no' }, basis: 'Art. 33 Abs. 4 DSGVO' }
            ],
            requiredInputs: [
                { field: 'awareness', label: 'Zeitpunkt des Bekanntwerdens' },
                { field: 'delay_reason', label: 'Begründung der Verzögerung', when: { within_72h: 'no' } },
                { field: 'incident', label: 'Art der Verletzung (Art. 33 Abs. 3 lit. a)' },
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (lit. a)', when: { facts_complete: 'yes' } },
                { field: 'contact', label: 'Datenschutzbeauftragter oder Anlaufstelle (lit. b)' },
                { field: 'consequences', label: 'Wahrscheinliche Folgen der Verletzung (lit. c)' },
                { field: 'measures', label: 'Ergriffene oder vorgeschlagene Maßnahmen (lit. d)' },
                { field: 'assessment_reason', label: 'Begründung des unverhältnismäßigen Aufwands' }
            ],
            optionalInputs: [
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (lit. a)', when: { facts_complete: 'no' } }
            ],
            obligations: [
                { id: 'OBL-BRE-AUTH', text: 'Meldung über den Meldeweg der zuständigen Aufsichtsbehörde einreichen.' },
                { id: 'OBL-BRE-PUBLIC', text: 'Öffentliche Bekanntmachung so platzieren, dass die Betroffenen vergleichbar wirksam informiert werden.' },
                { id: 'OBL-BRE-FOLLOWUP', text: 'Fehlende Angaben ohne unangemessene weitere Verzögerung nachmelden.', when: { facts_complete: 'no' } },
                { id: 'OBL-BRE-DOC', text: 'Vermerk zur Vorfallsakte nehmen.' }
            ]
        },
        {
            id: 'BRE-NOTIFY-AUTHORITY', scope: 'breach', when: { risk_likely: 'yes' },
            effect: 'ALLOW', action: 'generate_breach_documents', template: 'authority_only',
            label: 'Aufsichtsbehörde melden', verdict: 'Meldung an die Aufsichtsbehörde',
            legalBasis: ['Art. 33 Abs. 1 DSGVO', 'Art. 33 Abs. 3 DSGVO', 'Art. 33 Abs. 5 DSGVO'],
            conditionalBasis: [
                { when: { within_72h: 'no' }, basis: 'Art. 33 Abs. 1 S. 2 DSGVO' },
                { when: { facts_complete: 'no' }, basis: 'Art. 33 Abs. 4 DSGVO' },
                { when: { data_unintelligible: 'yes' }, basis: 'Art. 34 Abs. 3 lit. a DSGVO' },
                { when: { risk_mitigated: 'yes' }, basis: 'Art. 34 Abs. 3 lit. b DSGVO' }
            ],
            requiredInputs: [
                { field: 'awareness', label: 'Zeitpunkt des Bekanntwerdens' },
                { field: 'delay_reason', label: 'Begründung der Verzögerung', when: { within_72h: 'no' } },
                { field: 'incident', label: 'Art der Verletzung (Art. 33 Abs. 3 lit. a)' },
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (lit. a)', when: { facts_complete: 'yes' } },
                { field: 'contact', label: 'Datenschutzbeauftragter oder Anlaufstelle (lit. b)' },
                { field: 'consequences', label: 'Wahrscheinliche Folgen der Verletzung (lit. c)', when: { facts_complete: 'yes' } },
                { field: 'measures', label: 'Ergriffene oder vorgeschlagene Maßnahmen (lit. d)', when: { facts_complete: 'yes' } },
                { field: 'assessment_reason', label: 'Begründung, warum die Betroffenen nicht benachrichtigt werden', when: { high_risk: 'yes' } }
            ],
            optionalInputs: [
                { field: 'scope', label: 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (lit. a)', when: { facts_complete: 'no' } },
                { field: 'consequences', label: 'Wahrscheinliche Folgen der Verletzung (lit. c)', when: { facts_complete: 'no' } },
                { field: 'measures', label: 'Ergriffene oder vorgeschlagene Maßnahmen (lit. d)', when: { facts_complete: 'no' } }
            ],
            obligations: [
                { id: 'OBL-BRE-AUTH', text: 'Meldung über den Meldeweg der zuständigen Aufsichtsbehörde einreichen.' },
                { id: 'OBL-BRE-FOLLOWUP', text: 'Fehlende Angaben ohne unangemessene weitere Verzögerung nachmelden.', when: { facts_complete: 'no' } },
                { id: 'OBL-BRE-EXCEPTION', text: 'Voraussetzungen der Ausnahme von der Benachrichtigung belegen und aufbewahren.', when: { high_risk: 'yes' } },
                { id: 'OBL-BRE-DOC', text: 'Vermerk zur Vorfallsakte nehmen.' }
            ]
        }
    ],

    // Selbsttests: Fakten rein, erwartete Entscheidung raus. Format: docs/rulebook-spec.md
    tests: [
        {
            id: 'T-GATE-01', description: 'Ohne bestätigte Fakten keine Freigabe (Default-Deny)',
            requestType: 'breach', facts: {  },
            expect: { decision: 'BLOCKED', status: 'INCOMPLETE', outcome: null, score: null }
        },
        {
            id: 'T-BRE-01', description: 'Keine Verletzung: nur interner Vermerk',
            requestType: 'breach', facts: { breach_confirmed: 'no' },
            expect: { decision: 'PERMITTED', outcome: 'BRE-NO-BREACH', score: 1 }
        },
        {
            id: 'T-BRE-02', description: 'Auftragsverarbeiter meldet an den Verantwortlichen',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'no' },
            expect: { decision: 'PERMITTED', outcome: 'BRE-PROCESSOR', score: 1 }
        },
        {
            id: 'T-BRE-03', description: 'Verzicht auf Meldung nur nach Prüfung',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'no' },
            expect: { decision: 'MANUAL_REVIEW', status: 'REVIEW_REQUIRED', outcome: 'BRE-NO-RISK', score: 1 }
        },
        {
            id: 'T-BRE-04', description: 'Meldung an die Behörde ohne hohes Risiko',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'yes', within_72h: 'yes', facts_complete: 'yes', high_risk: 'no' },
            expect: { decision: 'PERMITTED', outcome: 'BRE-NOTIFY-AUTHORITY', score: 1 }
        },
        {
            id: 'T-BRE-05', description: 'Verspätete Meldung verlangt Prüfung',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'yes', within_72h: 'no', facts_complete: 'yes', high_risk: 'no' },
            expect: { decision: 'MANUAL_REVIEW', outcome: 'BRE-NOTIFY-AUTHORITY', score: 0.4 }
        },
        {
            id: 'T-BRE-06', description: 'Verschlüsselte Daten: keine Benachrichtigung der Betroffenen',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'yes', within_72h: 'yes', facts_complete: 'yes', high_risk: 'yes', data_unintelligible: 'yes' },
            expect: { decision: 'MANUAL_REVIEW', outcome: 'BRE-NOTIFY-AUTHORITY', score: 0.7 }
        },
        {
            id: 'T-BRE-07', description: 'Hohes Risiko: Behörde und Betroffene',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'yes', within_72h: 'yes', facts_complete: 'yes', high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'no' },
            expect: { decision: 'MANUAL_REVIEW', outcome: 'BRE-NOTIFY-SUBJECTS', score: 0.7 }
        },
        {
            id: 'T-BRE-08', description: 'Unverhältnismäßiger Aufwand: öffentliche Bekanntmachung',
            requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'yes', within_72h: 'yes', facts_complete: 'yes', high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'yes' },
            expect: { decision: 'MANUAL_REVIEW', outcome: 'BRE-NOTIFY-PUBLIC', score: 0.56 }
        }
    ]
};
