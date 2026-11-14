/**
 * @file Action-Fabrik (Execution / Enforcement)
 * Jedes Rule Pack bringt eigene Textbausteine mit, der Ablauf ist für alle gleich:
 * erst authorize() der Engine, dann render(), dann Hash und Audit-Eintrag.
 * Ohne Freigabe der Engine entsteht kein Dokument.
 * @author benthy
 * @license MIT
 */

import { sha256Hex } from '../core/crypto.js';

/**
 * @param {object} def
 * @param {string} def.id          Aktions-ID, wie im Rulebook unter metadata.actions definiert
 * @param {object} def.rulebook    Rulebook des Packs (für Fragetexte und Antwort-Labels)
 * @param {object} def.templates   Textbausteine: Name -> Funktion(context) -> Text
 * @param {function} [def.compose] Optional: (template, context) -> Text, z.B. für Briefkopf und Anrede
 */
export function createAction(def) {
    const questions = {};
    def.rulebook.rules.forEach(r => { questions[r.id] = r.question; });
    const labels = def.rulebook.metadata.answerLabels || {};

    return {
        id: def.id,
        templates: def.templates,

        // Rein: gleiche Evaluation + gleicher Payload ergeben stets denselben Text.
        render(evaluation, payload) {
            const tpl = def.templates[evaluation.outcome.template];
            if (typeof tpl !== 'function') throw new Error('Unbekanntes Template: ' + evaluation.outcome.template);
            const context = {
                company: payload.company,
                subject: String(payload.name || '').trim(),
                date: payload.issueDate,
                facts: evaluation.input.facts,
                payload: payload,
                outcome: evaluation.outcome,
                reviewer: evaluation.review.reviewer,
                assessment: evaluation.trace.filter(t => t.state === 'ANSWERED').map(t => ({
                    ruleId: t.ruleId, question: questions[t.ruleId], answer: labels[t.answer] || t.answer, source: t.source
                }))
            };
            return def.compose ? def.compose(tpl, context) : tpl(context);
        },

        // Enforcement: ohne Freigabe der Engine entsteht kein Dokument.
        execute(engine, input, payload) {
            const evaluation = engine.evaluate(input);
            const authorization = engine.authorize(this.id, evaluation, payload);
            if (!authorization.authorized) {
                engine.log('ACTION_DENIED', {
                    caseId: evaluation.input.caseId, action: this.id, code: authorization.code,
                    status: evaluation.status, decision: evaluation.decision, inputHash: evaluation.inputHash
                });
                return { executed: false, evaluation: evaluation, authorization: authorization };
            }
            engine.log('ACTION_AUTHORIZED', {
                caseId: evaluation.input.caseId, action: this.id, status: evaluation.status,
                decision: evaluation.decision, outcome: evaluation.outcome.id, inputHash: evaluation.inputHash
            });
            const doc = this.render(evaluation, payload);
            const documentTextHash = sha256Hex(doc);
            engine.log('ACTION_EXECUTED', {
                caseId: evaluation.input.caseId, action: this.id, type: evaluation.input.requestType,
                outcome: evaluation.outcome.id, verdict: evaluation.outcome.verdict,
                appliedParagraphs: evaluation.outcome.legalBasis, status: evaluation.status,
                reviewer: evaluation.review.reviewer, issueDate: payload.issueDate,
                attachmentIncluded: evaluation.outcome.acceptsAttachment ? !!payload.attachment : null,
                inputHash: evaluation.inputHash, documentTextHash: documentTextHash
            });
            return { executed: true, doc: doc, documentTextHash: documentTextHash, evaluation: evaluation, authorization: authorization };
        }
    };
}
