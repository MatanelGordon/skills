#!/usr/bin/env node
/**
 * Checks a plan folder written by the visual-plan skill: plan.md for the agent,
 * review.md for the user, and the SVG diagrams the review links.
 *
 * Usage: node check-review.mjs <plan-folder> [--json] [--max-words <n>]
 * Exit:  0 clean, 1 findings, 64 bad invocation.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MAX_WORDS = 500;

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE = 64;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PREDEFINED_ENTITIES = new Set(['lt', 'gt', 'amp', 'apos', 'quot']);
const FORBIDDEN_ELEMENTS = Object.freeze({
  script: 'remove <script>: a diagram shown as an image never runs it',
  foreignObject: 'remove <foreignObject>: draw with SVG shapes and <text>, embedded HTML does not survive being shown as an image',
});
const EXCERPT_LENGTH = 24;

class UsageError extends Error {}

const normaliseNewlines = (text) => text.replace(/\r\n?/g, '\n');
const toPosix = (path) => path.replaceAll('\\', '/');
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const excerpt = (text, position) => text.slice(position, position + EXCERPT_LENGTH).replace(/\s+/g, ' ').trim();
const finding = (code, message) => ({ code, message });

// --- Markdown -------------------------------------------------------------

/** The Markdown with fenced code blocks removed: samples are not content. */
const withoutFencedCode = (markdown) => markdown.split('\n').reduce((state, line) => {
  const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
  if (state.fence) {
    const closes = marker && marker[0] === state.fence[0] && marker.length >= state.fence.length;
    return closes ? { ...state, fence: null } : state;
  }
  return marker ? { ...state, fence: marker } : { ...state, lines: [...state.lines, line] };
}, { fence: null, lines: [] }).lines.join('\n');

const WORD = /[\p{L}\p{N}]+(?:[’'._/-][\p{L}\p{N}]+)*/gu;

/**
 * Words a reader sees. Link targets, image alt text, comments, HTML tags and
 * table rules are not counted; a path or a hyphenated term is one word.
 */
export function countWords(markdown) {
  const visible = normaliseNewlines(markdown)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/gm, ' ');
  return (visible.match(WORD) ?? []).length;
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const HTML_IMAGE = /<(?:img|source)\b[^>]*?\b(?:src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const srcsetUrls = (value) => value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);

/** Every image target in the Markdown, in document order, outside code blocks. */
export function imageTargets(markdown) {
  const text = withoutFencedCode(normaliseNewlines(markdown));
  const markdownImages = [...text.matchAll(MARKDOWN_IMAGE)].map((match) => ({ index: match.index, targets: [match[1]] }));
  const htmlImages = [...text.matchAll(HTML_IMAGE)].map((match) => ({ index: match.index, targets: srcsetUrls(match[1] ?? match[2]) }));
  return [...markdownImages, ...htmlImages]
    .sort((left, right) => left.index - right.index)
    .flatMap((image) => image.targets);
}

const HEADING = /^(#{1,6})\s/;
const TOP_LEVEL_BULLET = /^ {0,1}(?:[-*+]|\d+[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|\s*(.*)$/;
const leadingId = (pattern) => new RegExp(`^(?:\\*\\*|__|\`)?(${pattern.source})(?![\\w-])`);
const QUESTION_ID = leadingId(/Q\d+/);
const ADR_ID = leadingId(/ADR-\d+/);

/** Ids that open a top-level bullet or a table row, in order, without repeats. */
const leadingIds = (lines, pattern) => [...new Set(lines.flatMap((line) => {
  const entry = TOP_LEVEL_BULLET.exec(line)?.[1] ?? TABLE_ROW.exec(line)?.[1] ?? '';
  const id = pattern.exec(entry)?.[1];
  return id ? [id] : [];
}))];

const contentLines = (markdown) => withoutFencedCode(normaliseNewlines(markdown)).split('\n');

/** The lines under the first heading that matches, up to the next heading of the same or a higher level. */
const sectionLines = (lines, title) => {
  const start = lines.findIndex((line) => title.test(line));
  if (start === -1) return [];
  const level = HEADING.exec(lines[start])[1].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => (HEADING.exec(line)?.[1].length ?? Infinity) <= level);
  return end === -1 ? rest : rest.slice(0, end);
};

/** Open-question ids (Q1, Q2, …) that open a top-level bullet or a table row anywhere in the Markdown. */
export const leadingQuestionIds = (markdown) => leadingIds(contentLines(markdown), QUESTION_ID);

/**
 * The ids a plan defines: its open questions (Q<n>, normally under "Risks and
 * unknowns") and the ADRs listed under its "Decisions" heading.
 */
export function planIds(planMarkdown) {
  const lines = contentLines(planMarkdown);
  return {
    questions: leadingIds(lines, QUESTION_ID),
    decisions: leadingIds(sectionLines(lines, /^#{1,6}\s+Decisions\b/i), ADR_ID),
  };
}

// --- XML well-formedness ----------------------------------------------------

const matchAt = (pattern, text, position) => {
  const sticky = new RegExp(pattern.source, 'y');
  sticky.lastIndex = position;
  return sticky.exec(text);
};
const NAME = /[A-Za-z_:][\w:.-]*/;
const ATTRIBUTE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const CLOSING_TAG = /<\/([^\s<>/]+)\s*>/;
const AMPERSAND = /&([^;\s<&]{0,32})(;?)/g;

/** The first "&" in the text that is not a reference XML understands, or null. */
function badReference(text) {
  for (const match of text.matchAll(AMPERSAND)) {
    const [whole, body, semicolon] = match;
    const isNumeric = /^#\d+$/.test(body) || /^#x[0-9A-Fa-f]+$/.test(body);
    if (semicolon && (isNumeric || PREDEFINED_ENTITIES.has(body))) continue;
    if (semicolon && /^[A-Za-z_][\w.-]*$/.test(body)) {
      return `${whole} is not defined in SVG: write the character itself or a numeric reference such as &#160;`;
    }
    return `a raw "&" near "${excerpt(text, match.index)}": write &amp;`;
  }
  return null;
}

/** Reads one start tag at `position`. Returns the element and where it ends, or a problem. */
function readStartTag(text, position) {
  const name = matchAt(NAME, text, position + 1)?.[0];
  if (!name) return { problem: `a raw "<" in text near "${excerpt(text, position)}": write &lt;` };
  let cursor = position + 1 + name.length;
  let attributes = {};
  for (;;) {
    const gap = matchAt(/\s*/, text, cursor)[0].length;
    cursor += gap;
    if (text.startsWith('/>', cursor)) return { element: { name, attributes }, selfClosing: true, end: cursor + 2 };
    if (text[cursor] === '>') return { element: { name, attributes }, selfClosing: false, end: cursor + 1 };
    if (cursor >= text.length) return { problem: `<${name}> is never closed with ">"` };
    const attribute = matchAt(ATTRIBUTE, text, cursor);
    if (!attribute) {
      const bare = matchAt(NAME, text, cursor)?.[0];
      return {
        problem: bare
          ? `attribute ${bare} of <${name}> needs a value in quotes: ${bare}="…"`
          : `unexpected "${text[cursor]}" inside <${name}>: the tag is not closed`,
      };
    }
    const [whole, attributeName, doubleQuoted, singleQuoted] = attribute;
    const value = doubleQuoted ?? singleQuoted;
    if (gap === 0) return { problem: `<${name}> needs a space before attribute ${attributeName}` };
    if (Object.hasOwn(attributes, attributeName)) return { problem: `attribute ${attributeName} appears twice on <${name}>` };
    if (value.includes('<')) return { problem: `attribute ${attributeName} of <${name}> contains a raw "<": write &lt;` };
    const reference = badReference(value);
    if (reference) return { problem: reference };
    attributes = { ...attributes, [attributeName]: value };
    cursor += whole.length;
  }
}

/** Skips a block that ends with `terminator`, such as a comment. */
const skipBlock = (text, state, terminator, label) => {
  const end = text.indexOf(terminator, state.position);
  return end === -1 ? { problem: `a ${label} is never closed` } : { ...state, position: end + terminator.length };
};

/** One step of the scan: returns the next state, or `{ problem }`. */
function scanStep(text, state) {
  const { position, open, elements, roots } = state;
  if (text[position] !== '<') {
    const next = text.indexOf('<', position);
    const stop = next === -1 ? text.length : next;
    const chunk = text.slice(position, stop);
    if (open.length === 0 && chunk.trim() !== '') {
      return { problem: roots === 0 ? 'no root element: the file must start with <svg …>' : 'text outside the root element' };
    }
    const reference = badReference(chunk);
    return reference ? { problem: reference } : { ...state, position: stop };
  }
  if (text.startsWith('<!--', position)) return skipBlock(text, state, '-->', 'comment');
  if (text.startsWith('<![CDATA[', position)) return skipBlock(text, state, ']]>', 'CDATA section');
  if (text.startsWith('<?', position)) return skipBlock(text, state, '?>', 'processing instruction');
  if (text.startsWith('<!', position)) return skipBlock(text, state, '>', 'declaration');
  if (text.startsWith('</', position)) {
    const closing = matchAt(CLOSING_TAG, text, position);
    if (!closing) return { problem: `a closing tag near "${excerpt(text, position)}" is not closed with ">"` };
    const expected = open.at(-1);
    if (!expected) return { problem: `</${closing[1]}> closes nothing` };
    if (closing[1] !== expected) return { problem: `</${closing[1]}> closes <${expected}>: expected </${expected}>` };
    return { ...state, position: position + closing[0].length, open: open.slice(0, -1) };
  }
  const tag = readStartTag(text, position);
  if (tag.problem) return tag;
  if (open.length === 0 && roots > 0) return { problem: 'more than one root element' };
  return {
    position: tag.end,
    open: tag.selfClosing ? open : [...open, tag.element.name],
    elements: [...elements, tag.element],
    roots: open.length === 0 ? roots + 1 : roots,
  };
}

/** Scans XML text. Returns its elements in order, or the first well-formedness problem. */
function scanXml(text) {
  let state = { position: text.charCodeAt(0) === 0xfeff ? 1 : 0, open: [], elements: [], roots: 0 };
  while (state.position < text.length) {
    const next = scanStep(text, state);
    if (next.problem) return { problem: next.problem, elements: [] };
    state = next;
  }
  if (state.open.length > 0) return { problem: `<${state.open.at(-1)}> is never closed`, elements: [] };
  if (state.roots === 0) return { problem: 'no root element: the file must start with <svg …>', elements: [] };
  return { problem: null, elements: state.elements };
}

const REMOTE_URL = /^(?:https?:)?\/\//i;
const REMOTE_IN_CSS = /@import\b|url\(\s*["']?(?:https?:)?\/\//i;
const LINK_ATTRIBUTES = ['href', 'xlink:href', 'src'];

/** Reasons this SVG text would not render as a self-contained diagram; empty when it is fine. */
export function findSvgProblems(svgText) {
  const text = normaliseNewlines(svgText);
  if (text.trim() === '') return ['the file is empty'];
  const { problem, elements } = scanXml(text);
  if (problem) return [`not well-formed XML: ${problem}`];
  const [root] = elements;
  if (root.name !== 'svg') return [`the root element is <${root.name}>, not <svg>`];
  const names = new Set(elements.map((element) => element.name));
  const hasRemoteLink = elements.some((element) => (
    LINK_ATTRIBUTES.some((attribute) => REMOTE_URL.test(element.attributes[attribute] ?? ''))
  ));
  return [
    ...(root.attributes.xmlns === SVG_NAMESPACE ? [] : [`the <svg> root needs xmlns="${SVG_NAMESPACE}", or it will not render as an image`]),
    ...(root.attributes.viewBox ? [] : ['the <svg> root needs a viewBox so the diagram scales with the page']),
    ...(names.has('title') ? [] : ['add a <title> that says what the diagram shows']),
    ...Object.entries(FORBIDDEN_ELEMENTS).filter(([name]) => names.has(name)).map(([, message]) => message),
    ...(hasRemoteLink || REMOTE_IN_CSS.test(text) ? ['remote reference found: a diagram must be self-contained (no http links, no @import)'] : []),
  ];
}

// --- The plan folder --------------------------------------------------------

const readText = (path) => (existsSync(path) && statSync(path).isFile() ? normaliseNewlines(readFileSync(path, 'utf8')) : null);
const isRemoteTarget = (target) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);
const PLAN_LINK = /(?<!!)\[[^\]]*\]\(\s*<?(?:\.\/)?plan\.md(?:[#?][^)\s>]*)?>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)|<a\b[^>]*\bhref\s*=\s*["'](?:\.\/)?plan\.md(?:[#?][^"']*)?["']/i;

const decodeTarget = (target) => {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

/** Where a local image target points, relative to the plan folder, in POSIX form. */
const locateTarget = (dir, target) => {
  const path = decodeTarget(target.replace(/[?#].*$/, ''));
  const location = toPosix(relative(dir, resolve(dir, path)));
  const inside = !path.startsWith('/') && location !== '' && !location.startsWith('..') && !isAbsolute(location);
  return { target, location, inside };
};

const svgFilesIn = (dir) => (existsSync(dir) && statSync(dir).isDirectory()
  ? readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.svg')).sort().map((name) => `diagrams/${name}`)
  : []);

function diagramFindings(dir, review) {
  const targets = imageTargets(review);
  const remote = targets.filter(isRemoteTarget);
  const located = targets.filter((target) => !isRemoteTarget(target)).map((target) => locateTarget(dir, target));
  const outside = located.filter((image) => !image.inside);
  const linked = [...new Set(located
    .filter((image) => image.inside && image.location.toLowerCase().endsWith('.svg'))
    .map((image) => image.location))];
  const missing = linked.filter((location) => readText(join(dir, location)) === null);
  const unlinked = svgFilesIn(join(dir, 'diagrams')).filter((location) => !linked.includes(location));
  const invalid = linked
    .filter((location) => !missing.includes(location))
    .map((location) => ({ location, problems: findSvgProblems(readText(join(dir, location))) }))
    .filter((diagram) => diagram.problems.length > 0);
  return {
    linked,
    findings: [
      ...(/<svg[\s>]/i.test(withoutFencedCode(review))
        ? [finding('inline-svg', 'review.md contains inline <svg>: GitHub strips it. Save the diagram as diagrams/<name>.svg and link it with ![what it shows](diagrams/<name>.svg)')]
        : []),
      ...remote.map((target) => finding('diagram-remote', `image ${target.slice(0, 60)} is not a file in this folder: save it under diagrams/ and link it by relative path`)),
      ...outside.map((image) => finding('diagram-outside', `image ${image.target} points outside the plan folder: keep diagrams in diagrams/ beside review.md`)),
      ...(linked.length === 0 ? [finding('no-diagram', 'review.md links no SVG diagram: add at least one, as ![what it shows](diagrams/<name>.svg)')] : []),
      ...missing.map((location) => finding('diagram-missing', `review.md links ${location}, which does not exist`)),
      ...unlinked.map((location) => finding('diagram-unlinked', `${location} is not linked from review.md: link it or delete it`)),
      ...invalid.map((diagram) => finding('svg-invalid', `${diagram.location}: ${diagram.problems.join('; ')}`)),
    ],
  };
}

function idFindings(plan, review) {
  const { questions, decisions } = planIds(plan);
  const ids = [...questions, ...decisions];
  const uncovered = ids.filter((id) => !new RegExp(`(?<![\\w-])${escapeRegex(id)}(?![\\w-])`).test(review));
  const unknown = leadingQuestionIds(review).filter((id) => !questions.includes(id));
  return {
    ids,
    findings: [
      ...(uncovered.length > 0
        ? [finding('id-uncovered', `review.md does not mention ${uncovered.join(', ')}: every open question and ADR in plan.md appears in the review under the same id`)]
        : []),
      ...(unknown.length > 0
        ? [finding('id-unknown', `review.md asks ${unknown.join(', ')}, which plan.md does not list: add the question to plan.md under "Risks and unknowns" first, or drop it`)]
        : []),
    ],
  };
}

/** Checks one plan folder against the visual-plan contract. Throws UsageError when it is not a folder. */
export function checkPlanDir(dir, { maxWords = DEFAULT_MAX_WORDS } = {}) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`${dir} is not a folder`);
  const plan = readText(join(dir, 'plan.md'));
  const review = readText(join(dir, 'review.md'));
  const hasPlan = Boolean(plan?.trim());
  const hasReview = Boolean(review?.trim());
  const fileFindings = [
    ...(hasPlan ? [] : [finding('plan-missing', 'plan.md is missing or empty: it is the file the implementing agent follows')]),
    ...(hasReview ? [] : [finding('review-missing', 'review.md is missing or empty: it is the file the user reads')]),
  ];
  if (!hasReview) return { ok: false, findings: fileFindings, words: 0, maxWords, diagrams: [], ids: [] };
  const matched = hasPlan ? idFindings(plan, review) : { ids: [], findings: [] };

  const diagrams = diagramFindings(dir, review);
  const words = countWords(review);
  const findings = [
    ...fileFindings,
    ...(PLAN_LINK.test(review) ? [] : [finding('plan-link', 'review.md does not link the full plan: add [plan.md](plan.md) near the top')]),
    ...diagrams.findings,
    ...(words > maxWords ? [finding('word-budget', `review.md has ${words} words; the budget is ${maxWords}. Keep the gist and leave the detail in plan.md`)] : []),
    ...matched.findings,
  ];
  return { ok: findings.length === 0, findings, words, maxWords, diagrams: diagrams.linked, ids: matched.ids };
}

// --- CLI --------------------------------------------------------------------

const USAGE = 'usage: node check-review.mjs <plan-folder> [--json] [--max-words <n>]';

function parseArguments(argv) {
  const parsed = argv.reduce((state, argument) => {
    if (state.expectsMaxWords) return { ...state, expectsMaxWords: false, maxWords: argument };
    if (argument === '--json') return { ...state, json: true };
    if (argument === '--max-words') return { ...state, expectsMaxWords: true };
    if (argument.startsWith('--')) throw new UsageError(`unknown option ${argument}`);
    if (state.dir !== null) throw new UsageError('give one plan folder');
    return { ...state, dir: argument };
  }, { dir: null, json: false, maxWords: String(DEFAULT_MAX_WORDS), expectsMaxWords: false });
  if (parsed.dir === null) throw new UsageError('no plan folder given');
  if (parsed.expectsMaxWords || !/^[1-9]\d*$/.test(parsed.maxWords)) throw new UsageError('--max-words needs a whole number above zero');
  return { dir: parsed.dir, json: parsed.json, maxWords: Number(parsed.maxWords) };
}

const report = (dir, result) => (result.ok
  ? `✔ ${dir}: plan.md + review.md, ${plural(result.diagrams.length, 'diagram')}, ${result.words}/${result.maxWords} words, ${plural(result.ids.length, 'id')} matched`
  : [
    ...result.findings.map((entry) => `✖ [${entry.code}] ${entry.message}`),
    `${plural(result.findings.length, 'problem')} in ${dir}`,
  ].join('\n'));

function main(argv) {
  try {
    const { dir, json, maxWords } = parseArguments(argv);
    const result = checkPlanDir(dir, { maxWords });
    process.stdout.write(`${json ? JSON.stringify({ dir, ...result }, null, 2) : report(dir, result)}\n`);
    process.exitCode = result.ok ? EXIT_OK : EXIT_FINDINGS;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`check-review: ${error.message}\n${USAGE}\n`);
    process.exitCode = EXIT_USAGE;
  }
}

function isEntryPoint(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    // A symlinked skill install leaves the link in argv[1], while import.meta.url names the real file.
    return realpathSync(argvPath) === realpathSync(modulePath);
  } catch {
    return resolve(argvPath) === modulePath;
  }
}

if (isEntryPoint(import.meta.url)) main(process.argv.slice(2));
