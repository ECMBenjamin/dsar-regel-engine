/**
 * @file Tests, die für jedes Rule Pack gelten, und Tests des Datenpannen-Packs.
 * Kern: Jeder mögliche Antwortpfad eines Packs muss zu genau einem Outcome mit vorhandenem Template führen.
 * @author benthy
 * @license MIT
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UniversalRulesEngine } from '../src/core/engine.js';
import { DSARRulebook } from '../src/rulepacks/dsar-gdpr-de.js';
import { BreachRulebook } from '../src/rulepacks/breach-gdpr-de.js';
import { ResponseLetterAction } from '../src/actions/response-letter.js';
import { BreachDocumentsAction } from '../src/actions/breach-documents.js';
import { parseBreachReport } from '../src/ingestion/breach-parser.js';
import { parseDsarRequest } from '../src/ingestion/dsar-parser.js';
import { runRulebookTests } from '../src/core/rulebook-tests.js';
import { createProtocolAction } from '../src/actions/protocol-action.js';
import { validateSchema } from './mini-schema.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const EXAMPLE = readJson('../docs/examples/example-rulebook.json');
const SCHEMA = readJson('../docs/rulebook.schema.json');

const PACKS = [
    { rulebook: DSARRulebook, action: ResponseLetterAction },
    { rulebook: BreachRulebook, action: BreachDocumentsAction },
    { rulebook: EXAMPLE, action: createProtocolAction(EXAMPLE, 'record_decision') }
];

// Engine-Freeze: Die Engine wurde für das zweite Pack nicht angefasst.
// Eine bewusste Änderung der Engine aktualisiert diesen Wert und wird im Changelog begründet.
const ENGINE_SOURCE_SHA256 = 'd87e005827fc581af6f691db7bd7e57bbdec7b49bf0c6771d5f99d1df6bbef32';

test('Engine ist unverändert und enthält kein Fachvokabular', () => {
    const source = readFileSync(new URL('../src/core/engine.js', import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), ENGINE_SOURCE_SHA256);
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /DSGVO|GDPR|DSAR|Art\.\s*\d|Datenpanne|breach|Betroffen/i);
});

// Alle vollständigen Antwortpfade eines Anfrage-Typs: Tiefensuche entlang der showIf-Abhängigkeiten.
function allPaths(engine, requestType) {
    const done = [];
    const walk = facts => {
        const ev = engine.evaluate({ requestType, facts });
        if (ev.complete) { done.push({ facts, ev }); return; }
        const next = engine.getRule(ev.pending[0]);
        next.answers.forEach(a => walk(Object.assign({}, facts, { [next.fact]: a })));
    };
    walk({});
    return done;
}

for (const { rulebook, action } of PACKS) {
    const id = rulebook.metadata.id;

    test(`${id}: gültig, reine Daten, Aktion passt zum Rulebook`, () => {
        assert.deepEqual(UniversalRulesEngine.validateRulebook(rulebook), []);
        assert.deepEqual(JSON.parse(JSON.stringify(rulebook)), rulebook);
        assert.ok(rulebook.metadata.actions.some(a => a.id === action.id));
        for (const o of rulebook.outcomes.filter(o => o.effect === 'ALLOW')) {
            assert.equal(o.action, action.id, o.id);
            assert.equal(typeof action.templates[o.template], 'function', o.id);
        }
    });

    test(`${id}: entspricht dem JSON-Schema`, () => {
        assert.deepEqual(validateSchema(SCHEMA, rulebook), []);
    });

    test(`${id}: eingebaute Testfälle bestehen und decken jedes Outcome ab`, () => {
        const r = runRulebookTests(rulebook);
        assert.equal(r.valid, true);
        assert.deepEqual(r.results.filter(x => !x.ok).map(x => `${x.id}: ${x.message}`), []);
        assert.ok(r.total >= rulebook.outcomes.length);
        assert.deepEqual(r.uncoveredOutcomes, []);
    });

    test(`${id}: optionale Eingaben verweisen auf gültige Fakten`, () => {
        const facts = {};
        rulebook.rules.forEach(r => { facts[r.scope + ':' + r.fact] = r.answers; });
        for (const o of rulebook.outcomes) {
            for (const opt of o.optionalInputs || []) {
                for (const [f, v] of Object.entries(opt.when || {})) {
                    assert.ok(facts[o.scope + ':' + f], `${o.id}: unbekannter Fakt ${f}`);
                    assert.ok(facts[o.scope + ':' + f].includes(v), `${o.id}: ungültige Antwort ${v}`);
                }
            }
        }
    });

    test(`${id}: jeder Antwortpfad endet in einem Outcome, und jedes Outcome ist erreichbar`, () => {
        const engine = new UniversalRulesEngine().load(rulebook);
        const reached = new Set();
        let paths = 0;
        for (const type of rulebook.requestTypes) {
            for (const { facts, ev } of allPaths(engine, type.id)) {
                paths++;
                assert.ok(ev.outcome, `${type.id} ${JSON.stringify(facts)}: kein Outcome`);
                assert.notEqual(ev.reasons[0].code, 'NO_OUTCOME');
                assert.ok(['PERMITTED', 'MANUAL_REVIEW', 'BLOCKED'].includes(ev.decision));
                reached.add(ev.outcome.id);
            }
        }
        assert.ok(paths > 0);
        assert.deepEqual([...reached].sort(), rulebook.outcomes.map(o => o.id).sort(), 'nicht erreichbare Outcomes');
    });

    test(`${id}: jeder freigebbare Pfad erzeugt ein Dokument ohne Lücken`, () => {
        const engine = new UniversalRulesEngine().load(rulebook);
        const fill = 'TEXT';
        for (const type of rulebook.requestTypes) {
            for (const { facts, ev } of allPaths(engine, type.id)) {
                if (ev.outcome.effect !== 'ALLOW') continue;
                const input = { caseId: 'P', requestType: type.id, facts };
                if (ev.decision === 'MANUAL_REVIEW') engine.recordReview(input, 'BT');
                const payload = { name: 'Vorgang X', company: 'Muster GmbH', issueDate: '14.11.2026', attachment: '' };
                ev.outcome.requiredInputs.forEach(r => { payload[r.field] = fill; });
                const res = action.execute(engine, input, payload);
                assert.equal(res.executed, true, `${JSON.stringify(facts)}: ${res.authorization.code}`);
                assert.doesNotMatch(res.doc, /undefined|null|\$\{|\[object/, JSON.stringify(facts));
                assert.ok(res.doc.length > 100);
            }
        }
    });
}

// ---------- Datenpannen-Pack im Detail ----------

const breach = () => new UniversalRulesEngine().load(BreachRulebook);
const BASE = { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'yes', within_72h: 'yes', facts_complete: 'yes' };
const FULL_INPUTS = { name: 'Laptop-Diebstahl', company: 'Muster GmbH', issueDate: '14.11.2026', awareness: '12.11.2026, 09:30 Uhr', incident: 'Laptop gestohlen', scope: 'ca. 300 Kunden', contact: 'DSB Max Muster', consequences: 'Phishing', measures: 'Konten gesperrt' };

test('Datenpannen: Entscheidungen je Faktenlage', () => {
    const e = breach();
    const ev = facts => e.evaluate({ requestType: 'breach', facts });
    const cases = [
        [{ breach_confirmed: 'no' }, 'PERMITTED', 1, 'BRE-NO-BREACH'],
        [{ breach_confirmed: 'yes', role_controller: 'no' }, 'PERMITTED', 1, 'BRE-PROCESSOR'],
        [{ breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'no' }, 'MANUAL_REVIEW', 1, 'BRE-NO-RISK'],
        [{ ...BASE, high_risk: 'no' }, 'PERMITTED', 1, 'BRE-NOTIFY-AUTHORITY'],
        [{ ...BASE, facts_complete: 'no', high_risk: 'no' }, 'PERMITTED', 0.9, 'BRE-NOTIFY-AUTHORITY'],
        [{ ...BASE, within_72h: 'no', high_risk: 'no' }, 'MANUAL_REVIEW', 0.4, 'BRE-NOTIFY-AUTHORITY'],
        [{ ...BASE, high_risk: 'yes', data_unintelligible: 'yes' }, 'MANUAL_REVIEW', 0.7, 'BRE-NOTIFY-AUTHORITY'],
        [{ ...BASE, high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'yes' }, 'MANUAL_REVIEW', 0.7, 'BRE-NOTIFY-AUTHORITY'],
        [{ ...BASE, high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'no' }, 'MANUAL_REVIEW', 0.7, 'BRE-NOTIFY-SUBJECTS'],
        [{ ...BASE, high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'yes' }, 'MANUAL_REVIEW', 0.56, 'BRE-NOTIFY-PUBLIC']
    ];
    for (const [facts, decision, score, outcome] of cases) {
        const r = ev(facts);
        assert.equal(r.decision, decision, JSON.stringify(facts));
        assert.equal(r.score, score, JSON.stringify(facts));
        assert.equal(r.outcome.id, outcome, JSON.stringify(facts));
    }
    assert.equal(ev({}).decision, 'BLOCKED');
    assert.deepEqual(ev({ breach_confirmed: 'yes', role_controller: 'no', risk_likely: 'yes' }).ignoredFacts, ['risk_likely']);
});

test('Datenpannen: Pflichtangaben hängen von der Faktenlage ab', () => {
    const e = breach();
    const fields = facts => e.evaluate({ requestType: 'breach', facts }).outcome.requiredInputs.map(r => r.field);
    assert.deepEqual(fields({ ...BASE, high_risk: 'no' }), ['awareness', 'incident', 'scope', 'contact', 'consequences', 'measures']);
    assert.deepEqual(fields({ ...BASE, facts_complete: 'no', high_risk: 'no' }), ['awareness', 'incident', 'contact']);
    assert.ok(fields({ ...BASE, within_72h: 'no', high_risk: 'no' }).includes('delay_reason'));
    assert.ok(fields({ ...BASE, high_risk: 'yes', data_unintelligible: 'yes' }).includes('assessment_reason'));
    assert.deepEqual(fields({ breach_confirmed: 'yes', role_controller: 'no' }), ['controller_name', 'awareness', 'incident', 'contact']);

    const input = { requestType: 'breach', facts: { ...BASE, within_72h: 'no', high_risk: 'no' } };
    e.recordReview(input, 'BT');
    const denied = e.authorize('generate_breach_documents', e.evaluate(input), FULL_INPUTS);
    assert.equal(denied.code, 'REQUIRED_INPUT_MISSING');
    assert.deepEqual(denied.missingInputs, ['delay_reason']);
});

test('Datenpannen: Erstmeldung mit fehlenden Angaben und verspäteter Meldung', () => {
    const e = breach();
    const input = { caseId: 'B', requestType: 'breach', facts: { ...BASE, within_72h: 'no', facts_complete: 'no', high_risk: 'no' } };
    e.recordReview(input, 'BT');
    const res = BreachDocumentsAction.execute(e, input, { name: '', company: 'Muster GmbH', issueDate: '14.11.2026', awareness: '09.11.2026', delay_reason: 'Forensik am Wochenende', incident: 'Fehlversand', contact: 'DSB' });
    assert.equal(res.executed, true);
    assert.match(res.doc, /DOKUMENT 1 VON 2: MELDUNG AN DIE AUFSICHTSBEHÖRDE/);
    assert.match(res.doc, /– Erstmeldung/);
    assert.match(res.doc, /nicht binnen 72 Stunden[\s\S]*Forensik am Wochenende/);
    assert.equal((res.doc.match(/wird gemäß Art\. 33 Abs\. 4 DSGVO ohne unangemessene weitere Verzögerung nachgereicht/g) || []).length, 3);
    assert.match(res.doc, /kein hohes Risiko[\s\S]*nicht vorgesehen/);
    assert.doesNotMatch(res.doc, /Vorgang:/);
    assert.match(res.doc, /Manuelle Prüfung\nGeprüft und freigegeben durch: BT/);
    assert.ok(res.evaluation.outcome.legalBasis.includes('Art. 33 Abs. 1 S. 2 DSGVO'));
    assert.ok(res.evaluation.outcome.legalBasis.includes('Art. 33 Abs. 4 DSGVO'));
});

test('Datenpannen: Benachrichtigung der Betroffenen enthält die Pflichtinhalte nach Art. 34 Abs. 2', () => {
    const e = breach();
    const input = { requestType: 'breach', facts: { ...BASE, high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'no' } };
    e.recordReview(input, 'BT');
    const res = BreachDocumentsAction.execute(e, input, FULL_INPUTS);
    assert.equal(res.executed, true);
    const subjects = res.doc.split('DOKUMENT 2 VON 3')[1].split('DOKUMENT 3 VON 3')[0];
    for (const part of ['Was ist passiert?\nLaptop gestohlen', 'Welche Folgen sind wahrscheinlich?\nPhishing', 'Was haben wir unternommen und was empfehlen wir Ihnen?\nKonten gesperrt', 'An wen können Sie sich wenden?\nDSB Max Muster']) {
        assert.ok(subjects.includes(part), part);
    }
    assert.match(res.doc, /werden unverzüglich gemäß Art\. 34 Abs\. 1 DSGVO benachrichtigt/);
});

test('Datenpannen: Ausnahmen von der Benachrichtigung werden begründet', () => {
    const e = breach();
    for (const [extra, pattern] of [
        [{ data_unintelligible: 'yes' }, /Art\. 34 Abs\. 3 lit\. a DSGVO ab[\s\S]*Begründung: Festplatte AES-256/],
        [{ data_unintelligible: 'no', risk_mitigated: 'yes' }, /Art\. 34 Abs\. 3 lit\. b DSGVO ab[\s\S]*Begründung: Festplatte AES-256/]
    ]) {
        const input = { requestType: 'breach', facts: { ...BASE, high_risk: 'yes', ...extra } };
        e.recordReview(input, 'BT');
        const res = BreachDocumentsAction.execute(e, input, { ...FULL_INPUTS, assessment_reason: 'Festplatte AES-256' });
        assert.equal(res.executed, true);
        assert.match(res.doc, pattern);
        assert.match(res.doc, /DOKUMENT 1 VON 2/);
    }
    const pub = { requestType: 'breach', facts: { ...BASE, high_risk: 'yes', data_unintelligible: 'no', risk_mitigated: 'no', disproportionate_effort: 'yes' } };
    e.recordReview(pub, 'BT');
    const res = BreachDocumentsAction.execute(e, pub, { ...FULL_INPUTS, assessment_reason: 'Keine Kontaktdaten' });
    assert.match(res.doc, /ÖFFENTLICHE BEKANNTMACHUNG \(Art\. 34 Abs\. 3 lit\. c DSGVO\) – ENTWURF/);
    assert.match(res.doc, /Öffentliche Bekanntmachung gemäß Art\. 34 Abs\. 3 lit\. c DSGVO\n\nInformation[\s\S]*\n\nBei uns ist es/);
});

test('Datenpannen: Auftragsverarbeiter meldet an den Verantwortlichen, nicht an die Behörde', () => {
    const e = breach();
    const res = BreachDocumentsAction.execute(e, { requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'no' } }, { ...FULL_INPUTS, controller_name: 'Kunde AG', scope: '', measures: '' });
    assert.equal(res.executed, true);
    assert.match(res.doc, /An: Kunde AG/);
    assert.match(res.doc, /Art\. 33 Abs\. 2 DSGVO/);
    assert.doesNotMatch(res.doc, /An die zuständige Datenschutzaufsichtsbehörde/);
    assert.match(res.doc, /wird unverzüglich nachgereicht/);
});

test('Datenpannen: keine Verletzung und kein Risiko ergeben nur einen internen Vermerk', () => {
    const e = breach();
    const none = BreachDocumentsAction.execute(e, { requestType: 'breach', facts: { breach_confirmed: 'no' } }, { ...FULL_INPUTS, assessment_reason: 'Nur Fehlalarm' });
    assert.ok(none.doc.startsWith('INTERNER DOKUMENTATIONSVERMERK'));
    assert.doesNotMatch(none.doc, /Aufsichtsbehörde|DOKUMENT 1/);
    const input = { requestType: 'breach', facts: { breach_confirmed: 'yes', role_controller: 'yes', risk_likely: 'no' } };
    assert.equal(BreachDocumentsAction.execute(e, input, { ...FULL_INPUTS, assessment_reason: 'Daten öffentlich' }).authorization.code, 'STATUS_NOT_SUFFICIENT');
    e.recordReview(input, 'BT');
    const noRisk = BreachDocumentsAction.execute(e, input, { ...FULL_INPUTS, assessment_reason: 'Daten öffentlich' });
    assert.match(noRisk.doc, /Keine Meldung: Verletzung intern dokumentieren \(Art\. 33 Abs\. 1 DSGVO, Art\. 33 Abs\. 5 DSGVO\)/);
});

test('Datenpannen-Parser: Vorschläge, aber vorsichtig bei mehrdeutigen Wörtern', () => {
    const p = t => parseBreachReport(t).suggestions;
    assert.deepEqual(p('Ransomware hat unsere Server verschlüsselt, Patientendaten betroffen, vor 2 Tagen bemerkt.'), { breach_confirmed: 'yes', high_risk: 'yes', within_72h: 'yes' });
    assert.equal(p('Ein unverschlüsselter Laptop wurde gestohlen.').data_unintelligible, 'no');
    assert.equal(p('Ein verschlüsselter Laptop (BitLocker) wurde gestohlen.').data_unintelligible, 'yes');
    assert.equal(p('Fehlversand vor 3 Tagen').within_72h, 'no');
    assert.equal(p('Fehlversand seit 5 Stunden bekannt').within_72h, 'yes');
    assert.deepEqual(p('Der Drucker im zweiten Stock ist defekt.'), {});
    assert.equal(parseBreachReport('x').requestType, 'breach');
});

test('Auskunfts-Parser: unverändertes Verhalten nach dem Auslagern', () => {
    const r = parseDsarRequest('Ich fordere Auskunft nach Art. 15, Ausweis anbei.\n\nMit freundlichen Grüßen\nMax Mustermann');
    assert.equal(r.requestType, 'art15');
    assert.equal(r.subject, 'Max Mustermann');
    assert.deepEqual(r.suggestions, { id_doubt: 'yes' });
    assert.equal(parseDsarRequest('Bitte löschen Sie meine Daten').requestType, 'art17');
    assert.equal(parseDsarRequest('Wir brauchen eine Fristverlängerung').requestType, 'art12_3');
});

// ---------- Selbsttests und Schema ----------

const clone = x => JSON.parse(JSON.stringify(x));

test('Selbsttest erkennt geänderte Regeln', () => {
    const changed = clone(DSARRulebook);
    changed.rules.find(r => r.id === 'DSAR-A15-01').risk.yes = 0.5;
    const r = runRulebookTests(changed);
    assert.equal(r.valid, true);
    assert.deepEqual(r.results.filter(x => !x.ok).map(x => x.id), ['T-A15-01']);
    assert.match(r.results.find(x => x.id === 'T-A15-01').message, /score/);
    assert.deepEqual(r.uncoveredOutcomes, ['A15-IDENTITY']);
});

test('Selbsttest erkennt fehlerhafte Testfälle', () => {
    const rb = clone(EXAMPLE);
    rb.tests.push(
        { id: 'T-PR-01', requestType: 'press', facts: {}, expect: { decision: 'BLOCKED' } },
        { id: 'X-1', requestType: 'unbekannt', facts: {}, expect: { decision: 'BLOCKED' } },
        { id: 'X-2', requestType: 'press', facts: [], expect: { decision: 'BLOCKED' } },
        { id: 'X-3', requestType: 'press', facts: {}, expect: {} },
        { id: 'X-4', requestType: 'press', facts: {}, expect: { decision: 'BLOCKED', verdict: 'x' } },
        'kein Objekt'
    );
    const r = runRulebookTests(rb);
    assert.equal(r.passed, 4);
    assert.deepEqual(r.results.slice(4).map(x => x.message), [
        'ID ist nicht eindeutig.', 'Unbekannter requestType.', 'facts muss ein Objekt sein.', 'expect.decision fehlt.',
        'Unbekannter Schlüssel in expect (erlaubt: decision, status, outcome, score).', 'Testfall ist kein Objekt.'
    ]);
    assert.equal(r.results[9].id, 'tests[9]');
});

test('Selbsttest meldet ungültige Rulebooks ohne Ausnahme', () => {
    const r = runRulebookTests({ metadata: { id: 'x', version: '1.0.0' } });
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /Ungültiges Rulebook/);
    assert.equal(runRulebookTests(null).valid, false);
});

test('Ohne Testfälle: gültig, aber kein Outcome abgedeckt', () => {
    const rb = clone(EXAMPLE); delete rb.tests;
    const r = runRulebookTests(rb);
    assert.deepEqual([r.valid, r.total, r.failed, r.uncoveredOutcomes.length], [true, 0, 0, 4]);
});

test('Schema-Prüfer findet Abweichungen', () => {
    const rb = clone(EXAMPLE);
    rb.extra = 1;
    delete rb.rules[0].provenance;
    rb.rules[1].risk.yes = 2;
    rb.metadata.version = '1.0';
    rb.tests[0].expect.decision = 'ALLOW';
    const errors = validateSchema(SCHEMA, rb);
    for (const part of ['$: unbekanntes Feld "extra"', '$.rules[0]: Feld "provenance" fehlt', '$.rules[1].risk.yes: größer als 1', '$.metadata.version: passt nicht', '$.tests[0].expect.decision']) {
        assert.ok(errors.some(e => e.startsWith(part)), part);
    }
});

test('Spezifikation nennt jedes Feld des Schemas', () => {
    const spec = readFileSync(new URL('../docs/rulebook-spec.md', import.meta.url), 'utf8');
    const fields = new Set();
    const walk = s => {
        if (!s || typeof s !== 'object') return;
        Object.keys(s.properties || {}).forEach(k => fields.add(k));
        Object.values(s).forEach(walk);
    };
    walk(SCHEMA);
    const missing = [...fields].filter(f => !spec.includes('`' + f + '`'));
    assert.deepEqual(missing, []);
});

test('Importierte Packs: Fehlerfälle beim Bau des Packs', async () => {
    // packs.js hängt am Browser-Bundle nicht, kann aber direkt geprüft werden.
    const { createImportedPack } = await import('../src/ui/packs.js');
    assert.ok(createImportedPack({}).errors.length > 0);
    assert.match(createImportedPack(clone(DSARRulebook)).errors[0], /bereits geladen/);
    const two = clone(EXAMPLE);
    two.metadata.actions.push({ id: 'other', requiresStatus: ['COMPLIANT'] });
    two.outcomes[3].action = 'other';
    assert.match(createImportedPack(two).errors[0], /nur eine Aktion/);
    const ok = createImportedPack(clone(EXAMPLE));
    assert.equal(ok.pack.imported, true);
    assert.equal(ok.pack.action.id, 'record_decision');
    assert.deepEqual(ok.pack.parse('egal').suggestions, {});
});
