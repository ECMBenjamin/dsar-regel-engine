/**
 * @file Domain Rule Pack: DSGVO-Betroffenenanfragen (Art. 15, 17, 12 Abs. 3)
 * Reines Datenobjekt. Kein ausführbarer Code, keine Funktionen.
 * - rules:    Frage, Risikofaktoren je Antwort, Rechtsquelle, Abhängigkeit (showIf)
 * - outcomes: Entscheidungstabelle je Anfrage-Typ; der erste passende Eintrag gilt
 * @author benthy
 * @license MIT
 */

export const DSARRulebook = {
    metadata: {
        schema: 'uri.rulebook/v1',
        id: 'dsar-gdpr-de',
        name: 'DSGVO-Betroffenenanfragen (DSAR)',
        version: '1.1.0',
        domain: 'Datenschutz / Betroffenenrechte',
        jurisdiction: 'EU (Verordnung (EU) 2016/679)',
        language: 'de',
        description: 'Betroffenenanfragen: Auskunft (Art. 15), Löschung (Art. 17) und Fristverlängerung (Art. 12 Abs. 3 DSGVO).',
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
                id: 'generate_response_letter',
                label: 'Antwortschreiben generieren',
                requiresStatus: ['COMPLIANT', 'REVIEW_COMPLETED'],
                // Hinweise und sichtbare Vorbelegungen für die Eingabefelder der Aktion
                inputs: {
                    recipients: { hint: 'Empfänger nach Möglichkeit konkret benennen (EuGH C-154/21); Kategorien nur, wenn eine Identifizierung nicht möglich ist.' },
                    origin: { defaultValue: 'Die Daten wurden direkt bei der betroffenen Person erhoben.' },
                    automated: { defaultValue: 'Eine automatisierte Entscheidungsfindung einschließlich Profiling gemäß Art. 22 DSGVO findet nicht statt.' },
                    safeguards: {
                        hint: 'Sie haben eine Drittlandübermittlung bestätigt. Die betroffene Person ist über die geeigneten Garantien zu unterrichten (Art. 15 Abs. 2 DSGVO). Dieses Feld wird bewusst nicht vorbelegt.',
                        placeholder: 'z.B. Empfängerland, Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO) oder Angemessenheitsbeschluss (Art. 45 DSGVO)'
                    }
                }
            }
        ]
    },

    requestTypes: [
        { id: 'art15', label: 'Art. 15 DSGVO (Auskunft)' },
        { id: 'art17', label: 'Art. 17 DSGVO (Löschung)' },
        { id: 'art12_3', label: 'Art. 12 Abs. 3 DSGVO (Fristverlängerung)' }
    ],

    rules: [
        // ---------- Art. 15 DSGVO: Auskunft ----------
        {
            id: 'DSAR-A15-01', scope: 'art15', fact: 'id_doubt',
            question: 'Bestehen begründete Zweifel an der Identität?',
            answers: ['yes', 'no'], risk: { yes: 0.2, no: 1.0 },
            provenance: {
                source: 'Art. 12 Abs. 6 DSGVO',
                quote: 'begründete Zweifel an der Identität der natürlichen Person',
                note: 'Identitätsprüfung ohne Zweifel ist unzulässig. Ausweiskopie nur als Ultima Ratio. Bei "Ja" ruht der Prozess, weitere Fragen werden übersprungen.'
            }
        },
        {
            id: 'DSAR-A15-02', scope: 'art15', fact: 'excessive',
            question: 'Ist der Antrag offenkundig exzessiv?',
            answers: ['yes', 'no'], risk: { yes: 0.3, no: 1.0 },
            showIf: { fact: 'id_doubt', equals: 'no' },
            provenance: {
                source: 'Art. 12 Abs. 5 DSGVO',
                quote: 'offenkundig unbegründeten oder […] exzessiven Anträgen',
                note: 'Ablehnung wegen Exzessivität hat hohe Hürden. Die Beweislast liegt beim Verantwortlichen.'
            }
        },
        {
            id: 'DSAR-A15-03', scope: 'art15', fact: 'data_processed',
            question: 'Werden personenbezogene Daten verarbeitet?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            showIf: { fact: 'excessive', equals: 'no' },
            provenance: {
                source: 'Art. 15 Abs. 1 DSGVO',
                quote: 'eine Bestätigung darüber zu verlangen, ob sie betreffende personenbezogene Daten verarbeitet werden',
                note: 'Bestimmt, ob eine Negativauskunft oder Vollauskunft erteilt wird. Beide Wege sind compliance-konform (Faktor 1.0).'
            }
        },
        {
            id: 'DSAR-A15-04', scope: 'art15', fact: 'large_amount',
            question: 'Sehr große Datenmenge (Präzisierung nötig)?',
            answers: ['yes', 'no'], risk: { yes: 0.7, no: 1.0 },
            showIf: { fact: 'data_processed', equals: 'yes' },
            provenance: {
                source: 'ErwGr. 63 S. 7 DSGVO',
                quote: 'eine große Menge von Informationen über die betroffene Person',
                note: 'Der Betroffene kann zur Eingrenzung des Suchraums aufgefordert werden.'
            }
        },
        {
            id: 'DSAR-A15-05', scope: 'art15', fact: 'third_party',
            question: 'Sind Rechte Dritter betroffen (z.B. in E-Mails)?',
            answers: ['yes', 'no'], risk: { yes: 0.6, no: 1.0 },
            showIf: { fact: 'data_processed', equals: 'yes' },
            provenance: {
                source: 'Art. 15 Abs. 4 DSGVO',
                quote: 'darf die Rechte und Freiheiten anderer Personen nicht beeinträchtigen',
                note: 'Erfordert Schwärzungen in der Datenkopie, keine Totalverweigerung.'
            }
        },
        {
            id: 'DSAR-A15-06', scope: 'art15', fact: 'third_country',
            question: 'Findet eine Drittlandübermittlung statt?',
            answers: ['yes', 'no'], risk: { yes: 0.8, no: 1.0 },
            showIf: { fact: 'data_processed', equals: 'yes' },
            provenance: {
                source: 'Art. 15 Abs. 2 i.V.m. Art. 46 DSGVO',
                quote: 'über die geeigneten Garantien gemäß Artikel 46 […] unterrichtet zu werden',
                note: 'Geeignete Garantien (z.B. Standardvertragsklauseln) müssen in der Auskunft genannt werden.'
            }
        },
        {
            id: 'DSAR-A15-07', scope: 'art15', fact: 'electronic_format',
            question: 'Wurde der Antrag elektronisch gestellt?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 1.0 },
            showIf: { fact: 'data_processed', equals: 'yes' },
            provenance: {
                source: 'Art. 15 Abs. 3 S. 3 DSGVO',
                quote: 'in einem gängigen elektronischen Format zur Verfügung zu stellen',
                note: 'Die Datenkopie muss in einem gängigen elektronischen Format bereitgestellt werden.'
            }
        },

        // ---------- Art. 17 DSGVO: Löschung ----------
        {
            id: 'DSAR-A17-01', scope: 'art17', fact: 'id_doubt',
            question: 'Bestehen begründete Zweifel an der Identität?',
            answers: ['yes', 'no'], risk: { yes: 0.2, no: 1.0 },
            provenance: {
                source: 'Art. 12 Abs. 6 DSGVO',
                quote: 'begründete Zweifel an der Identität der natürlichen Person',
                note: 'Die Löschung ruht bis zur Klärung der Identität. Bei "Ja" werden weitere Fragen übersprungen.'
            }
        },
        {
            id: 'DSAR-A17-02', scope: 'art17', fact: 'erasure_reason',
            question: 'Liegt ein gesetzlicher Löschgrund vor (z.B. Zweckentfall)?',
            answers: ['yes', 'no'], risk: { yes: 0.9, no: 1.0 },
            showIf: { fact: 'id_doubt', equals: 'no' },
            provenance: {
                source: 'Art. 17 Abs. 1 DSGVO',
                quote: 'unverzüglich gelöscht werden',
                note: 'Grundvoraussetzung für die Löschung.'
            }
        },
        {
            id: 'DSAR-A17-03', scope: 'art17', fact: 'erasure_exception',
            question: 'Greift eine Ausnahme (z.B. gesetzliche Aufbewahrungspflicht)?',
            answers: ['yes', 'no'], risk: { yes: 0.4, no: 1.0 },
            showIf: { fact: 'erasure_reason', equals: 'yes' },
            provenance: {
                source: 'Art. 17 Abs. 3 DSGVO',
                quote: 'zur Erfüllung einer rechtlichen Verpflichtung',
                note: 'Daten werden nicht gelöscht, sondern gesperrt (Art. 18 DSGVO).'
            }
        },
        {
            id: 'DSAR-A17-04', scope: 'art17', fact: 'public_data',
            question: 'Wurden die Daten öffentlich gemacht?',
            answers: ['yes', 'no'], risk: { yes: 0.6, no: 1.0 },
            showIf: { fact: 'erasure_exception', equals: 'no' },
            provenance: {
                source: 'Art. 17 Abs. 2 DSGVO',
                quote: 'Hat der Verantwortliche die personenbezogenen Daten öffentlich gemacht',
                note: 'Der Verantwortliche muss andere Stellen über das Löschbegehren informieren.'
            }
        },
        {
            id: 'DSAR-A17-05', scope: 'art17', fact: 'recipients',
            question: 'Wurden die Daten an Empfänger übermittelt?',
            answers: ['yes', 'no'], risk: { yes: 0.8, no: 1.0 },
            showIf: { fact: 'erasure_exception', equals: 'no' },
            provenance: {
                source: 'Art. 19 DSGVO',
                quote: 'es sei denn, dies erweist sich als unmöglich',
                note: 'Empfänger müssen über die Löschung informiert werden.'
            }
        },

        // ---------- Art. 12 Abs. 3 DSGVO: Fristverlängerung ----------
        {
            id: 'DSAR-A12-01', scope: 'art12_3', fact: 'complex_request',
            question: 'Ist die Anfrage besonders komplex oder liegt eine Vielzahl von Anträgen vor?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 0.0 },
            provenance: {
                source: 'Art. 12 Abs. 3 S. 2 DSGVO',
                quote: 'Diese Frist kann um weitere zwei Monate verlängert werden',
                note: 'Die Fristverlängerung ist nur bei komplexen oder zahlreichen Anträgen zulässig. Komplexität an sich ist kein Compliance-Verstoß (Faktor 1.0). Ohne diesen Grund ist die Verlängerung unzulässig (Faktor 0.0).'
            }
        },
        {
            id: 'DSAR-A12-02', scope: 'art12_3', fact: 'within_first_month',
            question: 'Befinden wir uns noch im ersten Monat nach Eingang?',
            answers: ['yes', 'no'], risk: { yes: 1.0, no: 0.0 },
            provenance: {
                source: 'Art. 12 Abs. 3 S. 3 DSGVO',
                quote: 'innerhalb eines Monats nach Eingang des Antrags über eine Fristverlängerung',
                note: 'Die Mitteilung über die Verlängerung muss zwingend innerhalb des ersten Monats erfolgen. Bei "Nein" ist die Verlängerung rechtswidrig (Faktor 0.0).'
            }
        }
    ],

    outcomes: [
        // ---------- Art. 15 ----------
        {
            id: 'A15-IDENTITY', scope: 'art15', when: { id_doubt: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'identity_check',
            label: 'Identitätsnachweis anfordern', verdict: 'Nachforderung',
            legalBasis: ['Art. 12 Abs. 6 DSGVO'],
            obligations: [
                { id: 'OBL-ID-1', text: 'Nur den mildesten geeigneten Nachweis anfordern; keine pauschale Ausweiskopie.' },
                { id: 'OBL-ID-2', text: 'Vorgang nach Eingang des Nachweises erneut prüfen.' }
            ]
        },
        {
            id: 'A15-REFUSAL', scope: 'art15', when: { excessive: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'refusal_excessive',
            label: 'Ablehnung wegen Exzessivität', verdict: 'Ablehnung',
            requiresReview: true,
            reviewReason: 'Das Outcome verweigert ein Betroffenenrecht.',
            legalBasis: ['Art. 12 Abs. 5 S. 2 DSGVO', 'Art. 12 Abs. 4 DSGVO'],
            obligations: [
                { id: 'OBL-EXC-1', text: 'Nachweis des exzessiven Charakters intern dokumentieren (Beweislast beim Verantwortlichen).' }
            ]
        },
        {
            id: 'A15-NEGATIVE', scope: 'art15', when: { data_processed: 'no' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'negative_disclosure',
            label: 'Negativauskunft erteilen', verdict: 'Negativauskunft',
            legalBasis: ['Art. 15 Abs. 1 DSGVO'],
            obligations: [
                { id: 'OBL-NEG-1', text: 'Suche in allen relevanten Systemen dokumentieren.' }
            ]
        },
        {
            id: 'A15-CLARIFY', scope: 'art15', when: { large_amount: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'clarification_request',
            label: 'Präzisierung anfordern', verdict: 'Präzisierung',
            legalBasis: ['ErwGr. 63 S. 7 DSGVO']
        },
        {
            id: 'A15-FULL', scope: 'art15', when: { data_processed: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'full_disclosure',
            label: 'Vollauskunft erteilen', verdict: 'Vollauskunft erteilt',
            acceptsAttachment: true,
            legalBasis: ['Art. 15 Abs. 1 lit. a-h DSGVO', 'Art. 15 Abs. 3 DSGVO'],
            conditionalBasis: [
                { when: { third_country: 'yes' }, basis: 'Art. 15 Abs. 2 DSGVO' },
                { when: { third_party: 'yes' }, basis: 'Art. 15 Abs. 4 DSGVO' }
            ],
            requiredInputs: [
                { field: 'purposes', label: 'Zwecke & Rechtsgrundlagen (lit. a)' },
                { field: 'categories', label: 'Kategorien personenbezogener Daten (lit. b)' },
                { field: 'recipients', label: 'Empfänger / Kategorien (lit. c)' },
                { field: 'retention', label: 'Speicherdauer (lit. d)' },
                { field: 'origin', label: 'Herkunft der Daten (lit. f)' },
                { field: 'automated', label: 'Automatisierte Entscheidungsfindung (lit. g)' },
                { field: 'safeguards', label: 'Geeignete Garantien nach Art. 46 DSGVO', when: { third_country: 'yes' } }
            ],
            obligations: [
                { id: 'OBL-FULL-1', text: 'Datenkopie vor dem Versand auf Vollständigkeit prüfen.' },
                { id: 'OBL-FULL-2', text: 'Datenkopie auf Rechte Dritter prüfen und betroffene Passagen schwärzen.', when: { third_party: 'yes' } },
                { id: 'OBL-FULL-3', text: 'Kopie in einem gängigen elektronischen Format bereitstellen.', when: { electronic_format: 'yes' } }
            ]
        },

        // ---------- Art. 17 ----------
        {
            id: 'A17-IDENTITY', scope: 'art17', when: { id_doubt: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'identity_check',
            label: 'Identitätsnachweis anfordern', verdict: 'Nachforderung',
            legalBasis: ['Art. 12 Abs. 6 DSGVO'],
            obligations: [
                { id: 'OBL-ID-1', text: 'Nur den mildesten geeigneten Nachweis anfordern; keine pauschale Ausweiskopie.' },
                { id: 'OBL-ID-2', text: 'Vorgang nach Eingang des Nachweises erneut prüfen.' }
            ]
        },
        {
            id: 'A17-REJECTED', scope: 'art17', when: { erasure_reason: 'no' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'erasure_rejected',
            label: 'Löschung ablehnen (kein Löschgrund)', verdict: 'Abgelehnt (Kein Grund)',
            requiresReview: true,
            reviewReason: 'Das Outcome verweigert ein Betroffenenrecht.',
            legalBasis: ['Art. 17 Abs. 1 DSGVO', 'Art. 12 Abs. 4 DSGVO']
        },
        {
            id: 'A17-RESTRICTED', scope: 'art17', when: { erasure_exception: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'erasure_restricted',
            label: 'Verarbeitung einschränken statt löschen', verdict: 'Teilweise (Sperrung)',
            legalBasis: ['Art. 17 Abs. 3 DSGVO', 'Art. 18 DSGVO', 'Art. 12 Abs. 4 DSGVO'],
            obligations: [
                { id: 'OBL-RES-1', text: 'Daten in allen Systemen für die weitere Verarbeitung sperren.' },
                { id: 'OBL-RES-2', text: 'Löschung nach Ablauf der Aufbewahrungsfrist terminieren.' }
            ]
        },
        {
            id: 'A17-ERASED', scope: 'art17', when: { erasure_exception: 'no' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'erasure_confirmed',
            label: 'Löschung bestätigen', verdict: 'Vollständig gelöscht',
            legalBasis: ['Art. 17 Abs. 1 DSGVO'],
            conditionalBasis: [
                { when: { public_data: 'yes' }, basis: 'Art. 17 Abs. 2 DSGVO' },
                { when: { recipients: 'yes' }, basis: 'Art. 19 DSGVO' }
            ],
            obligations: [
                { id: 'OBL-ERA-1', text: 'Löschung vor dem Versand in allen Systemen durchführen und dokumentieren.' },
                { id: 'OBL-ERA-2', text: 'Andere Verantwortliche über das Löschbegehren informieren.', when: { public_data: 'yes' } },
                { id: 'OBL-ERA-3', text: 'Alle Empfänger über die Löschung informieren.', when: { recipients: 'yes' } }
            ]
        },

        // ---------- Art. 12 Abs. 3 ----------
        {
            id: 'A12-DENY-LATE', scope: 'art12_3', when: { within_first_month: 'no' },
            effect: 'DENY', verdict: 'Rechtswidrig (Fristversäumnis)',
            label: 'Keine Aktion zulässig',
            blockReason: 'Die Voraussetzungen für eine Fristverlängerung nach Art. 12 Abs. 3 DSGVO liegen nicht vor, da der erste Monat bereits verstrichen ist. Der Versand einer Verlängerungsmitteilung wäre rechtswidrig.',
            legalBasis: ['Art. 12 Abs. 3 DSGVO']
        },
        {
            id: 'A12-DENY-GROUND', scope: 'art12_3', when: { complex_request: 'no' },
            effect: 'DENY', verdict: 'Unzulässig (kein Verlängerungsgrund)',
            label: 'Keine Aktion zulässig',
            blockReason: 'Eine Fristverlängerung nach Art. 12 Abs. 3 DSGVO setzt Komplexität oder eine Vielzahl von Anträgen voraus. Ohne diesen Grund ist die Anfrage innerhalb eines Monats zu beantworten.',
            legalBasis: ['Art. 12 Abs. 3 DSGVO']
        },
        {
            id: 'A12-EXTEND', scope: 'art12_3', when: { complex_request: 'yes', within_first_month: 'yes' },
            effect: 'ALLOW', action: 'generate_response_letter', template: 'extension_notice',
            label: 'Fristverlängerung mitteilen', verdict: 'Verlängert',
            legalBasis: ['Art. 12 Abs. 3 DSGVO'],
            obligations: [
                { id: 'OBL-EXT-1', text: 'Neues Fristende im Fristenrechner berechnen und überwachen.' }
            ]
        }
    ]
};
