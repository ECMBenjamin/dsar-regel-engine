/**
 * @file DOM-Helfer
 * Kleine, fachfreie Hilfsfunktionen für die Oberfläche. Texte werden immer über textContent gesetzt (XSS-sicher).
 * @author benthy
 * @license MIT
 */

export const $ = id => document.getElementById(id);

// DOM Helper (XSS Safe)
export const el = (tag, text, className) => {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (className) e.className = className;
    return e;
};

export function haltApplication(title, message) {
    document.title = 'Systemfehler – DSAR Regel-Engine';
    const body = document.body;
    body.textContent = '';
    const box = document.createElement('div');
    box.id = 'fatal-error';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'max-width:720px;margin:80px auto;padding:32px;border:2px solid #B91C1C;border-radius:8px;background:#FEE2E2;color:#7f1d1d;font-family:system-ui,sans-serif;line-height:1.6;';
    const h = document.createElement('h1');
    h.textContent = title;
    h.style.cssText = 'color:#7f1d1d;font-size:1.5rem;margin:0 0 12px;';
    const p = document.createElement('p');
    p.textContent = message;
    p.style.margin = '0';
    box.appendChild(h);
    box.appendChild(p);
    body.appendChild(box);
}

export function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function copyText(text, button) {
    const original = button.textContent;
    const done = ok => {
        button.textContent = ok ? 'Kopiert' : 'Kopieren nicht möglich';
        setTimeout(() => { button.textContent = original; }, 1500);
    };
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        document.body.removeChild(ta);
        done(ok);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true), fallback);
    } else {
        fallback();
    }
}
