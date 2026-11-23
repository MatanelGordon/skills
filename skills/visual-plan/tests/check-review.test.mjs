import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MAX_WORDS,
  checkPlanDir,
  countWords,
  findSvgProblems,
  imageTargets,
  leadingQuestionIds,
  planIds,
} from '../scripts/check-review.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check-review.mjs', import.meta.url));

const GOOD_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 200" role="img">
  <title>Login flow</title>
  <style><![CDATA[ .card > .label { fill: #1f2328; } ]]></style>
  <style>.wire { stroke: #818b98; } g > rect { fill: none; }</style>
  <rect class="card" x="40" y="40" width="160" height="60" rx="8"/>
  <text x="120" y="75" text-anchor="middle">Limiter &amp; store</text>
</svg>
`;

const GOOD_PLAN = `# Plan: login-rate-limit

**Status:** draft

## Goal

Throttle repeated failed logins.

## Approach

Count failures per account, not per IP: shared office IPs would lock out whole teams.

## Risks and unknowns

- Redis outage -> fail open and log; accepted.
- Q1: Lockout length, 15 minutes or 1 hour -> your call; default 15 minutes.
- Q2: Tell the user why the login failed, or stay vague -> your call; default vague.

## Decisions

- \`ADR-0007\` — Counters live in Redis — already recorded.

## Amendments
`;

const GOOD_REVIEW = `# Login rate limit

**Status:** draft, waiting for your review. Full plan for the agent: [plan.md](plan.md)

Five failed logins lock an account for a while, so guessing passwords stops being cheap.

![Before and after: the limiter sits between the form and the password check](diagrams/flow.svg)

## Your call

| # | Question | Recommended | If you say nothing |
|---|---|---|---|
| Q1 | Lockout length | 15 minutes | 15 minutes |
| Q2 | Say why the login failed | Stay vague | Stay vague |

## Already decided

- Failures are counted per account, not per IP.
- ADR-0007: counters live in Redis.
`;

const withPlanDir = async (files, run) => {
  const root = await mkdtemp(join(tmpdir(), 'check-review-'));
  const dir = join(root, 'login-rate-limit');
  try {
    for (const [name, text] of Object.entries(files)) {
      const path = join(dir, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    }
    return await run(dir, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const goodFiles = (overrides = {}) => ({
  'plan.md': GOOD_PLAN,
  'review.md': GOOD_REVIEW,
  'diagrams/flow.svg': GOOD_SVG,
  ...overrides,
});

const codes = (result) => result.findings.map((finding) => finding.code);

// --- countWords -----------------------------------------------------------

test('countWords counts visible words and treats paths and hyphenated terms as one word', () => {
  assert.equal(countWords('Hard-to-reverse choices live in `src/auth/login.js` today.'), 6);
  assert.equal(countWords(''), 0);
});

test('countWords ignores link targets, image alt text, comments, HTML tags and table rules', () => {
  const markdown = [
    '<!-- hidden note with many words in it -->',
    'See [the plan](plan.md "a title here").',
    '![alt text that is not counted](diagrams/flow.svg)',
    '| A | B |',
    '|---|:-:|',
    '| one | two |',
    '<br>',
    '---',
  ].join('\n');
  assert.equal(countWords(markdown), 7);
});

test('countWords handles non-ASCII letters and CRLF line endings', () => {
  assert.equal(countWords('Zoë déjà vu\r\nnaïve café'), 5);
});

// --- imageTargets ---------------------------------------------------------

test('imageTargets finds Markdown images, titles, angle brackets, img tags and picture sources', () => {
  const markdown = [
    '![a](diagrams/a.svg)',
    '![b](./diagrams/b.svg "Title")',
    '![c](<diagrams/c.svg>)',
    '<img src="diagrams/d.svg" alt="d" width="720">',
    '<picture><source media="(prefers-color-scheme: dark)" srcset="diagrams/e-dark.svg"><img src=\'diagrams/e.svg\'></picture>',
  ].join('\n');
  assert.deepEqual(imageTargets(markdown), [
    'diagrams/a.svg',
    './diagrams/b.svg',
    'diagrams/c.svg',
    'diagrams/d.svg',
    'diagrams/e-dark.svg',
    'diagrams/e.svg',
  ]);
});

test('imageTargets skips images shown inside fenced code blocks', () => {
  assert.deepEqual(imageTargets('```md\n![x](diagrams/x.svg)\n```\n'), []);
});

// --- planIds and leadingQuestionIds --------------------------------------

test('planIds reads open questions anywhere and ADRs under the Decisions heading only', () => {
  const plan = [
    '## Background',
    '- ADR-0003 — honoured, not made by this plan',
    '## Risks and unknowns',
    '- Redis outage -> fail open',
    '- Q1: lockout length -> your call',
    '* **Q2**: wording of the error -> your call',
    '| Q3 | table form |',
    '## Decisions',
    '- `ADR-0007` — counters live in Redis',
    '1. ADR-0008 — second',
    '### Notes',
    '- ADR-0009 — inside a sub-heading of Decisions',
    '## Amendments',
    '- ADR-0010 — elsewhere',
  ].join('\n');
  assert.deepEqual(planIds(plan), {
    questions: ['Q1', 'Q2', 'Q3'],
    decisions: ['ADR-0007', 'ADR-0008', 'ADR-0009'],
  });
});

test('planIds finds nothing in a plan whose decisions are prose, "None", or absent', () => {
  const empty = { questions: [], decisions: [] };
  assert.deepEqual(planIds('## Decisions\n\nNo ADR is needed. The policy is a user-selected behaviour.\n'), empty);
  assert.deepEqual(planIds('## Decisions\n\nNone.\n\n## Amendments\n'), empty);
  assert.deepEqual(planIds('# Plan\n\n## Goal\n'), empty);
});

test('planIds counts top-level entries only: not nested bullets, not ids in a code sample, not prose', () => {
  const plan = [
    '## Risks and unknowns',
    '- Q1: lockout length -> your call',
    '  - Q7: a nested note, not a question of its own',
    '```md',
    '- Q8: an example line',
    '```',
    'Q9 is mentioned in a sentence.',
    '- Q10: repeated below',
    '- Q10: repeated',
  ].join('\n');
  assert.deepEqual(planIds(plan), { questions: ['Q1', 'Q10'], decisions: [] });
});

test('leadingQuestionIds reads ids that open a row or bullet and ignores quarters in prose', () => {
  const review = [
    'We ship in Q4 2026.',
    '| # | Question |',
    '|---|---|',
    '| Q1 | Lockout length |',
    '| **Q2** | Wording |',
    '- Q3: a bullet',
    'See Q5 above.',
  ].join('\n');
  assert.deepEqual(leadingQuestionIds(review), ['Q1', 'Q2', 'Q3']);
});

// --- findSvgProblems ------------------------------------------------------

test('findSvgProblems accepts a declaration, comments, CDATA, self-closing tags and > inside CSS', () => {
  assert.deepEqual(findSvgProblems(GOOD_SVG), []);
});

const brokenSvg = (body, root = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>t</title>') => (
  `${root}${body}</svg>`
);

test('findSvgProblems reports each way an SVG stops being well-formed XML', () => {
  const cases = [
    ['', /empty/],
    ['just text', /no root element/],
    [brokenSvg('<g><rect/>'), /<g> is never closed|closes <g>/],
    [brokenSvg('<g><rect></g></rect>'), /closes <rect>|expected <\/rect>/],
    [brokenSvg('<text>Fish & chips</text>'), /&/],
    [brokenSvg('<text>a&nbsp;b</text>'), /&nbsp;/],
    [brokenSvg('<text>1 < 2</text>'), /</],
    [brokenSvg('<rect width=10/>'), /quote/],
    [brokenSvg('<rect x="1" x="2"/>'), /twice/],
    [brokenSvg('<rect x="1"y="2"/>'), /space before attribute y/],
    [`${brokenSvg('')}<svg/>`, /more than one root/],
    [`${brokenSvg('')}trailing`, /outside the root/],
    [brokenSvg('<!-- never closed'), /comment/],
    [brokenSvg('<rect'), /never closed|not closed/],
  ];
  for (const [svg, expected] of cases) {
    const problems = findSvgProblems(svg);
    assert.ok(problems.length > 0, `expected a problem for: ${svg}`);
    assert.match(problems.join('\n'), expected, svg);
  }
});

test('findSvgProblems accepts numeric and predefined entities', () => {
  assert.deepEqual(findSvgProblems(brokenSvg('<text>&lt;a&gt; &amp; &#8594; &#x2192; &quot;q&quot; &apos;</text>')), []);
});

test('findSvgProblems requires an svg root with xmlns, viewBox and a title', () => {
  assert.match(findSvgProblems('<div xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>t</title></div>').join('\n'), /root element is <div>/);
  assert.match(findSvgProblems('<svg viewBox="0 0 1 1"><title>t</title></svg>').join('\n'), /xmlns/);
  assert.match(findSvgProblems('<svg xmlns="http://www.w3.org/2000/svg"><title>t</title></svg>').join('\n'), /viewBox/);
  assert.match(findSvgProblems('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>').join('\n'), /<title>/);
});

test('findSvgProblems rejects scripts, foreignObject and remote references', () => {
  assert.match(findSvgProblems(brokenSvg('<script>alert(1)</script>')).join('\n'), /<script>/);
  assert.match(findSvgProblems(brokenSvg('<foreignObject><p xmlns="http://www.w3.org/1999/xhtml">x</p></foreignObject>')).join('\n'), /<foreignObject>/);
  assert.match(findSvgProblems(brokenSvg('<image href="https://example.com/a.png"/>')).join('\n'), /outside the file/);
  assert.match(findSvgProblems(brokenSvg('<style>@import url("https://example.com/f.css");</style>')).join('\n'), /outside the file/);
  assert.deepEqual(findSvgProblems(brokenSvg('<defs><marker id="arrow"/></defs><path marker-end="url(#arrow)" d="M0 0"/><use href="#arrow"/>')), []);
});

// --- checkPlanDir ---------------------------------------------------------

test('checkPlanDir passes a plan folder that meets the contract', async () => {
  await withPlanDir(goodFiles(), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(result.findings, []);
    assert.equal(result.ok, true);
    assert.equal(result.maxWords, DEFAULT_MAX_WORDS);
    assert.equal(result.words, countWords(GOOD_REVIEW));
    assert.deepEqual(result.diagrams, ['diagrams/flow.svg']);
    assert.deepEqual(result.ids, ['Q1', 'Q2', 'ADR-0007']);
  });
});

test('checkPlanDir reports a missing or empty plan.md and review.md', async () => {
  await withPlanDir({ 'review.md': GOOD_REVIEW, 'diagrams/flow.svg': GOOD_SVG }, (dir) => {
    assert.ok(codes(checkPlanDir(dir)).includes('plan-missing'));
  });
  await withPlanDir({ 'plan.md': GOOD_PLAN }, (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['review-missing']);
  });
  await withPlanDir(goodFiles({ 'review.md': '  \n' }), (dir) => {
    assert.ok(codes(checkPlanDir(dir)).includes('review-missing'));
  });
});

test('checkPlanDir reports a review that does not link plan.md', async () => {
  await withPlanDir(goodFiles({ 'review.md': GOOD_REVIEW.replace('[plan.md](plan.md)', 'plan.md') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['plan-link']);
  });
  await withPlanDir(goodFiles({ 'review.md': GOOD_REVIEW.replace('(plan.md)', '(./plan.md#decisions)') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
});

test('checkPlanDir reports a review with no diagram, a remote one, or a data URI', async () => {
  const noImage = GOOD_REVIEW.replace(/^!\[.*$/m, '');
  await withPlanDir(goodFiles({ 'review.md': noImage }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['no-diagram', 'diagram-unlinked']);
  });
  const remote = GOOD_REVIEW.replace('diagrams/flow.svg', 'https://example.com/flow.svg');
  await withPlanDir(goodFiles({ 'review.md': remote }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['diagram-remote', 'no-diagram', 'diagram-unlinked']);
  });
  const data = GOOD_REVIEW.replace('diagrams/flow.svg', 'data:image/svg+xml;base64,AAAA');
  await withPlanDir(goodFiles({ 'review.md': data }), (dir) => {
    assert.ok(codes(checkPlanDir(dir)).includes('diagram-remote'));
  });
});

test('checkPlanDir reports a linked SVG that is missing, outside the folder, or unlinked on disk', async () => {
  await withPlanDir({ 'plan.md': GOOD_PLAN, 'review.md': GOOD_REVIEW }, (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['diagram-missing']);
  });
  const outside = GOOD_REVIEW.replace('diagrams/flow.svg', '../elsewhere/flow.svg');
  await withPlanDir(goodFiles({ 'review.md': outside }), (dir) => {
    assert.ok(codes(checkPlanDir(dir)).includes('diagram-outside'));
  });
  await withPlanDir(goodFiles({ 'diagrams/extra.svg': GOOD_SVG }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(codes(result), ['diagram-unlinked']);
    assert.match(result.findings[0].message, /diagrams\/extra\.svg/);
  });
});

test('checkPlanDir accepts ./ prefixes, titles and img tags as links to a diagram', async () => {
  const review = GOOD_REVIEW.replace(
    /^!\[.*$/m,
    '<img src="./diagrams/flow.svg?v=2#top" alt="Flow" width="720">',
  );
  await withPlanDir(goodFiles({ 'review.md': review }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
});

test('checkPlanDir reports inline SVG in the review but not SVG shown as a code sample', async () => {
  await withPlanDir(goodFiles({ 'review.md': `${GOOD_REVIEW}\n<svg viewBox="0 0 1 1"></svg>\n` }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['inline-svg']);
  });
  await withPlanDir(goodFiles({ 'review.md': `${GOOD_REVIEW}\n\`\`\`xml\n<svg/>\n\`\`\`\n` }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
});

test('checkPlanDir reports a linked SVG that is not well-formed, naming the file', async () => {
  await withPlanDir(goodFiles({ 'diagrams/flow.svg': GOOD_SVG.replace('&amp;', '&') }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(codes(result), ['svg-invalid']);
    assert.match(result.findings[0].message, /diagrams\/flow\.svg/);
  });
});

test('checkPlanDir enforces the word budget at the boundary', async () => {
  const words = countWords(GOOD_REVIEW);
  await withPlanDir(goodFiles(), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir, { maxWords: words })), []);
    const over = checkPlanDir(dir, { maxWords: words - 1 });
    assert.deepEqual(codes(over), ['word-budget']);
    assert.match(over.findings[0].message, new RegExp(`${words} words`));
  });
});

test('checkPlanDir reports a plan id missing from the review, matching whole ids only', async () => {
  const plan = GOOD_PLAN.replace('- Q2:', '- Q12: twelfth -> your call\n- Q2:');
  const review = GOOD_REVIEW.replace('| Q1 | Lockout length | 15 minutes | 15 minutes |\n', '| Q12 | Twelfth | x | x |\n');
  await withPlanDir(goodFiles({ 'plan.md': plan, 'review.md': review }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(codes(result), ['id-uncovered']);
    assert.match(result.findings[0].message, /\bQ1\b/);
    assert.doesNotMatch(result.findings[0].message, /Q12|Q2|ADR-0007/);
  });
  await withPlanDir(goodFiles({ 'review.md': GOOD_REVIEW.replace('- ADR-0007: counters live in Redis.\n', '') }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(codes(result), ['id-uncovered']);
    assert.match(result.findings[0].message, /ADR-0007/);
  });
});

test('checkPlanDir reports a question the review asks that the plan does not list', async () => {
  const review = GOOD_REVIEW.replace('| Q2 |', '| Q2 | extra | x | x |\n| Q3 |');
  await withPlanDir(goodFiles({ 'review.md': `${review}\nWe ship in Q4 2026.\n` }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(codes(result), ['id-unknown']);
    assert.match(result.findings[0].message, /\bQ3\b/);
    assert.doesNotMatch(result.findings[0].message, /Q4/);
  });
});

test('checkPlanDir passes a plan with no ids, and reports no id findings when plan.md is missing', async () => {
  const review = GOOD_REVIEW.replace(/\| Q[12] \|.*\n/g, '').replace('- ADR-0007: counters live in Redis.\n', '');
  await withPlanDir(goodFiles({ 'plan.md': '# Plan\n\n## Decisions\n\nNo ADR is needed.\n', 'review.md': review }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.ids, []);
  });
  await withPlanDir({ 'review.md': GOOD_REVIEW, 'diagrams/flow.svg': GOOD_SVG }, (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['plan-missing']);
  });
});

test('checkPlanDir reads CRLF files the same way as LF files', async () => {
  const crlf = (text) => text.replace(/\n/g, '\r\n');
  await withPlanDir(goodFiles({ 'plan.md': crlf(GOOD_PLAN), 'review.md': crlf(GOOD_REVIEW), 'diagrams/flow.svg': crlf(GOOD_SVG) }), (dir) => {
    const result = checkPlanDir(dir);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.ids, ['Q1', 'Q2', 'ADR-0007']);
  });
});

test('checkPlanDir throws a usage error when the folder is missing or is a file', async () => {
  await withPlanDir(goodFiles(), (dir) => {
    assert.throws(() => checkPlanDir(join(dir, 'nope')), /not a folder/);
    assert.throws(() => checkPlanDir(join(dir, 'plan.md')), /not a folder/);
  });
});

test('the plan, review and diagram shipped as eval fixtures meet the contract', () => {
  const fixture = fileURLToPath(new URL('../evals/files/shared/export-queue', import.meta.url));
  const result = checkPlanDir(fixture);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.ids, ['Q1', 'Q2', 'ADR-0007']);
});

test('the SVG skeleton in references/diagrams.md is itself a valid diagram', async () => {
  const guide = await readFile(new URL('../references/diagrams.md', import.meta.url), 'utf8');
  const skeleton = /```svg\r?\n([\s\S]*?)\r?\n```/.exec(guide)?.[1];
  assert.ok(skeleton, 'diagrams.md has no ```svg block');
  assert.deepEqual(findSvgProblems(skeleton), []);
  assert.match(skeleton, /prefers-color-scheme: dark/);
});

// --- Review findings, 23 November: each case below was a false pass or a false fail ---

const svgWith = (body, attributes = '') => (
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attributes}><title>t</title>${body}</svg>`
);

test('findSvgProblems rejects what XML parsers reject: misplaced declaration, "--" in a comment, "]]>", bad character references', () => {
  const cases = [
    [`\n<?xml version="1.0"?>${svgWith('')}`, /declaration must be the very first/],
    [`<!-- c --><?xml version="1.0"?>${svgWith('')}`, /declaration must be the very first/],
    [svgWith('<!-- phase 1 -- foundation -->'), /"--"/],
    [svgWith('<!-- ends with a dash --->'), /"--"/],
    [svgWith('<text>a ]]> b</text>'), /\]\]>/],
    [svgWith('<text>&#0;</text>'), /does not allow/],
    [svgWith('<text>&#xFFFE;</text>'), /does not allow/],
    [`<!DOCTYPE svg [ <!ENTITY a "b"> ]>${svgWith('')}`, /DOCTYPE/],
    [svgWith('<!ELEMENT x ANY>'), /unexpected "<!"/],
  ];
  for (const [svg, expected] of cases) {
    assert.match(findSvgProblems(svg).join('\n'), expected, svg);
  }
  assert.deepEqual(findSvgProblems(`﻿<?xml version="1.0"?>${svgWith('')}`), []);
  assert.deepEqual(findSvgProblems(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${svgWith('')}`), []);
  assert.deepEqual(findSvgProblems(svgWith('<text>&#9;&#x1F600;</text>')), []);
});

test('findSvgProblems requires every namespace prefix to be declared on an enclosing element', () => {
  assert.match(findSvgProblems(svgWith('<use xlink:href="#a"/>')).join('\n'), /prefix xlink.*plain href/);
  assert.match(findSvgProblems(svgWith('<s:rect/>')).join('\n'), /prefix s/);
  assert.deepEqual(findSvgProblems(svgWith('<defs><g id="a"/></defs><use xlink:href="#a"/>', ' xmlns:xlink="http://www.w3.org/1999/xlink"')), []);
  assert.deepEqual(findSvgProblems(svgWith('<g xmlns:s="urn:s"><s:x/></g>')), []);
  assert.match(findSvgProblems(svgWith('<g xmlns:s="urn:s"/><s:x/>')).join('\n'), /prefix s/);
  assert.deepEqual(findSvgProblems(svgWith('<text xml:space="preserve">a</text>')), []);
});

test('findSvgProblems rejects references to other files, not only remote ones', () => {
  const outside = [
    '<image href="photo.png"/>',
    '<use href="sprites.svg#icon"/>',
    '<image href=" https://example.com/a.png"/>',
    '<style>@font-face { font-family: F; src: url(font.woff2); }</style>',
    '<rect style="fill: url(other.svg#g)"/>',
  ];
  for (const body of outside) {
    assert.match(findSvgProblems(svgWith(body)).join('\n'), /outside the file/, body);
  }
  assert.match(findSvgProblems(`<?xml-stylesheet href="https://example.com/s.css"?>${svgWith('')}`).join('\n'), /outside the file/);
  assert.match(findSvgProblems(svgWith('<s:script xmlns:s="http://www.w3.org/2000/svg">x</s:script>')).join('\n'), /<script>/);
  assert.deepEqual(findSvgProblems(svgWith('<defs><linearGradient id="g"/></defs><rect fill="url(#g)" style="fill:url(#g)"/><image href="data:image/png;base64,AAAA"/>')), []);
  assert.deepEqual(findSvgProblems(svgWith('<text>@import rules are explained here</text>')), []);
});

test('findSvgProblems requires a title with text and a viewBox of four numbers', () => {
  const root = (viewBox, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${title}</svg>`;
  assert.match(findSvgProblems(root('0 0 10 10', '<title/>')).join('\n'), /<title> with text/);
  assert.match(findSvgProblems(root('0 0 10 10', '<title>  </title>')).join('\n'), /<title> with text/);
  assert.match(findSvgProblems(root('junk', '<title>t</title>')).join('\n'), /viewBox of four numbers/);
  assert.match(findSvgProblems(root('0 0 0 10', '<title>t</title>')).join('\n'), /viewBox of four numbers/);
  assert.deepEqual(findSvgProblems(root('0,0,720,240', '<title>t</title>')), []);
});

test('findSvgProblems stays fast on large and pathological input', () => {
  const many = svgWith('<rect/>'.repeat(20000));
  const started = Date.now();
  assert.deepEqual(findSvgProblems(many), []);
  assert.ok(Date.now() - started < 2000, `20,000 elements took ${Date.now() - started} ms`);
});

test('countWords stays fast on pathological lines', () => {
  const started = Date.now();
  countWords(' '.repeat(5000));
  countWords('![a'.repeat(20000));
  countWords('<'.repeat(20000));
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
});

test('imageTargets and plan links ignore comments and inline code, and read reference-style links', () => {
  const markdown = [
    '<!-- ![old](diagrams/old.svg) -->',
    '`![sample](diagrams/sample.svg)`',
    '![a][flow]',
    '![b](<diagrams/my flow.svg> (A title))',
    '<img src=diagrams/c.svg alt=c>',
    '',
    '[flow]: diagrams/flow.svg',
  ].join('\n');
  assert.deepEqual(imageTargets(markdown), ['diagrams/flow.svg', 'diagrams/my flow.svg', 'diagrams/c.svg']);
});

test('checkPlanDir accepts a reference-style plan link and rejects one that differs in case or sits in a comment', async () => {
  const swap = (from, to) => GOOD_REVIEW.replace('[plan.md](plan.md)', from) + (to ? `\n${to}\n` : '');
  await withPlanDir(goodFiles({ 'review.md': swap('[the plan][p]', '[p]: plan.md') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
  await withPlanDir(goodFiles({ 'review.md': swap('[plan](PLAN.md)') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['plan-link']);
  });
  await withPlanDir(goodFiles({ 'review.md': swap('<!-- [plan.md](plan.md) -->') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['plan-link']);
  });
});

test('checkPlanDir does not take <svg> in inline code or a comment for an inline diagram, and catches <svg/>', async () => {
  await withPlanDir(goodFiles({ 'review.md': `${GOOD_REVIEW}\nDo not paste \`<svg>\` here. <!-- <svg> -->\n` }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
  await withPlanDir(goodFiles({ 'review.md': `${GOOD_REVIEW}\n<svg/>\n` }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['inline-svg']);
  });
});

test('checkPlanDir counts a diagram linked only inside a comment as missing', async () => {
  const review = GOOD_REVIEW.replace(/^!\[.*$/m, '<!-- ![flow](diagrams/flow.svg) -->');
  await withPlanDir(goodFiles({ 'review.md': review }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['no-diagram', 'diagram-unlinked']);
  });
});

test('checkPlanDir reports a backslash path and a diagram that is a symlink to a file outside the folder', async (context) => {
  await withPlanDir(goodFiles({ 'review.md': GOOD_REVIEW.replace('diagrams/flow.svg', 'diagrams\\flow.svg') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['diagram-path', 'no-diagram', 'diagram-unlinked']);
  });
  await withPlanDir({ 'plan.md': GOOD_PLAN, 'review.md': GOOD_REVIEW, 'elsewhere.svg': GOOD_SVG }, async (dir, root) => {
    const outsideFile = join(root, 'outside.svg');
    await writeFile(outsideFile, GOOD_SVG);
    await mkdir(join(dir, 'diagrams'));
    try {
      await symlink(outsideFile, join(dir, 'diagrams', 'flow.svg'));
    } catch (error) {
      if (error.code === 'EPERM') return context.skip('symlinks are not permitted here');
      throw error;
    }
    assert.ok(codes(checkPlanDir(dir)).includes('diagram-outside'));
  });
});

test('checkPlanDir ignores a directory named like a diagram', async () => {
  await withPlanDir(goodFiles(), async (dir) => {
    await mkdir(join(dir, 'diagrams', 'folder.svg'));
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
});

test('ids: emphasis, links and checkboxes still count; quarters and years do not', () => {
  const plan = [
    '## Risks and unknowns',
    '- [ ] Q1: lockout length -> your call; recommend 15 minutes; default 15 minutes',
    '- Q2 (answered 2026-11-23): 30 days',
    '| Q3 2027 | roadmap quarter, not a question |',
    '## Decisions',
    '- [ADR-0007](../../.adr/0007-redis.md) — counters live in Redis',
  ].join('\n');
  assert.deepEqual(planIds(plan), { questions: ['Q1', 'Q2'], decisions: ['ADR-0007'] });
  assert.deepEqual(leadingQuestionIds('| Q4 code freeze | the team is away |\n| _Q1_ | Lockout |\n| Q1 | Lockout |'), ['Q1']);
});

test('checkPlanDir treats an id in emphasis as mentioned, and one inside a comment as not', async () => {
  await withPlanDir(goodFiles({ 'review.md': GOOD_REVIEW.replace('| Q1 |', '| _Q1_ |') }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
  const hidden = GOOD_REVIEW.replace('- ADR-0007: counters live in Redis.', '<!-- ADR-0007 -->');
  await withPlanDir(goodFiles({ 'review.md': hidden }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), ['id-uncovered']);
  });
});

test('checkPlanDir passes a plan whose answered questions stay in plan.md and move to "Already decided"', async () => {
  const plan = GOOD_PLAN.replace(
    '- Q1: Lockout length, 15 minutes or 1 hour -> your call; default 15 minutes.',
    '- Q1: Lockout length -> answered 2026-11-23: 1 hour.',
  );
  const review = GOOD_REVIEW
    .replace('| Q1 | Lockout length | 15 minutes | 15 minutes |\n', '')
    .replace('## Already decided\n', '## Already decided\n\n- Q1: accounts lock for 1 hour (your answer).\n');
  await withPlanDir(goodFiles({ 'plan.md': plan, 'review.md': review }), (dir) => {
    assert.deepEqual(codes(checkPlanDir(dir)), []);
  });
});

// --- CLI ------------------------------------------------------------------

const runCli = (args, script = SCRIPT) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('CLI exits 0 with a summary line for a clean folder', async () => {
  await withPlanDir(goodFiles(), (dir) => {
    const result = runCli([dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 diagram/);
    assert.match(result.stdout, new RegExp(`${countWords(GOOD_REVIEW)}/${DEFAULT_MAX_WORDS} words`));
    assert.match(result.stdout, /3 ids matched/);
  });
});

test('CLI exits 1 and names every finding', async () => {
  await withPlanDir(goodFiles({ 'diagrams/extra.svg': GOOD_SVG }), (dir) => {
    const result = runCli([dir, '--max-words', '5']);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\[diagram-unlinked\]/);
    assert.match(result.stdout, /\[word-budget\]/);
    assert.match(result.stdout, /2 problems/);
  });
});

test('CLI --json prints the result object', async () => {
  await withPlanDir(goodFiles(), (dir) => {
    const result = runCli([dir, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.findings, []);
    assert.deepEqual(parsed.ids, ['Q1', 'Q2', 'ADR-0007']);
  });
});

test('CLI exits 64 on a missing folder, a missing argument, or a bad word budget', async () => {
  assert.equal(runCli([]).status, 64);
  assert.equal(runCli([join(tmpdir(), 'check-review-does-not-exist')]).status, 64);
  await withPlanDir(goodFiles(), (dir) => {
    assert.equal(runCli([dir, '--max-words', 'many']).status, 64);
    assert.equal(runCli([dir, '--max-words', '0']).status, 64);
    assert.equal(runCli([dir, '--unknown']).status, 64);
  });
});

test('CLI runs when the skill directory is reached through a symlink', async (context) => {
  await withPlanDir(goodFiles(), async (dir, root) => {
    const linkedSkill = join(root, 'linked-skill');
    try {
      await symlink(dirname(dirname(SCRIPT)), linkedSkill, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error.code === 'EPERM') return context.skip('symlinks are not permitted here');
      throw error;
    }
    const result = runCli([dir], join(linkedSkill, 'scripts', 'check-review.mjs'));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 diagram/);
  });
});
