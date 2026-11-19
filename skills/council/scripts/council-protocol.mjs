#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_BRIEF_SECTIONS = ['DECISION', 'OPTIONS', 'CONSTRAINTS', 'EVIDENCE', 'STAKES'];
const REQUIRED_MEMBER_SLOTS = ['VOTE', 'POSITION', 'ARGUMENT'];
const MEMBER_SLOTS = [
  'STEELMAN',
  'REACTING TO',
  'VOTE',
  'POSITION',
  'ARGUMENT',
  'STRONGEST OBJECTION TO MY OWN POSITION',
  'CONFIDENCE',
  'WOULD CHANGE MY MIND',
  'PREMISE CHALLENGE',
];
const CASTING_MEMBERS = new Set(['Skeptic', 'Pragmatist', 'Visionary', 'Hupert-Graph', 'MLK', 'Maintainer', 'Migrator']);
const STRATEGY_KINDS = new Set(['technical-strategy', 'mission-prioritization']);
const FEATURE_KEYS = ['touchesProduction', 'futureUnlock', 'operatedByOthers', 'platformSurface', 'prioritizesMission', 'domainModelDispute', 'rewriteOrPort'];

export const ROUND_ONE_INSTRUCTIONS = `Respond independently. You have not seen any other member's answer. Follow
your charter and tie-break. Do not answer from a generic balanced viewpoint.
Use every output slot exactly once.

NUMERIC EVIDENCE RULE:
Every number in ARGUMENT must use exactly one source tag:
- (measured: from what) for measured evidence
- (code-read: path or symbol) only when that exact number appears directly in code or configuration
- (estimate) for an inference, unverified documentation, or missing evidence
Absence of evidence never establishes a numeric zero, baseline, current ceiling, or measured result.

VOTE: option letter from the brief
POSITION: one sentence
ARGUMENT: max 200 words, strictly from your charter's lens
STRONGEST OBJECTION TO MY OWN POSITION: one sentence
CONFIDENCE: n/5
WOULD CHANGE MY MIND: one specific observable piece of evidence
PREMISE CHALLENGE: one sentence, or the literal word NONE`;

export const ANTI_CONFORMITY = `ANTI-CONFORMITY RULE:
Agreement discovered independently is signal.
Agreement produced by reading others is noise.
Do not soften your charter to match the room.`;

export const ROUND_TWO_INSTRUCTIONS = `STEELMAN: label + one sentence
REACTING TO: label(s)

NUMERIC EVIDENCE RULE:
Every number in ARGUMENT must use exactly one source tag:
- (measured: from what) for measured evidence
- (code-read: path or symbol) only when that exact number appears directly in code or configuration
- (estimate) for an inference, unverified documentation, or missing evidence
Absence of evidence never establishes a numeric zero, baseline, current ceiling, or measured result.

VOTE: option letter from the brief
POSITION: one sentence
ARGUMENT: max 200 words, strictly from your charter's lens
STRONGEST OBJECTION TO MY OWN POSITION: one sentence
CONFIDENCE: n/5
WOULD CHANGE MY MIND: one specific observable piece of evidence
PREMISE CHALLENGE: one sentence, or the literal word NONE`;

export const LATE_JOINER_INSTRUCTION = 'You were added because the council lacks your view. You have read a settled conversation. If you have grounds to disagree, you MUST disagree; agreement without new grounds is a failed contribution from you specifically.';

export class CouncilProtocolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CouncilProtocolError';
    this.code = code;
    this.details = details;
  }
}

function parseSections(text) {
  const sections = {};
  let current = null;
  for (const line of String(text).split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z -]+):\s*(.*)$/u.exec(line);
    if (match && REQUIRED_BRIEF_SECTIONS.includes(match[1])) {
      current = match[1];
      sections[current] = match[2].trim();
    } else if (current && line.trim()) {
      sections[current] = `${sections[current]} ${line.trim()}`.trim();
    }
  }
  return sections;
}

function parseOptions(text) {
  const options = [];
  const pattern = /(?:^|\s)([A-E])\)\s+(.+?)(?=\s+[A-E]\)\s+|$)/gsu;
  for (const match of String(text).matchAll(pattern)) {
    options.push({ letter: match[1], text: match[2].trim() });
  }
  return options;
}

export function validateDecisionBrief(text) {
  const value = String(text ?? '').trim();
  const sections = parseSections(value);
  const errors = [];
  const wordCount = value ? value.split(/\s+/u).length : 0;

  for (const section of REQUIRED_BRIEF_SECTIONS) {
    if (!sections[section]) errors.push({ code: 'MISSING_SECTION', section });
  }
  if (wordCount > 300) errors.push({ code: 'WORD_LIMIT', wordCount, maximum: 300 });

  const options = parseOptions(sections.OPTIONS ?? '');
  const letters = options.map(({ letter }) => letter);
  if (options.length < 2 || options.length > 5 || new Set(letters).size !== options.length) {
    errors.push({ code: 'OPTION_COUNT', count: options.length, minimum: 2, maximum: 5 });
  }
  const expectedLetters = Array.from({ length: options.length }, (_, index) => String.fromCharCode(65 + index));
  if (options.length && letters.some((letter, index) => letter !== expectedLetters[index])) {
    errors.push({ code: 'OPTION_SEQUENCE', letters });
  }

  const evidence = sections.EVIDENCE ?? '';
  if (evidence) {
    for (const [index, source] of evidence.split(';').map((item) => item.trim()).filter(Boolean).entries()) {
      const tags = [...source.matchAll(/\((measured|code-read|unverified-docs)(?::[^)]+)?\)/gu)];
      if (tags.length !== 1) errors.push({ code: 'EVIDENCE_TAG', source: index + 1 });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    sections,
    options,
    optionLetters: letters,
    wordCount,
  };
}

export function routeCouncil(input) {
  const {
    decisionKind,
    consequential,
    hardToReverse,
    optionCount,
    hasTradeoff,
    canSpawn,
    explicitRequest,
  } = input ?? {};

  const booleanInputs = { consequential, hardToReverse, hasTradeoff, canSpawn, explicitRequest };
  if (Object.values(booleanInputs).some((value) => typeof value !== 'boolean') || !Number.isInteger(optionCount)) {
    throw new CouncilProtocolError('INVALID_ROUTE_INPUT', 'Routing booleans must be booleans and optionCount must be an integer.');
  }

  if (!['architecture', ...STRATEGY_KINDS].includes(decisionKind)) return { run: false, code: 'OUT_OF_SCOPE' };
  if (!Number.isInteger(optionCount) || optionCount < 2) return { run: false, code: 'INSUFFICIENT_OPTIONS' };
  if (optionCount > 5) return { run: false, code: 'TOO_MANY_OPTIONS' };
  if (!hasTradeoff) return { run: false, code: 'NO_REAL_TRADEOFF' };
  if (!consequential) return { run: false, code: 'LOW_STAKES' };
  if (!hardToReverse) return { run: false, code: 'EASY_TO_REVERSE' };
  if (!canSpawn) return { run: false, code: 'NO_ISOLATED_SUBAGENTS' };
  if (decisionKind === 'architecture') {
    return { run: true, code: explicitRequest ? 'EXPLICIT_REQUEST' : 'AUTO_ARCHITECTURE' };
  }
  if (!explicitRequest) return { run: false, code: 'EXPLICIT_REQUEST_REQUIRED' };
  return { run: true, code: 'EXPLICIT_REQUEST' };
}

export function selectMembers(features = {}) {
  if (!features || typeof features !== 'object' || Array.isArray(features)
    || FEATURE_KEYS.some((key) => key in features && typeof features[key] !== 'boolean')) {
    throw new CouncilProtocolError('INVALID_FEATURES', 'Persona feature flags must be booleans.');
  }
  const selected = ['Skeptic', 'Pragmatist'];
  const candidates = [
    ['Migrator', features.touchesProduction === true],
    ['MLK', features.futureUnlock === true],
    ['Maintainer', features.operatedByOthers === true],
    ['Hupert-Graph', features.platformSurface === true || features.prioritizesMission === true],
    ['Visionary', features.domainModelDispute === true || features.rewriteOrPort === true],
  ];
  for (const [member, matches] of candidates) {
    if (matches && selected.length < 6) selected.push(member);
  }
  if (selected.length === 2) selected.push('Maintainer');
  return selected;
}

export function parseMemberResponse(text, { validOptions = [] } = {}) {
  const slots = {};
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    const match = /^([A-Z][A-Z '’-]*):\s*(.*)$/u.exec(line);
    if (match && MEMBER_SLOTS.includes(match[1])) {
      current = match[1];
      slots[current] = match[2].trim();
    } else if (current) {
      slots[current] = `${slots[current]}\n${line}`.trimEnd();
    }
  }

  const errors = [];
  for (const slot of REQUIRED_MEMBER_SLOTS) {
    if (!slots[slot]?.trim()) errors.push(`MISSING_${slot.replaceAll(' ', '_')}`);
  }
  if (slots.VOTE) {
    slots.VOTE = slots.VOTE.trim().toUpperCase();
    if (validOptions.length && !validOptions.includes(slots.VOTE)) errors.push('INVALID_VOTE');
  }
  const confidenceMatch = /^([1-5])\/5$/u.exec(slots.CONFIDENCE ?? '');
  const confidence = confidenceMatch ? Number(confidenceMatch[1]) : null;

  return { usable: errors.length === 0, errors, slots, confidence };
}

export function classifyRoundOne(entries, { validOptions = [] } = {}) {
  if (!Array.isArray(validOptions)
    || validOptions.length < 2
    || validOptions.length > 5
    || new Set(validOptions).size !== validOptions.length
    || validOptions.some((option) => !/^[A-E]$/u.test(option))) {
    throw new CouncilProtocolError('INVALID_OPTIONS', 'Round-one classification requires 2-5 unique option letters.');
  }
  if (!Array.isArray(entries)) {
    throw new CouncilProtocolError('INVALID_RESPONSES', 'Round-one entries must be an array.');
  }
  const parsed = (entries ?? []).map((entry) => ({
    persona: entry.persona,
    text: entry.text,
    ...parseMemberResponse(entry.text, { validOptions }),
  }));
  const usable = parsed.filter((entry) => entry.usable);
  const personas = parsed.map((entry) => entry.persona);
  if (new Set(personas).size !== personas.length) {
    return { state: 'ABORT', reason: 'DUPLICATE_PERSONA', usable, parsed };
  }
  if (usable.length < 3) return { state: 'ABORT', usable, parsed };

  const vote = usable[0].slots.VOTE;
  const converged = usable.every((entry) => entry.slots.VOTE === vote && entry.confidence !== null && entry.confidence >= 4);
  return { state: converged ? 'CONVERGED' : 'NOT_CONVERGED', usable, parsed, vote: converged ? vote : null };
}

export function validateCastingDirector(text) {
  const value = String(text ?? '').trim();
  if (value === 'NONE NEEDED') return { member: null, valid: true };
  const match = /^MISSING ROLE: (.+)$/u.exec(value);
  if (!match || !CASTING_MEMBERS.has(match[1])) return { member: null, valid: false };
  return { member: match[1], valid: true };
}

function seedNumber(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed) {
  let state = seedNumber(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mappingsEqual(left, right) {
  if (!left || !right) return false;
  const keys = Object.keys(left).sort();
  const otherKeys = Object.keys(right).sort();
  return keys.length === otherKeys.length && keys.every((key, index) => key === otherKeys[index] && left[key] === right[key]);
}

function validateMapping(mapping, personas) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return false;
  const keys = Object.keys(mapping).sort();
  const expected = [...personas].sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && new Set(Object.values(mapping)).size === expected.length
    && Object.values(mapping).every((label) => typeof label === 'string' && label.length > 0);
}

export function anonymizeResponses(entries, { seed, previousMapping } = {}) {
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new CouncilProtocolError('INSUFFICIENT_RESPONSES', 'At least two responses are required for anonymization.');
  }
  const personas = entries.map((entry) => entry.persona);
  if (personas.some((persona) => typeof persona !== 'string' || !persona) || new Set(personas).size !== personas.length) {
    throw new CouncilProtocolError('DUPLICATE_PERSONA', 'Every response must have one unique persona.');
  }
  if (entries.some((entry) => typeof entry.text !== 'string' || !entry.text)) {
    throw new CouncilProtocolError('EMPTY_RESPONSE', 'Every anonymized response must contain text.');
  }
  if ((typeof seed !== 'string' && typeof seed !== 'number') || String(seed).length === 0) {
    throw new CouncilProtocolError('MISSING_SEED', 'An explicit seed is required so label assignment is reproducible.');
  }

  const labels = entries.map((_, index) => `R${index + 1}`);
  const shuffled = [...labels];
  const random = randomFromSeed(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const mapping = Object.fromEntries(personas.map((persona, index) => [persona, shuffled[index]]));
  if (mappingsEqual(mapping, previousMapping)) {
    const current = personas.map((persona) => mapping[persona]);
    personas.forEach((persona, index) => {
      mapping[persona] = current[(index + 1) % current.length];
    });
  }

  const responses = entries
    .map((entry) => ({ label: mapping[entry.persona], text: entry.text }))
    .sort((left, right) => left.label.localeCompare(right.label, 'en', { numeric: true }));
  return { mapping, responses };
}

function formatAnonymousPacket(anonymous) {
  if (!anonymous || !Array.isArray(anonymous.responses) || anonymous.responses.length < 2) {
    throw new CouncilProtocolError('INVALID_ANONYMOUS_PACKET', 'Anonymous responses are required.');
  }
  const labels = anonymous.responses.map((entry) => entry.label);
  if (anonymous.responses.some((entry) => typeof entry.text !== 'string' || entry.text.length === 0)) {
    throw new CouncilProtocolError('EMPTY_RESPONSE', 'Every anonymous response must contain exact raw text.');
  }
  if (new Set(labels).size !== labels.length) {
    throw new CouncilProtocolError('DUPLICATE_LABEL', 'Every anonymous response needs a unique label.');
  }
  const mappedLabels = Object.values(anonymous.mapping ?? {});
  const sortedLabels = [...labels].sort();
  if (mappedLabels.length !== labels.length
    || new Set(mappedLabels).size !== mappedLabels.length
    || JSON.stringify([...mappedLabels].sort()) !== JSON.stringify(sortedLabels)) {
    throw new CouncilProtocolError('INVALID_MAPPING', 'The anonymous mapping must be a one-to-one match for the response labels.');
  }
  return [
    'ANONYMOUS ROUND-1 RESPONSES',
    ...anonymous.responses.map((entry) => `[${entry.label}]\n${entry.text}`),
  ].join('\n\n');
}

function validatePromptMember(member) {
  if (!member || typeof member.persona !== 'string'
    || !member.persona
    || typeof member.personaBlock !== 'string'
    || !member.personaBlock) {
    throw new CouncilProtocolError('INVALID_MEMBER', 'Every member needs a persona name and complete persona block.');
  }
}

function enforcePromptBudget(persona, text, maxPromptChars) {
  if (!Number.isInteger(maxPromptChars) || maxPromptChars <= 0) {
    throw new CouncilProtocolError('INVALID_BUDGET', 'maxPromptChars must be a positive integer.');
  }
  if (text.length > maxPromptChars) {
    throw new CouncilProtocolError(
      'PACKET_TOO_LARGE',
      `Complete prompt for ${persona} is ${text.length} characters; budget is ${maxPromptChars}.`,
      { persona, actual: text.length, maximum: maxPromptChars },
    );
  }
}

export function buildRoundOnePrompt({ brief, persona, personaBlock, maxPromptChars }) {
  const member = { persona, personaBlock };
  validatePromptMember(member);
  if (typeof brief !== 'string' || !brief) {
    throw new CouncilProtocolError('INVALID_BRIEF', 'A nonempty validated decision brief is required.');
  }
  const text = [personaBlock, brief, ROUND_ONE_INSTRUCTIONS].join('\n\n');
  enforcePromptBudget(persona, text, maxPromptChars);
  return { persona, text };
}

export function buildRoundTwoPrompts({
  brief,
  members,
  anonymous,
  maxPromptChars,
}) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new CouncilProtocolError('NO_ROUND_TWO_MEMBERS', 'At least one round-two member is required.');
  }
  members.forEach(validatePromptMember);
  if (typeof brief !== 'string' || !brief) {
    throw new CouncilProtocolError('INVALID_BRIEF', 'A nonempty validated decision brief is required.');
  }
  const packet = formatAnonymousPacket(anonymous);
  const prompts = members.map((member) => {
    const parts = [member.personaBlock, brief, packet, ANTI_CONFORMITY, ROUND_TWO_INSTRUCTIONS];
    if (member.lateJoiner) parts.push(LATE_JOINER_INSTRUCTION);
    const text = parts.join('\n\n');
    enforcePromptBudget(member.persona, text, maxPromptChars);
    return { persona: member.persona, text, lateJoiner: Boolean(member.lateJoiner) };
  });
  return { packet, prompts, mapping: anonymous.mapping };
}

export function auditNumericEvidence(argument) {
  const value = String(argument ?? '');
  const tagRanges = [...value.matchAll(/\((?:measured|code-read)(?::\s*[^)]+)?\)|\(estimate\)/gu)]
    .map((match) => [match.index, match.index + match[0].length]);
  const matches = [...value.matchAll(/\b\d+(?:\.\d+)?(?:x|%|[kKmMbB])?\b/gu)]
    .filter((match) => !tagRanges.some(([start, end]) => match.index >= start && match.index < end));
  const claims = [];
  const issues = [];
  for (const [index, match] of matches.entries()) {
    const end = matches[index + 1]?.index ?? value.length;
    const remainder = value.slice(match.index + match[0].length, end);
    const sentenceBoundary = remainder.search(/[.!?;](?:\s|$)|\n/u);
    const tail = sentenceBoundary === -1 ? remainder : remainder.slice(0, sentenceBoundary);
    const tags = [...tail.matchAll(/\((measured|code-read)(?::\s*([^)]+))?\)|\(estimate\)/gu)];
    const tag = tags[0];
    const kind = tag ? (tag[1] ?? 'estimate') : 'estimate';
    const detail = tag?.[2]?.trim() ?? null;
    const explicit = Boolean(tag);
    claims.push({ number: match[0], kind, detail, explicit });
    if (!explicit) issues.push({ code: 'UNTAGGED_NUMBER', number: match[0] });
    if (tags.length > 1) issues.push({ code: 'MULTIPLE_SOURCE_TAGS', number: match[0] });
    if ((kind === 'measured' || kind === 'code-read') && !detail) {
      issues.push({ code: 'MISSING_SOURCE_DETAIL', number: match[0], kind });
    }
  }
  return { claims, issues };
}

function responseEntriesFromLedger(round1) {
  return round1.map(({ persona, response: text }) => ({ persona, text }));
}

export function extractPersonaBlocks(markdown) {
  const text = String(markdown ?? '');
  const names = [...CASTING_MEMBERS, "Devil's Advocate"];
  const blocks = {};
  for (const name of names) {
    const marker = `### ${name}\n`;
    const start = text.indexOf(marker);
    if (start === -1) continue;
    const end = text.indexOf('\n### ', start + marker.length);
    blocks[name] = text.slice(start, end === -1 ? text.length : end).trim();
  }
  return blocks;
}

const nonemptyString = (value) => typeof value === 'string' && value.trim().length > 0;

export function validateLiveSmokeLedger(ledger, manifest, { personaBlocks } = {}) {
  const errors = [];
  const fail = (code, details = {}) => errors.push({ code, ...details });
  const expectedMembers = manifest?.expectedMembers ?? [];
  const briefValidation = validateDecisionBrief(manifest?.decisionBrief ?? '');
  const validOptions = briefValidation.optionLetters;
  if (!briefValidation.ok) fail('INVALID_MANIFEST_BRIEF');
  if (!personaBlocks || typeof personaBlocks !== 'object' || Array.isArray(personaBlocks)) fail('MISSING_PERSONA_BLOCKS');
  if (ledger?.decisionBrief !== manifest?.decisionBrief) fail('BRIEF_MISMATCH');

  const casting = validateCastingDirector(ledger?.castingDirectorOutput);
  if (!casting.valid) fail('INVALID_CASTING_OUTPUT');
  if (casting.member && expectedMembers.includes(casting.member)) fail('DUPLICATE_CASTING_MEMBER');
  const expectedRoundTwo = casting.valid && casting.member
    ? [...expectedMembers, casting.member]
    : expectedMembers;

  if (!Array.isArray(ledger?.round1)) fail('MISSING_ROUND_ONE');
  const round1 = Array.isArray(ledger?.round1) ? ledger.round1 : [];
  const round1Personas = round1.map((entry) => entry.persona).sort();
  if (JSON.stringify(round1Personas) !== JSON.stringify([...expectedMembers].sort())) fail('ROUND_ONE_MEMBERS');

  const allSpawnIds = [];
  for (const [index, entry] of round1.entries()) {
    if (!nonemptyString(entry.spawnId) || !nonemptyString(entry.prompt) || !nonemptyString(entry.response)) {
      fail('INCOMPLETE_ROUND_ONE_ENTRY', { index });
    } else {
      allSpawnIds.push(entry.spawnId);
    }
    const personaBlock = personaBlocks?.[entry.persona];
    if (!nonemptyString(personaBlock)) {
      fail('MISSING_PERSONA_BLOCK', { persona: entry.persona });
    } else if (nonemptyString(entry.prompt)) {
      try {
        const expectedPrompt = buildRoundOnePrompt({
          brief: manifest.decisionBrief,
          persona: entry.persona,
          personaBlock,
          maxPromptChars: manifest.maxPromptChars,
        }).text;
        if (entry.prompt !== expectedPrompt) fail('ROUND_ONE_PROMPT_MISMATCH', { index });
      } catch (error) {
        fail('ROUND_ONE_PROMPT_BUILD', { index, error: error.code ?? error.message });
      }
    }
  }
  if (round1.length && briefValidation.ok) {
    const classification = classifyRoundOne(responseEntriesFromLedger(round1), { validOptions });
    if (classification.parsed.some((entry) => !entry.usable)) fail('INVALID_ROUND_ONE_RESPONSE');
    if (manifest?.expectedRoundOneState && classification.state !== manifest.expectedRoundOneState) {
      fail('ROUND_ONE_STATE', { expected: manifest.expectedRoundOneState, actual: classification.state });
    }
  }

  if (manifest?.requireRoundTwo && !ledger?.round2) fail('MISSING_ROUND_TWO');
  if (ledger?.round2) {
    const round2Members = Array.isArray(ledger.round2.members) ? ledger.round2.members : [];
    const round2Personas = round2Members.map((entry) => entry.persona).sort();
    if (JSON.stringify(round2Personas) !== JSON.stringify([...expectedRoundTwo].sort())) fail('ROUND_TWO_MEMBERS');
    for (const [index, entry] of round2Members.entries()) {
      if (!nonemptyString(entry.spawnId) || !nonemptyString(entry.prompt) || !nonemptyString(entry.response)) {
        fail('INCOMPLETE_ROUND_TWO_ENTRY', { index });
      } else {
        allSpawnIds.push(entry.spawnId);
      }
      const parsed = parseMemberResponse(nonemptyString(entry.response) ? entry.response : '', { validOptions });
      if (briefValidation.ok && (!parsed.usable || !parsed.slots.STEELMAN || !parsed.slots['REACTING TO'])) {
        fail('INVALID_ROUND_TWO_RESPONSE', { index });
      }
    }

    if (!validateMapping(ledger.round1Mapping, expectedMembers)) fail('INVALID_ROUND_ONE_MAPPING');
    if (!validateMapping(ledger.round2.mapping, expectedMembers)) fail('INVALID_ROUND_TWO_MAPPING');
    if (mappingsEqual(ledger.round1Mapping, ledger.round2.mapping)) fail('REUSED_MAPPING');

    if (validateMapping(ledger.round2.mapping, expectedMembers) && round1.length === expectedMembers.length) {
      const byPersona = new Map(responseEntriesFromLedger(round1).map((entry) => [entry.persona, entry.text]));
      const expectedResponses = Object.entries(ledger.round2.mapping)
        .map(([persona, label]) => ({ label, text: byPersona.get(persona) }))
        .sort((left, right) => left.label.localeCompare(right.label, 'en', { numeric: true }));
      try {
        const anonymous = { mapping: ledger.round2.mapping, responses: expectedResponses };
        const expectedPacket = formatAnonymousPacket(anonymous);
        if (ledger.round2.packet !== expectedPacket) fail('PACKET_MISMATCH');
        const expectedPrompts = buildRoundTwoPrompts({
          brief: manifest.decisionBrief,
          members: expectedRoundTwo.map((persona) => ({
            persona,
            personaBlock: personaBlocks?.[persona],
            lateJoiner: persona === casting.member,
          })),
          anonymous,
          maxPromptChars: manifest.maxPromptChars,
        }).prompts;
        const promptByPersona = new Map(expectedPrompts.map((entry) => [entry.persona, entry.text]));
        for (const [index, entry] of round2Members.entries()) {
          if (entry.prompt !== promptByPersona.get(entry.persona)) fail('ROUND_TWO_PROMPT_MISMATCH', { index });
        }
      } catch (error) {
        fail('ROUND_TWO_PROMPT_BUILD', { error: error.code ?? error.message });
      }
    }
  }

  if (allSpawnIds.length !== new Set(allSpawnIds).size) fail('DUPLICATE_SPAWN_ID');
  return { ok: errors.length === 0, errors };
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function runCli(args) {
  const [command, inputPath, optionalManifestPath] = args;
  if (!command || !inputPath) {
    throw new CouncilProtocolError('USAGE', 'Usage: council-protocol.mjs <validate-brief|route|select-members|prepare-round-one|round-one|validate-casting|anonymize|prepare-round-two|audit-evidence|verify-live-smoke> <input.json> [manifest.json]');
  }
  const input = await readJson(inputPath);
  let output;
  if (command === 'validate-brief') output = validateDecisionBrief(input.brief);
  else if (command === 'route') output = routeCouncil(input);
  else if (command === 'select-members') output = selectMembers(input);
  else if (command === 'prepare-round-one') output = buildRoundOnePrompt(input);
  else if (command === 'round-one') output = classifyRoundOne(input.entries, { validOptions: input.validOptions });
  else if (command === 'validate-casting') output = validateCastingDirector(input.output);
  else if (command === 'anonymize') output = anonymizeResponses(input.entries, { seed: input.seed, previousMapping: input.previousMapping });
  else if (command === 'prepare-round-two') output = buildRoundTwoPrompts(input);
  else if (command === 'audit-evidence') output = auditNumericEvidence(input.argument);
  else if (command === 'verify-live-smoke') {
    const defaultManifest = fileURLToPath(new URL('../evals/live-smoke.json', import.meta.url));
    const personasPath = fileURLToPath(new URL('../references/personas.md', import.meta.url));
    const personaBlocks = extractPersonaBlocks(await readFile(personasPath, 'utf8'));
    output = validateLiveSmokeLedger(input, await readJson(optionalManifestPath ?? defaultManifest), { personaBlocks });
    if (!output.ok) process.exitCode = 1;
  } else {
    throw new CouncilProtocolError('USAGE', `Unknown command '${command}'.`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runCli(process.argv.slice(2)).catch((error) => {
    const code = error instanceof CouncilProtocolError ? error.code : 'UNEXPECTED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
