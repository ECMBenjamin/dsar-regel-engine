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
import { readFileSync } from 'node:fs';
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
        const k = E.eventLog.findIndex(e => e.action === 'USER_CONFIRMED_ANSWER');
        assert.equal(E.eventLog[k].details.answer, 'no');
        E.eventLog[k].details.answer = 'yes';
        click($('btn-val-chain'));
        assert.match($('prov-status').textContent, /Inkonsistenz/);
        E.eventLog[k].details.answer = 'no';
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

test('Sitzung C: Datenpannen-Pack auf derselben Engine', async t => {
    const s = await boot();
    const { $, U, click, change, answer, visible, count } = s;
    const E = U.engine;
    const dsarHash = E.rulebookHash;

    await t.test('Pack-Wechsel lädt das zweite Rulebook in dieselbe Engine', () => {
        assert.deepEqual(plain([...$('pack-select').options].map(o => o.value)), ['dsar-gdpr-de', 'breach-gdpr-de']);
        $('pack-select').value = 'breach-gdpr-de'; change($('pack-select'));
        assert.equal(U.rulebook.metadata.id, 'breach-gdpr-de');
        assert.notEqual(E.rulebookHash, dsarHash);
        const loads = E.eventLog.filter(e => e.action === 'RULEBOOK_LOADED');
        assert.deepEqual(plain(loads.map(e => e.details.id)), ['dsar-gdpr-de', 'breach-gdpr-de']);
        assert.equal(E.eventLog.at(-1).details.reason, 'RULE_PACK_CHANGED');
        assert.match($('header-meta').textContent, /breach-gdpr-de@1\.1\.0/);
        assert.match($('ingest-label').textContent, /Vorfallbericht/);
        assert.equal($('q-type').options.length, 1);
        assert.equal($('btn-to-step-3').disabled, true);
    });

    await t.test('Ingestion: Vorschläge aus dem Vorfallbericht, keine Fakten', () => {
        click($('btn-parse'));
        assert.ok(visible('ingest-hint'));
        assert.match($('ingest-hint').textContent, /Beschreibung des Vorfalls/);
        $('ingest-text').value = 'Am 08.11. wurde ein unverschlüsselter Laptop mit Kundendaten und IBAN gestohlen. Bemerkt vor 4 Tagen.';
        click($('btn-parse'));
        assert.deepEqual(plain(U.getState().unconfirmedSuggestions), { breach_confirmed: 'yes', high_risk: 'yes', data_unintelligible: 'no', within_72h: 'no' });
        assert.match($('dynamic-questions-container').textContent, /Vorschlag aus Vorfallbericht: Ja/);
        assert.equal(count('USER_CONFIRMED_ANSWER'), 0);
        assert.equal(U.getState().evaluation.decision, 'BLOCKED');
    });

    await t.test('Verspätete Meldung mit hohem Risiko verlangt Review', () => {
        s.answers(['breach_confirmed:yes', 'role_controller:yes', 'risk_likely:yes', 'within_72h:no', 'facts_complete:no', 'high_risk:yes', 'data_unintelligible:no', 'risk_mitigated:no', 'disproportionate_effort:no']);
        assert.equal($('score-value').textContent, '0.25');
        assert.equal($('decision-chip').textContent, 'MANUAL_REVIEW');
        assert.equal($('outcome-label').textContent, 'Aufsichtsbehörde melden und Betroffene benachrichtigen');
        assert.match($('outcome-basis').textContent, /Art\. 33 Abs\. 1 S\. 2 DSGVO.*Art\. 33 Abs\. 4 DSGVO/);
        assert.match($('obligations-list').textContent, /nachmelden/);
        assert.equal($('btn-to-step-3').disabled, true);
        $('reviewer-name').value = 'BT'; click($('btn-review'));
        assert.equal($('status-chip').textContent, 'REVIEW_COMPLETED');
    });

    await t.test('Schritt 3 zeigt genau die Felder, die das Outcome verlangt', () => {
        click($('btn-to-step-3'));
        assert.ok(!visible('preset-box') && !visible('datadrop-section'));
        const labels = [...s.d.querySelectorAll('#action-inputs label')].map(l => l.textContent);
        assert.deepEqual(plain(labels.map(l => l.replace(/ \(.*$/, ''))), ['Zeitpunkt des Bekanntwerdens', 'Begründung der Verzögerung', 'Art der Verletzung', 'Datenschutzbeauftragter oder Anlaufstelle', 'Wahrscheinliche Folgen der Verletzung', 'Ergriffene oder vorgeschlagene Maßnahmen', 'Kategorien und ungefähre Zahl der betroffenen Personen und Datensätze']);
        assert.match(labels.at(-1), /\(optional\)$/);
        assert.match($('in-awareness').placeholder, /12\.11\.2026/);
        assert.match($('in-delay_reason').nextElementSibling.textContent, /zu begründen/);
        assert.equal($('in-incident').value, '');
        assert.equal($('btn-to-step-4').textContent, 'Aktion ausführen: Dokumente erzeugen');
    });

    await t.test('Ohne Pflichtangaben keine Dokumente; danach Meldung, Benachrichtigung und Vermerk', () => {
        click($('btn-to-step-4'));
        assert.ok(visible('action-error'));
        assert.match($('action-error').textContent, /REQUIRED_INPUT_MISSING/);
        for (const f of ['awareness', 'delay_reason', 'incident', 'contact', 'consequences', 'measures']) assert.ok($('in-' + f).classList.contains('field-missing'), f);
        assert.equal($('in-scope').classList.contains('field-missing'), false);
        s.type('awareness', '10.11.2026, 08:00 Uhr');
        s.type('delay_reason', 'Forensische Analyse erforderlich');
        s.type('incident', 'Diebstahl eines unverschlüsselten Laptops');
        s.type('contact', 'Datenschutzbeauftragte, dsb@example.org');
        s.type('consequences', 'Missbrauch von Bankdaten');
        s.type('measures', 'Kontosperre empfohlen, Gerät gesperrt');
        $('q-name').value = 'Laptop-Diebstahl Vertrieb';
        click($('btn-to-step-4'));
        const doc = $('final-letter').textContent;
        assert.ok(visible('step-4-generation'));
        assert.match($('result-title').textContent, /Meldung und Dokumentation/);
        assert.match(doc, /DOKUMENT 1 VON 3: MELDUNG AN DIE AUFSICHTSBEHÖRDE/);
        assert.match(doc, /DOKUMENT 2 VON 3: BENACHRICHTIGUNG DER BETROFFENEN PERSONEN/);
        assert.match(doc, /DOKUMENT 3 VON 3: INTERNER DOKUMENTATIONSVERMERK/);
        assert.match(doc, /Vorgang: Laptop-Diebstahl Vertrieb/);
        assert.match(doc, /Forensische Analyse erforderlich/);
        assert.match(doc, /Geprüft und freigegeben durch: BT/);
        assert.doesNotMatch(doc, /undefined|null/);
        assert.equal(U.getState().enforcement.documentTextHash, sha(doc));
        const exec = E.eventLog.filter(e => e.action === 'ACTION_EXECUTED');
        assert.equal(exec.length, 1);
        assert.equal(exec[0].details.action, 'generate_breach_documents');
        assert.equal(exec[0].details.attachmentIncluded, null);
        click($('btn-test-det'));
        assert.match($('prov-status').textContent, /Determinismus bestätigt.*Action: zwei/);
    });

    await t.test('Entwickler-Ansicht und MCP-Mockup folgen dem aktiven Pack', () => {
        click(s.d.querySelector('[data-target="view-dev"]'));
        $('mcp-view').value = 'tools/list'; change($('mcp-view'));
        const tools = JSON.parse($('mcp-response').textContent).result.tools;
        assert.deepEqual(tools[0].inputSchema.properties.rulebook.enum, ['dsar-gdpr-de', 'breach-gdpr-de']);
        assert.deepEqual(tools[1].inputSchema.properties.action.enum, ['generate_breach_documents']);
        $('mcp-view').value = 'rules_get_rulebook'; change($('mcp-view'));
        assert.equal(JSON.parse($('mcp-response').textContent).result.structuredContent.metadata.id, 'breach-gdpr-de');
        assert.match(s.d.querySelector('#rulebook-meta-table').textContent, /breach-gdpr-de@1\.1\.0/);
        assert.equal(JSON.parse($('rulebook-json').textContent).metadata.id, 'breach-gdpr-de');
    });

    await t.test('Zurück zum Auskunfts-Pack: Ablauf unverändert, Kette über beide Packs gültig', () => {
        $('pack-select').value = 'dsar-gdpr-de'; change($('pack-select'));
        assert.equal(E.rulebookHash, dsarHash);
        assert.match($('ingest-label').textContent, /E-Mail-Text/);
        $('ingest-text').value = 'Bitte Auskunft nach Art. 15.\n\nViele Grüße\nEva Muster';
        click($('btn-parse'));
        s.answers(FULL);
        click($('btn-to-step-3'));
        assert.ok(visible('preset-box'));
        $('preset-selector').value = 'coaching'; change($('preset-selector'));
        click($('btn-to-step-4'));
        assert.match($('final-letter').textContent, /Sehr geehrte\(r\) Eva Muster,/);
        assert.match($('final-letter').textContent, /Videokonferenz-Anbieter/);
        click($('btn-val-chain'));
        assert.match($('prov-status').textContent, /erfolgreich/);
        assert.deepEqual(s.errors, []);
    });
});

test('Sitzung D: Selbsttests der Packs und Import fremder Rulebooks', async t => {
    const s = await boot();
    const { $, U, click, change, visible } = s;
    const E = U.engine;
    const example = readFileSync(new URL('../docs/examples/example-rulebook.json', import.meta.url), 'utf8');
    const importFile = async (name, content) => {
        const input = $('rulebook-import');
        Object.defineProperty(input, 'files', { value: [new s.w.File([content], name)], configurable: true });
        input.dispatchEvent(new s.w.Event('change', { bubbles: true }));
        await wait(80);
    };
    const options = () => [...$('pack-select').options].map(o => o.value);

    await t.test('Mitgelieferte Packs bestehen ihre Selbsttests beim Start', () => {
        const runs = E.eventLog.filter(e => e.action === 'RULEBOOK_SELFTEST');
        assert.deepEqual(plain(runs.map(e => [e.details.id, e.details.passed, e.details.failed, e.details.uncoveredOutcomes.length])),
            [['dsar-gdpr-de', 14, 0, 0], ['breach-gdpr-de', 9, 0, 0]]);
        assert.equal($('selftest-summary').textContent, '14 von 14 Testfällen bestanden.');
        assert.equal(s.d.querySelectorAll('#selftest-table tbody tr').length, 14);
        assert.match($('selftest-table').textContent, /T-A12-01.*BLOCKED · NON_COMPLIANT · A12-DENY-LATE · 0\.00/);
    });

    await t.test('Kaputte und ungültige Dateien werden abgelehnt', async () => {
        await importFile('kaputt.json', '{ nicht json');
        assert.match($('import-status').textContent, /kein gültiges JSON/);
        await importFile('leer.json', '{}');
        assert.match($('import-status').textContent, /Rulebook ist ungültig/);
        const dup = JSON.parse(example); dup.metadata.id = 'dsar-gdpr-de';
        await importFile('dup.json', JSON.stringify(dup));
        assert.match($('import-status').textContent, /bereits geladen/);
        assert.deepEqual(plain(options()), ['dsar-gdpr-de', 'breach-gdpr-de']);
        assert.equal(U.rulebook.metadata.id, 'dsar-gdpr-de');
    });

    await t.test('Ein Rulebook mit fehlschlagendem Testfall wird nicht aktiviert', async () => {
        const bad = JSON.parse(example); bad.rules[1].risk.yes = 0.9;
        await importFile('bad.json', JSON.stringify(bad));
        assert.match($('import-status').textContent, /1 von 4 Testfällen schlagen fehl/);
        assert.match($('import-status').textContent, /T-PR-03: Abweichung bei: decision, status, score/);
        assert.deepEqual(plain(options()), ['dsar-gdpr-de', 'breach-gdpr-de']);
        assert.equal(U.selftests['example-press-release'], undefined);
        assert.equal(E.eventLog.filter(e => e.action === 'RULEBOOK_IMPORT_REJECTED').at(-1).details.reason, 'SELFTEST_FAILED');
    });

    await t.test('Gültiges Rulebook wird geladen, gekennzeichnet und aktiviert', async () => {
        await importFile('example-rulebook.json', example);
        assert.match($('import-status').textContent, /Importiert und aktiviert: Beispiel: Freigabe einer Pressemitteilung/);
        assert.match($('import-status').textContent, /Gilt nur für diese Sitzung/);
        assert.deepEqual(plain(options()), ['dsar-gdpr-de', 'breach-gdpr-de', 'example-press-release']);
        assert.match($('pack-select').selectedOptions[0].textContent, /importiert, ungeprüft/);
        assert.equal(U.rulebook.metadata.id, 'example-press-release');
        assert.match($('pack-description').textContent, /nicht mitgeliefert, ungeprüft/);
        assert.equal($('selftest-summary').textContent, '4 von 4 Testfällen bestanden.');
        const imported = E.eventLog.find(e => e.action === 'RULEBOOK_IMPORTED');
        assert.equal(imported.details.scope, 'SESSION');
        assert.equal(imported.details.rulebookHash, E.rulebookHash);
    });

    await t.test('Workflow mit dem importierten Pack erzeugt ein Protokoll', () => {
        click($('btn-parse'));
        assert.ok(visible('ingest-hint'));
        $('ingest-text').value = 'Mitteilung zum neuen Standort';
        click($('btn-parse'));
        s.answers(['facts_checked:yes', 'names_customers:no']);
        assert.equal($('decision-chip').textContent, 'PERMITTED');
        click($('btn-to-step-3'));
        click($('btn-to-step-4'));
        assert.ok($('in-summary').classList.contains('field-missing'));
        s.type('summary', 'Neuer Standort Köln');
        click($('btn-to-step-4'));
        const doc = $('final-letter').textContent;
        assert.match(doc, /^ENTSCHEIDUNGSPROTOKOLL/);
        assert.match(doc, /example-press-release@1\.0\.0\), importiert, nicht mitgeliefert/);
        assert.match(doc, /- \[PR-01\] Sind alle Zahlen und Zitate geprüft\? Ja/);
        assert.match(doc, /Kurzbeschreibung der Mitteilung: Neuer Standort Köln/);
        assert.doesNotMatch(doc, /undefined|null/);
        click($('btn-val-chain'));
        assert.match($('prov-status').textContent, /erfolgreich/);
        assert.deepEqual(s.errors, []);
    });
});

test('Build ist reproduzierbar und enthält keine Modul-Anweisungen', async () => {
    const { build } = await import('../build.js');
    const html = build();
    assert.equal(html, readDist());
    assert.equal(readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8'), html);
    assert.equal(html, build());
    assert.doesNotMatch(html, /^\s*(import|export)\s/m);
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!schema\.org|opensource\.org)/);
});

test('Projektseite lädt nichts von außen und verlinkt die Anwendung', () => {
    const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(page, /<script|<link[^>]+href=|<img|@import|url\(/i);
    assert.match(page, /href="app\/"/);
    assert.match(page, /href="https:\/\/benjaminthyssen\.com"/);
    assert.match(page, /keine Rechtsberatung/i);
    const anchors = [...page.matchAll(/href="#([a-z-]+)"/g)].map(m => m[1]);
    for (const a of anchors) assert.ok(page.includes(`id="${a}"`), a);
});
