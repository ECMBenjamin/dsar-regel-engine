/**
 * @file Action: Antwortschreiben (Execution / Enforcement)
 * Textbausteine des DSGVO-Packs für Betroffenenanfragen. Ablauf und Freigabe: siehe create-action.js.
 * @author benthy
 * @license MIT
 */

import { createAction } from './create-action.js';
import { DSARRulebook } from '../rulepacks/dsar-gdpr-de.js';

export const RIGHTS_NOTICE = 'Gemäß Art. 12 Abs. 4 DSGVO weisen wir Sie darauf hin, dass Sie das Recht haben, Beschwerde bei einer Datenschutzaufsichtsbehörde einzulegen (Art. 77 DSGVO) oder einen gerichtlichen Rechtsbehelf einzulegen (Art. 79 DSGVO).';

const RESPONSE_LETTER_TEMPLATES = {
    identity_check: c =>
        `Betreff: Ihre Datenschutzanfrage – Identitätsprüfung erforderlich\n\n${c.salutation}\n\nwir nehmen Bezug auf Ihre Anfrage. Der Schutz personenbezogener Daten hat für uns höchste Priorität. Gemäß Art. 12 Abs. 6 DSGVO sind wir verpflichtet, bei begründeten Zweifeln an der Identität der anfragenden Person zusätzliche Informationen anzufordern, um eine unbefugte Offenlegung von Daten zu verhindern.\n\nDa wir Ihre Identität anhand der vorliegenden Daten nicht zweifelsfrei feststellen können, bitten wir Sie um einen geeigneten Nachweis (z.B. Verifizierung über Ihr Kundenkonto oder Nennung Ihrer Kundennummer).\n\nDie gesetzliche Bearbeitungsfrist ruht bis zur Klärung.\n\nMit freundlichen Grüßen\n\n${c.company}`,

    refusal_excessive: c =>
        `Betreff: Ihre Datenschutzanfrage – Ablehnung\n\n${c.salutation}\n\nwir lehnen die Bearbeitung Ihrer Anfrage gemäß Art. 12 Abs. 5 Satz 2 DSGVO ab, da diese offenkundig unbegründet bzw. exzessiv ist.\n\n${RIGHTS_NOTICE}\n\nMit freundlichen Grüßen\n\n${c.company}`,

    negative_disclosure: c =>
        `Betreff: Ihre Datenschutzanfrage – Negativauskunft\n\n${c.salutation}\n\ngemäß Art. 15 Abs. 1 DSGVO teilen wir Ihnen mit, dass in unserem Unternehmen keine personenbezogenen Daten zu Ihrer Person verarbeitet werden.\n\nMit freundlichen Grüßen\n\n${c.company}`,

    clarification_request: c =>
        `Betreff: Ihre Datenschutzanfrage – Bitte um Präzisierung\n\n${c.salutation}\n\nwir verarbeiten eine sehr große Menge an Informationen über Sie. Gemäß Erwägungsgrund 63 Satz 7 DSGVO bitten wir Sie, Ihr Auskunftsersuchen auf bestimmte Informationen oder Verarbeitungsvorgänge zu präzisieren.\n\nMit freundlichen Grüßen\n\n${c.company}`,

    full_disclosure: c => {
        const p = c.payload;
        const f = c.facts;
        let n = 0;
        let doc = `Betreff: Auskunft nach Art. 15 DSGVO\n\n${c.salutation}\n\nhiermit erteilen wir Ihnen die gewünschte Auskunft über die zu Ihrer Person verarbeiteten Daten gemäß Art. 15 DSGVO.\n\n`;
        doc += `${++n}. Verarbeitungszwecke und Rechtsgrundlagen (Art. 15 Abs. 1 lit. a DSGVO)\nWir verarbeiten Ihre Daten zu folgenden Zwecken: ${p.purposes}\n\n`;
        doc += `${++n}. Kategorien personenbezogener Daten (Art. 15 Abs. 1 lit. b DSGVO)\nEs werden folgende Datenkategorien verarbeitet: ${p.categories}\n\n`;
        doc += `${++n}. Empfänger der Daten (Art. 15 Abs. 1 lit. c DSGVO)\nIhre Daten werden gegenüber folgenden Empfängern bzw. Kategorien von Empfängern offengelegt: ${p.recipients}\n\n`;
        doc += `${++n}. Speicherdauer (Art. 15 Abs. 1 lit. d DSGVO)\nIhre Daten werden gelöscht, sobald sie für die genannten Zwecke nicht mehr erforderlich sind. Konkret: ${p.retention}\n\n`;
        doc += `${++n}. Ihre Rechte (Art. 15 Abs. 1 lit. e DSGVO)\nSie haben das Recht auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) sowie ein Widerspruchsrecht (Art. 21).\n\n`;
        doc += `${++n}. Herkunft der Daten (Art. 15 Abs. 1 lit. f DSGVO)\n${p.origin}\n\n`;
        doc += `${++n}. Automatisierte Entscheidungsfindung (Art. 15 Abs. 1 lit. g DSGVO)\n${p.automated}\n\n`;
        doc += `${++n}. Beschwerderecht (Art. 15 Abs. 1 lit. h DSGVO)\nSie haben das Recht auf Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO).\n\n`;
        if (f.third_country === 'yes') {
            doc += `${++n}. Übermittlung in Drittländer (Art. 15 Abs. 2 DSGVO)\nIhre Daten werden an Empfänger in einem Drittland übermittelt. Geeignete Garantien gemäß Art. 46 DSGVO: ${p.safeguards}\n\n`;
        }
        doc += `${++n}. Datenkopie (Art. 15 Abs. 3 DSGVO)\n`;
        if (p.attachment) {
            // Nur wenn tatsächlich eine Datenkopie eingebunden ist, darf das Schreiben "anbei" sagen.
            if (f.electronic_format === 'yes') {
                doc += `Da Sie den Antrag elektronisch gestellt haben, stellen wir Ihnen die Kopie Ihrer Daten als elektronische Anlage zur Verfügung.\n`;
            } else {
                doc += `Anbei erhalten Sie eine Kopie der zu Ihnen verarbeiteten personenbezogenen Daten.\n`;
            }
        } else {
            doc += `Die Kopie Ihrer Daten wird Ihnen in einer separaten Anlage zur Verfügung gestellt.`;
            if (f.electronic_format === 'yes') {
                doc += ` Da Sie den Antrag elektronisch gestellt haben, erhalten Sie diese in einem gängigen elektronischen Format.`;
            }
            doc += `\n`;
        }
        if (f.third_party === 'yes') {
            doc += `\nHinweis: Zum Schutz der Rechte und Freiheiten anderer Personen (Art. 15 Abs. 4 DSGVO) wurden bestimmte Passagen in der Datenkopie geschwärzt.\n`;
        }
        doc += `\nMit freundlichen Grüßen\n\n${c.company}\n\n`;
        if (p.attachment) doc += `\n${p.attachment}`;
        return doc;
    },

    erasure_rejected: c =>
        `Betreff: Ihre Löschungsanfrage – Ablehnung\n\n${c.salutation}\n\nwir können Ihrem Löschbegehren nicht nachkommen, da kein gesetzlicher Löschgrund nach Art. 17 Abs. 1 DSGVO vorliegt.\n\n${RIGHTS_NOTICE}\n\nMit freundlichen Grüßen\n\n${c.company}`,

    erasure_restricted: c =>
        `Betreff: Ihre Löschungsanfrage – Einschränkung der Verarbeitung\n\n${c.salutation}\n\nwir können Ihre Daten derzeit nicht vollständig löschen, da gesetzliche Aufbewahrungspflichten (z.B. § 257 HGB, § 147 AO) gemäß Art. 17 Abs. 3 DSGVO entgegenstehen. Wir haben Ihre Daten jedoch für die weitere Verarbeitung gesperrt (Einschränkung der Verarbeitung nach Art. 18 DSGVO).\n\n${RIGHTS_NOTICE}\n\nMit freundlichen Grüßen\n\n${c.company}`,

    erasure_confirmed: c => {
        let doc = `Betreff: Bestätigung der Löschung nach Art. 17 DSGVO\n\n${c.salutation}\n\nwir bestätigen hiermit, dass wir Ihre personenbezogenen Daten antragsgemäß und vollständig gelöscht haben.\n`;
        if (c.facts.public_data === 'yes') {
            doc += `\nGemäß Art. 17 Abs. 2 DSGVO haben wir zudem angemessene Maßnahmen getroffen, um andere Verantwortliche, die diese Daten verarbeiten, über Ihr Löschbegehren zu informieren.\n`;
        }
        if (c.facts.recipients === 'yes') {
            doc += `\nGemäß Art. 19 DSGVO haben wir zudem alle Empfänger, denen Ihre Daten offengelegt wurden, über diese Löschung informiert.\n`;
        }
        doc += `\nMit freundlichen Grüßen\n\n${c.company}`;
        return doc;
    },

    extension_notice: c =>
        `Betreff: Ihre Datenschutzanfrage – Fristverlängerung\n\n${c.salutation}\n\nwir bestätigen den Eingang Ihrer Anfrage. Gemäß Art. 12 Abs. 3 DSGVO informieren wir Sie hiermit, dass wir die reguläre Bearbeitungsfrist von einem Monat um weitere zwei Monate verlängern müssen.\n\nGrund für die Verlängerung ist die hohe Komplexität Ihrer Anfrage, die eine umfangreiche Prüfung diverser Systeme erfordert.\n\nWir werden Ihnen die Antwort unaufgefordert zukommen lassen.\n\nMit freundlichen Grüßen\n\n${c.company}`
};

export const ResponseLetterAction = createAction({
    id: 'generate_response_letter',
    rulebook: DSARRulebook,
    templates: RESPONSE_LETTER_TEMPLATES,
    // Ohne Namen: neutrale Anrede, keine Namenszeile im Briefkopf.
    compose(tpl, c) {
        const salutation = c.subject ? `Sehr geehrte(r) ${c.subject},` : 'Sehr geehrte Damen und Herren,';
        const head = `${c.company}\n\n` + (c.subject ? `${c.subject}\n\n` : '') + `Datum: ${c.date}\n\n`;
        return head + tpl(Object.assign({}, c, { salutation: salutation }));
    }
});
