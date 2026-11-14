/**
 * @file Action: Dokumente zu einer Datenpanne (Execution / Enforcement)
 * Textbausteine des Datenpannen-Packs: Meldung an die Aufsichtsbehörde (Art. 33 DSGVO),
 * Benachrichtigung der Betroffenen (Art. 34 DSGVO), Mitteilung des Auftragsverarbeiters
 * und interner Dokumentationsvermerk (Art. 33 Abs. 5 DSGVO).
 * Ablauf und Freigabe: siehe create-action.js.
 * @author benthy
 * @license MIT
 */

import { createAction } from './create-action.js';
import { BreachRulebook } from '../rulepacks/breach-gdpr-de.js';

const BREACH_PENDING = 'Diese Angabe liegt noch nicht vollständig vor und wird gemäß Art. 33 Abs. 4 DSGVO ohne unangemessene weitere Verzögerung nachgereicht.';

// Nummerierte Abschnitte: Überschrift und Text, fortlaufend gezählt.
function breachSections(entries) {
    return entries.filter(Boolean).map((e, i) => `${i + 1}. ${e[0]}\n${e[1]}`).join('\n\n');
}

// Mehrere Dokumente in einer Ausgabe, klar voneinander getrennt.
function breachBundle(docs) {
    const line = '='.repeat(72);
    return docs.map((d, i) => `${line}\nDOKUMENT ${i + 1} VON ${docs.length}: ${d[0]}\n${line}\n\n${d[1]}`).join('\n\n\n');
}

// Abschnitt zu Art. 34 in der Meldung an die Behörde, abhängig von der bestätigten Faktenlage.
function breachSubjectClause(f, p) {
    if (f.high_risk !== 'yes') {
        return 'Nach unserer Bewertung hat die Verletzung voraussichtlich kein hohes Risiko für die persönlichen Rechte und Freiheiten natürlicher Personen zur Folge. Eine Benachrichtigung nach Art. 34 Abs. 1 DSGVO ist daher nicht vorgesehen.';
    }
    const high = 'Die Verletzung hat voraussichtlich ein hohes Risiko für die persönlichen Rechte und Freiheiten natürlicher Personen zur Folge.';
    if (f.data_unintelligible === 'yes') {
        return `${high} Von einer Benachrichtigung der betroffenen Personen sehen wir gemäß Art. 34 Abs. 3 lit. a DSGVO ab, da die betroffenen Daten durch geeignete technische und organisatorische Sicherheitsvorkehrungen für Unbefugte unzugänglich waren. Begründung: ${p.assessment_reason}`;
    }
    if (f.risk_mitigated === 'yes') {
        return `${high} Von einer Benachrichtigung der betroffenen Personen sehen wir gemäß Art. 34 Abs. 3 lit. b DSGVO ab, da durch nachfolgende Maßnahmen sichergestellt ist, dass das hohe Risiko aller Wahrscheinlichkeit nach nicht mehr besteht. Begründung: ${p.assessment_reason}`;
    }
    if (f.disproportionate_effort === 'yes') {
        return `${high} Da die individuelle Benachrichtigung mit einem unverhältnismäßigen Aufwand verbunden wäre, erfolgt stattdessen eine öffentliche Bekanntmachung gemäß Art. 34 Abs. 3 lit. c DSGVO. Begründung: ${p.assessment_reason}`;
    }
    return `${high} Die betroffenen Personen werden unverzüglich gemäß Art. 34 Abs. 1 DSGVO benachrichtigt.`;
}

function breachAuthorityNotification(c) {
    const p = c.payload;
    const f = c.facts;
    const phased = f.facts_complete === 'no';
    let awareness = p.awareness;
    if (f.within_72h === 'no') {
        awareness += `\nDie Meldung erfolgt nicht binnen 72 Stunden nach Bekanntwerden. Begründung der Verzögerung (Art. 33 Abs. 1 Satz 2 DSGVO): ${p.delay_reason}`;
    }
    let doc = `${c.company}\n\nAn die zuständige Datenschutzaufsichtsbehörde\n\nDatum: ${c.date}\n\n`;
    doc += `Betreff: Meldung einer Verletzung des Schutzes personenbezogener Daten gemäß Art. 33 DSGVO${phased ? ' – Erstmeldung' : ''}\n`;
    if (c.subject) doc += `Vorgang: ${c.subject}\n`;
    doc += `\nSehr geehrte Damen und Herren,\n\nhiermit melden wir eine Verletzung des Schutzes personenbezogener Daten gemäß Art. 33 Abs. 1 DSGVO.\n\n`;
    doc += breachSections([
        ['Zeitpunkt des Bekanntwerdens', awareness],
        ['Art der Verletzung (Art. 33 Abs. 3 lit. a DSGVO)', p.incident],
        ['Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze (Art. 33 Abs. 3 lit. a DSGVO)', p.scope || BREACH_PENDING],
        ['Datenschutzbeauftragter oder sonstige Anlaufstelle (Art. 33 Abs. 3 lit. b DSGVO)', p.contact],
        ['Wahrscheinliche Folgen der Verletzung (Art. 33 Abs. 3 lit. c DSGVO)', p.consequences || BREACH_PENDING],
        ['Ergriffene oder vorgeschlagene Maßnahmen (Art. 33 Abs. 3 lit. d DSGVO)', p.measures || BREACH_PENDING],
        ['Benachrichtigung der betroffenen Personen (Art. 34 DSGVO)', breachSubjectClause(f, p)]
    ]);
    if (phased) doc += `\n\nWeitere Informationen reichen wir gemäß Art. 33 Abs. 4 DSGVO ohne unangemessene weitere Verzögerung nach.`;
    doc += `\n\nMit freundlichen Grüßen\n\n${c.company}`;
    return doc;
}

// Art. 34 Abs. 2 DSGVO: klare und einfache Sprache; mindestens Anlaufstelle, Folgen und Maßnahmen.
function breachSubjectNotification(c, isPublic) {
    const p = c.payload;
    let doc = `${c.company}\n\nDatum: ${c.date}\n\n`;
    doc += isPublic
        ? `Öffentliche Bekanntmachung gemäß Art. 34 Abs. 3 lit. c DSGVO\n\nInformation über eine Verletzung des Schutzes personenbezogener Daten\n\nBei uns ist es zu einer Verletzung des Schutzes personenbezogener Daten gekommen. Weil wir nicht alle betroffenen Personen einzeln erreichen können, informieren wir auf diesem Weg.\n\n`
        : `Betreff: Information über eine Verletzung des Schutzes Ihrer personenbezogenen Daten (Art. 34 DSGVO)\n\nSehr geehrte Damen und Herren,\n\nbei uns ist es zu einer Verletzung des Schutzes personenbezogener Daten gekommen, von der auch Ihre Daten betroffen sind. Wir informieren Sie darüber, was geschehen ist und was Sie jetzt tun können.\n\n`;
    doc += `Was ist passiert?\n${p.incident}\n\n`;
    doc += `Welche Folgen sind wahrscheinlich?\n${p.consequences}\n\n`;
    doc += `Was haben wir unternommen und was empfehlen wir Ihnen?\n${p.measures}\n\n`;
    doc += `An wen können Sie sich wenden?\n${p.contact}\n\n`;
    doc += isPublic ? `${c.company}` : `Mit freundlichen Grüßen\n\n${c.company}`;
    return doc;
}

// Art. 33 Abs. 5 DSGVO: Verletzung, Auswirkungen und Abhilfemaßnahmen dokumentieren.
function breachInternalRecord(c) {
    const p = c.payload;
    let doc = `INTERNER DOKUMENTATIONSVERMERK\n\nVerantwortliche Stelle: ${c.company}\n`;
    if (c.subject) doc += `Vorgang: ${c.subject}\n`;
    doc += `Datum des Vermerks: ${c.date}\n\n`;
    doc += breachSections([
        ['Sachverhalt', p.incident],
        p.awareness ? ['Zeitpunkt des Bekanntwerdens', p.awareness] : null,
        ['Bewertung anhand der bestätigten Fakten', c.assessment.map(a => `- [${a.ruleId}] ${a.question} ${a.answer} (${a.source})`).join('\n')],
        ['Ergebnis', `${c.outcome.label} (${c.outcome.legalBasis.join(', ')})`],
        p.assessment_reason ? ['Begründung', p.assessment_reason] : null,
        p.delay_reason ? ['Begründung der Verzögerung', p.delay_reason] : null,
        p.consequences ? ['Auswirkungen', p.consequences] : null,
        p.measures ? ['Abhilfemaßnahmen', p.measures] : null,
        c.reviewer ? ['Manuelle Prüfung', `Geprüft und freigegeben durch: ${c.reviewer}`] : null
    ]);
    return doc;
}

function breachProcessorNotice(c) {
    const p = c.payload;
    let doc = `${c.company}\n\nAn: ${p.controller_name}\n\nDatum: ${c.date}\n\n`;
    doc += `Betreff: Meldung einer Verletzung des Schutzes personenbezogener Daten gemäß Art. 33 Abs. 2 DSGVO\n`;
    if (c.subject) doc += `Vorgang: ${c.subject}\n`;
    doc += `\nSehr geehrte Damen und Herren,\n\nals Ihr Auftragsverarbeiter melden wir Ihnen unverzüglich eine Verletzung des Schutzes personenbezogener Daten, die Daten aus Ihrem Auftrag betrifft. Die Meldung an die Aufsichtsbehörde und die Bewertung des Risikos obliegen Ihnen als Verantwortlichem; wir unterstützen Sie dabei.\n\n`;
    doc += breachSections([
        ['Zeitpunkt des Bekanntwerdens', p.awareness],
        ['Art der Verletzung', p.incident],
        ['Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze', p.scope || 'Diese Angabe liegt noch nicht vollständig vor und wird unverzüglich nachgereicht.'],
        ['Ergriffene oder vorgeschlagene Maßnahmen', p.measures || 'Diese Angabe liegt noch nicht vollständig vor und wird unverzüglich nachgereicht.'],
        ['Ansprechpartner für Rückfragen', p.contact]
    ]);
    doc += `\n\nMit freundlichen Grüßen\n\n${c.company}`;
    return doc;
}

const BREACH_TEMPLATES = {
    record_no_breach: c => breachInternalRecord(c),

    record_no_notification: c => breachInternalRecord(c),

    processor_notice: c => breachBundle([
        ['MITTEILUNG AN DEN VERANTWORTLICHEN (Art. 33 Abs. 2 DSGVO)', breachProcessorNotice(c)],
        ['INTERNER DOKUMENTATIONSVERMERK', breachInternalRecord(c)]
    ]),

    authority_only: c => breachBundle([
        ['MELDUNG AN DIE AUFSICHTSBEHÖRDE (Art. 33 DSGVO)', breachAuthorityNotification(c)],
        ['INTERNER DOKUMENTATIONSVERMERK (Art. 33 Abs. 5 DSGVO)', breachInternalRecord(c)]
    ]),

    authority_and_subjects: c => breachBundle([
        ['MELDUNG AN DIE AUFSICHTSBEHÖRDE (Art. 33 DSGVO)', breachAuthorityNotification(c)],
        ['BENACHRICHTIGUNG DER BETROFFENEN PERSONEN (Art. 34 DSGVO) – ENTWURF', breachSubjectNotification(c, false)],
        ['INTERNER DOKUMENTATIONSVERMERK (Art. 33 Abs. 5 DSGVO)', breachInternalRecord(c)]
    ]),

    authority_and_public: c => breachBundle([
        ['MELDUNG AN DIE AUFSICHTSBEHÖRDE (Art. 33 DSGVO)', breachAuthorityNotification(c)],
        ['ÖFFENTLICHE BEKANNTMACHUNG (Art. 34 Abs. 3 lit. c DSGVO) – ENTWURF', breachSubjectNotification(c, true)],
        ['INTERNER DOKUMENTATIONSVERMERK (Art. 33 Abs. 5 DSGVO)', breachInternalRecord(c)]
    ])
};

export const BreachDocumentsAction = createAction({
    id: 'generate_breach_documents',
    rulebook: BreachRulebook,
    templates: BREACH_TEMPLATES
});
