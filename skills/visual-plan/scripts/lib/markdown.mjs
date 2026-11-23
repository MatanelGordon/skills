/**
 * What check-review.mjs needs to know about a Markdown file: the words a
 * reader sees, the images and links it shows, and the ids it lists.
 * Node built-ins only.
 */

export const normaliseNewlines = (text) => text.replace(/\r\n?/g, '\n');
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The Markdown with fenced code blocks removed: samples are not content. */
export const withoutFencedCode = (markdown) => markdown.split('\n').reduce((state, line) => {
  const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
  if (state.fence) {
    const closes = marker && marker[0] === state.fence[0] && marker.length >= state.fence.length;
    return closes ? { ...state, fence: null } : state;
  }
  return marker ? { ...state, fence: marker } : { ...state, lines: [...state.lines, line] };
}, { fence: null, lines: [] }).lines.join('\n');

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const INLINE_CODE = /(`+)[^`\n]+?\1/g;

/** The Markdown without fenced code and HTML comments: what renders as content. */
export const withoutCodeOrComments = (markdown) => withoutFencedCode(normaliseNewlines(markdown)).replace(HTML_COMMENT, ' ');

/** As above, and without inline code spans: what renders as markup rather than as a sample. */
export const renderedMarkup = (markdown) => withoutCodeOrComments(markdown).replace(INLINE_CODE, ' ');

const REFERENCE_DEFINITION = /^ {0,3}\[([^\]\n]{1,400})\]:[ \t]*(?:<([^>\n]+)>|(\S+))/gm;
const normaliseLabel = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();

/** Reference-style link definitions, `[label]: target`, as a map from label to target. */
export const referenceDefinitions = (markdown) => new Map(
  [...renderedMarkup(markdown).matchAll(REFERENCE_DEFINITION)]
    .map((match) => [normaliseLabel(match[1]), match[2] ?? match[3]]),
);

// Alt text, link text and labels are capped at 400 characters so a line of unclosed brackets stays linear.
const WORD = /[\p{L}\p{N}]+(?:[’'._/-][\p{L}\p{N}]+)*/gu;
const isTableRule = (line) => /^[ \t|:-]+$/.test(line) && line.includes('-');

/**
 * Words a reader sees. Link targets, image alt text, comments, HTML tags,
 * reference definitions and table rules are not counted; a path or a
 * hyphenated term is one word.
 */
export function countWords(markdown) {
  const visible = normaliseNewlines(markdown)
    .replace(HTML_COMMENT, ' ')
    .replace(/^ {0,3}\[[^\]\n]{1,400}\]:.*$/gm, ' ')
    .replace(/!\[[^\]\n]{0,400}\](?:\([^)\n]{0,800}\)|\[[^\]\n]{0,400}\])?/g, ' ')
    .replace(/\[([^\]\n]{0,400})\](?:\([^)\n]{0,800}\)|\[[^\]\n]{0,400}\])/g, '$1')
    .replace(/<[^<>\n]{1,400}>/g, ' ')
    .split('\n')
    .map((line) => (isTableRule(line) ? ' ' : line))
    .join('\n');
  return (visible.match(WORD) ?? []).length;
}

const LINK_DESTINATION = String.raw`\s*(?:<([^>\n]{1,800})>|([^\s()<>]{1,800}))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]{0,800}\)))?\s*\)`;
const INLINE_IMAGE = new RegExp(String.raw`!\[[^\]\n]{0,400}\]\(${LINK_DESTINATION}`, 'g');
const REFERENCE_IMAGE = /!\[([^\]\n]{0,400})\](?:\[([^\]\n]{0,400})\])?(?!\()/g;
const HTML_IMAGE = /<(?:img|source)\b[^>]*?\b(?:src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
const srcsetUrls = (value) => value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);

/** Every image target the rendered Markdown shows, in document order; code and comments excluded. */
export function imageTargets(markdown) {
  const text = renderedMarkup(markdown);
  const definitions = referenceDefinitions(markdown);
  const inline = [...text.matchAll(INLINE_IMAGE)].map((match) => ({ index: match.index, targets: [match[1] ?? match[2]] }));
  const referenced = [...text.matchAll(REFERENCE_IMAGE)].flatMap((match) => {
    const target = definitions.get(normaliseLabel(match[2] || match[1]));
    return target ? [{ index: match.index, targets: [target] }] : [];
  });
  const html = [...text.matchAll(HTML_IMAGE)].map((match) => ({ index: match.index, targets: srcsetUrls(match[1] ?? match[2] ?? match[3]) }));
  return [...inline, ...referenced, ...html]
    .sort((left, right) => left.index - right.index)
    .flatMap((image) => image.targets);
}

const PLAN_TARGET = /^(?:\.\/)?plan\.md(?:[#?].*)?$/;
const INLINE_LINK = new RegExp(String.raw`(?<!!)\[[^\]\n]{0,400}\]\(${LINK_DESTINATION}`, 'g');
const REFERENCE_LINK = /(?<!!)\[([^\]\n]{1,400})\](?:\[([^\]\n]{0,400})\])?(?![(:])/g;
const HTML_LINK = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

/** True when the rendered Markdown links to plan.md beside it. */
export function linksPlan(markdown) {
  const text = renderedMarkup(markdown);
  const definitions = referenceDefinitions(markdown);
  const targets = [
    ...[...text.matchAll(INLINE_LINK)].map((match) => match[1] ?? match[2]),
    ...[...text.matchAll(REFERENCE_LINK)].map((match) => definitions.get(normaliseLabel(match[2] || match[1]))),
    ...[...text.matchAll(HTML_LINK)].map((match) => match[1] ?? match[2] ?? match[3]),
  ];
  return targets.some((target) => target && PLAN_TARGET.test(target.trim()));
}

/** True when inline <svg> markup would reach the renderer. */
export const hasInlineSvg = (markdown) => /<svg[\s>/]/i.test(renderedMarkup(markdown));

const HEADING = /^(#{1,6})\s/;
const TOP_LEVEL_BULLET = /^ ?(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const TABLE_ROW = /^\s*\|\s*(.*)$/;
// An id leads an entry when it is followed by ":", "(", a table bar, a dash, or the end of the line,
// so "Q3 2027" in a table of quarters is not taken for a question.
const leadingId = (pattern) => new RegExp(
  String.raw`^(?:\*\*|__|\`|\[)?(${pattern.source})(?:\*\*|__|\`)?(?=\]\(|\s*(?:\||:|\(|$)|\s+[—–-]\s)`,
);
const QUESTION_ID = leadingId(/Q\d+/);
const ADR_ID = leadingId(/ADR-\d+/);

/** Ids that open a top-level bullet or a table row, in order, without repeats. */
const leadingIds = (lines, pattern) => [...new Set(lines.flatMap((line) => {
  const entry = TOP_LEVEL_BULLET.exec(line)?.[1] ?? TABLE_ROW.exec(line)?.[1] ?? '';
  const id = pattern.exec(entry)?.[1];
  return id ? [id] : [];
}))];

const contentLines = (markdown) => withoutCodeOrComments(markdown).split('\n');

/** The lines under the first heading that matches, up to the next heading of the same or a higher level. */
const sectionLines = (lines, title) => {
  const start = lines.findIndex((line) => title.test(line));
  if (start === -1) return [];
  const level = HEADING.exec(lines[start])[1].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => (HEADING.exec(line)?.[1].length ?? Infinity) <= level);
  return end === -1 ? rest : rest.slice(0, end);
};

/** Question ids (Q1, Q2, …) that open a top-level bullet or a table row anywhere in the Markdown. */
export const leadingQuestionIds = (markdown) => leadingIds(contentLines(markdown), QUESTION_ID);

/**
 * The ids a plan defines: its questions (Q<n>, normally under "Risks and
 * unknowns") and the ADRs listed under its "Decisions" heading.
 */
export function planIds(planMarkdown) {
  const lines = contentLines(planMarkdown);
  return {
    questions: leadingIds(lines, QUESTION_ID),
    decisions: leadingIds(sectionLines(lines, /^#{1,6}\s+Decisions\b/i), ADR_ID),
  };
}

/** True when the id appears as a whole word in the rendered Markdown (comments and fences excluded). */
export const mentionsId = (markdown, id) => new RegExp(String.raw`(?<![A-Za-z0-9-])${escapeRegex(id)}(?![A-Za-z0-9-])`)
  .test(withoutCodeOrComments(markdown));
