/**
 * @file Tests für die DOM-freien Module: Crypto, Engine, Rule Pack, Action, Fristenrechner.
 * @author benthy
 * @license MIT
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex, canonicalJson, sha256SelfTest } from '../src/core/crypto.js';
import { UniversalRulesEngine } from '../src/core/engine.js';
import { DSARRulebook } from '../src/rulepacks/dsar-gdpr-de.js';
import { ResponseLetterAction } from '../src/actions/response-letter.js';
import { getHolidays, computeDeadline, parseLocalDate, formatDateDE } from '../src/domain/deadline.js';

const ACTION = 'generate_response_letter';
const newEngine = () => new UniversalRulesEngine().load(DSARRulebook);
const FULL = { id_doubt: 'no', excessive: 'no', data_processed: 'yes', large_amount: 'no', third_party: 'no', third_country: 'no', electronic_format: 'no' };
const PAYLOAD = { name: 'Max Mustermann', company: 'Muster GmbH', issueDate: '01.02.2026', purposes: 'p', categories: 'c', recipients: 'r', retention: 't', origin: 'o', automated: 'a', safeguards: '', attachment: '' };

test('SHA-256 stimmt mit der Referenzimplementierung überein', () => {
    for (const s of ['', 'abc', 'Grüße äöü €', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
        assert.equal(sha256Hex(s), createHash('sha256').update(s, 'utf8').digest('hex'), `Länge ${s.length}`);
    }
    assert.equal(sha256SelfTest(), true);
});

test('kanonisches JSON ist unabhängig von der Schlüsselreihenfolge', () => {
    assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('Rulebook ist gültig, reine Daten und nach dem Laden eingefroren', () => {
    assert.deepEqual(UniversalRulesEngine.validateRulebook(DSARRulebook), []);
    assert.deepEqual(JSON.parse(JSON.stringify(DSARRulebook)), DSARRulebook);
    newEngine();
    assert.ok(Object.isFrozen(DSARRulebook.rules[0].risk));
});

test('Validierung weist ein fehlerhaftes Rulebook zurück', () => {
    const bad = JSON.parse(JSON.stringify(DSARRulebook));
    bad.rules[1].showIf.fact = 'gibt_es_nicht';
    delete bad.rules[0].provenance;
    assert.equal(UniversalRulesEngine.validateRulebook(bad).length, 2);
    assert.throws(() => new UniversalRulesEngine().load(bad), /Ungültiges Rulebook/);
});

test('jedes ALLOW-Outcome verweist auf ein vorhandenes Template', () => {
    for (const o of DSARRulebook.outcomes.filter(o => o.effect === 'ALLOW')) {
        assert.equal(typeof ResponseLetterAction.templates[o.template], 'function', o.id);
    }
});

test('Entscheidungen: Default-Deny, Score, Outcome', () => {
    const e = newEngine();
    const ev = (requestType, facts) => e.evaluate({ caseId: 'T', requestType, facts });
    const cases = [
        ['art15', {}, 'BLOCKED', 'INCOMPLETE', null, null],
        ['art15', { id_doubt: 'yes' }, 'MANUAL_REVIEW', 'REVIEW_REQUIRED', 0.2, 'A15-IDENTITY'],
        ['art15', { id_doubt: 'no', excessive: 'yes' }, 'MANUAL_REVIEW', 'REVIEW_REQUIRED', 0.3, 'A15-REFUSAL'],
        ['art15', { id_doubt: 'no', excessive: 'no', data_processed: 'no' }, 'PERMITTED', 'COMPLIANT', 1, 'A15-NEGATIVE'],
        ['art15', FULL, 'PERMITTED', 'COMPLIANT', 1, 'A15-FULL'],
        ['art15', { ...FULL, third_country: 'yes' }, 'PERMITTED', 'COMPLIANT', 0.8, 'A15-FULL'],
        ['art15', { ...FULL, large_amount: 'yes', third_party: 'yes', third_country: 'yes' }, 'MANUAL_REVIEW', 'REVIEW_REQUIRED', 0.336, 'A15-CLARIFY'],
        ['art17', { id_doubt: 'no', erasure_reason: 'no' }, 'MANUAL_REVIEW', 'REVIEW_REQUIRED', 1, 'A17-REJECTED'],
        ['art17', { id_doubt: 'no', erasure_reason: 'yes', erasure_exception: 'yes' }, 'MANUAL_REVIEW', 'REVIEW_REQUIRED', 0.36, 'A17-RESTRICTED'],
        ['art17', { id_doubt: 'no', erasure_reason: 'yes', erasure_exception: 'no', public_data: 'no', recipients: 'no' }, 'PERMITTED', 'COMPLIANT', 0.9, 'A17-ERASED'],
        ['art12_3', { complex_request: 'yes', within_first_month: 'no' }, 'BLOCKED', 'NON_COMPLIANT', 0, 'A12-DENY-LATE'],
        ['art12_3', { complex_request: 'no', within_first_month: 'yes' }, 'BLOCKED', 'NON_COMPLIANT', 0, 'A12-DENY-GROUND'],
        ['art12_3', { complex_request: 'yes', within_first_month: 'yes' }, 'PERMITTED', 'COMPLIANT', 1, 'A12-EXTEND']
    ];
    for (const [type, facts, decision, status, score, outcome] of cases) {
        const r = ev(type, facts);
        const label = `${type} ${JSON.stringify(facts)}`;
        assert.equal(r.decision, decision, label);
        assert.equal(r.status, status, label);
        assert.equal(r.score, score, label);
        assert.equal(r.outcome ? r.outcome.id : null, outcome, label);
    }
});

test('Antworten hinter einer inaktiven Regel zählen nicht', () => {
    const r = newEngine().evaluate({ requestType: 'art15', facts: { id_doubt: 'yes', excessive: 'no', data_processed: 'yes' } });
    assert.equal(r.trace.length, 1);
    assert.deepEqual(r.ignoredFacts, ['data_processed', 'excessive']);
});

test('Auswertung ist deterministisch', () => {
    const e = newEngine();
    const input = { caseId: 'T', requestType: 'art15', facts: FULL };
    assert.equal(sha256Hex(canonicalJson(e.evaluate(input))), sha256Hex(canonicalJson(e.evaluate(input))));
});

test('Freigabe: Default-Deny, Pflichtangaben, unbekannte Aktion', () => {
    const e = newEngine();
    assert.equal(e.authorize(ACTION, e.evaluate({ requestType: 'art15', facts: {} }), PAYLOAD).code, 'STATUS_NOT_SUFFICIENT');
    const full = e.evaluate({ requestType: 'art15', facts: { ...FULL, third_country: 'yes' } });
    const denied = e.authorize(ACTION, full, PAYLOAD);
    assert.equal(denied.code, 'REQUIRED_INPUT_MISSING');
    assert.deepEqual(denied.missingInputs, ['safeguards']);
    assert.equal(e.authorize(ACTION, full, { ...PAYLOAD, safeguards: 'SCC' }).authorized, true);
    assert.equal(e.authorize('gibt_es_nicht', full, PAYLOAD).code, 'UNKNOWN_ACTION');
});

test('Review-Sign-off ist an Vorgang und Faktenlage gebunden', () => {
    const e = newEngine();
    const input = { caseId: 'CASE-1', requestType: 'art15', facts: { id_doubt: 'yes' } };
    assert.equal(e.recordReview(input, '  ').code, 'REVIEWER_MISSING');
    assert.equal(e.recordReview(input, 'BT').code, 'REVIEW_RECORDED');
    assert.equal(e.evaluate(input).status, 'REVIEW_COMPLETED');
    assert.equal(e.evaluate({ ...input, caseId: 'CASE-2' }).status, 'REVIEW_REQUIRED');
    assert.equal(e.evaluate({ ...input, facts: { id_doubt: 'no', excessive: 'yes' } }).status, 'REVIEW_REQUIRED');
});

test('Action: ohne Freigabe entsteht kein Dokument', () => {
    const e = newEngine();
    const res = ResponseLetterAction.execute(e, { requestType: 'art12_3', facts: { complex_request: 'yes', within_first_month: 'no' } }, PAYLOAD);
    assert.equal(res.executed, false);
    assert.equal('doc' in res, false);
    assert.equal(e.eventLog.at(-1).action, 'ACTION_DENIED');
});

test('Action: Vollauskunft mit und ohne Datenkopie, Anrede ohne Namen', () => {
    const e = newEngine();
    const input = { caseId: 'C', requestType: 'art15', facts: FULL };
    const without = ResponseLetterAction.execute(e, input, PAYLOAD);
    assert.equal(without.executed, true);
    assert.match(without.doc, /separaten Anlage zur Verfügung gestellt\./);
    assert.doesNotMatch(without.doc, /Anbei erhalten Sie/);
    assert.equal(without.documentTextHash, createHash('sha256').update(without.doc, 'utf8').digest('hex'));
    const withCopy = ResponseLetterAction.execute(e, input, { ...PAYLOAD, attachment: '--- DATENKOPIE ---' });
    assert.match(withCopy.doc, /Anbei erhalten Sie[\s\S]*--- DATENKOPIE ---/);
    const anonymous = ResponseLetterAction.render(e.evaluate(input), { ...PAYLOAD, name: '' });
    assert.ok(anonymous.startsWith('Muster GmbH\n\nDatum: 01.02.2026\n\n'));
    assert.equal((anonymous.match(/Sehr geehrte Damen und Herren,/g) || []).length, 1);
    assert.doesNotMatch(anonymous, /,,|Sehr geehrte\(r\)|undefined|null/);
});

test('Hash-Kette erkennt nachträgliche Änderungen', () => {
    const e = newEngine();
    e.log('A', { x: 1 }); e.log('B', { y: 2 });
    assert.deepEqual(e.verifyChain(), { valid: true, brokenAt: null });
    e.eventLog[2].details.x = 99;
    assert.deepEqual(e.verifyChain(), { valid: false, brokenAt: 2 });
});

test('Feiertage gelten erst ab ihrem Einführungsjahr', () => {
    const H = (year, state, key) => !!getHolidays(year, state)[key];
    assert.deepEqual([H(2018, 'BE', '03-08'), H(2019, 'BE', '03-08')], [false, true]);
    assert.deepEqual([H(2022, 'MV', '03-08'), H(2023, 'MV', '03-08')], [false, true]);
    assert.deepEqual([H(2018, 'TH', '09-20'), H(2019, 'TH', '09-20')], [false, true]);
    assert.deepEqual([H(2016, 'HH', '10-31'), H(2017, 'HH', '10-31'), H(2018, 'HH', '10-31')], [false, true, true]);
    assert.deepEqual([H(2017, 'BY', '10-31'), H(2018, 'BY', '10-31'), H(2010, 'SN', '10-31')], [true, false, true]);
    assert.deepEqual([H(2020, 'BE', '05-08'), H(2025, 'BE', '05-08'), H(2026, 'BE', '05-08'), H(2025, 'BB', '05-08')], [true, true, false, false]);
    assert.deepEqual([H(2028, 'BE', '06-17'), H(2027, 'BE', '06-17')], [true, false]);
    assert.equal(getHolidays(2026, 'SN')['11-18'], 'Buß- und Bettag');
    assert.equal(getHolidays(2026, 'NW')['04-03'], 'Karfreitag');
});

test('Fristberechnung: Monatsende, Wochenende, Feiertage', () => {
    const end = (date, state, ext = false) => formatDateDE(computeDeadline(parseLocalDate(date), state, ext).endDate);
    assert.equal(end('2026-01-31', 'BE'), '02.03.2026');          // 28.02. ist Samstag
    assert.equal(end('2026-11-25', 'BY'), '28.12.2026');          // 25./26.12. + Wochenende
    assert.equal(end('2026-03-03', 'NW'), '07.04.2026');          // Karfreitag bis Ostermontag
    assert.equal(end('2026-08-18', 'SN', true), '19.11.2026');    // Buß- und Bettag nur in Sachsen
    assert.equal(end('2026-08-18', 'BY', true), '18.11.2026');
    assert.equal(end('2025-04-08', 'BE'), '09.05.2025');          // einmaliger Feiertag 08.05.2025
    assert.equal(end('2025-04-08', 'BB'), '08.05.2025');
    assert.equal(end('2018-02-08', 'BE'), '08.03.2018');          // Frauentag erst ab 2019
    assert.equal(end('2019-02-08', 'BE'), '11.03.2019');
    assert.equal(parseLocalDate(''), null);
    assert.equal(parseLocalDate('2026-02-30'), null);
    assert.match(computeDeadline(parseLocalDate('2026-01-15'), 'BE', false).steps.at(-1), /Orientierungswert nach BGB \/ VO 1182\/71/);
});
