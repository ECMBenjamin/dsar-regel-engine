/**
 * @file Smart Ingestion für Betroffenenanfragen
 * Liest den Text einer Anfrage und liefert Vorschläge. Vorschläge sind keine Fakten:
 * Die Engine wertet nur aus, was der Nutzer aktiv bestätigt.
 * @author benthy
 * @license MIT
 */

export function parseDsarRequest(text) {
    // Strict Priority Parsing
    let requestType = 'art15'; // Fallback, wird unten begründet
    const reasoning = [];
    const suggestions = {};

    if (/(art\.?\s*17|löschung|löschen|vergessenwerden)/i.test(text)) {
        requestType = 'art17';
        reasoning.push("Als Art. 17 (Löschung) klassifiziert, da explizite Lösch-Schlüsselwörter gefunden wurden.");
    } else if (/(art\.?\s*12\s*abs\.?\s*3|fristverlängerung)/i.test(text)) {
        requestType = 'art12_3';
        reasoning.push("Als Art. 12 Abs. 3 klassifiziert, da explizit Fristverlängerung angefragt wurde.");
    } else if (/(art\.?\s*15|auskunft|datenkopie)/i.test(text)) {
        requestType = 'art15';
        reasoning.push("Als Art. 15 (Auskunft) klassifiziert, da Auskunft/Datenkopie explizit genannt wurde.");
    } else {
        reasoning.push("Keine eindeutigen Artikel gefunden. Fallback auf Art. 15 (Auskunft).");
    }

    let subject = '';
    const nameMatch = text.match(/(?:Mit freundlichen Grüßen|Freundliche Grüße|Viele Grüße|Beste Grüße|Grüße|Gruß)[,!.]?[ \t]*(?:\r?\n)+[ \t]*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .'-]{1,80})/i);
    if (nameMatch && nameMatch[1].trim().length > 2) subject = nameMatch[1].trim();

    if (/(anwalt|rechtsbeistand|klage)/i.test(text)) {
        reasoning.push("Flag: Anwalt/Klage erkannt.");
    }
    if (/(ausweis|identitätsnachweis)/i.test(text)) {
        suggestions.id_doubt = 'yes';
        reasoning.push("Flag: Ausweis/Identitätsnachweis erwähnt -> Identitätszweifel als Vorschlag hinterlegt.");
    }
    if (/(frist)/i.test(text) && requestType !== 'art12_3') {
        reasoning.push("Flag: 'Frist' erkannt. Wurde als Fristsetzung des Betroffenen gewertet, ändert nicht den Anfrage-Typ.");
    }

    return { requestType: requestType, subject: subject, suggestions: suggestions, reasoning: reasoning };
}
