/**
 * @file Kleiner JSON-Schema-Prüfer für die Tests (ohne Abhängigkeiten).
 * Unterstützt die Teilmenge, die docs/rulebook.schema.json verwendet:
 * $ref (#/$defs/...), type, const, enum, required, properties, additionalProperties,
 * items, minItems, minLength, pattern, minimum, maximum.
 * @author benthy
 * @license MIT
 */

export function validateSchema(schema, value) {
    const errors = [];
    const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

    const check = (s, v, path) => {
        if (s.$ref) {
            const name = s.$ref.replace('#/$defs/', '');
            if (!schema.$defs || !schema.$defs[name]) throw new Error('Unbekannte Referenz: ' + s.$ref);
            check(schema.$defs[name], v, path);
            return;
        }
        if ('const' in s && v !== s.const) errors.push(`${path}: erwartet ${JSON.stringify(s.const)}`);
        if (s.enum && !s.enum.includes(v)) errors.push(`${path}: ${JSON.stringify(v)} nicht in ${s.enum.join(' | ')}`);
        if (s.type) {
            const types = [].concat(s.type);
            const actual = typeOf(v);
            if (!types.some(t => t === actual || (t === 'integer' && Number.isInteger(v)))) {
                errors.push(`${path}: Typ ${actual}, erwartet ${types.join(' | ')}`);
                return;
            }
        }
        if (typeof v === 'string') {
            if (s.minLength !== undefined && v.length < s.minLength) errors.push(`${path}: zu kurz`);
            if (s.pattern && !new RegExp(s.pattern).test(v)) errors.push(`${path}: passt nicht zu ${s.pattern}`);
        }
        if (typeof v === 'number') {
            if (s.minimum !== undefined && v < s.minimum) errors.push(`${path}: kleiner als ${s.minimum}`);
            if (s.maximum !== undefined && v > s.maximum) errors.push(`${path}: größer als ${s.maximum}`);
        }
        if (Array.isArray(v)) {
            if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${path}: weniger als ${s.minItems} Einträge`);
            if (s.items) v.forEach((x, i) => check(s.items, x, `${path}[${i}]`));
        }
        if (typeOf(v) === 'object') {
            (s.required || []).forEach(k => { if (!(k in v)) errors.push(`${path}: Feld "${k}" fehlt`); });
            Object.keys(v).forEach(k => {
                if (s.properties && k in s.properties) check(s.properties[k], v[k], `${path}.${k}`);
                else if (s.additionalProperties === false) errors.push(`${path}: unbekanntes Feld "${k}"`);
                else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(s.additionalProperties, v[k], `${path}.${k}`);
            });
        }
    };

    check(schema, value, '$');
    return errors;
}
