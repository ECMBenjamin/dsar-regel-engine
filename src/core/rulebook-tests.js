/**
 * @file Selbsttests für Rulebooks
 * Jedes Rulebook kann im Feld "tests" eigene Testfälle mitbringen: Fakten rein, erwartete Entscheidung raus.
 * Die Testfälle laufen auf einer eigenen Engine-Instanz; der Audit-Log der Anwendung bleibt unberührt.
 * Die Engine selbst kennt das Feld "tests" nicht (sie ignoriert unbekannte Felder).
 * @author benthy
 * @license MIT
 */

import { UniversalRulesEngine } from './engine.js';

const EXPECT_KEYS = ['decision', 'status', 'outcome', 'score'];

/**
 * @param {object} rulebook
 * @returns {{rulebookId, version, rulebookHash, valid, errors, total, passed, failed, results, uncoveredOutcomes}}
 */
export function runRulebookTests(rulebook) {
    const md = rulebook && rulebook.metadata ? rulebook.metadata : {};
    const report = {
        rulebookId: md.id || null, version: md.version || null, rulebookHash: null,
        valid: false, errors: [], total: 0, passed: 0, failed: 0, results: [], uncoveredOutcomes: []
    };

    let engine;
    try {
        engine = new UniversalRulesEngine().load(rulebook);
    } catch (err) {
        report.errors.push(err.message);
        return report;
    }
    report.valid = true;
    report.rulebookHash = engine.rulebookHash;

    const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const types = rulebook.requestTypes.map(t => t.id);
    const cases = Array.isArray(rulebook.tests) ? rulebook.tests : [];
    const seen = {};
    const covered = {};

    cases.forEach((tc, i) => {
        const id = isObj(tc) && typeof tc.id === 'string' && tc.id ? tc.id : 'tests[' + i + ']';
        const entry = {
            id: id,
            description: isObj(tc) && typeof tc.description === 'string' ? tc.description : '',
            ok: false,
            expected: isObj(tc) && isObj(tc.expect) ? tc.expect : null,
            actual: null,
            message: ''
        };

        let problem = '';
        if (!isObj(tc)) problem = 'Testfall ist kein Objekt.';
        else if (seen[id]) problem = 'ID ist nicht eindeutig.';
        else if (types.indexOf(tc.requestType) === -1) problem = 'Unbekannter requestType.';
        else if (!isObj(tc.facts)) problem = 'facts muss ein Objekt sein.';
        else if (!isObj(tc.expect) || !tc.expect.decision) problem = 'expect.decision fehlt.';
        else if (Object.keys(tc.expect).some(k => EXPECT_KEYS.indexOf(k) === -1)) problem = 'Unbekannter Schlüssel in expect (erlaubt: ' + EXPECT_KEYS.join(', ') + ').';
        seen[id] = true;

        if (problem) {
            entry.message = problem;
        } else {
            const ev = engine.evaluate({ caseId: 'SELFTEST-' + id, requestType: tc.requestType, facts: tc.facts });
            entry.actual = { decision: ev.decision, status: ev.status, outcome: ev.outcome ? ev.outcome.id : null, score: ev.score };
            const diffs = Object.keys(tc.expect).filter(k => tc.expect[k] !== entry.actual[k]);
            entry.ok = diffs.length === 0;
            entry.message = entry.ok ? 'OK' : 'Abweichung bei: ' + diffs.join(', ');
            if (entry.ok && ev.outcome) covered[ev.outcome.id] = true;
        }

        report.results.push(entry);
        if (entry.ok) report.passed += 1; else report.failed += 1;
    });

    report.total = report.results.length;
    report.uncoveredOutcomes = rulebook.outcomes.map(o => o.id).filter(id => !covered[id]);
    return report;
}
