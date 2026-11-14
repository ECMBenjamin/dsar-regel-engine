/**
 * @file Test-Helfer: lädt die gebaute dist/index.html in ein Headless-DOM.
 * @author benthy
 * @license MIT
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DIST = fileURLToPath(new URL('../dist/index.html', import.meta.url));
export const readDist = () => readFileSync(DIST, 'utf8');
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function boot(html = readDist(), { quiet = false } = {}) {
    const errors = [];
    const options = {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(w) {
            w.TextEncoder = TextEncoder;
            w.addEventListener('error', e => errors.push(e.message));
        }
    };
    if (quiet) {
        const { VirtualConsole } = await import('jsdom');
        options.virtualConsole = new VirtualConsole();
    }
    const dom = new JSDOM(html, options);
    await wait(150);
    const w = dom.window, d = w.document;
    const $ = id => d.getElementById(id);
    return {
        w, d, $, errors,
        U: w.UniversalRules,
        run: code => w.eval(code),
        click: el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
        change: el => el.dispatchEvent(new w.Event('change', { bubbles: true })),
        visible: id => !$(id).classList.contains('hidden'),
        has: fact => !!d.querySelector(`input[name="q_${fact}"]`),
        checked: fact => !!d.querySelector(`input[name="q_${fact}"]:checked`),
        answer(fact, value) {
            const input = d.querySelector(`input[name="q_${fact}"][value="${value}"]`);
            if (!input) throw new Error(`Frage "${fact}" ist nicht sichtbar`);
            input.checked = true;
            input.dispatchEvent(new w.Event('change', { bubbles: true }));
        },
        answers(list) { list.forEach(pair => this.answer(...pair.split(':'))); },
        // Eingabefeld der Aktion ausfüllen (Felder werden aus dem Rulebook erzeugt: id "in-<feld>").
        type(field, value) {
            const area = d.getElementById('in-' + field);
            if (!area) throw new Error(`Eingabefeld "${field}" ist nicht vorhanden`);
            area.value = value;
            area.dispatchEvent(new w.Event('input', { bubbles: true }));
        },
        count: action => w.UniversalRules.engine.eventLog.filter(e => e.action === action).length
    };
}
