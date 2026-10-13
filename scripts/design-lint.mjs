// Deterministic design lint for the generated app: fails on the mechanical tells of generated UI.
// Usage: node scripts/design-lint.mjs [--root <dir>] [--list-rules]
// Prints `path:line: rule-name: what was found` per hit, then a summary; exit 1 on any hit.
// Node built-ins only. Add a rule by appending an entry to RULES.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

const COLOURS =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone';
const PALETTE = new RegExp(
  `\\b(bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-(${COLOURS})-\\d{2,3}`,
);
const BASIC = /\b(bg|text)-(white|black)\b/;
const BANNED = [
  'Welcome back!',
  'Seamlessly',
  'Seamless',
  'Unlock',
  'Elevate',
  'Supercharge',
  'Effortlessly',
  'John Doe',
  'Jane Doe',
  'Acme',
  'lorem ipsum',
];
const BANNED_RE = new RegExp(
  `(?<![\\w])(${BANNED.map((p) => p.replace(/[.*+?^${}()|[\]\\!]/g, '\\$&')).join('|')})(?![\\w])`,
  'i',
);

// ---- colour helpers -------------------------------------------------------------------------

const COLOUR_RE = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|(?:rgba?|hsla?|oklch)\([^)]*\)/gi;

function nums(s) {
  return (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

function rgbHue([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 20) return null; // grey
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Hue in degrees of one CSS colour, or null when it is (near) grey or unparseable. */
function hueOf(c) {
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return n.some(Number.isNaN) ? null : rgbHue(n);
  }
  const fn = c.slice(0, c.indexOf('(')).toLowerCase();
  const v = nums(c.slice(c.indexOf('(')));
  if (fn.startsWith('rgb')) return v.length >= 3 ? rgbHue(v) : null;
  if (fn.startsWith('hsl')) return v.length >= 3 && v[1] >= 10 ? ((v[0] % 360) + 360) % 360 : null;
  if (fn === 'oklch') return v.length >= 3 && v[1] >= 0.03 ? ((v[2] % 360) + 360) % 360 : null;
  return null;
}

const colourHues = (s) =>
  [...s.matchAll(COLOUR_RE)].map((m) => hueOf(m[0])).filter((h) => h !== null);
const isPurple = (h) => h >= 250 && h <= 300;

// ---- file model -----------------------------------------------------------------------------

function load(root, abs, theme) {
  const text = readFileSync(abs, 'utf8');
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const lineOf = (off) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  return {
    rel: relative(root, abs).split(sep).join('/'),
    ext: abs.slice(abs.lastIndexOf('.')),
    text,
    lineOf,
    theme,
  };
}

const hit = (f, off, found) => ({
  line: f.lineOf(off),
  found: found.replace(/\s+/g, ' ').slice(0, 80),
});

/** Quoted string literals of the script part (the whole file for .ts, <script> blocks in .vue/.html). */
function stringLiterals(f) {
  const spans = [];
  if (f.ext === '.ts') spans.push([0, f.text.length]);
  else if (f.ext === '.vue' || f.ext === '.html') {
    for (const m of f.text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      spans.push([m.index + m[0].indexOf(m[1]), m.index + m[0].indexOf(m[1]) + m[1].length]);
    }
  }
  const out = [];
  for (const [a, b] of spans) {
    const code = f.text.slice(a, b);
    for (const s of scanStrings(code)) out.push({ start: a + s.start, text: s.text });
  }
  return out;
}

/** Left-to-right scan of script code: skips comments; ' and " strings end at a newline. */
function scanStrings(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? code.length : nl;
    } else if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== ch) {
        if (code[j] === '\\') j++;
        else if (ch !== '`' && code[j] === '\n') break;
        j++;
      }
      if (code[j] === ch) {
        out.push({ start: i + 1, text: code.slice(i + 1, j) });
        i = j + 1;
      } else i = Math.min(j, code.length);
    } else i++;
  }
  return out;
}

/** Strings and class attribute values that can carry Tailwind classes. */
function classChunks(f) {
  const out = stringLiterals(f);
  for (const m of f.text.matchAll(
    /(?::|v-bind:)?\b(?:class|className)\s*=\s*("([^"]*)"|'([^']*)')/g,
  )) {
    const text = m[2] ?? m[3];
    out.push({ start: m.index + m[0].indexOf(m[1]) + 1, text });
  }
  return out;
}

/** Text that readers see: template/html text and attributes, plus string literals. */
function copySegments(f) {
  const out = stringLiterals(f);
  if (f.ext === '.vue' || f.ext === '.html') {
    const markup = f.text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, (s) =>
      ' '.repeat(s.length),
    );
    out.push({ start: 0, text: markup });
  }
  return out;
}

/** Balanced `( ... )` content starting at the opening paren index, or null. */
function parens(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

const px = (tok) => (/rem$|em$/.test(tok) ? parseFloat(tok) * 16 : parseFloat(tok));

/** True when one box-shadow layer is a blur of 20px or more in a non-neutral colour. */
function glowLayer(layer) {
  if (!colourHues(layer).length) return false;
  const rest = layer.replace(COLOUR_RE, ' ').replace(/\binset\b/g, ' ');
  const lens = rest.split(/[\s_]+/).filter((t) => /^-?\d*\.?\d+(px|rem|em)?$/.test(t));
  return lens.length >= 3 && px(lens[2]) >= 20;
}

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  return [...out, cur];
}

/** Content of the balanced `{ ... }` starting at the opening brace index, or null. */
function braces(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

const DEFAULT_FONTS = new Set(['inter', 'roboto', 'poppins', 'open-sans', 'montserrat']);
const RADIUS_RE =
  /\brounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?![\w-])/g;

// shadcn-vue zinc defaults for :root, from `shadcn-vue init` (base color zinc, new-york style,
// CLI 2.x). Keep all five in this one table; whitespace is normalised before comparing.
const ZINC = {
  background: 'oklch(1 0 0)',
  foreground: 'oklch(0.141 0.005 285.823)',
  primary: 'oklch(0.21 0.006 285.885)',
  muted: 'oklch(0.967 0.001 286.375)',
  border: 'oklch(0.92 0.004 286.32)',
};

const IGNORE_RE = /design-lint-ignore(?![\w-])([^\n]*)/;

/** Parses one line's ignore comment: { rule, reason } or null when the line has none. */
function parseIgnore(line) {
  const m = line.match(IGNORE_RE);
  if (!m) return null;
  const rest = m[1].replace(/\*\/.*$|-->.*$/, '').trim();
  const [rule = '', ...reason] = rest.split(/\s+/);
  return { rule, reason: reason.join(' ').trim() };
}

const ignorable = (name) => RULES.some((r) => r.name === name && !r.unsilenceable);

/** The rule names an `Allowed:` line in AGENTS.md's `## Design direction` section lists. */
function allowedRules(root) {
  const path = join(root, 'AGENTS.md');
  if (!existsSync(path)) return [];
  const m = readFileSync(path, 'utf8').match(
    /^##[ \t]+Design direction[ \t]*$([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/m,
  );
  const line = m?.[1].match(/^[ \t>*-]*\**Allowed:\**[ \t]*(.*)$/im);
  if (!line) return [];
  return splitTop(line[1])
    .map((t) =>
      t
        .replace(/\([^)]*\)?/g, '')
        .replace(/[*`]/g, '')
        .trim(),
    )
    .filter((n) => ignorable(n) && !PROTECTED.has(n));
}
const PROTECTED = new Set(['raw-palette', 'banned-copy', 'ignore-without-reason']);

// ---- rules ----------------------------------------------------------------------------------

export const RULES = [
  {
    name: 'purple-gradient',
    description: 'gradient with an indigo, violet, purple or fuchsia stop (hue 250-300)',
    check(f) {
      const out = [];
      for (const c of classChunks(f)) {
        const util = c.text.match(/\bbg-(?:gradient-to-|linear-|radial|conic)[\w[\]/.%-]*/);
        if (!util) continue;
        for (const s of c.text.matchAll(
          /\b(?:from|via|to)-(?:((?:indigo|violet|purple|fuchsia)-\d{2,3})|\[([^\]]+)\])/g,
        )) {
          const bad = s[1] || colourHues(s[2].replace(/_/g, ' ')).some(isPurple);
          if (bad) {
            out.push(hit(f, c.start + util.index, `${util[0]} with ${s[0]}`));
            break;
          }
        }
      }
      for (const m of f.text.matchAll(/(?:linear|radial|conic)-gradient\(/g)) {
        const body = parens(f.text, m.index + m[0].length - 1);
        if (body && colourHues(body).some(isPurple))
          out.push(hit(f, m.index, `${m[0]}... purple stop`));
      }
      return out;
    },
  },
  {
    name: 'gradient-text',
    description:
      'bg-clip-text with text-transparent, or background-clip: text with a transparent colour',
    check(f) {
      const out = [];
      for (const c of classChunks(f)) {
        const m = c.text.match(/\bbg-clip-text\b/);
        if (m && /\btext-transparent\b/.test(c.text))
          out.push(hit(f, c.start + m.index, 'bg-clip-text text-transparent'));
      }
      for (const m of f.text.matchAll(/(?:-webkit-)?background-clip\s*:\s*text/g)) {
        const open = f.text.lastIndexOf('{', m.index);
        const close = f.text.indexOf('}', m.index);
        const block = f.text.slice(open < 0 ? 0 : open, close < 0 ? f.text.length : close);
        if (/(?:^|[;{\s])(?:-webkit-text-fill-color|color)\s*:\s*transparent/.test(block)) {
          out.push(hit(f, m.index, 'background-clip: text with transparent colour'));
        }
      }
      return out;
    },
  },
  {
    name: 'backdrop-blur',
    description: 'backdrop-blur class or backdrop-filter with blur()',
    check(f) {
      const out = [];
      for (const m of f.text.matchAll(
        /\bbackdrop-blur[\w[\]./-]*|backdrop-filter\s*:[^;}]*blur\(/g,
      )) {
        out.push(hit(f, m.index, m[0]));
      }
      return out;
    },
  },
  {
    name: 'glow-shadow',
    description:
      'shadow-2xl, coloured shadow class, or a coloured shadow with a blur of 20px or more',
    check(f) {
      const out = [];
      for (const c of classChunks(f)) {
        for (const m of c.text.matchAll(
          new RegExp(`\\bshadow-(?:2xl\\b|(?:${COLOURS})-\\d{2,3}(?:/\\d+)?)`, 'g'),
        )) {
          out.push(hit(f, c.start + m.index, m[0]));
        }
        for (const m of c.text.matchAll(/\bshadow-\[([^\]]+)\]/g)) {
          if (glowLayer(m[1].replace(/_/g, ' '))) out.push(hit(f, c.start + m.index, m[0]));
        }
      }
      for (const m of f.text.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
        if (splitTop(m[1]).some(glowLayer)) out.push(hit(f, m.index, `box-shadow: ${m[1].trim()}`));
      }
      return out;
    },
  },
  {
    name: 'default-font',
    description:
      'Fontsource inter, roboto, poppins, open-sans or montserrat as the only family, or a theme font-family starting with one',
    tree(files) {
      const imports = [];
      for (const f of files) {
        if (!['.ts', '.css', '.vue'].includes(f.ext)) continue;
        for (const m of f.text.matchAll(/@fontsource(?:-variable)?\/([a-z0-9-]+)/g))
          imports.push({ f, off: m.index, family: m[1] });
      }
      const out = [];
      if (imports.length && imports.every((i) => DEFAULT_FONTS.has(i.family))) {
        for (const i of imports)
          out.push({ f: i.f, ...hit(i.f, i.off, `@fontsource/${i.family}`) });
      }
      for (const f of files) {
        if (!f.theme) continue;
        for (const m of f.text.matchAll(/(?:font-family|--font-sans)\s*:\s*([^;}]+)/g)) {
          const first = m[1]
            .split(',')[0]
            .trim()
            .replace(/^['"]|['"]$/g, '');
          const family = first
            .toLowerCase()
            .replace(/\s+variable$/, '')
            .replace(/\s+/g, '-');
          if (DEFAULT_FONTS.has(family)) out.push({ f, ...hit(f, m.index, m[0].trim()) });
        }
      }
      return out;
    },
  },
  {
    name: 'uniform-radius',
    description: 'rounded-2xl and rounded-3xl are over half of 8 or more rounded classes',
    tree(files) {
      let total = 0;
      let big = 0;
      let first = null;
      for (const f of files) {
        for (const c of classChunks(f)) {
          for (const m of c.text.matchAll(RADIUS_RE)) {
            total++;
            if (m[1] === '2xl' || m[1] === '3xl') {
              big++;
              first ??= { f, off: c.start + m.index };
            }
          }
        }
      }
      if (total < 8 || big * 2 <= total) return [];
      const pct = Math.round((big / total) * 100);
      return [
        {
          f: first.f,
          ...hit(first.f, first.off, `${pct}% of ${total} rounded classes are 2xl/3xl`),
        },
      ];
    },
  },
  {
    name: 'zinc-theme',
    description:
      ':root still carries the shadcn-vue zinc values for background, foreground, primary, muted and border',
    check(f) {
      if (!f.theme) return [];
      const root = f.text.match(/:root\s*\{/);
      const body = braces(f.text, root.index + root[0].length - 1) ?? '';
      const same = Object.entries(ZINC).every(([k, v]) => {
        const m = body.match(new RegExp(`--${k}\\s*:\\s*([^;]+);`));
        return m && m[1].replace(/\s+/g, ' ').trim() === v;
      });
      return same ? [hit(f, root.index, ':root uses the shadcn-vue zinc theme')] : [];
    },
  },
  {
    name: 'emoji-heading',
    description: 'emoji inside an h1, h2 or h3',
    check(f) {
      const out = [];
      for (const m of f.text.matchAll(/<h([123])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
        const e = m[2].match(/\p{Extended_Pictographic}/u);
        if (e) out.push(hit(f, m.index + m[0].indexOf(m[2]) + e.index, `${e[0]} in <h${m[1]}>`));
      }
      return out;
    },
  },
  {
    name: 'banned-copy',
    description:
      'filler or placeholder copy such as Seamless, Unlock, Elevate, John Doe, Acme, lorem ipsum',
    check(f) {
      const out = [];
      for (const s of copySegments(f)) {
        for (const m of s.text.matchAll(new RegExp(BANNED_RE, 'gi')))
          out.push(hit(f, s.start + m.index, m[0]));
      }
      return out;
    },
  },
  {
    name: 'raw-palette',
    description: 'raw Tailwind palette class, bg-white or text-black outside the theme file',
    check(f) {
      if (f.theme) return [];
      const out = [];
      let off = 0;
      for (const line of f.text.split('\n')) {
        const m = line.match(PALETTE) ?? line.match(BASIC);
        if (m) out.push(hit(f, off + m.index, m[0]));
        off += line.length + 1;
      }
      return out;
    },
  },
  {
    name: 'ignore-without-reason',
    description: 'design-lint-ignore without a known rule name and a reason',
    unsilenceable: true,
    check(f) {
      const out = [];
      let off = 0;
      for (const line of f.text.split('\n')) {
        const ig = parseIgnore(line);
        if (ig && !(ignorable(ig.rule) && ig.reason))
          out.push(hit(f, off + line.indexOf('design-lint-ignore'), line.trim()));
        off += line.length + 1;
      }
      return out;
    },
  },
];

// ---- scan -----------------------------------------------------------------------------------

function walk(dir, root, files) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = relative(root, abs).split(sep).join('/');
    if (statSync(abs).isDirectory()) {
      if (name === '__tests__' || rel === 'apps/web/src/components/ui') continue;
      walk(abs, root, files);
    } else if (/\.(vue|ts|css|html)$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) {
      files.push(abs);
    }
  }
}

function main(argv) {
  if (argv.includes('--list-rules')) {
    for (const r of RULES) console.log(r.name);
    return 0;
  }
  const i = argv.indexOf('--root');
  const root = i >= 0 && argv[i + 1] ? argv[i + 1] : '.';
  const src = join(root, 'apps/web/src');
  if (!existsSync(src)) {
    console.log('design-lint: nothing to scan');
    return 0;
  }
  const files = [];
  walk(src, root, files);
  const index = join(root, 'apps/web/index.html');
  if (existsSync(index)) files.push(index);

  const loaded = files.map((abs) => {
    const theme = abs.endsWith('.css') && /:root\s*\{/.test(readFileSync(abs, 'utf8'));
    return load(root, abs, theme);
  });
  const allowed = allowedRules(root);
  const rules = RULES.filter((r) => !allowed.includes(r.name));

  const raw = [];
  for (const r of rules) {
    for (const f of loaded) for (const h of r.check?.(f) ?? []) raw.push({ f, rule: r, ...h });
    for (const h of r.tree?.(loaded) ?? []) raw.push({ rule: r, ...h });
  }

  // A hit is silenced by a valid `design-lint-ignore <rule> <reason>` on its line or the one above.
  const silenced = new Map();
  for (const f of loaded) {
    const set = new Set();
    f.text.split('\n').forEach((line, i) => {
      const ig = parseIgnore(line);
      if (ig && ignorable(ig.rule) && ig.reason) set.add(`${i + 1}:${ig.rule}`);
    });
    silenced.set(f, set);
  }
  const seen = new Set();
  const hits = [];
  for (const h of raw) {
    const ig = silenced.get(h.f);
    if (
      !h.rule.unsilenceable &&
      (ig.has(`${h.line}:${h.rule.name}`) || ig.has(`${h.line - 1}:${h.rule.name}`))
    )
      continue;
    const key = `${h.f.rel}:${h.rule.name}:${h.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ path: h.f.rel, line: h.line, rule: h.rule.name, found: h.found });
  }
  hits.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  for (const h of hits) console.log(`${h.path}:${h.line}: ${h.rule}: ${h.found}`);
  if (hits.length) {
    console.log(`design-lint: ${hits.length} hits`);
    return 1;
  }
  const note = allowed.length ? `, allowed: ${allowed.join(', ')}` : '';
  console.log(`design-lint: ok (${files.length} files${note})`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
