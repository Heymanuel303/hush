import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'design-lint.mjs');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Writes `files` (path under the root -> content) to a temp root and runs the lint. */
function lint(files) {
  const root = mkdtempSync(join(tmpdir(), 'design-lint-'));
  dirs.push(root);
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), content);
  }
  try {
    const out = execFileSync('node', [script, '--root', root], { encoding: 'utf8' });
    return { code: 0, lines: out.trim().split('\n') };
  } catch (e) {
    return { code: e.status, lines: e.stdout.trim().split('\n') };
  }
}

const vue = (body) => ({ 'apps/web/src/App.vue': `<template>\n${body}\n</template>\n` });
const hitLines = (r) => r.lines.filter((l) => !l.startsWith('design-lint:'));

function expectHit(files, rule, path, line) {
  const r = lint(files);
  assert.equal(r.code, 1, r.lines.join('\n'));
  assert.deepEqual(
    hitLines(r).map((l) => l.split(': ').slice(0, 2).join(': ')),
    [`${path}:${line}: ${rule}`],
  );
}

const APP = 'apps/web/src/App.vue';
const cases = [
  ['purple-gradient', '<div class="bg-gradient-to-r from-violet-500 to-indigo-500" />'],
  ['purple-gradient', '<div\n  class="bg-gradient-to-r\n from-[#7c3aed] to-[#111111]" />'],
  [
    'purple-gradient',
    '<div class="bg-linear-to-r from-[oklch(0.6_0.2_290)] to-[hsl(10,80%,50%)]" />',
  ],
  ['gradient-text', '<h1 class="bg-clip-text text-transparent">Hi</h1>'],
  ['backdrop-blur', '<div class="backdrop-blur-md" />'],
  ['glow-shadow', '<div class="shadow-2xl" />'],
  ['glow-shadow', '<div class="shadow-blue-500/50" />'],
  ['glow-shadow', '<div class="shadow-[0_0_30px_#3b82f6]" />'],
  ['emoji-heading', '<h2>Launch 🚀</h2>'],
  ['banned-copy', '<p>Seamlessly connect</p>'],
  ['banned-copy', '<p title="Welcome back!">x</p>'],
  ['raw-palette', '<div class="text-slate-500" />'],
  ['raw-palette', '<div class="bg-white" />'],
];

for (const [rule, body] of cases) {
  test(`${rule}: ${body.replace(/\s+/g, ' ').slice(0, 50)}`, () => {
    const r = lint(vue(body));
    assert.equal(r.code, 1);
    const hits = hitLines(r);
    const rules = hits.map((l) => l.split(': ')[1]);
    assert.ok(rules.includes(rule), r.lines.join('\n'));
    const line = hits.find((l) => l.split(': ')[1] === rule).split(':')[1];
    const expected = body.startsWith('<div\n  class') ? 3 : 2;
    assert.equal(Number(line), expected);
  });
}

test('an apostrophe in a comment does not hide later strings', () => {
  expectHit(
    {
      'apps/web/src/a.ts': [
        "// Don't recompute the hero on every render",
        "export const hero = 'bg-gradient-to-r from-[#7c3aed] to-[#111111]';",
        '',
      ].join('\n'),
    },
    'purple-gradient',
    'apps/web/src/a.ts',
    2,
  );
});

test('an apostrophe in a comment does not flag code as copy', () => {
  const r = lint({
    'apps/web/src/a.ts':
      "// It's the lock store\nexport function unlock(id: string) { return id }\nexport const x = 'y'\n",
  });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('exact file and line', () => {
  expectHit(vue('<p>ok</p>\n<h1>Ship 🎉</h1>'), 'emoji-heading', APP, 3);
});

test('css rules', () => {
  const css = (decl) => ({ 'apps/web/src/a.css': `.a {\n  ${decl}\n}\n` });
  expectHit(
    css('background: linear-gradient(90deg, #8b5cf6, #3b82f6);'),
    'purple-gradient',
    'apps/web/src/a.css',
    2,
  );
  expectHit(
    css('background-clip: text; color: transparent;'),
    'gradient-text',
    'apps/web/src/a.css',
    2,
  );
  expectHit(css('backdrop-filter: blur(8px);'), 'backdrop-blur', 'apps/web/src/a.css', 2);
  expectHit(
    css('box-shadow: 0 0 40px rgba(124, 58, 237, 0.5);'),
    'glow-shadow',
    'apps/web/src/a.css',
    2,
  );
});

test('ts string literal is scanned for copy and classes', () => {
  expectHit(
    { 'apps/web/src/a.ts': "export const t = 'Unlock your potential';\n" },
    'banned-copy',
    'apps/web/src/a.ts',
    1,
  );
});

test('amber gradient passes purple-gradient but fails raw-palette', () => {
  const r = lint(vue('<div class="bg-gradient-to-r from-amber-500 to-orange-500" />'));
  assert.equal(r.code, 1);
  assert.deepEqual(
    hitLines(r).map((l) => l.split(': ')[1]),
    ['raw-palette'],
  );
});

test('clean fixture has zero hits', () => {
  const r = lint({
    ...vue(
      '<h1 class="text-foreground bg-card shadow-sm">Orders</h1>\n<p class="text-muted-foreground">Nothing yet.</p>',
    ),
    'apps/web/src/style.css':
      ':root {\n  --a: #111;\n  box-shadow: 0 1px 2px rgba(0,0,0,.1);\n}\n.dark {\n  --a: #eee;\n}\n',
    'apps/web/index.html': '<html><title>App</title></html>\n',
  });
  assert.equal(r.code, 0);
  assert.equal(r.lines.at(-1), 'design-lint: ok (3 files)');
});

test('no apps/web/src: nothing to scan', () => {
  const r = lint({ 'README.md': 'x' });
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ['design-lint: nothing to scan']);
});

test('components/ui, tests and theme files are exempt', () => {
  const r = lint({
    'apps/web/src/components/ui/button.vue':
      '<template><b class="bg-white backdrop-blur" /></template>\n',
    'apps/web/src/a.test.ts': "const x = 'Unlock';\n",
    'apps/web/src/__tests__/b.ts': "const x = 'Unlock';\n",
    'apps/web/src/theme.css': ':root {\n  --x: 1;\n}\n.a { @apply bg-slate-500; }\n',
  });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('theme files are not exempt from other rules', () => {
  expectHit(
    { 'apps/web/src/theme.css': ':root {\n  --x: 1;\n}\n.a { backdrop-filter: blur(4px); }\n' },
    'backdrop-blur',
    'apps/web/src/theme.css',
    4,
  );
});

const ZINC_CSS = (bg = 'oklch(1 0 0)', primary = 'oklch(0.21 0.006 285.885)') =>
  [
    ':root {',
    `  --background: ${bg};`,
    '  --foreground: oklch(0.141   0.005 285.823);',
    `  --primary: ${primary};`,
    '  --muted: oklch(0.967 0.001 286.375);',
    '  --border: oklch(0.92 0.004 286.32);',
    '}',
    '.dark {',
    '  --background: #111; --foreground: #eee; --primary: #ddd; --muted: #222; --border: #333;',
    '}',
    '',
  ].join('\n');
const THEME = 'apps/web/src/theme.css';

test('default-font: only a default Fontsource family', () => {
  expectHit(
    { 'apps/web/src/main.ts': "import '@fontsource-variable/inter';\n" },
    'default-font',
    'apps/web/src/main.ts',
    1,
  );
});

test('default-font: another family imported anywhere passes', () => {
  const r = lint({
    'apps/web/src/main.ts': "import '@fontsource/inter';\nimport '@fontsource/fraunces';\n",
  });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('default-font: theme font-family starting with a default family', () => {
  expectHit(
    { [THEME]: ":root {\n  --x: 1;\n}\nbody {\n  font-family: 'Open Sans', serif;\n}\n" },
    'default-font',
    THEME,
    5,
  );
  const r = lint({
    [THEME]: ':root {\n  --x: 1;\n}\nbody {\n  font-family: Fraunces, Inter;\n}\n',
  });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('uniform-radius: reported once with the percentage', () => {
  const big = '<div class="rounded-2xl" />\n'.repeat(5);
  const r = lint(vue(big + '<div class="rounded-3xl md:rounded-t-2xl rounded-md" />'));
  assert.equal(r.code, 1);
  assert.deepEqual(
    hitLines(r).map((l) => l.split(': ').slice(0, 2).join(': ')),
    [`${APP}:2: uniform-radius`],
  );
  assert.match(hitLines(r)[0], /88% of 8/);
});

test('uniform-radius: mixed or too few classes pass', () => {
  const mixed =
    '<div class="rounded-2xl" />\n'.repeat(4) + '<div class="rounded-md" />\n'.repeat(4);
  assert.equal(lint(vue(mixed)).code, 0);
  assert.equal(lint(vue('<div class="rounded-2xl" />\n'.repeat(7))).code, 0);
});

test('zinc-theme: shadcn zinc values fail, changed background and primary pass', () => {
  expectHit({ [THEME]: ZINC_CSS() }, 'zinc-theme', THEME, 1);
  const r = lint({ [THEME]: ZINC_CSS('oklch(0.98 0.01 80)', 'oklch(0.5 0.15 30)') });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('ignore comment suppresses on the same line and the line above, in .vue and .ts', () => {
  const r = lint({
    [APP]:
      '<template>\n<!-- design-lint-ignore backdrop-blur frosted nav is the signature -->\n<div class="backdrop-blur-md" />\n<div class="shadow-2xl" /> <!-- design-lint-ignore glow-shadow modal elevation -->\n</template>\n',
    'apps/web/src/a.ts':
      "// design-lint-ignore purple-gradient brand colour\nexport const c = 'bg-gradient-to-r from-[#7c3aed] to-[#111111]';\n/* design-lint-ignore banned-copy quoted from the client */\nexport const t = 'Unlock';\n",
  });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('ignore comment only covers its own rule', () => {
  expectHit(
    vue('<!-- design-lint-ignore glow-shadow reason here -->\n<div class="backdrop-blur-md" />'),
    'backdrop-blur',
    APP,
    3,
  );
});

test('bare ignore, missing reason and unknown rule are ignore-without-reason', () => {
  for (const [c, rule] of [
    ['// design-lint-ignore', 'x'],
    ['// design-lint-ignore glow-shadow', 'x'],
    ['/* design-lint-ignore no-such-rule because */', 'x'],
  ]) {
    const r = lint({ 'apps/web/src/a.ts': `${c}\nexport const ${rule} = 1;\n` });
    assert.equal(r.code, 1, c);
    assert.match(hitLines(r)[0], /^apps\/web\/src\/a\.ts:1: ignore-without-reason/, c);
  }
  // the reasonless ignore does not silence the hit it sits on
  const r = lint(vue('<!-- design-lint-ignore glow-shadow -->\n<div class="shadow-2xl" />'));
  assert.deepEqual(
    hitLines(r).map((l) => l.split(': ')[1]),
    ['ignore-without-reason', 'glow-shadow'],
  );
});

test('AGENTS.md Allowed line skips a rule and the summary names it', () => {
  const agents = (allowed) =>
    `# App\n\n## Design direction\n\n- Audience: x\n- Signature: y\n${allowed}\n\n## Other\n`;
  const files = vue('<div class="bg-gradient-to-r from-[#7c3aed] to-[#111111]" />');
  const r = lint({ ...files, 'AGENTS.md': agents('Allowed: purple-gradient (brand)') });
  assert.equal(r.code, 0, r.lines.join('\n'));
  assert.equal(r.lines.at(-1), 'design-lint: ok (1 files, allowed: purple-gradient)');
  for (const a of ['Allowed: none', '']) {
    assert.equal(lint({ ...files, 'AGENTS.md': agents(a) }).code, 1, a);
  }
  // the Allowed line only counts inside the Design direction section
  const outside = '# App\n\nAllowed: purple-gradient\n\n## Design direction\n\n- Audience: x\n';
  assert.equal(lint({ ...files, 'AGENTS.md': outside }).code, 1);
});

test('the whitelist never silences raw-palette, banned-copy or ignore-without-reason', () => {
  const r = lint({
    ...vue('<p class="text-slate-500">Unlock</p>\n<!-- design-lint-ignore -->'),
    'AGENTS.md':
      '## Design direction\nAllowed: raw-palette, banned-copy, ignore-without-reason, backdrop-blur\n',
  });
  assert.equal(r.code, 1);
  assert.deepEqual(
    hitLines(r)
      .map((l) => l.split(': ')[1])
      .sort(),
    ['banned-copy', 'ignore-without-reason', 'raw-palette'],
  );
});

test('--list-rules prints the twelve rule names', () => {
  const out = execFileSync('node', [script, '--list-rules'], { encoding: 'utf8' });
  assert.deepEqual(out.trim().split('\n'), [
    'purple-gradient',
    'gradient-text',
    'backdrop-blur',
    'glow-shadow',
    'default-font',
    'uniform-radius',
    'zinc-theme',
    'emoji-heading',
    'banned-copy',
    'raw-palette',
    'dark-token-parity',
    'ignore-without-reason',
  ]);
});

const PARITY_THEME = 'apps/web/src/assets/theme.css';

test('dark-token-parity flags a token missing from .dark', () => {
  const css =
    ':root {\n  --background: #fbfaf8;\n  --warning: #b45309;\n  --radius: 0.375rem;\n}\n' +
    '.dark {\n  --background: #1c1c1e;\n}\n';
  expectHit({ [PARITY_THEME]: css }, 'dark-token-parity', PARITY_THEME, 6);
  assert.match(hitLines(lint({ [PARITY_THEME]: css }))[0], /--warning missing from \.dark$/);
});

test('dark-token-parity passes matching sets', () => {
  const r = lint({
    [PARITY_THEME]:
      ':root {\n  --background: #fbfaf8;\n  --warning: #b45309;\n  --radius: 0.375rem;\n  color-scheme: light;\n}\n' +
      '.dark {\n  --background: #1c1c1e;\n  --warning: oklch(0.7 0.15 60);\n  color-scheme: dark;\n}\n',
  });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('dark-token-parity: a token only in .dark, and a missing .dark block', () => {
  expectHit(
    { [PARITY_THEME]: ':root {\n  --a: #111;\n}\n.dark {\n  --a: #eee;\n  --b: rgb(1 2 3);\n}\n' },
    'dark-token-parity',
    PARITY_THEME,
    1,
  );
  expectHit(
    { [PARITY_THEME]: ':root {\n  --a: hsl(10 50% 50%);\n}\n' },
    'dark-token-parity',
    PARITY_THEME,
    1,
  );
});

test('dark-token-parity reports each missing name, even on one line', () => {
  const r = lint({
    [PARITY_THEME]: ':root {\n  --a: #111;\n  --b: #222;\n}\n.dark {\n  --c: #333;\n}\n',
  });
  assert.equal(r.code, 1);
  assert.deepEqual(hitLines(r), [
    `${PARITY_THEME}:1: dark-token-parity: --c missing from :root`,
    `${PARITY_THEME}:5: dark-token-parity: --a missing from .dark`,
    `${PARITY_THEME}:5: dark-token-parity: --b missing from .dark`,
  ]);
});
