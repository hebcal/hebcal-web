// Rewrites bare local references in EJS templates to `locals.foo`, so the
// templates can be compiled with `_with: false` (see the `render()` call in
// src/app-www.js). This produced the one-time conversion of views/; keep it
// for converting a batch of newly added templates.
//
//   node tools/codemod/ejs-locals.mjs views/*.ejs        # dry run
//   node tools/codemod/ejs-locals.mjs --write views/*.ejs
//   node tools/codemod/ejs-locals.mjs --declared views/*.ejs
//
// Method: build a same-length JavaScript "shadow" of the template where every
// HTML region is blanked to spaces and the EJS delimiters are replaced by
// equal-width JS punctuation, so token offsets in the shadow are byte offsets
// in the template. acorn's tokenizer then classifies every identifier without
// having to re-implement string/comment/regex/template-literal scanning.
//
// The one thing it cannot see is scope: a name bound anywhere in a file is
// treated as bound throughout it, so a template that both receives `ev` as a
// local and uses `ev` as a loop variable gets no `locals.` prefix on the
// outer references and throws ReferenceError at render time. `--declared`
// lists each file's bound names; cross-check them against the data keys the
// template actually receives with tools/codemod/template-locals-audit.mjs.
import fs from 'node:fs';
import * as acorn from 'acorn';

const KNOWN_GLOBALS = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  'undefined', 'NaN', 'Infinity', 'arguments', 'this',
  // contextual keywords acorn's tokenizer reports as plain names
  'let', 'await', 'async', 'of', 'static', 'get', 'set', 'yield', 'from',
  // supplied by ejs to every compiled template
  'include', 'escapeFn', 'rethrow', 'locals', '__append', '__output',
]);

// `<%` opens code; the closer may be `%>`, `-%>` or `_%>`. Replacements are
// chosen to be exactly as wide as what they replace.
function shadow(src) {
  const out = new Array(src.length).fill(' ');
  // keep newlines so acorn's line numbers (and ASI) match the template
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') out[i] = '\n';

  const openRe = /<%(%|_|=|-|#)?/g;
  let m;
  while ((m = openRe.exec(src))) {
    const kind = m[1];
    const openLen = m[0].length;
    if (kind === '%') continue; // `<%%` is a literal `<%`
    const closeRe = /(-|_)?%>/g;
    closeRe.lastIndex = m.index + openLen;
    const c = closeRe.exec(src);
    if (!c) break;
    const codeStart = m.index + openLen;
    const codeEnd = c.index;
    openRe.lastIndex = c.index + c[0].length;
    if (kind === '#') continue; // comment tag: leave blanked

    const expr = kind === '=' || kind === '-';
    // opener: `<%` -> `; `, `<%=`/`<%-` -> `;+(`, `<%_` -> `;  `
    const open = expr ? ';+(' : openLen === 3 ? ';  ' : '; ';
    for (let i = 0; i < openLen; i++) out[m.index + i] = open[i];
    for (let i = codeStart; i < codeEnd; i++) {
      if (src[i] !== '\n') out[i] = src[i];
    }
    // closer: `%>` -> `);` or `; `, 3-wide variants get a trailing space
    const base = expr ? ');' : '; ';
    const close = c[0].length === 3 ? base + ' ' : base;
    for (let i = 0; i < c[0].length; i++) out[c.index + i] = close[i];
  }
  return out.join('');
}

const DECL_KW = new Set(['const', 'let', 'var', 'function', 'class', 'catch']);

function analyze(js) {
  const toks = [];
  for (const t of acorn.tokenizer(js, {ecmaVersion: 'latest'})) toks.push(t);

  const declared = new Set();
  // A declaration keyword, or a `(`-list that is a parameter list, binds every
  // identifier in its binding region. Conservative: any identifier bound
  // anywhere in the file is treated as bound everywhere in it.
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const kw = t.type.keyword || (t.type.label === 'name' ? t.value : null);
    // `let`, `of` and `in` are contextual, so the tokenizer reports them as
    // plain names rather than keywords
    if (DECL_KW.has(t.type.keyword) || kw === 'let') {
      // A parameter list ends at the `)` that closes it; a `const`/`let`/`var`
      // binding ends at `;`, or at the `of`/`in` of a for-loop head.
      const isParams = t.type.keyword === 'function' || t.type.keyword === 'catch';
      let depth = 0;
      let binding = true;
      for (let j = i + 1; j < toks.length; j++) {
        const u = toks[j];
        const lbl = u.type.label;
        const ukw = u.type.keyword || (lbl === 'name' ? u.value : null);
        if (lbl === '{' || lbl === '[' || lbl === '(') {
          depth++;
        } else if (lbl === '}' || lbl === ']' || lbl === ')') {
          if (depth === 0) break;
          depth--;
          if (depth === 0 && isParams) break;
        } else if (depth === 0 &&
            (lbl === ';' || ukw === 'of' || ukw === 'in')) {
          break;
        } else if (depth === 0 && lbl === '=') {
          binding = false; // skip the initializer
        } else if (depth === 0 && lbl === ',') {
          binding = true;
        } else if (lbl === 'name' && binding) {
          // in `{a: b}` the bound name is `b`; approximate by taking both
          const prev = toks[j - 1];
          if (!(prev && prev.type.label === '.')) declared.add(u.value);
        }
      }
    } else if (kw && toks[i + 1] && toks[i + 1].type.label === '=>') {
      declared.add(t.value); // `x => ...`
    } else if (t.type.label === '(') {
      // arrow parameter list: `( ... ) =>`
      let depth = 1; let j = i + 1;
      for (; j < toks.length && depth > 0; j++) {
        const lbl = toks[j].type.label;
        if (lbl === '(') depth++;
        else if (lbl === ')') depth--;
      }
      if (toks[j] && toks[j].type.label === '=>') {
        for (let k = i + 1; k < j - 1; k++) {
          if (toks[k].type.label === 'name') declared.add(toks[k].value);
        }
      }
    }
  }
  return {toks, declared};
}

function rewrite(src) {
  const js = shadow(src);
  const {toks, declared} = analyze(js);
  const edits = [];
  const used = new Set();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type.label !== 'name') continue;
    const name = t.value;
    if (declared.has(name) || KNOWN_GLOBALS.has(name)) continue;
    const prev = toks[i - 1];
    const next = toks[i + 1];
    if (prev && (prev.type.label === '.' || prev.type.label === '?.')) continue;
    const prevLbl = prev?.type.label;
    const nextLbl = next?.type.label;
    if ((prevLbl === '{' || prevLbl === ',') && nextLbl === ':') continue;
    if ((prevLbl === '{' || prevLbl === ',') &&
        (nextLbl === ',' || nextLbl === '}')) {
      edits.push({start: t.start, end: t.end, text: `${name}: locals.${name}`});
      used.add(name);
      continue;
    }
    edits.push({start: t.start, end: t.end, text: `locals.${name}`});
    used.add(name);
  }
  let out = '';
  let pos = 0;
  for (const e of edits) {
    out += src.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  out += src.slice(pos);
  return {out, used, declared};
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const showDeclared = args.includes('--declared');
for (const f of args.filter((a) => !a.startsWith('--'))) {
  const src = fs.readFileSync(f, 'utf8');
  const {out, used, declared} = rewrite(src);
  if (showDeclared) {
    console.log(`${f}\t${[...declared].sort().join(' ')}`);
    continue;
  }
  if (out === src) {
    console.log(`unchanged  ${f}`);
    continue;
  }
  console.log(`${write ? 'wrote' : 'would edit'}  ${f}  [${[...used].sort().join(' ')}]`);
  if (write) fs.writeFileSync(f, out);
}
