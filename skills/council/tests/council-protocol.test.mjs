import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANTI_CONFORMITY,
  CouncilProtocolError,
  LATE_JOINER_INSTRUCTION,
  ROUND_ONE_INSTRUCTIONS,
  ROUND_TWO_INSTRUCTIONS,
  anonymizeResponses,
  auditNumericEvidence,
  buildRoundOnePrompt,
  buildRoundTwoPrompts,
  classifyRoundOne,
  extractPersonaBlocks,
  parseMemberResponse,
  routeCouncil,
  selectMembers,
  validateCastingDirector,
  validateDecisionBrief,
  validateLiveSmokeLedger,
} from '../scripts/council-protocol.mjs';

const normalizeNewlines = (text) => text.replace(/\r\n?/g, '\n');

const BRIEF = `DECISION: Choose the boundary for the billing capability.
OPTIONS: A) Keep it in the monolith B) Extract a service
CONSTRAINTS: Preserve the public API and avoid downtime.
EVIDENCE: current dependency graph (code-read); production latency sample (measured: 2026-11 load test)
STAKES: A wrong boundary will be expensive to reverse.`;

const PERSONA_BLOCKS = {
  Skeptic: 'PERSONA Skeptic',
  Pragmatist: 'PERSONA Pragmatist',
  Maintainer: 'PERSONA Maintainer',
  Visionary: 'PERSONA Visionary',
};

const response = (vote = 'A', confidence = '4/5', argument = 'The current boundary has 2 (code-read: src/billing.ts exports) public seams.') => `VOTE: ${vote}
POSITION: Choose ${vote} for the stated constraints.
ARGUMENT: ${argument}
STRONGEST OBJECTION TO MY OWN POSITION: The alternative may isolate failures better.
CONFIDENCE: ${confidence}
WOULD CHANGE MY MIND: A production trace showing cross-boundary calls dominate latency.
PREMISE CHALLENGE: NONE`;

test('validates a bounded decision brief with 2-5 options and trust-tagged evidence', () => {
  const valid = validateDecisionBrief(BRIEF);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.optionLetters, ['A', 'B']);

  const tooFew = validateDecisionBrief(BRIEF.replace(' B) Extract a service', ''));
  assert.equal(tooFew.ok, false);
  assert.ok(tooFew.errors.some((error) => error.code === 'OPTION_COUNT'));

  const untagged = validateDecisionBrief(BRIEF.replace('current dependency graph (code-read)', 'current dependency graph'));
  assert.equal(untagged.ok, false);
  assert.ok(untagged.errors.some((error) => error.code === 'EVIDENCE_TAG'));

  const oversized = `${BRIEF}\n${'word '.repeat(301)}`;
  assert.ok(validateDecisionBrief(oversized).errors.some((error) => error.code === 'WORD_LIMIT'));

  const nonSequential = validateDecisionBrief(BRIEF.replace(' B) Extract a service', ' C) Extract a service'));
  assert.ok(nonSequential.errors.some((error) => error.code === 'OPTION_SEQUENCE'));
});

test('routes architecture automatically and technical strategy only on explicit request', () => {
  const base = {
    consequential: true,
    hardToReverse: true,
    optionCount: 2,
    hasTradeoff: true,
    canSpawn: true,
    explicitRequest: false,
  };

  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'architecture' }), { run: true, code: 'AUTO_ARCHITECTURE' });
  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'technical-strategy' }), { run: false, code: 'EXPLICIT_REQUEST_REQUIRED' });
  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'technical-strategy', explicitRequest: true }), { run: true, code: 'EXPLICIT_REQUEST' });
  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'factual', explicitRequest: true }), { run: false, code: 'OUT_OF_SCOPE' });
  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'architecture', optionCount: 1 }), { run: false, code: 'INSUFFICIENT_OPTIONS' });
  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'architecture', optionCount: 6 }), { run: false, code: 'TOO_MANY_OPTIONS' });
  assert.deepEqual(routeCouncil({ ...base, decisionKind: 'architecture', canSpawn: false }), { run: false, code: 'NO_ISOLATED_SUBAGENTS' });
  assert.throws(
    () => routeCouncil({ ...base, decisionKind: 'architecture', canSpawn: 'false' }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_ROUTE_INPUT',
  );
});

test('selects the three-member floor and six-member cap in documented priority order', () => {
  assert.deepEqual(selectMembers({}), ['Skeptic', 'Pragmatist', 'Maintainer']);
  assert.deepEqual(selectMembers({ prioritizesMission: true }), ['Skeptic', 'Pragmatist', 'Hupert-Graph']);
  assert.deepEqual(selectMembers({
    touchesProduction: true,
    operatedByOthers: true,
    platformSurface: true,
    prioritizesMission: true,
    futureUnlock: true,
    domainModelDispute: true,
    rewriteOrPort: true,
  }), ['Skeptic', 'Pragmatist', 'Migrator', 'MLK', 'Maintainer', 'Hupert-Graph']);
  assert.throws(
    () => selectMembers({ touchesProduction: 'false' }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_FEATURES',
  );
});

test('parses required member slots and rejects votes outside the brief', () => {
  const parsed = parseMemberResponse(response().replace('public seams.', 'public\nseams.'), { validOptions: ['A', 'B'] });
  assert.equal(parsed.usable, true);
  assert.equal(parsed.slots.VOTE, 'A');
  assert.match(parsed.slots.ARGUMENT, /public\nseams/);

  const missing = parseMemberResponse('VOTE: A\nPOSITION: Fine', { validOptions: ['A', 'B'] });
  assert.equal(missing.usable, false);
  assert.ok(missing.errors.includes('MISSING_ARGUMENT'));

  const invalidVote = parseMemberResponse(response('C'), { validOptions: ['A', 'B'] });
  assert.equal(invalidVote.usable, false);
  assert.ok(invalidVote.errors.includes('INVALID_VOTE'));
});

test('protocol constructors fail closed on malformed collections and members', () => {
  assert.throws(
    () => anonymizeResponses([], { seed: 'empty' }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INSUFFICIENT_RESPONSES',
  );
  assert.throws(
    () => anonymizeResponses([
      { persona: 'Skeptic', text: 'one' },
      { persona: 'Skeptic', text: 'two' },
    ], { seed: 'duplicate' }),
    (error) => error instanceof CouncilProtocolError && error.code === 'DUPLICATE_PERSONA',
  );
  assert.throws(
    () => anonymizeResponses([
      { persona: 'Skeptic', text: '' },
      { persona: 'Pragmatist', text: 'two' },
    ], { seed: 'empty-text' }),
    (error) => error instanceof CouncilProtocolError && error.code === 'EMPTY_RESPONSE',
  );

  const entries = [
    { persona: 'Skeptic', text: 'one' },
    { persona: 'Pragmatist', text: 'two' },
  ];
  const anonymous = anonymizeResponses(entries, { seed: 'valid' });
  const base = {
    brief: BRIEF,
    members: [{ persona: 'Skeptic', personaBlock: 'PERSONA', lateJoiner: false }],
    anonymous,
    antiConformity: 'ANTI',
    roundTwoInstructions: 'ROUND TWO',
    lateJoinerInstruction: 'LATE',
    maxPromptChars: 10_000,
  };
  assert.throws(
    () => buildRoundTwoPrompts({ ...base, maxPromptChars: 0 }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_BUDGET',
  );
  assert.throws(
    () => buildRoundTwoPrompts({ ...base, members: [] }),
    (error) => error instanceof CouncilProtocolError && error.code === 'NO_ROUND_TWO_MEMBERS',
  );
  assert.throws(
    () => buildRoundTwoPrompts({ ...base, members: [{ persona: 'Skeptic', personaBlock: '' }] }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_MEMBER',
  );
  assert.throws(
    () => buildRoundTwoPrompts({ ...base, anonymous: { mapping: { Skeptic: 'R1' }, responses: [{ label: 'R1', text: 'one' }] } }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_ANONYMOUS_PACKET',
  );
  assert.throws(
    () => buildRoundTwoPrompts({ ...base, anonymous: { mapping: { Skeptic: 'R1', Pragmatist: 'R2' }, responses: [{ label: 'R1', text: '' }, { label: 'R2', text: 'two' }] } }),
    (error) => error instanceof CouncilProtocolError && error.code === 'EMPTY_RESPONSE',
  );
  assert.throws(
    () => buildRoundTwoPrompts({ ...base, anonymous: { mapping: { Skeptic: 'R1', Pragmatist: 'R1' }, responses: [{ label: 'R1', text: 'one' }, { label: 'R1', text: 'two' }] } }),
    (error) => error instanceof CouncilProtocolError && error.code === 'DUPLICATE_LABEL',
  );
});

test('classifies quorum, convergence, and contested rounds mechanically', () => {
  const members = ['Skeptic', 'Pragmatist', 'Maintainer'].map((persona) => ({ persona, text: response() }));
  assert.equal(classifyRoundOne(members, { validOptions: ['A', 'B'] }).state, 'CONVERGED');

  const contested = members.map((entry, index) => ({ ...entry, text: response(index === 2 ? 'B' : 'A') }));
  assert.equal(classifyRoundOne(contested, { validOptions: ['A', 'B'] }).state, 'NOT_CONVERGED');

  const low = members.map((entry, index) => ({ ...entry, text: response('A', index === 2 ? '3/5' : '4/5') }));
  assert.equal(classifyRoundOne(low, { validOptions: ['A', 'B'] }).state, 'NOT_CONVERGED');

  assert.equal(classifyRoundOne(members.slice(0, 2), { validOptions: ['A', 'B'] }).state, 'ABORT');

  const duplicate = members.map((entry) => ({ ...entry, persona: 'Skeptic' }));
  const duplicateResult = classifyRoundOne(duplicate, { validOptions: ['A', 'B'] });
  assert.deepEqual(
    { state: duplicateResult.state, reason: duplicateResult.reason },
    { state: 'ABORT', reason: 'DUPLICATE_PERSONA' },
  );
  assert.throws(
    () => classifyRoundOne(members),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_OPTIONS',
  );
  assert.throws(
    () => classifyRoundOne(null, { validOptions: ['A', 'B'] }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_RESPONSES',
  );
});

test('accepts only literal casting-director forms and standing voting roles', () => {
  assert.deepEqual(validateCastingDirector('MISSING ROLE: Visionary'), { member: 'Visionary', valid: true });
  assert.deepEqual(validateCastingDirector('NONE NEEDED'), { member: null, valid: true });
  assert.deepEqual(validateCastingDirector('Maybe add Visionary'), { member: null, valid: false });
  assert.deepEqual(validateCastingDirector("MISSING ROLE: Devil's Advocate"), { member: null, valid: false });
});

test('anonymization is deterministic, bijective, and never reuses the prior mapping', () => {
  const entries = [
    { persona: 'Skeptic', text: response('A') },
    { persona: 'Pragmatist', text: response('B') },
    { persona: 'Maintainer', text: response('A') },
  ];
  const first = anonymizeResponses(entries, { seed: 'round-one' });
  assert.deepEqual(anonymizeResponses(entries, { seed: 'round-one' }), first);
  assert.equal(new Set(Object.values(first.mapping)).size, entries.length);
  for (const entry of entries) assert.equal(first.responses.find((item) => item.label === first.mapping[entry.persona]).text, entry.text);

  const second = anonymizeResponses(entries, { seed: 'round-one', previousMapping: first.mapping });
  assert.notDeepEqual(second.mapping, first.mapping);
  assert.throws(
    () => anonymizeResponses(entries),
    (error) => error instanceof CouncilProtocolError && error.code === 'MISSING_SEED',
  );
});

test('round-two prompts preserve every byte and fail instead of compacting over budget', () => {
  const entries = [
    { persona: 'Skeptic', text: `${response('A', '4/5', 'Skeptic found 2 (code-read: src/billing.ts exports) seams.')}\nUnicode evidence: 東京 ✓` },
    { persona: 'Pragmatist', text: response('B', '4/5', 'Pragmatist estimates 3 (estimate) weeks.') },
    { persona: 'Maintainer', text: response('A', '4/5', 'Maintainer traced 4 (code-read: src/routes.ts handlers) routes.') },
  ];
  const anonymous = anonymizeResponses(entries, { seed: 'round-two' });
  const input = {
    brief: BRIEF,
    members: entries.map(({ persona }) => ({ persona, personaBlock: `PERSONA ${persona}`, lateJoiner: false })),
    anonymous,
  };
  const built = buildRoundTwoPrompts({ ...input, maxPromptChars: 100_000 });
  for (const entry of entries) {
    assert.equal(built.packet.split(entry.text).length - 1, 1);
    for (const prompt of built.prompts) assert.equal(prompt.text.split(entry.text).length - 1, 1);
  }

  const exactLimit = Math.max(...built.prompts.map((prompt) => prompt.text.length));
  assert.doesNotThrow(() => buildRoundTwoPrompts({ ...input, maxPromptChars: exactLimit }));
  assert.throws(
    () => buildRoundTwoPrompts({ ...input, maxPromptChars: exactLimit - 1 }),
    (error) => error instanceof CouncilProtocolError && error.code === 'PACKET_TOO_LARGE',
  );

  assert.throws(
    () => buildRoundTwoPrompts({
      ...input,
      anonymous: { ...anonymous, mapping: { Skeptic: 'R1', Pragmatist: 'R1', Maintainer: 'R3' } },
      maxPromptChars: 100_000,
    }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_MAPPING',
  );
});

test('late joiner instruction appears only in the added member prompt', () => {
  const entries = [
    { persona: 'Skeptic', text: response('A') },
    { persona: 'Pragmatist', text: response('B') },
    { persona: 'Maintainer', text: response('A') },
  ];
  const built = buildRoundTwoPrompts({
    brief: BRIEF,
    members: [
      { persona: 'Skeptic', personaBlock: 'PERSONA Skeptic', lateJoiner: false },
      { persona: 'Visionary', personaBlock: 'PERSONA Visionary', lateJoiner: true },
    ],
    anonymous: anonymizeResponses(entries, { seed: 'late-joiner' }),
    maxPromptChars: 100_000,
  });
  assert.equal(built.prompts.find((item) => item.persona === 'Skeptic').text.includes(LATE_JOINER_INSTRUCTION), false);
  assert.equal(built.prompts.find((item) => item.persona === 'Visionary').text.includes(LATE_JOINER_INSTRUCTION), true);
});

test('round-one builder owns its literal prompt and both builders reject empty briefs', () => {
  const built = buildRoundOnePrompt({
    brief: BRIEF,
    persona: 'Skeptic',
    personaBlock: PERSONA_BLOCKS.Skeptic,
    maxPromptChars: 100_000,
  });
  assert.equal(built.text, [PERSONA_BLOCKS.Skeptic, BRIEF, ROUND_ONE_INSTRUCTIONS].join('\n\n'));
  assert.throws(
    () => buildRoundOnePrompt({ brief: '', persona: 'Skeptic', personaBlock: PERSONA_BLOCKS.Skeptic, maxPromptChars: 100_000 }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_BRIEF',
  );
  const anonymous = anonymizeResponses([
    { persona: 'Skeptic', text: 'one' },
    { persona: 'Pragmatist', text: 'two' },
  ], { seed: 'empty-brief' });
  assert.throws(
    () => buildRoundTwoPrompts({ brief: '', members: [{ persona: 'Skeptic', personaBlock: PERSONA_BLOCKS.Skeptic }], anonymous, maxPromptChars: 100_000 }),
    (error) => error instanceof CouncilProtocolError && error.code === 'INVALID_BRIEF',
  );
});

test('numeric evidence audit distinguishes exact, measured, estimated, and untagged claims', () => {
  const result = auditNumericEvidence('Limit is 500 (code-read: config/runtime.ts MAX_CONNECTIONS). Test reached 450 (measured: 2026-11 load test). Design may reach 800 (estimate). Notes promise 10x.');
  assert.deepEqual(result.claims.map((claim) => [claim.number, claim.kind]), [
    ['500', 'code-read'],
    ['450', 'measured'],
    ['800', 'estimate'],
    ['10x', 'estimate'],
  ]);
  assert.equal(result.claims.at(-1).explicit, false);
  assert.ok(result.issues.some((issue) => issue.code === 'UNTAGGED_NUMBER' && issue.number === '10x'));

  const invalid = auditNumericEvidence('Limit is 500 (code-read).');
  assert.ok(invalid.issues.some((issue) => issue.code === 'MISSING_SOURCE_DETAIL'));

  const laterTag = auditNumericEvidence('Notes promise 10x. The config is known (code-read: config/runtime.ts).');
  assert.equal(laterTag.claims[0].explicit, false);
});

test('live smoke ledger proves distinct spawns and exact round-two packet propagation', () => {
  const round1 = ['Skeptic', 'Pragmatist', 'Maintainer'].map((persona, index) => ({
    persona,
    spawnId: `host-round1-${index}`,
    prompt: buildRoundOnePrompt({ brief: BRIEF, persona, personaBlock: PERSONA_BLOCKS[persona], maxPromptChars: 100_000 }).text,
    response: response(index === 1 ? 'B' : 'A'),
  }));
  const first = anonymizeResponses(round1.map(({ persona, response: text }) => ({ persona, text })), { seed: 'live-r1' });
  const second = anonymizeResponses(round1.map(({ persona, response: text }) => ({ persona, text })), {
    seed: 'live-r2',
    previousMapping: first.mapping,
  });
  const built = buildRoundTwoPrompts({
    brief: BRIEF,
    members: round1.map(({ persona }) => ({ persona, personaBlock: `PERSONA ${persona}`, lateJoiner: false })),
    anonymous: second,
    maxPromptChars: 100_000,
  });
  const ledger = {
    decisionBrief: BRIEF,
    castingDirectorOutput: 'NONE NEEDED',
    round1,
    round1Mapping: first.mapping,
    round2: {
      mapping: second.mapping,
      packet: built.packet,
      members: built.prompts.map((item, index) => ({
        persona: item.persona,
        spawnId: `host-round2-${index}`,
        prompt: item.text,
        response: `STEELMAN: R1 + one sentence\nREACTING TO: R1\n${response(index === 1 ? 'B' : 'A')}`,
      })),
    },
  };
  const manifest = {
    decisionBrief: BRIEF,
    expectedMembers: ['Skeptic', 'Pragmatist', 'Maintainer'],
    expectedRoundOneState: 'NOT_CONVERGED',
    requireRoundTwo: true,
    maxPromptChars: 100_000,
  };
  assert.deepEqual(validateLiveSmokeLedger(ledger, manifest, { personaBlocks: PERSONA_BLOCKS }), { ok: true, errors: [] });

  const reusedSpawn = structuredClone(ledger);
  reusedSpawn.round2.members[0].spawnId = reusedSpawn.round1[0].spawnId;
  assert.ok(validateLiveSmokeLedger(reusedSpawn, manifest, { personaBlocks: PERSONA_BLOCKS }).errors.some((error) => error.code === 'DUPLICATE_SPAWN_ID'));

  const compacted = structuredClone(ledger);
  compacted.round2.packet = 'summary only';
  assert.ok(validateLiveSmokeLedger(compacted, manifest, { personaBlocks: PERSONA_BLOCKS }).errors.some((error) => error.code === 'PACKET_MISMATCH'));

  const reusedMapping = structuredClone(ledger);
  reusedMapping.round2.mapping = reusedMapping.round1Mapping;
  assert.ok(validateLiveSmokeLedger(reusedMapping, manifest, { personaBlocks: PERSONA_BLOCKS }).errors.some((error) => error.code === 'REUSED_MAPPING'));

  const malformed = structuredClone(ledger);
  malformed.round2.members[0].response = 'VOTE: A';
  assert.ok(validateLiveSmokeLedger(malformed, manifest, { personaBlocks: PERSONA_BLOCKS }).errors.some((error) => error.code === 'INVALID_ROUND_TWO_RESPONSE'));

  const missingBrief = structuredClone(ledger);
  missingBrief.round1[0].prompt = 'PERSONA Skeptic';
  assert.ok(validateLiveSmokeLedger(missingBrief, manifest, { personaBlocks: PERSONA_BLOCKS }).errors.some((error) => error.code === 'ROUND_ONE_PROMPT_MISMATCH'));

  const objectBypass = structuredClone(ledger);
  objectBypass.round1[0].spawnId = {};
  objectBypass.round1[0].prompt = {};
  const bypassErrors = validateLiveSmokeLedger(objectBypass, manifest, { personaBlocks: PERSONA_BLOCKS }).errors;
  assert.ok(bypassErrors.some((error) => error.code === 'INCOMPLETE_ROUND_ONE_ENTRY'));
});

test('protocol references contain the helper-owned literal prompt blocks', async () => {
  const protocol = normalizeNewlines(
    await readFile(new URL('../references/protocol.md', import.meta.url), 'utf8'),
  );
  const personas = normalizeNewlines(
    await readFile(new URL('../references/personas.md', import.meta.url), 'utf8'),
  );
  assert.ok(protocol.includes(ROUND_ONE_INSTRUCTIONS));
  assert.ok(protocol.includes(ANTI_CONFORMITY));
  assert.ok(protocol.includes(ROUND_TWO_INSTRUCTIONS));
  assert.ok(protocol.includes(LATE_JOINER_INSTRUCTION));
  const blocks = extractPersonaBlocks(personas);
  assert.match(blocks.Skeptic, /^### Skeptic/u);
  assert.match(blocks["Devil's Advocate"], /^### Devil's Advocate/u);
});

test('JSON CLI exposes deterministic routing and rejects unknown commands', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'council-protocol-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = join(directory, 'route.json');
  await writeFile(inputPath, JSON.stringify({
    decisionKind: 'architecture',
    consequential: true,
    hardToReverse: true,
    optionCount: 2,
    hasTradeoff: true,
    canSpawn: true,
    explicitRequest: false,
  }));
  const script = fileURLToPath(new URL('../scripts/council-protocol.mjs', import.meta.url));
  const routed = spawnSync(process.execPath, [script, 'route', inputPath], { encoding: 'utf8' });
  assert.equal(routed.status, 0, routed.stderr);
  assert.deepEqual(JSON.parse(routed.stdout), { run: true, code: 'AUTO_ARCHITECTURE' });

  const unknown = spawnSync(process.execPath, [script, 'unknown', inputPath], { encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /^USAGE: Unknown command/u);

  const castingPath = join(directory, 'casting.json');
  await writeFile(castingPath, JSON.stringify({ output: 'MISSING ROLE: Visionary' }));
  const casting = spawnSync(process.execPath, [script, 'validate-casting', castingPath], { encoding: 'utf8' });
  assert.equal(casting.status, 0, casting.stderr);
  assert.deepEqual(JSON.parse(casting.stdout), { member: 'Visionary', valid: true });

  const roundPath = join(directory, 'round.json');
  await writeFile(roundPath, JSON.stringify({ entries: [
    { persona: 'Skeptic', text: response('Z') },
    { persona: 'Pragmatist', text: response('Z') },
    { persona: 'Maintainer', text: response('Z') },
  ] }));
  const invalidRound = spawnSync(process.execPath, [script, 'round-one', roundPath], { encoding: 'utf8' });
  assert.equal(invalidRound.status, 1);
  assert.match(invalidRound.stderr, /^INVALID_OPTIONS:/u);
});
