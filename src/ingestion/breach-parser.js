/**
 * @file Smart Ingestion für Vorfallberichte (Datenpannen)
 * Liest die Beschreibung eines Vorfalls und liefert Vorschläge. Vorschläge sind keine Fakten:
 * Die Engine wertet nur aus, was der Nutzer aktiv bestätigt.
 * @author benthy
 * @license MIT
 */

export function parseBreachReport(text) {
    const reasoning = [];
    const suggestions = {};

    if (/(ransomware|schadsoftware|phishing|gehackt|hackerangriff|fehlversand|falsch(?:en)? empfänger|verloren|verlust|diebstahl|gestohlen|unbefugt|datenleck|offengelegt)/i.test(text)) {
        suggestions.breach_confirmed = 'yes';
        reasoning.push('Hinweis auf Verlust, unbefugten Zugang oder Offenlegung erkannt -> Verletzung als Vorschlag hinterlegt.');
    } else {
        reasoning.push('Kein eindeutiger Hinweis auf eine Verletzung erkannt. Bitte Sachverhalt selbst einordnen.');
    }

    if (/(gesundheitsdaten|patientendaten|diagnose|bankdaten|kontodaten|kreditkarte|iban|passw[oö]rt|zugangsdaten|ausweis|sozialversicherung|besondere kategorien)/i.test(text)) {
        suggestions.high_risk = 'yes';
        reasoning.push('Sensible Daten erwähnt (z.B. Gesundheits-, Finanz- oder Zugangsdaten) -> hohes Risiko als Vorschlag hinterlegt.');
    }

    // "verschlüsselt" allein ist mehrdeutig: Bei Ransomware verschlüsselt der Angreifer. Deshalb nur eindeutige Formulierungen.
    if (/(unverschlüsselt|nicht verschlüsselt|ohne verschlüsselung)/i.test(text)) {
        suggestions.data_unintelligible = 'no';
        reasoning.push('Fehlende Verschlüsselung erwähnt -> Daten waren für Unbefugte lesbar (Vorschlag).');
    } else if (/(bitlocker|filevault|festplattenverschlüsselung|vollverschlüssel|verschlüsselte[rsn]? (?:laptop|notebook|festplatte|datenträger|usb-stick|smartphone|gerät))/i.test(text)) {
        suggestions.data_unintelligible = 'yes';
        reasoning.push('Geräte- oder Datenträgerverschlüsselung erwähnt -> Daten für Unbefugte unzugänglich (Vorschlag).');
    }

    const elapsed = text.match(/(?:vor|seit)\s+(\d{1,3})\s+(stunden|tagen)/i);
    if (elapsed) {
        const hours = Number(elapsed[1]) * (/tagen/i.test(elapsed[2]) ? 24 : 1);
        suggestions.within_72h = hours < 72 ? 'yes' : 'no';
        reasoning.push(`Zeitangabe erkannt (${elapsed[0]}) -> ${hours < 72 ? 'innerhalb' : 'außerhalb'} der 72-Stunden-Frist als Vorschlag hinterlegt. Maßgeblich ist der Zeitpunkt des Bekanntwerdens.`);
    }

    if (/(auftragsverarbeit|im auftrag von)/i.test(text)) {
        reasoning.push('Flag: Auftragsverarbeitung erwähnt. Bitte die eigene Rolle (Verantwortlicher oder Auftragsverarbeiter) prüfen.');
    }

    return { requestType: 'breach', subject: '', suggestions: suggestions, reasoning: reasoning };
}
