/**
 * @file Generische Action für importierte Rulebooks: neutrales Entscheidungsprotokoll
 * Importierte Rulebooks bringen keine Textbausteine mit. Statt Schreiben an Dritte entsteht
 * ein Protokoll aus Outcome, Rechtsgrundlagen, bestätigten Fakten, Angaben und Auflagen.
 * Ablauf und Freigabe: siehe create-action.js.
 * @author benthy
 * @license MIT
 */

import { createAction } from './create-action.js';

export function createProtocolAction(rulebook, actionId) {
    const md = rulebook.metadata;

    const render = c => {
        const p = c.payload;
        const out = ['ENTSCHEIDUNGSPROTOKOLL', ''];
        out.push(`Stelle: ${c.company}`);
        if (c.subject) out.push(`Vorgang: ${c.subject}`);
        out.push(`Datum: ${c.date}`);
        out.push(`Rule Pack: ${md.name || md.id} (${md.id}@${md.version}), importiert, nicht mitgeliefert`);
        out.push('', '1. Ergebnis', `${c.outcome.label} (${c.outcome.legalBasis.join(', ')})`);
        out.push('', '2. Bewertung anhand der bestätigten Fakten');
        c.assessment.forEach(a => out.push(`- [${a.ruleId}] ${a.question} ${a.answer} (${a.source})`));
        let n = 2;
        if (c.outcome.requiredInputs.length) {
            out.push('', `${++n}. Angaben`);
            c.outcome.requiredInputs.forEach(r => out.push(`${r.label}: ${p[r.field]}`));
        }
        if (c.outcome.obligations.length) {
            out.push('', `${++n}. Auflagen`);
            c.outcome.obligations.forEach(o => out.push(`- ${o.text}`));
        }
        if (c.reviewer) {
            out.push('', `${++n}. Manuelle Prüfung`, `Geprüft und freigegeben durch: ${c.reviewer}`);
        }
        return out.join('\n');
    };

    // Jedes Template, auf das ein ALLOW-Outcome verweist, erzeugt dasselbe Protokoll.
    const templates = {};
    rulebook.outcomes.forEach(o => { if (o.effect === 'ALLOW') templates[o.template] = render; });
    return createAction({ id: actionId, rulebook: rulebook, templates: templates });
}
