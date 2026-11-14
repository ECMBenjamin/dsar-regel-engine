/**
 * @file Anwendung / Oberfläche
 * Verbindet Rule Packs, Engine und Actions mit dem DOM. Einziger Teil mit Browser-Abhängigkeit.
 * Die Oberfläche kennt kein einzelnes Rechtsgebiet: Fragen, Eingabefelder und Texte kommen aus dem aktiven Rule Pack.
 * @author benthy
 * @license MIT
 */

import { sha256Hex, canonicalJson, SHA256_TEST_VECTORS, sha256SelfTest } from '../core/crypto.js';
import { UniversalRulesEngine, ENGINE_VERSION } from '../core/engine.js';
import { knowledgeBase, caseDatabase } from '../domain/content.js';
import { formatDateDE, toISODateLocal, WEEKDAYS, parseLocalDate, computeDeadline, DEADLINE_CAVEAT, GDPR_APPLICABLE_FROM } from '../domain/deadline.js';
import { formatAttachment } from '../domain/attachment.js';
import { $, el, haltApplication, downloadFile, copyText } from './dom.js';
import { RULE_PACKS } from './packs.js';

// --- Start: SHA-256 Self-Test. Schlägt er fehl, startet die Anwendung nicht. ---
if (!sha256SelfTest()) {
    haltApplication(
        'Systemfehler: SHA-256 Self-Test fehlgeschlagen',
        'Die Hash-Funktion liefert für bekannte Testvektoren falsche Ergebnisse. Ein verlässlicher Audit-Trail ist damit nicht möglich. Die Anwendung wurde gestoppt; es werden keine Vorgänge verarbeitet. Bitte verwenden Sie eine unveränderte Kopie der Datei in einem aktuellen Browser.'
    );
    throw new Error('SHA-256 Self-Test fehlgeschlagen. Anwendung gestoppt.');
}

const APP_VERSION = '8.1.0';

const engine = new UniversalRulesEngine({ initDetails: { sha256SelfTest: 'PASSED', testVectors: SHA256_TEST_VECTORS.length } });
let activePack = RULE_PACKS[0];
engine.load(activePack.rulebook);

// Sitzungszustand: Eingaben des aktuellen Vorgangs. Vorschläge des Parsers
// und bestätigte Fakten bleiben strikt getrennt.
const session = {
    caseSeq: 1,
    caseId: 'CASE-0001',
    requestType: activePack.rulebook.requestTypes[0].id,
    facts: {},
    suggestions: {},
    inputs: {},
    attachmentData: '',
    lastDecisionKey: null,
    execution: null
};

const currentInput = () => ({ caseId: session.caseId, requestType: session.requestType, facts: Object.assign({}, session.facts) });

// --- Eingabefelder der Aktion: Welche Felder es gibt, bestimmt das Outcome im Rulebook ---
function actionDefinition() {
    return activePack.rulebook.metadata.actions.find(a => a.id === activePack.action.id) || {};
}

function inputMeta(field) {
    const inputs = actionDefinition().inputs || {};
    return inputs[field] || {};
}

// Pflichtfelder liefert die Engine. Optionale Felder stehen nur im Rulebook; die Engine erzwingt sie nicht.
function inputFieldsFor(ev) {
    if (!ev || !ev.outcome) return [];
    const fields = ev.outcome.requiredInputs.map(r => ({ field: r.field, label: r.label, required: true }));
    const raw = activePack.rulebook.outcomes.find(o => o.id === ev.outcome.id) || {};
    (raw.optionalInputs || []).forEach(o => {
        const applies = !o.when || UniversalRulesEngine.matches(o.when, ev.input.facts);
        if (applies && !fields.some(f => f.field === o.field)) fields.push({ field: o.field, label: o.label, required: false });
    });
    return fields;
}

// Sichtbare Vorbelegungen aus dem Rulebook gelten, bis der Nutzer das Feld ändert.
const inputValue = field => (field in session.inputs ? session.inputs[field] : (inputMeta(field).defaultValue || ''));

function collectPayload(ev, issueDate) {
    const payload = {
        name: $('q-name').value.trim(),
        company: $('company-name').value.trim() || 'Verantwortliche Stelle',
        issueDate: issueDate || formatDateDE(new Date()),
        attachment: session.attachmentData
    };
    inputFieldsFor(ev).forEach(f => { payload[f.field] = inputValue(f.field).trim(); });
    return payload;
}

// --- Smart Ingestion (der Parser des Packs liefert nur Vorschläge) ---
function runIngestion() {
    const text = $('ingest-text').value;
    if (!text.trim()) { $('ingest-hint').classList.remove('hidden'); return; }
    $('ingest-hint').classList.add('hidden');

    const result = activePack.parse(text);

    // Strikt als Vorschläge gespeichert, NICHT als bestätigte Fakten.
    session.requestType = result.requestType;
    session.facts = {};
    session.suggestions = result.suggestions;
    session.lastDecisionKey = null;

    $('q-name').value = result.subject;
    $('q-type').value = result.requestType;

    const box = $('parser-reasoning');
    box.textContent = '';
    box.appendChild(el('strong', 'Parser-Begründung:'));
    const ul = el('ul');
    result.reasoning.forEach(r => ul.appendChild(el('li', r)));
    box.appendChild(ul);
    box.classList.remove('hidden');

    engine.log('SMART_INGESTION', {
        caseId: session.caseId, rulePack: activePack.rulebook.metadata.id, length: text.length,
        detectedType: result.requestType, nameFound: !!result.subject,
        suggestedFacts: Object.keys(result.suggestions).sort(), reasoning: result.reasoning
    });

    refreshWorkflow();
    $('step-1-ingestion').classList.add('hidden');
    $('step-2-questionnaire').classList.remove('hidden');
}

// --- Fragebogen: rendert ausschließlich, was die Engine als aktiv meldet ---
function renderQuestionnaire(ev, focusFact) {
    const container = $('dynamic-questions-container');
    container.textContent = '';
    const labels = activePack.rulebook.metadata.answerLabels || {};

    ev.trace.forEach(t => {
        const rule = engine.getRule(t.ruleId);
        const answered = t.state === 'ANSWERED';
        const group = el('div', null, 'form-group');
        // STRICT GATE: keine Default-Antworten. Offene Regeln werden markiert.
        if (!answered) group.classList.add('unanswered-highlight');

        group.appendChild(el('span', rule.id, 'rule-id'));
        const lbl = el('label', rule.question);
        lbl.id = 'lbl_' + rule.fact;
        group.appendChild(lbl);

        const suggestion = session.suggestions[rule.fact];
        if (!answered && suggestion !== undefined) {
            const badge = el('span', `Vorschlag aus ${activePack.text.suggestionSource}: ${labels[suggestion] || suggestion} – Bitte durch Klick bestätigen`, 'badge badge-yellow');
            badge.style.display = 'block';
            badge.style.marginBottom = '12px';
            group.appendChild(badge);
        }

        const rg = el('div', null, 'radio-group row');
        rg.setAttribute('role', 'radiogroup');
        rg.setAttribute('aria-labelledby', lbl.id);
        rule.answers.forEach(val => {
            const rl = el('label', null, 'radio-label');
            const inp = el('input');
            inp.type = 'radio';
            inp.name = 'q_' + rule.fact;
            inp.value = val;
            if (answered && t.answer === val) inp.checked = true;
            inp.addEventListener('change', () => confirmFact(rule, val));
            rl.appendChild(inp);
            rl.appendChild(document.createTextNode(labels[val] || val));
            rg.appendChild(rl);
        });
        group.appendChild(rg);

        const whyBox = el('div', null, 'why-box');
        whyBox.appendChild(el('h4', 'Juristischer Hintergrund · ' + rule.provenance.source));
        if (rule.provenance.note) whyBox.appendChild(el('p', rule.provenance.note));
        if (rule.provenance.quote) whyBox.appendChild(el('p', 'Normtext (Auszug): „' + rule.provenance.quote + '“', 'quote'));
        const math = rule.answers.map(a => `'${labels[a] || a}' = ${rule.risk[a].toFixed(2)}`).join(', ');
        whyBox.appendChild(el('p', 'Mathematische Auswirkung: Faktor bei ' + math + '.', 'quote'));
        group.appendChild(whyBox);

        container.appendChild(group);
    });

    if (focusFact) {
        const checked = container.querySelector('input[name="q_' + focusFact + '"]:checked');
        if (checked) checked.focus();
    }
}

function confirmFact(rule, value) {
    session.facts[rule.fact] = value;
    const suggestion = session.suggestions[rule.fact];
    engine.log('USER_CONFIRMED_ANSWER', {
        caseId: session.caseId,
        ruleId: rule.id,
        questionId: rule.fact,
        answer: value,
        wasParserSuggested: suggestion !== undefined,
        matchesSuggestion: suggestion !== undefined ? suggestion === value : null
    });
    const ev = refreshWorkflow(rule.fact);
    logDecisionIfChanged(ev);
}

function logDecisionIfChanged(ev) {
    if (!ev.complete) { session.lastDecisionKey = null; return; }
    if (session.lastDecisionKey === ev.inputHash) return;
    session.lastDecisionKey = ev.inputHash;
    engine.log('POLICY_DECISION', {
        caseId: session.caseId, requestType: ev.input.requestType,
        decision: ev.decision, status: ev.status, score: ev.score,
        outcome: ev.outcome ? ev.outcome.id : null,
        verdict: ev.outcome ? ev.outcome.verdict : null,
        legalBasis: ev.outcome ? ev.outcome.legalBasis : [],
        rules: ev.trace.map(t => t.ruleId),
        rulebookHash: ev.rulebook.hash, inputHash: ev.inputHash
    });
}

const DECISION_CHIP = { PERMITTED: 'chip chip-permitted', MANUAL_REVIEW: 'chip chip-review', BLOCKED: 'chip chip-blocked' };
const statusChipClass = s => (s === 'COMPLIANT' || s === 'REVIEW_COMPLETED') ? 'chip chip-permitted' : (s === 'REVIEW_REQUIRED' ? 'chip chip-review' : (s === 'NON_COMPLIANT' ? 'chip chip-blocked' : 'chip'));
const isReleased = ev => ev.status === 'COMPLIANT' || ev.status === 'REVIEW_COMPLETED';

function renderDecision(ev) {
    // Ampel & Score
    const tl = $('traffic-light');
    tl.className = 'traffic-light';
    if (!ev.complete) {
        tl.classList.add('yellow');
        $('score-value').textContent = '-.--';
        $('pending-badge').classList.remove('hidden');
    } else {
        $('pending-badge').classList.add('hidden');
        $('score-value').textContent = ev.score.toFixed(2);
        tl.classList.add(ev.riskLevel === 'GREEN' ? 'green' : (ev.riskLevel === 'YELLOW' ? 'yellow' : 'red'));
    }

    // Maschinenlesbare Entscheidung
    const dc = $('decision-chip');
    dc.textContent = ev.decision;
    dc.className = DECISION_CHIP[ev.decision] || 'chip';
    const sc = $('status-chip');
    sc.textContent = ev.status;
    sc.className = statusChipClass(ev.status);
    $('outcome-label').textContent = ev.outcome ? ev.outcome.label : '–';
    $('outcome-basis').textContent = ev.outcome ? ev.outcome.legalBasis.join(', ') : '–';

    const reasons = $('decision-reasons');
    reasons.textContent = '';
    ev.reasons.forEach(r => reasons.appendChild(el('li', r.message)));

    const obligations = ev.outcome && ev.outcome.effect === 'ALLOW' ? ev.outcome.obligations : [];
    $('obligations-list').textContent = '';
    obligations.forEach(o => $('obligations-list').appendChild(el('li', o.text)));
    $('obligations-box').classList.toggle('hidden', obligations.length === 0);

    // Review / Block
    $('review-box').classList.toggle('hidden', ev.status !== 'REVIEW_REQUIRED');
    const done = $('review-done');
    done.classList.toggle('hidden', ev.status !== 'REVIEW_COMPLETED');
    if (ev.status === 'REVIEW_COMPLETED') {
        done.textContent = `Manuelle Prüfung abgeschlossen durch ${ev.review.reviewer}. Die Freigabe gilt nur für diese Faktenlage; jede Änderung einer Antwort hebt sie auf.`;
    }
    const blocked = $('blocked-box');
    const isBlocked = ev.complete && ev.decision === 'BLOCKED';
    blocked.classList.toggle('hidden', !isBlocked);
    if (isBlocked) blocked.textContent = 'Aktion blockiert: ' + ev.reasons.map(r => r.message).join(' ');

    // STRICT GATE: Weiter erst, wenn alle aktiven Regeln bestätigt sind UND die Engine freigibt.
    $('btn-to-step-3').disabled = !isReleased(ev);
    const hint = $('gate-hint');
    if (!ev.complete) hint.textContent = 'Weiter ist gesperrt, bis alle aktiven Fragen durch Klick bestätigt sind.';
    else if (ev.status === 'REVIEW_REQUIRED') hint.textContent = 'Weiter ist gesperrt, bis die manuelle Prüfung abgezeichnet ist.';
    else if (ev.status === 'NON_COMPLIANT') hint.textContent = 'Weiter ist gesperrt: Die Engine hat die Aktion blockiert.';
    else hint.textContent = 'Freigegeben durch die Engine (Status ' + ev.status + ').';
}

// STRICT GATE: Fakten, deren Regel nicht mehr aktiv ist, werden hart gelöscht.
// Wird die übergeordnete Antwort später zurückgeändert, müssen die abhängigen
// Fragen erneut aktiv bestätigt werden. evaluate() selbst bleibt seiteneffektfrei.
function pruneFacts(ev) {
    const removed = Object.keys(session.facts).filter(f => !(f in ev.input.facts)).sort();
    if (!removed.length) return false;
    removed.forEach(f => { delete session.facts[f]; });
    engine.log('FACTS_PRUNED', { caseId: session.caseId, removed: removed, reason: 'Regel nicht mehr aktiv; erneute Bestätigung erforderlich.' });
    return true;
}

function refreshWorkflow(focusFact) {
    let ev = engine.evaluate(currentInput());
    if (pruneFacts(ev)) ev = engine.evaluate(currentInput());
    renderQuestionnaire(ev, focusFact);
    renderDecision(ev);
    refreshDevView();
    return ev;
}

function completeReview() {
    const reviewer = $('reviewer-name').value.trim();
    $('reviewer-hint').classList.toggle('hidden', !!reviewer);
    if (!reviewer) { $('reviewer-name').focus(); return; }
    engine.recordReview(currentInput(), reviewer);
    refreshWorkflow();
}

// --- Schritt 3: Eingaben, die das Outcome für die Aktion verlangt ---
function renderActionInputs(ev) {
    const container = $('action-inputs');
    container.textContent = '';
    inputFieldsFor(ev).forEach(f => {
        const meta = inputMeta(f.field);
        const group = el('div', null, 'form-group');
        const label = el('label', f.required ? f.label : f.label + ' (optional)');
        label.setAttribute('for', 'in-' + f.field);
        const area = el('textarea');
        area.id = 'in-' + f.field;
        area.value = inputValue(f.field);
        if (meta.placeholder) area.placeholder = meta.placeholder;
        if (f.required) area.setAttribute('aria-required', 'true');
        area.addEventListener('input', () => {
            session.inputs[f.field] = area.value;
            area.classList.remove('field-missing');
        });
        group.appendChild(label);
        group.appendChild(area);
        if (meta.hint) group.appendChild(el('p', meta.hint, 'field-hint'));
        container.appendChild(group);
    });
}

function configureStep3(ev) {
    const fields = inputFieldsFor(ev);
    const required = fields.filter(f => f.required);
    const presets = activePack.presets;
    const presetKeys = presets ? Object.keys(presets.values[presets.options[0].id]) : [];
    $('preset-box').classList.toggle('hidden', !fields.some(f => presetKeys.indexOf(f.field) !== -1));
    $('datadrop-section').classList.toggle('hidden', !ev.outcome.acceptsAttachment);
    renderActionInputs(ev);
    clearActionError();

    const summary = $('action-summary');
    summary.textContent = '';
    summary.appendChild(el('strong', 'Freigegebene Aktion: ' + ev.outcome.label));
    summary.appendChild(el('p', `Engine-Entscheidung ${ev.decision}, Status ${ev.status}, Score ${ev.score.toFixed(2)}. Rechtsgrundlage: ${ev.outcome.legalBasis.join(', ')}.`, 'mt-4'));
    if (required.length) summary.appendChild(el('p', 'Das Outcome verlangt Pflichtangaben. Die Aktion wird erst ausgeführt, wenn alle ausgefüllt sind.'));
}

function clearActionError() {
    $('action-error').classList.add('hidden');
    document.querySelectorAll('#action-inputs .field-missing').forEach(e => e.classList.remove('field-missing'));
}

function goToStep3() {
    const ev = engine.evaluate(currentInput());
    // Defense in Depth: Der Button ist deaktiviert, die Engine entscheidet trotzdem erneut.
    if (!isReleased(ev)) { renderDecision(ev); return; }
    configureStep3(ev);
    $('step-2-questionnaire').classList.add('hidden');
    $('step-3-data').classList.remove('hidden');
}

function loadPreset() {
    const val = $('preset-selector').value;
    if (!val || !activePack.presets) return;
    const data = activePack.presets.values[val];
    Object.keys(data).forEach(field => { session.inputs[field] = data[field]; });
    renderActionInputs(engine.evaluate(currentInput()));
    clearActionError();
    engine.log('LOAD_PRESET', { caseId: session.caseId, preset: val });
    refreshDevView();
}

// --- Local Data-Drop ---
function handleFileDrop(e) {
    e.preventDefault();
    $('drop-zone').classList.remove('dragover');
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const formatted = formatAttachment(file.name, String(event.target.result));
        $('data-attachment').value = formatted;
        $('parsed-data-preview').classList.remove('hidden');
        session.attachmentData = formatted;
        engine.log('FILE_PARSED', { caseId: session.caseId, filename: file.name, size: file.size, contentHash: sha256Hex(formatted) });
    };
    reader.readAsText(file, 'UTF-8');
    // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann (sonst feuert "change" nicht).
    $('file-input').value = '';
}

// --- Schritt 4: Aktion ausführen (Enforcement) ---
function runAction() {
    const before = engine.evaluate(currentInput());
    // Idempotenz-Sperre: Für dieselbe Faktenlage wird die Aktion nur einmal ausgeführt.
    if (session.execution && session.execution.inputHash === before.inputHash) return;
    clearActionError();
    const payload = collectPayload(before);
    const result = activePack.action.execute(engine, currentInput(), payload);

    if (!result.executed) {
        const box = $('action-error');
        box.textContent = 'Aktion nicht ausgeführt (' + result.authorization.code + '): ' + result.authorization.message;
        box.classList.remove('hidden');
        (result.authorization.missingInputs || []).forEach(f => { const field = $('in-' + f); if (field) field.classList.add('field-missing'); });
        refreshDevView();
        return;
    }

    const ev = result.evaluation;
    session.execution = {
        inputHash: ev.inputHash, documentTextHash: result.documentTextHash, issueDate: payload.issueDate,
        status: ev.status, decision: ev.decision, outcomeId: ev.outcome.id, verdict: ev.outcome.verdict,
        legalBasis: ev.outcome.legalBasis, reviewer: ev.review.reviewer, score: ev.score
    };

    $('final-letter').textContent = result.doc;
    const rec = $('enforcement-record');
    rec.textContent = '';
    rec.appendChild(el('strong', 'Aktion ausgeführt: ' + ev.outcome.label));
    rec.appendChild(el('p', `Freigabe durch die Engine mit Status ${ev.status}` + (ev.review.reviewer ? ` (geprüft durch ${ev.review.reviewer})` : '') + `. Angewandte Normen: ${ev.outcome.legalBasis.join(', ')}.`, 'mt-4'));
    rec.appendChild(el('p', 'Document-Text-Hash: ' + result.documentTextHash));
    if (ev.outcome.obligations.length) {
        rec.appendChild(el('p', 'Vor dem Versand zu erledigen: ' + ev.outcome.obligations.map(o => o.text).join(' ')));
    }
    if (ev.outcome.acceptsAttachment && !payload.attachment && activePack.text.attachmentWarning) {
        rec.appendChild(el('p', activePack.text.attachmentWarning));
    }

    $('step-3-data').classList.add('hidden');
    $('step-4-generation').classList.remove('hidden');
    refreshDevView();
}

function startNewCase(reason) {
    session.caseSeq += 1;
    session.caseId = 'CASE-' + String(session.caseSeq).padStart(4, '0');
    session.requestType = activePack.rulebook.requestTypes[0].id;
    session.facts = {};
    session.suggestions = {};
    session.inputs = {};
    session.attachmentData = '';
    session.lastDecisionKey = null;
    session.execution = null;

    ['ingest-text', 'q-name', 'reviewer-name', 'data-attachment', 'file-input', 'preset-selector'].forEach(id => { $(id).value = ''; });
    $('q-type').value = session.requestType;
    $('action-inputs').textContent = '';
    $('parsed-data-preview').classList.add('hidden');
    $('parser-reasoning').classList.add('hidden');
    $('reviewer-hint').classList.add('hidden');
    $('ingest-hint').classList.add('hidden');
    $('final-letter').textContent = '';
    clearActionError();

    ['step-2-questionnaire', 'step-3-data', 'step-4-generation'].forEach(id => $(id).classList.add('hidden'));
    $('step-1-ingestion').classList.remove('hidden');
    engine.log('SESSION_RESET', { reason: reason, newCaseId: session.caseId });
    refreshWorkflow();
}

// --- Rule Pack wechseln: dieselbe Engine lädt ein anderes Rulebook ---
function selectPack(id) {
    const next = RULE_PACKS.find(p => p.rulebook.metadata.id === id);
    if (!next || next === activePack) return;
    activePack = next;
    engine.load(next.rulebook);
    renderPackInfo();
    startNewCase('RULE_PACK_CHANGED');
}

// --- BGB-Fristenrechner (UI) ---
function calculateDeadline() {
    const dateStr = $('dl-date').value;
    const stateCode = $('dl-state').value;
    const isExt = document.querySelector('input[name="dl-ext"]:checked').value === 'yes';
    const receiptDate = parseLocalDate(dateStr);
    $('dl-hint').classList.toggle('hidden', !!receiptDate);
    $('dl-date').classList.toggle('field-missing', !receiptDate);
    if (!receiptDate) {
        // Kein veraltetes Ergebnis stehen lassen.
        $('dl-result-panel').classList.add('hidden');
        $('dl-date').focus();
        return;
    }

    const result = computeDeadline(receiptDate, stateCode, isExt);
    $('dl-caveat').textContent = DEADLINE_CAVEAT + '.';
    $('dl-history-note').classList.toggle('hidden', receiptDate >= GDPR_APPLICABLE_FROM);
    const logUl = $('dl-log');
    logUl.textContent = '';
    result.steps.forEach(s => logUl.appendChild(el('li', s)));
    $('dl-final-date').textContent = `${WEEKDAYS[result.endDate.getDay()]}, ${formatDateDE(result.endDate)}`;
    $('dl-result-panel').classList.remove('hidden');
    engine.log('CALCULATE_DEADLINE', { receipt: dateStr, state: stateCode, extended: isExt, result: toISODateLocal(result.endDate), shifted: result.shifted, basis: DEADLINE_CAVEAT });
}

// --- Audit UI & Export ---
function updateAuditUI() {
    const tbody = document.querySelector('#event-log-table tbody');
    if (!tbody) return;
    tbody.textContent = '';
    engine.eventLog.forEach(e => {
        const tr = el('tr');
        tr.appendChild(el('td', e.seq));
        tr.appendChild(el('td', e.action));
        tr.appendChild(el('td', JSON.stringify(e.details)));
        tr.appendChild(el('td', e.hash.substring(0, 16) + '...'));
        tbody.appendChild(tr);
    });
}

function setProvStatus(text, ok) {
    const status = $('prov-status');
    status.textContent = text;
    status.style.color = ok ? "var(--color-success)" : "var(--color-danger)";
    status.style.borderColor = ok ? "var(--color-success)" : "var(--color-danger)";
}

function validateChain() {
    const res = engine.verifyChain();
    setProvStatus(res.valid
        ? `Validierung erfolgreich. ${engine.eventLog.length} Ereignisse. Chain-Hash: ${engine.chainHash}`
        : `Inkonsistenz erkannt! Die Hash-Kette ist bei Seq ${res.brokenAt} gebrochen: Ein Eintrag wurde nachträglich verändert.`, res.valid);
}

function testDeterminism() {
    // Echter Determinismus-Test: Engine und (falls freigegeben) Action je zweimal mit identischen Eingaben.
    const input = currentInput();
    const e1 = engine.evaluate(input);
    const e2 = engine.evaluate(input);
    const h1 = sha256Hex(canonicalJson(e1));
    const h2 = sha256Hex(canonicalJson(e2));
    let ok = h1 === h2;
    let msg = `Engine: zwei unabhängige Auswertungen, Evaluation-Hash ${h1.substring(0, 16)}...`;

    const payload = collectPayload(e1, session.execution ? session.execution.issueDate : null);
    if (engine.authorize(activePack.action.id, e1, payload).authorized) {
        const d1 = activePack.action.render(e1, payload);
        const d2 = activePack.action.render(e2, payload);
        const dh1 = sha256Hex(d1);
        ok = ok && d1 === d2 && dh1 === sha256Hex(d2);
        msg += ` Action: zwei Durchläufe erzeugen identische Dokumente, Hash ${dh1.substring(0, 16)}...`;
    } else {
        msg += ' Action: nicht freigegeben, daher nicht ausgeführt.';
    }
    setProvStatus(ok ? 'Determinismus bestätigt. ' + msg : 'Determinismus-Fehler! Durchläufe weichen ab.', ok);
}

function buildAuditStatement() {
    const x = session.execution || {};
    const md = activePack.rulebook.metadata;
    let doc = `INTERNE AUDITERKLÄRUNG\nDatum: ${new Date().toISOString()}\nVorgang: ${session.caseId}\n\n`;
    doc += `Engine: ${engine.name} ${ENGINE_VERSION}\nRulebook: ${md.id}@${md.version}\nRulebook-Hash: ${engine.rulebookHash}\n\n`;
    doc += `Engine-Entscheidung: ${x.decision || '-'}\nStatus bei Ausführung: ${x.status || '-'}\nCompliance Score: ${typeof x.score === 'number' ? x.score.toFixed(2) : '-'}\n`;
    doc += `Outcome: ${x.outcomeId || '-'} (${x.verdict || '-'})\nAngewandte Normen: ${(x.legalBasis || []).join(', ') || '-'}\nManuelle Prüfung durch: ${x.reviewer || 'nicht erforderlich'}\n\n`;
    doc += `Input-Hash: ${x.inputHash || '-'}\nDocument-Text-Hash: ${x.documentTextHash || '-'}\nChain-Hash: ${engine.chainHash}\n\n`;
    doc += `Der Vorgang wurde deterministisch über die Engine ${ENGINE_VERSION} verarbeitet. Die Aktion wurde erst nach Freigabe durch die Engine ausgeführt.\n`;
    return doc;
}

// --- Entwickler-Ansicht: Evaluation State & MCP-Mockup ---
function buildEvaluationState() {
    const ev = engine.evaluate(currentInput());
    const auth = engine.authorize(activePack.action.id, ev, collectPayload(ev));
    const executed = !!(session.execution && session.execution.inputHash === ev.inputHash);
    // Ein Vorschlag gilt nur so lange als unbestätigt, wie der Fakt nicht bestätigt wurde.
    const unconfirmed = {};
    Object.keys(session.suggestions).forEach(k => { if (!(k in session.facts)) unconfirmed[k] = session.suggestions[k]; });
    return {
        schema: 'uri.evaluation-state/v1',
        evaluation: ev,
        unconfirmedSuggestions: unconfirmed,
        enforcement: {
            action: activePack.action.id,
            authorized: auth.authorized,
            code: auth.code,
            message: auth.message,
            missingInputs: auth.missingInputs || [],
            executed: executed,
            documentTextHash: executed ? session.execution.documentTextHash : null
        },
        provenance: { chainHash: engine.chainHash, events: engine.eventLog.length }
    };
}

function mcpTools() {
    const rb = activePack.rulebook;
    const answers = [];
    rb.rules.forEach(r => r.answers.forEach(a => { if (answers.indexOf(a) === -1) answers.push(a); }));
    return [
        {
            name: 'rules_evaluate',
            description: 'Wertet bestätigte Fakten gegen ein Rulebook aus. Liefert Entscheidung (PERMITTED | BLOCKED | MANUAL_REVIEW), Status, Score, Outcome und Provenance.',
            inputSchema: {
                type: 'object',
                properties: {
                    rulebook: { type: 'string', enum: RULE_PACKS.map(p => p.rulebook.metadata.id), description: 'Rulebook-ID' },
                    caseId: { type: 'string' },
                    requestType: { type: 'string', enum: rb.requestTypes.map(t => t.id) },
                    facts: { type: 'object', additionalProperties: { type: 'string', enum: answers } }
                },
                required: ['rulebook', 'requestType', 'facts']
            }
        },
        {
            name: 'rules_authorize_action',
            description: 'Prüft nach dem Default-Deny-Prinzip, ob eine Aktion für die angegebene Faktenlage freigegeben ist.',
            inputSchema: {
                type: 'object',
                properties: {
                    rulebook: { type: 'string' },
                    action: { type: 'string', enum: rb.metadata.actions.map(a => a.id) },
                    caseId: { type: 'string' },
                    requestType: { type: 'string' },
                    facts: { type: 'object' },
                    providedInputs: { type: 'array', items: { type: 'string' }, description: 'Namen der bereits ausgefüllten Pflichtangaben' }
                },
                required: ['rulebook', 'action', 'requestType', 'facts']
            }
        },
        {
            name: 'rules_get_rulebook',
            description: 'Liefert Metadaten, Regeln und Outcomes des geladenen Rulebooks einschließlich Hash.',
            inputSchema: { type: 'object', properties: { rulebook: { type: 'string' } }, required: ['rulebook'] }
        }
    ];
}

function buildMcpExchange(view) {
    const rb = activePack.rulebook;
    const rulebookId = rb.metadata.id;
    const actionId = activePack.action.id;
    const input = currentInput();
    const ev = engine.evaluate(input);
    const wrap = (structured, isError) => ({
        jsonrpc: '2.0', id: 1,
        result: { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured, isError: !!isError }
    });
    const call = (name, args) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: name, arguments: args } });

    if (view === 'tools/list') {
        return { request: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, response: { jsonrpc: '2.0', id: 1, result: { tools: mcpTools() } } };
    }
    if (view === 'rules_get_rulebook') {
        return {
            request: call(view, { rulebook: rulebookId }),
            response: wrap({ hash: engine.rulebookHash, metadata: rb.metadata, requestTypes: rb.requestTypes, rules: rb.rules, outcomes: rb.outcomes })
        };
    }
    if (view === 'rules_authorize_action') {
        const payload = collectPayload(ev);
        const provided = inputFieldsFor(ev).map(f => f.field).filter(f => payload[f] !== '');
        const auth = engine.authorize(actionId, ev, payload);
        return {
            request: call(view, { rulebook: rulebookId, action: actionId, caseId: input.caseId, requestType: input.requestType, facts: input.facts, providedInputs: provided }),
            response: wrap(Object.assign({ decision: ev.decision, status: ev.status }, auth))
        };
    }
    return {
        request: call('rules_evaluate', { rulebook: rulebookId, caseId: input.caseId, requestType: input.requestType, facts: input.facts }),
        response: wrap(ev)
    };
}

function refreshDevView() {
    const pre = $('dev-state');
    if (!pre) return;
    const state = buildEvaluationState();
    pre.textContent = JSON.stringify(state, null, 2);

    const dc = $('dev-decision-chip');
    dc.textContent = state.evaluation.decision;
    dc.className = DECISION_CHIP[state.evaluation.decision] || 'chip';
    const sc = $('dev-status-chip');
    sc.textContent = state.evaluation.status;
    sc.className = statusChipClass(state.evaluation.status);
    const ac = $('dev-action-chip');
    ac.textContent = state.enforcement.authorized ? 'action: authorized' : 'action: not authorized';
    ac.className = state.enforcement.authorized ? 'chip chip-permitted' : 'chip';

    const exchange = buildMcpExchange($('mcp-view').value);
    $('mcp-request').textContent = JSON.stringify(exchange.request, null, 2);
    $('mcp-response').textContent = JSON.stringify(exchange.response, null, 2);
}

// --- Alles, was vom aktiven Rule Pack abhängt ---
function renderPackInfo() {
    const rb = activePack.rulebook;
    const md = rb.metadata;
    const text = activePack.text;

    // Header & Footer
    const meta = $('header-meta');
    meta.textContent = '';
    [`Rule Pack: ${md.id}@${md.version}`, `Rulebook-Hash: ${engine.rulebookHash.substring(0, 12)}…`, `Engine ${ENGINE_VERSION}`, `SHA-256 Self-Test: bestanden (${SHA256_TEST_VECTORS.length} Vektoren)`]
        .forEach(t => meta.appendChild(el('span', t, 'badge badge-neutral')));
    $('footer-version').textContent = `DSAR Regel-Engine v${APP_VERSION} | Universal Rules Engine ${ENGINE_VERSION}: Deterministisch (Strict-Gate, Default-Deny) | Rule Pack ${md.id}@${md.version} | Lizenz: MIT`;

    // Workflow-Texte
    $('pack-select').value = md.id;
    $('pack-description').textContent = md.description;
    $('ingest-intro').textContent = text.ingestIntro;
    $('ingest-label').textContent = text.ingestLabel;
    $('ingest-text').placeholder = text.ingestPlaceholder;
    $('ingest-hint').textContent = text.ingestMissing;
    $('subject-label').textContent = text.subjectLabel;
    $('subject-hint').textContent = text.subjectHint;
    $('btn-to-step-4').textContent = text.actionButton;
    $('result-title').textContent = text.resultTitle;
    $('result-intro').textContent = text.resultIntro;
    $('btn-export-txt').textContent = text.exportLabel;

    // Anfrage-Typen aus dem Rulebook
    const typeSelect = $('q-type');
    typeSelect.textContent = '';
    engine.getRequestTypes().forEach(t => {
        const opt = el('option', t.label);
        opt.value = t.id;
        typeSelect.appendChild(opt);
    });

    // Presets des Packs (falls vorhanden)
    const presetSelect = $('preset-selector');
    presetSelect.textContent = '';
    const blank = el('option', '-- Profil wählen --');
    blank.value = '';
    presetSelect.appendChild(blank);
    if (activePack.presets) {
        $('preset-title').textContent = activePack.presets.title;
        $('preset-intro').textContent = activePack.presets.intro;
        activePack.presets.options.forEach(o => {
            const opt = el('option', o.label);
            opt.value = o.id;
            presetSelect.appendChild(opt);
        });
    }

    // Rulebook-Übersicht (Entwickler-Tab)
    const metaBody = document.querySelector('#rulebook-meta-table tbody');
    metaBody.textContent = '';
    [
        ['ID / Version', `${md.id}@${md.version}`],
        ['Domäne', md.domain],
        ['Rechtsraum', md.jurisdiction],
        ['Regeln / Outcomes', `${rb.rules.length} / ${rb.outcomes.length}`],
        ['Scoring', md.scoring.description],
        ['Entscheidungslogik', `Default ${md.decisionPolicy.defaultDecision}; MANUAL_REVIEW unter ${md.decisionPolicy.reviewBelow.toFixed(2)}; BLOCKED bei ${md.decisionPolicy.blockAtOrBelow.toFixed(2)} oder DENY-Outcome`],
        ['Aktionen', md.actions.map(a => `${a.id} (benötigt ${a.requiresStatus.join(' oder ')})`).join('; ')],
        ['SHA-256', engine.rulebookHash]
    ].forEach(row => {
        const tr = el('tr');
        tr.appendChild(el('th', row[0]));
        tr.appendChild(el('td', row[1]));
        metaBody.appendChild(tr);
    });
    $('rulebook-json').textContent = JSON.stringify(rb, null, 2);
}

// --- Inhalte, die für alle Packs gleich sind ---
function renderStaticContent() {
    const packSelect = $('pack-select');
    RULE_PACKS.forEach(p => {
        const opt = el('option', `${p.rulebook.metadata.name} (${p.rulebook.metadata.id})`);
        opt.value = p.rulebook.metadata.id;
        packSelect.appendChild(opt);
    });

    // Wissensdatenbank
    const kContainer = $('knowledge-container');
    knowledgeBase.forEach(k => {
        const box = el('div', null, 'why-box');
        box.style.borderRadius = 'var(--radius)';
        box.style.marginBottom = '16px';
        box.appendChild(el('h4', k.title));
        box.appendChild(el('p', `Rechtsgrundlage: ${k.basis}`, 'quote'));
        box.appendChild(el('p', k.body));
        kContainer.appendChild(box);
    });

    // Fallbeispiele
    const cTbody = document.querySelector('#cases-table tbody');
    caseDatabase.forEach(c => {
        const tr = el('tr');
        tr.appendChild(el('td', c.court));
        const azTd = el('td', c.az);
        if (!c.verified) {
            const badge = el('span', 'Fundstelle ungeprüft', 'badge badge-yellow');
            badge.style.display = 'block';
            badge.style.margin = '8px 0 0';
            badge.style.width = 'fit-content';
            azTd.appendChild(badge);
        }
        tr.appendChild(azTd);
        tr.appendChild(el('td', c.summary));
        cTbody.appendChild(tr);
    });
}

// --- Initialisierung & Event Listener ---
document.addEventListener('DOMContentLoaded', () => {
    // Selbsttest: Jedes ALLOW-Outcome jedes Packs muss auf ein vorhandenes Template zeigen.
    const missingTemplates = [];
    RULE_PACKS.forEach(p => p.rulebook.outcomes.forEach(o => {
        if (o.effect === 'ALLOW' && typeof p.action.templates[o.template] !== 'function') missingTemplates.push(o.id);
    }));
    if (missingTemplates.length) engine.log('SELFTEST_FAILED', { missingTemplates: missingTemplates });

    engine.onLog = updateAuditUI;
    renderStaticContent();
    renderPackInfo();
    updateAuditUI();

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('main > section').forEach(s => s.classList.remove('active'));
            target.classList.add('active');
            $(target.getAttribute('data-target')).classList.add('active');
            if (target.getAttribute('data-target') === 'view-dev') refreshDevView();
        });
    });

    // Workflow
    $('pack-select').addEventListener('change', (e) => selectPack(e.target.value));
    $('btn-parse').addEventListener('click', runIngestion);
    $('q-type').addEventListener('change', (e) => {
        const previous = session.requestType;
        session.requestType = e.target.value;
        session.facts = {};
        session.suggestions = {};
        session.lastDecisionKey = null;
        $('parser-reasoning').classList.add('hidden');
        engine.log('REQUEST_TYPE_CHANGED', { caseId: session.caseId, from: previous, to: session.requestType, answersReset: true, suggestionsCleared: true });
        refreshWorkflow();
    });
    $('btn-review').addEventListener('click', completeReview);
    $('btn-to-step-3').addEventListener('click', goToStep3);
    $('btn-back-to-step-2').addEventListener('click', () => {
        $('step-3-data').classList.add('hidden');
        $('step-2-questionnaire').classList.remove('hidden');
        refreshWorkflow();
    });
    $('btn-reset-workflow').addEventListener('click', () => startNewCase('ABORTED'));
    $('btn-restart').addEventListener('click', () => startNewCase('COMPLETED'));
    $('preset-selector').addEventListener('change', loadPreset);

    // Drag & Drop
    const dropZone = $('drop-zone');
    const fileInput = $('file-input');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', handleFileDrop);
    fileInput.addEventListener('click', (e) => e.stopPropagation());
    fileInput.addEventListener('change', handleFileDrop);

    // Action & Export
    $('btn-to-step-4').addEventListener('click', runAction);
    $('btn-export-txt').addEventListener('click', () => downloadFile(activePack.text.exportFile, $('final-letter').textContent));
    $('btn-export-audit').addEventListener('click', () => downloadFile(`${activePack.text.filePrefix}_Interne_Doku.txt`, buildAuditStatement()));

    // Fristenrechner
    $('btn-calc-dl').addEventListener('click', calculateDeadline);

    // Audit
    $('btn-val-chain').addEventListener('click', validateChain);
    $('btn-test-det').addEventListener('click', testDeterminism);
    $('btn-export-json').addEventListener('click', () => {
        const md = activePack.rulebook.metadata;
        downloadFile(`${activePack.text.filePrefix}_Provenance_Record.json`, JSON.stringify({
            engine: ENGINE_VERSION,
            rulebook: { id: md.id, version: md.version, hash: engine.rulebookHash },
            chainHash: engine.chainHash,
            documentTextHash: session.execution ? session.execution.documentTextHash : null,
            evaluationState: buildEvaluationState(),
            log: engine.eventLog
        }, null, 2));
    });

    // Entwickler
    $('mcp-view').addEventListener('change', refreshDevView);
    $('btn-dev-copy').addEventListener('click', (e) => copyText($('dev-state').textContent, e.currentTarget));
    $('btn-dev-export').addEventListener('click', () => downloadFile(`${activePack.text.filePrefix}_Evaluation_State.json`, JSON.stringify(buildEvaluationState(), null, 2)));
    $('btn-rulebook-export').addEventListener('click', () => {
        const md = activePack.rulebook.metadata;
        downloadFile(`${md.id}-${md.version}.rulebook.json`, JSON.stringify(activePack.rulebook, null, 2));
    });

    refreshWorkflow();
});

// Konsolen-Schnittstelle für Entwickler (rein lokal).
window.UniversalRules = {
    engine: engine,
    packs: RULE_PACKS,
    get rulebook() { return activePack.rulebook; },
    get action() { return activePack.action; },
    selectPack: selectPack,
    getState: () => buildEvaluationState()
};
