/**
 * @file Fristenrechner (BGB / VO 1182/71) mit Feiertagslogik
 * Reine Funktionen ohne DOM-Zugriff. Landesfeiertage gelten erst ab ihrem Einführungsjahr.
 * @author benthy
 * @license MIT
 */

export const pad2 = n => String(n).padStart(2, '0');
export const formatDateDE = d => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
export const toISODateLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function parseLocalDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return (d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])) ? d : null;
}

export function getEasterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

export function getHolidays(year, stateCode) {
    const easter = getEasterSunday(year);
    const format = d => `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const holidays = {
        "01-01": "Neujahr", "05-01": "Tag der Arbeit", "10-03": "Tag der Deutschen Einheit",
        "12-25": "1. Weihnachtsfeiertag", "12-26": "2. Weihnachtsfeiertag",
        [format(addDays(easter, -2))]: "Karfreitag", [format(addDays(easter, 1))]: "Ostermontag",
        [format(addDays(easter, 39))]: "Christi Himmelfahrt", [format(addDays(easter, 50))]: "Pfingstmontag"
    };
    // Feiertage mit Stichjahr: Sie gelten erst ab ihrer Einführung, nicht rückwirkend.
    if (['BW', 'BY', 'ST'].includes(stateCode)) holidays["01-06"] = "Heilige Drei Könige";
    if ((stateCode === 'BE' && year >= 2019) || (stateCode === 'MV' && year >= 2023)) holidays["03-08"] = "Internationaler Frauentag";
    if (stateCode === 'BE' && (year === 2020 || year === 2025)) holidays["05-08"] = "Tag der Befreiung (einmaliger Feiertag in Berlin)";
    if (stateCode === 'BE' && year === 2028) holidays["06-17"] = "Jahrestag des Volksaufstands vom 17. Juni 1953 (einmaliger Feiertag in Berlin)";
    if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(stateCode)) holidays[format(addDays(easter, 60))] = "Fronleichnam";
    if (['BY', 'SL'].includes(stateCode)) holidays["08-15"] = "Mariä Himmelfahrt";
    if (stateCode === 'TH' && year >= 2019) holidays["09-20"] = "Weltkindertag";
    if (['BB', 'MV', 'SN', 'ST', 'TH'].includes(stateCode)
        || (['HB', 'HH', 'NI', 'SH'].includes(stateCode) && year >= 2018)
        || year === 2017) holidays["10-31"] = "Reformationstag";
    if (['BW', 'BY', 'NW', 'RP', 'SL'].includes(stateCode)) holidays["11-01"] = "Allerheiligen";
    if (stateCode === 'SN') {
        const nov23 = new Date(year, 10, 23);
        let daysToWed = (nov23.getDay() + 4) % 7;
        if (daysToWed === 0) daysToWed = 7;
        holidays[format(addDays(nov23, -daysToWed))] = "Buß- und Bettag";
    }
    return holidays;
}

export function addMonths(date, months) {
    const d = new Date(date.getTime());
    const expectedMonth = ((d.getMonth() + months) % 12 + 12) % 12;
    d.setMonth(d.getMonth() + months);
    if (d.getMonth() !== expectedMonth) {
        d.setDate(0); // Clamp to last day of the intended month (§ 188 Abs. 3 BGB)
    }
    return d;
}

// Ob für DSGVO-Fristen das BGB oder die Fristen-Verordnung (EWG, Euratom) Nr. 1182/71 gilt, ist umstritten.
export const DEADLINE_CAVEAT = 'Orientierungswert nach BGB / VO 1182/71 (praxisüblich, aber im Detail umstritten)';
export const GDPR_APPLICABLE_FROM = new Date(2018, 4, 25);

// Rein: liefert Fristende und Protokoll, ohne DOM-Zugriff.
export function computeDeadline(receiptDate, stateCode, extended) {
    let endDate = addMonths(receiptDate, extended ? 3 : 1);
    const steps = [
        `Ereignis (Eingang): ${formatDateDE(receiptDate)} (§ 187 Abs. 1 BGB)`,
        `Reguläres Fristende: ${formatDateDE(endDate)} (§ 188 Abs. 2 BGB)`
    ];
    let shifted = false;
    while (true) {
        const dayOfWeek = endDate.getDay();
        const md = `${pad2(endDate.getMonth() + 1)}-${pad2(endDate.getDate())}`;
        const holidays = getHolidays(endDate.getFullYear(), stateCode);
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            steps.push(`Verschiebung wegen Wochenende: ${WEEKDAYS[dayOfWeek]}, ${formatDateDE(endDate)}`);
            endDate = addDays(endDate, 1); shifted = true;
        } else if (holidays[md]) {
            steps.push(`Verschiebung wegen Feiertag: ${holidays[md]}`);
            endDate = addDays(endDate, 1); shifted = true;
        } else { break; }
    }
    if (shifted) steps.push(`Verschiebung auf den nächsten Werktag (§ 193 BGB bzw. Art. 3 Abs. 4 VO 1182/71): ${formatDateDE(endDate)}. ${DEADLINE_CAVEAT}.`);
    else steps.push(`Keine Verschiebung erforderlich. ${DEADLINE_CAVEAT}.`);
    return { endDate: endDate, steps: steps, shifted: shifted };
}
