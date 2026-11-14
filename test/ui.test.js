/**
 * @file Tests der gebauten Einzeldatei im Headless-DOM: Workflow, Strict-Gate, Review,
 * Enforcement, Audit Trail, Entwickler-Ansicht, Fristenrechner, Self-Test.
 * Die Tests einer Sitzung laufen nacheinander auf demselben Dokument.
 * @author benthy
 * @license MIT
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { boot, readDist, wait } from './helpers.js';

const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
// Objekte aus dem Headless-DOM gehören zu einem anderen Realm; für strikte Vergleiche in schlichte Daten umwandeln.
const plain = x => JSON.parse(JSON.stringify(x));
const presetPurposes = s => s.U.packs[0].presets.values.agency.purposes;
const FULL = ['id_doubt:no', 'excessive:no', 'data_processed:yes', 'large_amount:no', 'third_party:no', 'third_country:no', 'electronic_format:no'];

test('Self-Test: verfälschte Hash-Konstante stoppt die Anwendung', async () => {
    const broken = readDist().replace('0x428a2f98, 0x71374491', '0x428a2f99, 0x71374491');
    assert.notEqual(broken, readDist());
    const b = await boot(broken, { quiet: true });
    assert.ok(b.d.getElementById('fatal-error'));
    assert.match(b.d.body.textContent, /Self-Test fehlgeschlagen/);
    assert.equal(b.w.UniversalRules, undefined);
    assert.equal(b.d.getElementById('btn-parse'), null);
    assert.ok(b.errors.some(e => /Self-Test/.test(e)));
});

test('Sitzung A: Auskunft mit Review, Drittland und Pflichtangaben', async t => {
    const s = await boot();
    const { $, U, click, change, answer, visible } = s;
    const E = U.engine;

    await t.test('Start: fehlerfrei, Self-Test protokolliert, Weiter gesperrt', () => {
        assert.deepEqual(s.errors, []);
        assert.equal(E.eventLog[0].details.sha256SelfTest, 'PASSED');
        assert.match($('header-meta').textContent, /Self-Test: bestanden/);
        assert.equal($('btn-to-step-3').disabled, true);
    });

    await t.test('Parser liefert Typ und Namen, aber keine Fakten', () => {
        $('ingest-text').value = 'Sehr geehrte Damen und Herren,\nich fordere Auskunft nach Art. 15 DSGVO und eine Datenkopie.\n\nMit freundlichen Grüßen,\nMax Mustermann\nMusterstr. 1';
        click($('btn-parse'));
        assert.equal($('q-type').value, 'art15');
        assert.equal($('q-name').value, 'Max Mustermann');
        assert.deepEqual(plain(U.getState().unconfirmedSuggestions), {});
        assert.equal(s.d.querySelectorAll('#dynamic-questions-container .form-group').length, 1);
    });

    await t.test('Strict-Gate: gesperrt, bis alle aktiven Fragen bestätigt sind', () => {
        s.answers(['id_doubt:no', 'excessive:no', 'data_processed:yes']);
        assert.equal(s.d.querySelectorAll('#dynamic-questions-container .form-group').length, 7);
        assert.equal($('score-value').textContent, '-.--');
        s.answers(['large_amount:no', 'third_party:yes', 'third_country:yes']);
        assert.equal($('btn-to-step-3').disabled, true);
        answer('electronic_format', 'yes');
        assert.equal($('score-value').textContent, '0.48');
        assert.equal($('decision-chip').textContent, 'MANUAL_REVIEW');
        assert.equal($('status-chip').textContent, 'REVIEW_REQUIRED');
        assert.equal($('btn-to-step-3').disabled, true);
    });

    await t.test('Review: Name erforderlich, Sign-off gibt frei', () => {
        click($('btn-review'));
        assert.ok(visible('reviewer-hint'));
        $('reviewer-name').value = 'BT';
        click($('btn-review'));
        assert.equal($('status-chip').textContent, 'REVIEW_COMPLETED');
        assert.equal($('btn-to-step-3').disabled, false);
        answer('third_party', 'no');
        assert.equal($('status-chip').textContent, 'COMPLIANT');
        answer('third_party', 'yes');
        assert.equal($('status-chip').textContent, 'REVIEW_COMPLETED');
    });

    await t.test('Enforcement: Aktion scheitert an fehlenden Pflichtangaben', () => {
        click($('btn-to-step-3'));
        assert.ok(visible('preset-box') && visible('datadrop-section'));
        for (const f of ['purposes', 'categories', 'recipients', 'retention', 'origin', 'automated', 'safeguards']) assert.ok($('in-' + f), f);
        assert.match($('in-origin').value, /direkt bei der betroffenen Person/);
        assert.equal($('in-safeguards').value, '');
        click($('btn-to-step-4'));
        assert.ok(visible('action-error') && !visible('step-4-generation'));
        assert.ok($('in-purposes').classList.contains('field-missing'));
        $('preset-selector').value = 'agency'; change($('preset-selector'));
        click($('btn-to-step-4'));
        assert.equal($('in-purposes').value, presetPurposes(s));
        assert.ok($('in-safeguards').classList.contains('field-missing'));
    });

    await t.test('Aktion erzeugt Schreiben; Hash, Kette und Determinismus stimmen', () => {
        s.type('safeguards', 'USA, Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).');
        click($('btn-to-step-4'));
        const letter = $('final-letter').textContent;
        assert.ok(visible('step-4-generation'));
        assert.match(letter, /9\. Übermittlung in Drittländer/);
        assert.match(letter, /10\. Datenkopie/);
        assert.match(letter, /geschwärzt/);
        assert.match(letter, /Sehr geehrte\(r\) Max Mustermann,/);
        assert.doesNotMatch(letter, /undefined|null|\$\{/);
        const st = U.getState();
        assert.equal(st.enforcement.executed, true);
        assert.equal(st.enforcement.documentTextHash, sha(letter));
        click($('btn-val-chain'));
        assert.match($('prov-status').textContent, /erfolgreich/);
        click($('btn-test-det'));
        assert.match($('prov-status').textContent, /Determinismus bestätigt.*Action: zwei/);
        const actions = new Set(E.eventLog.map(e => e.action));
        for (const a of ['SYSTEM_INIT', 'RULEBOOK_LOADED', 'SMART_INGESTION', 'USER_CONFIRMED_ANSWER', 'POLICY_DECISION', 'MANUAL_REVIEW_COMPLETED', 'ACTION_DENIED', 'ACTION_AUTHORIZED', 'ACTION_EXECUTED']) assert.ok(actions.has(a), a);
    });

    await t.test('Audit: veränderter Eintrag wird erkannt', () => {
        E.eventLog[3].details.answer = 'yes';
        click($('btn-val-chain'));
        assert.match($('prov-status').textContent, /Inkonsistenz/);
        E.eventLog[3].details.answer = 'no';
        click($('btn-val-chain'));
        assert.match($('prov-status').textContent, /erfolgreich/);
    });

    await t.test('Neuer Vorgang: Löschung; Vorschlag wird angezeigt, aber nicht übernommen', () => {
        click($('btn-restart'));
        assert.ok(visible('step-1-ingestion') && !visible('step-4-generation'));
        assert.equal($('action-inputs').textContent, '');
        assert.equal(U.getState().evaluation.input.caseId, 'CASE-0002');
        $('ingest-text').value = 'Bitte um Löschung meiner Daten nach Art. 17. Meinen Ausweis lege ich nicht bei.\nViele Grüße\nErika Beispiel';
        click($('btn-parse'));
        assert.equal($('q-type').value, 'art17');
        assert.equal(U.getState().unconfirmedSuggestions.id_doubt, 'yes');
        assert.match($('dynamic-questions-container').textContent, /Vorschlag aus E-Mail: Ja/);
        assert.equal($('btn-to-step-3').disabled, true);
        answer('id_doubt', 'no');
        assert.deepEqual(plain(U.getState().unconfirmedSuggestions), {});
        s.answers(['erasure_reason:yes', 'erasure_exception:no', 'public_data:no', 'recipients:yes']);
        assert.equal($('score-value').textContent, '0.72');
        assert.equal($('status-chip').textContent, 'REVIEW_REQUIRED');   // Review aus Vorgang 1 gilt nicht
        $('reviewer-name').value = 'BT'; click($('btn-review')); click($('btn-to-step-3'));
        assert.ok(!visible('preset-box') && !visible('datadrop-section'));
        assert.equal($('in-purposes'), null);
        assert.equal($('action-inputs').children.length, 0);
        click($('btn-to-step-4'));
        assert.match($('final-letter').textContent, /Art\. 19 DSGVO/);
        assert.doesNotMatch($('final-letter').textContent, /Art\. 17 Abs\. 2/);
    });

    await t.test('Fristverlängerung nach Ablauf wird blockiert', () => {
        click($('btn-restart'));
        $('ingest-text').value = 'Wir benötigen eine Fristverlängerung.';
        click($('btn-parse'));
        assert.equal($('q-type').value, 'art12_3');
        s.answers(['complex_request:yes', 'within_first_month:no']);
        assert.equal($('decision-chip').textContent, 'BLOCKED');
        assert.equal($('status-chip').textContent, 'NON_COMPLIANT');
        assert.equal($('score-value').textContent, '0.00');
        assert.ok($('btn-to-step-3').disabled && visible('blocked-box'));
        answer('within_first_month', 'yes');
        assert.equal($('decision-chip').textContent, 'PERMITTED');
        assert.equal($('btn-to-step-3').disabled, false);
    });

    await t.test('Entwickler-Ansicht: Evaluation State und MCP-Mockup sind gültiges JSON', () => {
        click(s.d.querySelector('[data-target="view-dev"]'));
        const dev = JSON.parse($('dev-state').textContent);
        assert.equal(dev.evaluation.decision, 'PERMITTED');
        for (const view of ['rules_evaluate', 'rules_authorize_action', 'rules_get_rulebook', 'tools/list']) {
            $('mcp-view').value = view; change($('mcp-view'));
            assert.equal(JSON.parse($('mcp-request').textContent).jsonrpc, '2.0', view);
            assert.ok(JSON.parse($('mcp-response').textContent).result, view);
        }
        assert.equal(s.d.querySelectorAll('#cases-table tbody tr').length, 11);
        assert.equal(s.d.querySelectorAll('#cases-table .badge').length, 2);
        assert.equal(s.d.querySelectorAll('#knowledge-container .why-box').length, 10);
        assert.deepEqual(s.errors, []);
    });
});

test('Sitzung B: Strict-Gate-Lücken, Datenkopie, Idempotenz, Fristenrechner', async t => {
    const s = await boot();
    const { $, U, click, change, answer, visible, has, checked, count } = s;
    const E = U.engine;

    await t.test('Verwaiste Antworten werden gelöscht und müssen neu bestätigt werden', () => {
        $('ingest-text').value = 'Auskunft nach Art. 15 DSGVO bitte, Ausweis liegt bei.\n\nGruß\nA. Test';
        click($('btn-parse'));
        s.answers(FULL);
        assert.equal($('status-chip').textContent, 'COMPLIANT');
        answer('excessive', 'yes');
        assert.equal(has('data_processed'), false);
        assert.deepEqual(plain(E.eventLog.find(e => e.action === 'FACTS_PRUNED').details.removed), ['data_processed', 'electronic_format', 'large_amount', 'third_country', 'third_party']);
        answer('excessive', 'no');
        assert.ok(has('data_processed') && !checked('data_processed'));
        assert.equal($('status-chip').textContent, 'INCOMPLETE');
        assert.equal($('btn-to-step-3').disabled, true);
        answer('data_processed', 'yes');
        assert.ok(has('large_amount') && !checked('large_amount') && !checked('third_party'));
        assert.deepEqual(plain(U.getState().evaluation.ignoredFacts), []);
        s.answers(FULL.slice(3));
        assert.equal($('btn-to-step-3').disabled, false);
    });

    await t.test('Vollauskunft ohne Datei: kein "Anbei", neutrale Anrede, Warnhinweis', () => {
        $('q-name').value = '';
        click($('btn-to-step-3'));
        $('preset-selector').value = 'saas'; change($('preset-selector'));
        click($('btn-to-step-4'));
        const letter = $('final-letter').textContent;
        assert.match(letter, /separaten Anlage zur Verfügung gestellt\./);
        assert.doesNotMatch(letter, /Anbei erhalten Sie|DATENKOPIE GEMÄSS/);
        assert.ok(letter.startsWith('Musterunternehmen GmbH\n\nDatum: '));
        assert.equal((letter.match(/Sehr geehrte Damen und Herren,/g) || []).length, 1);
        assert.doesNotMatch(letter, /,,|Sehr geehrte\(r\)|Betroffene Person/);
        assert.match($('enforcement-record').textContent, /keine Datenkopie eingebunden/);
        assert.equal(E.eventLog.find(e => e.action === 'ACTION_EXECUTED').details.attachmentIncluded, false);
    });

    await t.test('Idempotenz: erneutes Auslösen führt die Aktion nicht noch einmal aus', () => {
        click($('btn-to-step-4')); click($('btn-to-step-4'));
        assert.equal(count('ACTION_EXECUTED'), 1);
    });

    await t.test('Datenkopie: dieselbe Datei zweimal, CSV mit Semikolon und Anführungszeichen', async () => {
        click($('btn-restart'));
        $('ingest-text').value = 'Auskunft nach Art. 15 bitte.\n\nViele Grüße\nBea Beispiel';
        click($('btn-parse'));
        s.answers([...FULL.slice(0, 6), 'electronic_format:yes']);
        click($('btn-to-step-3'));
        $('preset-selector').value = 'agency'; change($('preset-selector'));
        const drop = () => {
            const ev = new s.w.Event('drop', { bubbles: true, cancelable: true });
            Object.defineProperty(ev, 'dataTransfer', { value: { files: [new s.w.File(['name;"ort; plz"\r\nBea;"Berlin; 10115"\r\n'], 'export.CSV')] } });
            $('drop-zone').dispatchEvent(ev);
        };
        drop(); await wait(80); drop(); await wait(80);
        assert.equal(count('FILE_PARSED'), 2);
        assert.equal($('file-input').value, '');
        assert.match($('data-attachment').value, /name \| ort; plz\nBea \| Berlin; 10115/);
        click($('btn-to-step-4'));
        const letter = $('final-letter').textContent;
        assert.match(letter, /als elektronische Anlage zur Verfügung/);
        assert.match(letter, /DATENKOPIE GEMÄSS ART\. 15/);
        assert.doesNotMatch(letter, /separaten Anlage/);
        assert.doesNotMatch($('enforcement-record').textContent, /keine Datenkopie eingebunden/);
    });

    await t.test('Typwechsel löscht Parser-Vorschläge und Begründung', () => {
        click($('btn-restart'));
        $('ingest-text').value = 'Auskunft nach Art. 15, Ausweis anbei.';
        click($('btn-parse'));
        assert.ok(visible('parser-reasoning'));
        $('q-type').value = 'art17'; change($('q-type'));
        assert.equal(visible('parser-reasoning'), false);
        assert.doesNotMatch($('dynamic-questions-container').textContent, /Vorschlag aus E-Mail/);
        assert.deepEqual(plain(U.getState().unconfirmedSuggestions), {});
        assert.equal(U.getState().evaluation.pending.length, 1);
    });

    await t.test('Fristenrechner: leeres Datum, Orientierungshinweis, Audit-Datum', () => {
        click(s.d.querySelector('[data-target="view-deadline"]'));
        $('dl-date').value = ''; click($('btn-calc-dl'));
        assert.ok(visible('dl-hint') && !visible('dl-result-panel'));
        $('dl-date').value = '2025-04-08'; $('dl-state').value = 'BE'; click($('btn-calc-dl'));
        assert.equal($('dl-final-date').textContent, 'Freitag, 09.05.2025');
        assert.equal(visible('dl-hint'), false);
        assert.match($('dl-log').textContent, /Orientierungswert nach BGB \/ VO 1182\/71 \(praxisüblich, aber im Detail umstritten\)/);
        assert.match($('dl-caveat').textContent, /Orientierungswert/);
        assert.equal(E.eventLog.at(-1).details.result, '2025-05-09');
        $('dl-date').value = '2018-02-08'; click($('btn-calc-dl'));
        assert.ok(visible('dl-history-note'));
    });

    await t.test('Audit-Tab beschreibt die Grenzen der Hash-Kette', () => {
        const text = $('view-audit').textContent;
        assert.match(text, /eine kryptografische Garantie gegen gezielte Manipulation des lokalen Speichers \(z\.B\. per Dev-Tools\) besteht vor dem Export jedoch nicht/);
        assert.doesNotMatch(text, /garantiert/);
        assert.deepEqual(s.errors, []);
    });
});

test('Build ist reproduzierbar und enthält keine Modul-Anweisungen', async () => {
    const { build } = await import('../build.js');
    const html = build();
    assert.equal(html, readDist());
    assert.equal(html, build());
    assert.doesNotMatch(html, /^\s*(import|export)\s/m);
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!schema\.org|opensource\.org)/);
});
