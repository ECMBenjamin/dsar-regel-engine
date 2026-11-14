/**
 * @file Universal Rules Engine (Policy Decision)
 * Lädt und validiert ein Rulebook, wertet Fakten aus, entscheidet (PERMITTED / MANUAL_REVIEW / BLOCKED)
 * und schreibt den Audit-Log. Enthält keinerlei Fachlogik.
 * @author benthy
 * @license MIT
 */

import { sha256Hex, canonicalJson, deepFreeze } from './crypto.js';

export const ENGINE_VERSION = '8.1.0';
export const GENESIS_HASH = '0'.repeat(64);

export class UniversalRulesEngine {
    constructor(options) {
        const o = options || {};
        this.name = 'UniversalRulesEngine';
        this.version = ENGINE_VERSION;
        this._hash = o.hash || sha256Hex;
        this._canonical = o.canonical || canonicalJson;
        this.onLog = typeof o.onLog === 'function' ? o.onLog : null;
        this.eventLog = [];
        this.chainHash = GENESIS_HASH;
        this.reviews = {};
        this.rulebook = null;
        this.rulebookHash = null;
        this._rulesById = {};
        this.log('SYSTEM_INIT', Object.assign({ engine: this.name, version: this.version }, o.initDetails || {}));
    }

    // ---- Rulebook laden ----
    static validateRulebook(rb) {
        const errors = [];
        const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
        if (!isObj(rb)) return ['Rulebook ist kein Objekt.'];
        const md = isObj(rb.metadata) ? rb.metadata : {};
        if (!md.id || !md.version) errors.push('metadata.id und metadata.version sind erforderlich.');
        const policy = isObj(md.decisionPolicy) ? md.decisionPolicy : null;
        if (!policy || typeof policy.blockAtOrBelow !== 'number' || typeof policy.reviewBelow !== 'number') errors.push('metadata.decisionPolicy ist unvollständig.');
        const thresholds = md.scoring && md.scoring.thresholds;
        if (!thresholds || typeof thresholds.green !== 'number' || typeof thresholds.yellow !== 'number') errors.push('metadata.scoring.thresholds ist unvollständig.');
        const actions = Array.isArray(md.actions) ? md.actions : [];
        const actionIds = actions.map(a => a && a.id);
        actions.forEach(a => { if (!a || !a.id || !Array.isArray(a.requiresStatus)) errors.push('metadata.actions: id und requiresStatus sind erforderlich.'); });
        const types = Array.isArray(rb.requestTypes) ? rb.requestTypes.map(t => t && t.id) : [];
        if (!types.length) errors.push('requestTypes fehlen.');

        const ruleIds = {};
        const factsByScope = {};
        const rules = Array.isArray(rb.rules) ? rb.rules : [];
        if (!rules.length) errors.push('rules fehlen.');
        rules.forEach((r, i) => {
            const ref = r && r.id ? r.id : 'rules[' + i + ']';
            if (!isObj(r) || !r.id) { errors.push(ref + ': id fehlt.'); return; }
            if (ruleIds[r.id]) errors.push(ref + ': ID ist nicht eindeutig.');
            ruleIds[r.id] = true;
            if (types.indexOf(r.scope) === -1) errors.push(ref + ': unbekannter scope "' + r.scope + '".');
            if (!r.fact) errors.push(ref + ': fact fehlt.');
            if (!r.question) errors.push(ref + ': question fehlt.');
            if (!Array.isArray(r.answers) || r.answers.length < 2) {
                errors.push(ref + ': answers benötigt mindestens zwei Werte.');
            } else {
                r.answers.forEach(a => {
                    const f = isObj(r.risk) ? r.risk[a] : undefined;
                    if (typeof f !== 'number' || f < 0 || f > 1) errors.push(ref + ': risk["' + a + '"] muss eine Zahl zwischen 0 und 1 sein.');
                });
            }
            if (!isObj(r.provenance) || !r.provenance.source) errors.push(ref + ': provenance.source fehlt.');
            const known = factsByScope[r.scope] || (factsByScope[r.scope] = {});
            if (r.showIf) {
                const dep = known[r.showIf.fact];
                if (!dep) errors.push(ref + ': showIf verweist auf einen unbekannten oder später definierten Fakt.');
                else if (dep.indexOf(r.showIf.equals) === -1) errors.push(ref + ': showIf.equals ist keine gültige Antwort der Bezugsregel.');
            }
            if (known[r.fact]) errors.push(ref + ': fact "' + r.fact + '" ist im scope doppelt vergeben.');
            known[r.fact] = Array.isArray(r.answers) ? r.answers : [];
        });

        const outcomeIds = {};
        const outcomes = Array.isArray(rb.outcomes) ? rb.outcomes : [];
        if (!outcomes.length) errors.push('outcomes fehlen.');
        const checkWhen = (ref, scope, when) => {
            if (!isObj(when)) { errors.push(ref + ': when muss ein Objekt sein.'); return; }
            Object.keys(when).forEach(f => {
                const answers = (factsByScope[scope] || {})[f];
                if (!answers) errors.push(ref + ': when verweist auf unbekannten Fakt "' + f + '".');
                else if (answers.indexOf(when[f]) === -1) errors.push(ref + ': when["' + f + '"] ist keine gültige Antwort.');
            });
        };
        outcomes.forEach((o, i) => {
            const ref = o && o.id ? o.id : 'outcomes[' + i + ']';
            if (!isObj(o) || !o.id) { errors.push(ref + ': id fehlt.'); return; }
            if (outcomeIds[o.id]) errors.push(ref + ': ID ist nicht eindeutig.');
            outcomeIds[o.id] = true;
            if (types.indexOf(o.scope) === -1) errors.push(ref + ': unbekannter scope.');
            checkWhen(ref, o.scope, o.when);
            if (o.effect === 'ALLOW') {
                if (actionIds.indexOf(o.action) === -1) errors.push(ref + ': unbekannte action.');
                if (!o.template) errors.push(ref + ': template fehlt.');
            } else if (o.effect === 'DENY') {
                if (!o.blockReason) errors.push(ref + ': blockReason fehlt.');
            } else {
                errors.push(ref + ': effect muss ALLOW oder DENY sein.');
            }
            if (!Array.isArray(o.legalBasis) || !o.legalBasis.length) errors.push(ref + ': legalBasis fehlt.');
            ['conditionalBasis', 'requiredInputs', 'obligations'].forEach(key => {
                (Array.isArray(o[key]) ? o[key] : []).forEach(entry => { if (entry && entry.when) checkWhen(ref + '.' + key, o.scope, entry.when); });
            });
        });
        return errors;
    }

    load(rulebook) {
        const errors = UniversalRulesEngine.validateRulebook(rulebook);
        if (errors.length) throw new Error('Ungültiges Rulebook: ' + errors.join(' '));
        this.rulebook = deepFreeze(rulebook);
        this.rulebookHash = this._hash(this._canonical(rulebook));
        this._rulesById = {};
        rulebook.rules.forEach(r => { this._rulesById[r.id] = r; });
        this.reviews = {};
        this.log('RULEBOOK_LOADED', {
            id: rulebook.metadata.id,
            version: rulebook.metadata.version,
            rules: rulebook.rules.length,
            outcomes: rulebook.outcomes.length,
            rulebookHash: this.rulebookHash
        });
        return this;
    }

    getRequestTypes() { return this.rulebook.requestTypes.slice(); }
    getRule(id) { return this._rulesById[id] || null; }
    rulesFor(scope) { return this.rulebook.rules.filter(r => r.scope === scope); }

    static matches(when, facts) {
        return Object.keys(when || {}).every(k => facts[k] === when[k]);
    }

    _resolveOutcome(scope, facts) {
        const hit = this.rulebook.outcomes.find(o => o.scope === scope && UniversalRulesEngine.matches(o.when, facts));
        if (!hit) return null;
        const pick = list => (Array.isArray(list) ? list : []).filter(e => !e.when || UniversalRulesEngine.matches(e.when, facts));
        return {
            id: hit.id,
            effect: hit.effect,
            label: hit.label || hit.id,
            verdict: hit.verdict || null,
            action: hit.action || null,
            template: hit.template || null,
            requiresReview: hit.requiresReview === true,
            reviewReason: hit.reviewReason || null,
            blockReason: hit.blockReason || null,
            acceptsAttachment: hit.acceptsAttachment === true,
            legalBasis: hit.legalBasis.concat(pick(hit.conditionalBasis).map(e => e.basis)),
            requiredInputs: pick(hit.requiredInputs).map(e => ({ field: e.field, label: e.label })),
            obligations: pick(hit.obligations).map(e => ({ id: e.id, text: e.text }))
        };
    }

    // ---- Zustand gegen die Regeln prüfen (rein, ohne Seiteneffekte) ----
    evaluate(input) {
        if (!this.rulebook) throw new Error('Kein Rulebook geladen.');
        const inp = input || {};
        const requestType = inp.requestType;
        const facts = inp.facts || {};
        const caseId = inp.caseId || null;
        const md = this.rulebook.metadata;
        const rules = this.rulesFor(requestType);

        const effective = {};
        const trace = [];
        const pending = [];
        const skipped = [];
        let product = 1;

        rules.forEach(r => {
            // Eine Regel ist nur aktiv, wenn ihre Bezugsregel selbst aktiv UND passend bestätigt ist.
            const active = !r.showIf || effective[r.showIf.fact] === r.showIf.equals;
            if (!active) { skipped.push(r.id); return; }
            const answer = facts[r.fact];
            if (answer === undefined || r.answers.indexOf(answer) === -1) {
                pending.push(r.id);
                trace.push({ ruleId: r.id, fact: r.fact, state: 'PENDING' });
                return;
            }
            effective[r.fact] = answer;
            const factor = r.risk[answer];
            product *= factor;
            trace.push({ ruleId: r.id, fact: r.fact, state: 'ANSWERED', answer: answer, factor: factor, source: r.provenance.source });
        });

        const ignoredFacts = Object.keys(facts).filter(f => !(f in effective)).sort();
        const complete = rules.length > 0 && pending.length === 0;
        const score = complete ? Math.round(product * 10000) / 10000 : null;
        const inputHash = this._hash(this._canonical({
            rulebook: this.rulebookHash, caseId: caseId, requestType: requestType || null, facts: effective
        }));

        let decision = md.decisionPolicy.defaultDecision;
        let status = 'INCOMPLETE';
        let riskLevel = 'PENDING';
        let outcome = null;
        const reasons = [];

        if (!rules.length) {
            reasons.push({ code: 'UNKNOWN_REQUEST_TYPE', message: 'Für diesen Anfrage-Typ enthält das Rulebook keine Regeln.' });
        } else if (!complete) {
            reasons.push({ code: 'FACTS_PENDING', message: pending.length + ' aktive Regel(n) ohne bestätigte Antwort. Default-Deny.' });
        } else {
            const t = md.scoring.thresholds;
            riskLevel = score >= t.green ? 'GREEN' : (score >= t.yellow ? 'YELLOW' : 'RED');
            outcome = this._resolveOutcome(requestType, effective);
            if (!outcome) {
                decision = 'BLOCKED'; status = 'NON_COMPLIANT';
                reasons.push({ code: 'NO_OUTCOME', message: 'Das Rulebook definiert für diese Faktenlage kein Outcome.' });
            } else if (outcome.effect === 'DENY' || score <= md.decisionPolicy.blockAtOrBelow) {
                decision = 'BLOCKED'; status = 'NON_COMPLIANT';
                reasons.push({ code: 'POLICY_DENY', message: outcome.blockReason || 'Der Score liegt an oder unter der Block-Schwelle.' });
            } else if (score < md.decisionPolicy.reviewBelow || outcome.requiresReview) {
                decision = 'MANUAL_REVIEW';
                if (score < md.decisionPolicy.reviewBelow) {
                    reasons.push({ code: 'SCORE_BELOW_REVIEW_THRESHOLD', message: 'Score ' + score.toFixed(2) + ' liegt unter der Review-Schwelle ' + md.decisionPolicy.reviewBelow.toFixed(2) + '.' });
                }
                if (outcome.requiresReview) {
                    reasons.push({ code: 'OUTCOME_REQUIRES_REVIEW', message: outcome.reviewReason || 'Das Outcome verlangt eine manuelle Prüfung.' });
                }
                status = this.reviews[inputHash] ? 'REVIEW_COMPLETED' : 'REVIEW_REQUIRED';
            } else {
                decision = 'PERMITTED'; status = 'COMPLIANT';
                reasons.push({ code: 'POLICY_ALLOW', message: 'Alle aktiven Regeln sind bestätigt; Score ' + score.toFixed(2) + ' erreicht die Schwelle.' });
            }
        }

        const review = this.reviews[inputHash] || null;
        return {
            schema: 'uri.evaluation/v1',
            engine: { name: this.name, version: this.version },
            rulebook: { id: md.id, version: md.version, hash: this.rulebookHash },
            input: { caseId: caseId, requestType: requestType || null, facts: effective },
            inputHash: inputHash,
            complete: complete,
            decision: decision,
            status: status,
            score: score,
            riskLevel: riskLevel,
            reasons: reasons,
            outcome: outcome,
            review: {
                required: decision === 'MANUAL_REVIEW',
                completed: decision === 'MANUAL_REVIEW' && !!review,
                reviewer: decision === 'MANUAL_REVIEW' && review ? review.reviewer : null
            },
            pending: pending,
            skipped: skipped,
            ignoredFacts: ignoredFacts,
            trace: trace
        };
    }

    // ---- Freigabe einer Aktion (rein, ohne Seiteneffekte) ----
    authorize(actionId, evaluation, payload) {
        const deny = (code, message, extra) => Object.assign({ authorized: false, action: actionId, code: code, message: message }, extra || {});
        const def = this.rulebook.metadata.actions.find(a => a.id === actionId);
        if (!def) return deny('UNKNOWN_ACTION', 'Die Aktion ist im Rulebook nicht definiert.');
        if (!evaluation || def.requiresStatus.indexOf(evaluation.status) === -1) {
            return deny('STATUS_NOT_SUFFICIENT', 'Status ' + (evaluation ? evaluation.status : 'UNKNOWN') + ' genügt nicht. Erforderlich: ' + def.requiresStatus.join(' oder ') + '.');
        }
        if (!evaluation.outcome || evaluation.outcome.action !== actionId) {
            return deny('ACTION_NOT_IN_OUTCOME', 'Das Outcome sieht diese Aktion nicht vor.');
        }
        const data = payload || {};
        const missing = evaluation.outcome.requiredInputs.filter(req => String(data[req.field] == null ? '' : data[req.field]).trim() === '');
        if (missing.length) {
            return deny('REQUIRED_INPUT_MISSING', 'Pflichtangaben fehlen: ' + missing.map(m => m.label).join('; ') + '.', { missingInputs: missing.map(m => m.field) });
        }
        return { authorized: true, action: actionId, code: 'AUTHORIZED', message: 'Aktion freigegeben (Status ' + evaluation.status + ').', status: evaluation.status, inputHash: evaluation.inputHash };
    }

    // ---- Manuelle Prüfung abzeichnen (an Vorgang + Faktenlage gebunden) ----
    recordReview(input, reviewer) {
        const ev = this.evaluate(input);
        const name = String(reviewer || '').trim();
        if (!name) return { ok: false, code: 'REVIEWER_MISSING' };
        if (!ev.complete || ev.decision !== 'MANUAL_REVIEW') return { ok: false, code: 'NO_REVIEW_REQUIRED' };
        if (this.reviews[ev.inputHash]) return { ok: true, code: 'ALREADY_REVIEWED' };
        this.reviews[ev.inputHash] = { reviewer: name };
        this.log('MANUAL_REVIEW_COMPLETED', {
            caseId: ev.input.caseId, reviewer: name, inputHash: ev.inputHash,
            outcome: ev.outcome.id, verdict: ev.outcome.verdict, score: ev.score,
            reasons: ev.reasons.map(r => r.code)
        });
        return { ok: true, code: 'REVIEW_RECORDED' };
    }

    // ---- Audit-Log (SHA-256 Hash-Kette) ----
    static eventPayload(e) {
        return { seq: e.seq, action: e.action, details: e.details, prevHash: e.prevHash, engine: e.engine };
    }

    log(action, details) {
        const seq = this.eventLog.length;
        const prevHash = seq === 0 ? GENESIS_HASH : this.eventLog[seq - 1].hash;
        const eventObj = { seq: seq, action: action, details: details, prevHash: prevHash, engine: this.version };
        const hash = this._hash(this._canonical(eventObj));
        this.eventLog.push(Object.assign({}, eventObj, { hash: hash }));
        this.chainHash = hash;
        if (this.onLog) this.onLog(this.eventLog[seq]);
        return hash;
    }

    verifyChain() {
        for (let i = 0; i < this.eventLog.length; i++) {
            const e = this.eventLog[i];
            const expected = this._hash(this._canonical(UniversalRulesEngine.eventPayload(e)));
            const prevOk = i === 0 ? e.prevHash === GENESIS_HASH : e.prevHash === this.eventLog[i - 1].hash;
            if (e.hash !== expected || !prevOk) return { valid: false, brokenAt: i };
        }
        return { valid: true, brokenAt: null };
    }
}
