/**
 * @file Build: erzeugt aus den Modulen in src/ die eine, abhängigkeitsfreie dist/index.html.
 * Kein Bundler: Die Module werden in fester Reihenfolge aneinandergehängt, import/export wird entfernt.
 * Voraussetzung dafür: Top-Level-Namen sind über alle Module eindeutig, Imports stehen einzeilig.
 * @author benthy
 * @license MIT
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), 'utf8');

// Reihenfolge = Abhängigkeitsreihenfolge. Ein neues Rule Pack wird hier eingetragen.
const MODULES = [
    'src/core/crypto.js',
    'src/core/engine.js',
    'src/rulepacks/dsar-gdpr-de.js',
    'src/actions/create-action.js',
    'src/actions/response-letter.js',
    'src/ingestion/dsar-parser.js',
    'src/domain/content.js',
    'src/domain/deadline.js',
    'src/domain/attachment.js',
    'src/ui/dom.js',
    'src/ui/packs.js',
    'src/ui/app.js'
];

function toPlainScript(path) {
    const code = read(path)
        .replace(/^import\s[^;]*?from\s+['"][^'"]+['"];[ \t]*\n/gm, '')
        .replace(/^export\s+(?=(?:const|let|function|class)\b)/gm, '');
    const leftover = code.match(/^(?:import|export)\b.*$/m);
    if (leftover) throw new Error(`${path}: nicht unterstützte Modul-Anweisung: ${leftover[0]}`);
    return `// ---- ${path} ----\n${code.trim()}\n`;
}

export function build() {
    const script = "'use strict';\n\n" + MODULES.map(toPlainScript).join('\n');
    const names = [...script.matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) throw new Error('Doppelte Top-Level-Namen: ' + [...new Set(dupes)].join(', '));
    if (/<\/script/i.test(script)) throw new Error('Der Quelltext darf kein schließendes script-Tag enthalten.');

    const template = read('src/ui/index.html');
    for (const slot of ['/*__STYLES__*/', '/*__SCRIPT__*/']) {
        if (template.split(slot).length !== 2) throw new Error(`Platzhalter ${slot} muss genau einmal im Template stehen.`);
    }
    // Funktions-Ersetzung, damit "$" im Quelltext nicht als Ersetzungsmuster gelesen wird.
    return template
        .replace('/*__STYLES__*/', () => read('src/ui/styles.css').trim())
        .replace('/*__SCRIPT__*/', () => script.trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const html = build();
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist/index.html'), html);
    console.log(`dist/index.html geschrieben (${html.split('\n').length} Zeilen, ${Buffer.byteLength(html)} Bytes)`);
}
