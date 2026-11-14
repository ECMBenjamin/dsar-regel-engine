/**
 * @file Datenkopie: CSV/JSON in eine lesbare Textanlage umformen
 * Reine Funktionen ohne DOM-Zugriff.
 * @author benthy
 * @license MIT
 */

export function splitCsvLine(line, delim) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
            } else { cur += ch; }
        } else if (ch === '"') { inQuotes = true; }
        else if (ch === delim) { out.push(cur.trim()); cur = ''; }
        else { cur += ch; }
    }
    out.push(cur.trim());
    return out;
}

export function formatAttachment(filename, content) {
    let formatted = "--- DATENKOPIE GEMÄSS ART. 15 ABS. 3 DSGVO ---\n";
    formatted += "HINWEIS: Bitte prüfen Sie diese Rohdaten vor dem Versand auf Rechte Dritter (Art. 15 Abs. 4 DSGVO) und schwärzen Sie diese gegebenenfalls.\n\n";
    const lower = filename.toLowerCase();
    try {
        if (lower.endsWith('.json')) {
            formatted += JSON.stringify(JSON.parse(content), null, 2);
        } else if (lower.endsWith('.csv')) {
            const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
            const first = lines[0] || '';
            const count = ch => first.split(ch).length - 1;
            const delim = count(';') > count(',') ? ';' : (count('\t') > count(',') ? '\t' : ',');
            lines.forEach(line => { formatted += splitCsvLine(line, delim).join(' | ') + '\n'; });
        } else {
            formatted += content;
        }
    } catch (err) {
        formatted += "Fehler beim Parsen der Datei. Rohdaten:\n" + content;
    }
    return formatted;
}
