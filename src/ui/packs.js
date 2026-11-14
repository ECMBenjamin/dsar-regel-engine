/**
 * @file Registry der Rule Packs für die Oberfläche
 * Ein Pack besteht aus Rulebook (Daten), Action (Textbausteine), Parser (Vorschläge) und Beschriftungen.
 * Die Engine wird dafür nicht angefasst: Ein neues Pack ist ein neuer Eintrag in dieser Liste.
 * @author benthy
 * @license MIT
 */

import { DSARRulebook } from '../rulepacks/dsar-gdpr-de.js';
import { BreachRulebook } from '../rulepacks/breach-gdpr-de.js';
import { ResponseLetterAction } from '../actions/response-letter.js';
import { BreachDocumentsAction } from '../actions/breach-documents.js';
import { parseDsarRequest } from '../ingestion/dsar-parser.js';
import { parseBreachReport } from '../ingestion/breach-parser.js';
import { presets } from '../domain/content.js';

export const RULE_PACKS = [
    {
        rulebook: DSARRulebook,
        action: ResponseLetterAction,
        parse: parseDsarRequest,
        presets: {
            title: 'Branchen-Presets (Pflichtangaben Art. 15)',
            intro: 'Wählen Sie ein Profil, um die Pflichtangaben nach Art. 15 Abs. 1 lit. a-h DSGVO mit generischen, rechtlich korrekten Begriffen vorzubelegen, oder füllen Sie die Felder manuell aus.',
            options: [
                { id: 'agency', label: 'Digitalagentur / Webentwicklung' },
                { id: 'ecommerce', label: 'E-Commerce / Online-Shop' },
                { id: 'saas', label: 'SaaS / Software-Anbieter' },
                { id: 'coaching', label: 'Coaching & Dienstleistungen' }
            ],
            values: presets
        },
        text: {
            ingestIntro: 'Fügen Sie die E-Mail des Betroffenen ein. Der Parser analysiert den Text, erkennt den Anfrage-Typ und erzeugt Vorschläge für die nachfolgende Prüfung. Vorschläge sind keine Fakten: Die Engine wertet ausschließlich aktiv bestätigte Antworten aus.',
            ingestLabel: 'E-Mail-Text der betroffenen Person',
            ingestPlaceholder: 'Sehr geehrte Damen und Herren, hiermit fordere ich Auskunft nach Art. 15 DSGVO...',
            ingestMissing: 'Bitte fügen Sie zuerst den Text der Anfrage ein.',
            suggestionSource: 'E-Mail',
            subjectLabel: 'Erkannter Name der betroffenen Person',
            subjectHint: 'Bleibt das Feld leer, verwendet das Schreiben die Anrede „Sehr geehrte Damen und Herren“.',
            actionButton: 'Aktion ausführen: Schreiben generieren',
            resultTitle: 'Schritt 4: Ausgeführte Aktion – Antwortschreiben',
            resultIntro: 'Dieses Schreiben wurde erst erzeugt, nachdem die Engine die Aktion freigegeben hat. Es basiert deterministisch auf Ihren bestätigten Eingaben und enthält keine Platzhalter.',
            exportLabel: 'Schreiben (.txt) speichern',
            filePrefix: 'DSAR',
            exportFile: 'DSAR_Antwortschreiben.txt',
            attachmentWarning: 'Achtung: Es wurde keine Datenkopie eingebunden. Das Schreiben verweist auf eine separate Anlage; diese muss dem Versand beigefügt werden (Art. 15 Abs. 3 DSGVO).'
        }
    },
    {
        rulebook: BreachRulebook,
        action: BreachDocumentsAction,
        parse: parseBreachReport,
        presets: null,
        text: {
            ingestIntro: 'Fügen Sie die interne Beschreibung des Vorfalls ein (z.B. die Meldung der IT oder des Mitarbeiters). Der Parser erzeugt daraus Vorschläge für die nachfolgende Prüfung. Vorschläge sind keine Fakten: Die Engine wertet ausschließlich aktiv bestätigte Antworten aus.',
            ingestLabel: 'Vorfallbericht',
            ingestPlaceholder: 'Am Montag wurde ein unverschlüsselter Laptop mit Kundendaten gestohlen...',
            ingestMissing: 'Bitte fügen Sie zuerst die Beschreibung des Vorfalls ein.',
            suggestionSource: 'Vorfallbericht',
            subjectLabel: 'Kurzbezeichnung des Vorfalls (optional)',
            subjectHint: 'Erscheint als Vorgangszeile in den Dokumenten, z.B. „Laptop-Diebstahl Vertrieb“.',
            actionButton: 'Aktion ausführen: Dokumente erzeugen',
            resultTitle: 'Schritt 4: Ausgeführte Aktion – Meldung und Dokumentation',
            resultIntro: 'Diese Dokumente wurden erst erzeugt, nachdem die Engine die Aktion freigegeben hat. Sie basieren deterministisch auf Ihren bestätigten Eingaben. Meldung und Benachrichtigung sind Entwürfe für den Meldeweg Ihrer Aufsichtsbehörde.',
            exportLabel: 'Dokumente (.txt) speichern',
            filePrefix: 'Datenpanne',
            exportFile: 'Datenpanne_Meldung_und_Dokumentation.txt',
            attachmentWarning: ''
        }
    }
];
