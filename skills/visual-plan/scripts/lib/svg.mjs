/**
 * Is an SVG file well-formed XML, and will it render on its own as an image?
 * A small scanner, Node built-ins only. It checks what makes a browser refuse
 * the file (unclosed or crossed tags, raw "&" or "<", undeclared namespace
 * prefixes, a misplaced XML declaration, "--" in a comment, characters XML
 * forbids) and what makes an image depend on something outside itself.
 */
import { normaliseNewlines } from './markdown.mjs';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PREDEFINED_ENTITIES = new Set(['lt', 'gt', 'amp', 'apos', 'quot']);
const FORBIDDEN_ELEMENTS = Object.freeze({
  script: 'remove <script>: a diagram shown as an image never runs it',
  foreignObject: 'remove <foreignObject>: draw with SVG shapes and <text>, embedded HTML does not survive being shown as an image',
});
const EXCERPT_LENGTH = 24;
const BUILT_IN_PREFIXES = new Set(['xml', 'xmlns']);

const excerpt = (text, position) => text.slice(position, position + EXCERPT_LENGTH).replace(/\s+/g, ' ').trim();
const matchAt = (pattern, text, position) => {
  const sticky = new RegExp(pattern.source, 'y');
  sticky.lastIndex = position;
  return sticky.exec(text);
};
const prefixOf = (name) => (name.includes(':') ? name.slice(0, name.indexOf(':')) : null);
const localName = (name) => name.slice(name.indexOf(':') + 1);

// A persistent stack: push and pop are O(1) and never change an existing stack.
const EMPTY = null;
const push = (stack, head) => ({ head, tail: stack, size: (stack?.size ?? 0) + 1 });
const toArray = (stack) => {
  // Local to this function: the stack itself is never changed.
  const items = [];
  for (let node = stack; node; node = node.tail) items.push(node.head);
  return items.reverse();
};

const NAME = /[A-Za-z_:][\w:.-]*/;
const ATTRIBUTE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const CLOSING_TAG = /<\/([^\s<>/]+)\s*>/;
const AMPERSAND = /&([^;\s<&]{0,32})(;?)/g;

/** True for a code point XML 1.0 allows in a document. */
const isXmlChar = (code) => code === 0x9 || code === 0xa || code === 0xd
  || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);

/** The code point of a numeric character reference body ("#160", "#xA0"), or null. */
const numericValue = (body) => {
  const decimal = /^#(\d+)$/.exec(body);
  if (decimal) return Number(decimal[1]);
  const hex = /^#x([0-9A-Fa-f]+)$/.exec(body);
  return hex ? Number.parseInt(hex[1], 16) : null;
};

/** The first "&" in the text that is not a reference XML understands, or null. */
function badReference(text) {
  for (const match of text.matchAll(AMPERSAND)) {
    const [whole, body, semicolon] = match;
    const code = numericValue(body);
    if (semicolon && code !== null) {
      if (isXmlChar(code)) continue;
      return `${whole} is a character XML does not allow`;
    }
    if (semicolon && PREDEFINED_ENTITIES.has(body)) continue;
    if (semicolon && /^[A-Za-z_][\w.-]*$/.test(body)) {
      return `${whole} is not defined in SVG: write the character itself or a numeric reference such as &#160;`;
    }
    return `a raw "&" near "${excerpt(text, match.index)}": write &amp;`;
  }
  return null;
}

/** A namespace problem for this name, or null. `prefixes` are the ones declared in scope. */
const undeclaredPrefix = (name, prefixes, where) => {
  const prefix = prefixOf(name);
  if (prefix === null || BUILT_IN_PREFIXES.has(prefix) || prefixes.has(prefix)) return null;
  const fix = prefix === 'xlink' ? ' (or use plain href, which SVG 2 reads)' : '';
  return `${where} uses the prefix ${prefix}: without xmlns:${prefix}="…" on an enclosing element the file is not valid XML${fix}`;
};

/** Reads one start tag at `position`. Returns the element and where it ends, or a problem. */
function readStartTag(text, position, inheritedPrefixes) {
  const name = matchAt(NAME, text, position + 1)?.[0];
  if (!name) return { problem: `a raw "<" in text near "${excerpt(text, position)}": write &lt;` };
  let cursor = position + 1 + name.length;
  let attributes = {};
  for (;;) {
    const gap = matchAt(/\s*/, text, cursor)[0].length;
    cursor += gap;
    const closesHere = text.startsWith('/>', cursor) || text[cursor] === '>';
    if (closesHere) {
      const declared = Object.keys(attributes).filter((key) => key.startsWith('xmlns:')).map((key) => key.slice(6));
      const prefixes = new Set([...inheritedPrefixes, ...declared]);
      const problem = undeclaredPrefix(name, prefixes, `<${name}>`)
        ?? Object.keys(attributes).map((key) => undeclaredPrefix(key, prefixes, `attribute ${key} of <${name}>`)).find(Boolean)
        ?? null;
      if (problem) return { problem };
      const selfClosing = text[cursor] === '/';
      return { element: { name, attributes }, prefixes, selfClosing, end: cursor + (selfClosing ? 2 : 1) };
    }
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

/** Skips a block from `position` to `terminator`; `check` may reject its body. */
const skipBlock = (text, state, opener, terminator, label, check = () => null) => {
  const end = text.indexOf(terminator, state.position + opener.length);
  if (end === -1) return { problem: `a ${label} is never closed` };
  const problem = check(text.slice(state.position + opener.length, end));
  return problem ? { problem } : { ...state, position: end + terminator.length };
};

const commentProblem = (body) => (body.includes('--') || body.endsWith('-')
  ? `a comment contains "--" near "${excerpt(body, Math.max(0, body.indexOf('-')))}": XML forbids it, use a single dash`
  : null);

function scanMarkup(text, state) {
  const { position, start } = state;
  if (text.startsWith('<!--', position)) return skipBlock(text, state, '<!--', '-->', 'comment', commentProblem);
  if (text.startsWith('<![CDATA[', position)) return skipBlock(text, state, '<![CDATA[', ']]>', 'CDATA section');
  if (text.startsWith('<?', position)) {
    const isDeclaration = /^<\?xml[\s?]/.test(text.slice(position, position + 6));
    if (isDeclaration && position !== start) return { problem: 'the <?xml …?> declaration must be the very first thing in the file' };
    return skipBlock(text, state, '<?', '?>', 'processing instruction');
  }
  if (text.startsWith('<!DOCTYPE', position)) {
    const end = text.indexOf('>', position);
    if (end !== -1 && text.slice(position, end).includes('[')) {
      return { problem: 'remove the DOCTYPE: a declaration with its own entity list is not supported here, and SVG needs none' };
    }
    return skipBlock(text, state, '<!DOCTYPE', '>', 'DOCTYPE');
  }
  if (text.startsWith('<!', position)) return { problem: `unexpected "<!" near "${excerpt(text, position)}"` };
  return null;
}

/** One step of the scan: returns the next state, or `{ problem }`. */
function scanStep(text, state) {
  const { position, open, elements, roots } = state;
  if (text[position] !== '<') {
    const next = text.indexOf('<', position);
    const stop = next === -1 ? text.length : next;
    const chunk = text.slice(position, stop);
    if (open === EMPTY && chunk.trim() !== '') {
      return { problem: roots === 0 ? 'no root element: the file must start with <svg …>' : 'text outside the root element' };
    }
    if (chunk.includes(']]>')) return { problem: 'the text "]]>" is not allowed outside a CDATA section: write ]]&gt;' };
    const reference = badReference(chunk);
    return reference ? { problem: reference } : { ...state, position: stop };
  }
  const markup = scanMarkup(text, state);
  if (markup) return markup;
  if (text.startsWith('</', position)) {
    const closing = matchAt(CLOSING_TAG, text, position);
    if (!closing) return { problem: `a closing tag near "${excerpt(text, position)}" is not closed with ">"` };
    const expected = open?.head.name;
    if (!expected) return { problem: `</${closing[1]}> closes nothing` };
    if (closing[1] !== expected) return { problem: `</${closing[1]}> closes <${expected}>: expected </${expected}>` };
    return { ...state, position: position + closing[0].length, open: open.tail };
  }
  const tag = readStartTag(text, position, open?.head.prefixes ?? new Set());
  if (tag.problem) return tag;
  if (open === EMPTY && roots > 0) return { problem: 'more than one root element' };
  return {
    ...state,
    position: tag.end,
    open: tag.selfClosing ? open : push(open, { name: tag.element.name, prefixes: tag.prefixes }),
    elements: push(elements, tag.element),
    roots: open === EMPTY ? roots + 1 : roots,
  };
}

/** Scans XML text. Returns its elements in order, or the first well-formedness problem. */
function scanXml(text) {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let state = { position: start, start, open: EMPTY, elements: EMPTY, roots: 0 };
  while (state.position < text.length) {
    const next = scanStep(text, state);
    if (next.problem) return { problem: next.problem, elements: [] };
    state = next;
  }
  if (state.open !== EMPTY) return { problem: `<${state.open.head.name}> is never closed`, elements: [] };
  if (state.roots === 0) return { problem: 'no root element: the file must start with <svg …>', elements: [] };
  return { problem: null, elements: toArray(state.elements) };
}

const isOwnReference = (value) => value.startsWith('#') || /^data:/i.test(value);
const CSS_REFERENCE = /@import\b|url\(\s*["']?([^"')\s]*)/gi;

/** References to anything outside the file: link attributes, CSS url() and @import, stylesheet instructions. */
function outsideReferences(text, elements) {
  const linked = elements.flatMap((element) => Object.entries(element.attributes)
    .filter(([name]) => ['href', 'src'].includes(localName(name)))
    .map(([, value]) => value.trim())
    .filter((value) => value && !isOwnReference(value)));
  const css = [
    ...[...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    ...elements.map((element) => element.attributes.style ?? ''),
  ].flatMap((sheet) => [...sheet.matchAll(CSS_REFERENCE)]
    .filter((match) => match[0].startsWith('@') || !isOwnReference(match[1] ?? ''))
    .map((match) => (match[0].startsWith('@') ? '@import' : `url(${match[1]})`)));
  const stylesheets = /<\?xml-stylesheet\b/.test(text) ? ['<?xml-stylesheet?>'] : [];
  return [...linked, ...css, ...stylesheets];
}

const VIEW_BOX = /^\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)[\s,]+([\d.]+(?:e-?\d+)?)[\s,]+([\d.]+(?:e-?\d+)?)\s*$/i;
const hasUsableViewBox = (value) => {
  const match = VIEW_BOX.exec(value ?? '');
  return Boolean(match) && Number(match[3]) > 0 && Number(match[4]) > 0;
};
const titleText = (text) => /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]
  .replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? '';

/** Reasons this SVG text would not render as a self-contained diagram; empty when it is fine. */
export function findSvgProblems(svgText) {
  const text = normaliseNewlines(svgText);
  if (text.trim() === '') return ['the file is empty'];
  const { problem, elements } = scanXml(text);
  if (problem) return [`not well-formed XML: ${problem}`];
  const [root] = elements;
  if (localName(root.name) !== 'svg') return [`the root element is <${root.name}>, not <svg>`];
  const names = new Set(elements.map((element) => localName(element.name)));
  const outside = outsideReferences(text, elements);
  return [
    ...(root.attributes.xmlns === SVG_NAMESPACE ? [] : [`the <svg> root needs xmlns="${SVG_NAMESPACE}", or it will not render as an image`]),
    ...(hasUsableViewBox(root.attributes.viewBox) ? [] : ['the <svg> root needs a viewBox of four numbers, such as viewBox="0 0 720 240", so the diagram scales with the page']),
    ...(titleText(text) ? [] : ['add a <title> with text that says what the diagram shows']),
    ...Object.entries(FORBIDDEN_ELEMENTS).filter(([name]) => names.has(name)).map(([, message]) => message),
    ...(outside.length > 0
      ? [`it refers to something outside the file (${outside.slice(0, 3).join(', ')}): a diagram shown as an image loads nothing else, so draw it inline`]
      : []),
  ];
}
