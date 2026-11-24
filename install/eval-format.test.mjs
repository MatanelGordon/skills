import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASE_KEY_ORDER,
  MIN_CASES,
  checkEvalDocument,
  duplicateKeys,
  normalizeEvalDocument,
  serializeEvalDocument,
} from './eval-format.mjs';

const MAX_BYTES = 64 * 1024;

/** A lookup over a fixed set of skill-relative paths, as the file layer would answer. */
const lookupOf = (entries = {}) => (path) => entries[path] ?? { kind: 'missing' };
const textFile = (bytes = 10) => ({ kind: 'file', bytes, isText: true });

const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const standardCase = (overrides = {}) => ({
  id: 1,
  prompt: 'Do it',
  expected_output: 'Done',
  files: [],
  assertions: ['The reply says it is done.', 'The reply names the result.'],
  expectations: ['The reply says it is done.', 'The reply names the result.'],
  ...overrides,
});

const skillDoc = (evals, extra = {}) => ({ skill_name: 'demo', evals, ...extra });

const normalizedCase = (evaluation, lookup) => normalizeEvalDocument(skillDoc([evaluation]), lookup);

test('a document already in the standard format comes back equal, with nothing to do', () => {
  const doc = skillDoc([standardCase(), standardCase({ id: 2, expected_skill: null })]);
  const result = normalizeEvalDocument(doc, lookupOf());
  assert.deepEqual(result.doc, doc);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.problems, []);
});

test('normalising never mutates its input', () => {
  const doc = deepFreeze(skillDoc([{
    id: 3,
    expectations: ['It works.'],
    prompt: 'p',
    expected_output: 'e',
    files: [{ path: 'package.json', content: '{}' }],
  }]));
  const result = normalizeEvalDocument(doc, lookupOf());
  assert.notEqual(result.doc, doc);
  assert.equal(result.doc.evals[0].assertions[0], 'It works.');
});

test('a case with no files key gets an empty list', () => {
  const { files: _omitted, ...withoutFiles } = standardCase();
  assert.deepEqual(normalizedCase(withoutFiles).doc.evals[0].files, []);
  assert.deepEqual(normalizedCase({ ...withoutFiles, files: null }).doc.evals[0].files, []);
});

test('a single string in files becomes a one-item list', () => {
  const lookup = lookupOf({ 'evals/files/1/a.txt': textFile() });
  const result = normalizedCase(standardCase({ files: 'evals/files/1/a.txt' }), lookup);
  assert.deepEqual(result.doc.evals[0].files, ['evals/files/1/a.txt']);
  assert.deepEqual(result.problems, []);
});

test('expectations are copied into assertions, and the other way round', () => {
  const { assertions: _a, ...onlyExpectations } = standardCase();
  const { expectations: _e, ...onlyAssertions } = standardCase();
  const fromExpectations = normalizedCase(onlyExpectations).doc.evals[0];
  const fromAssertions = normalizedCase(onlyAssertions).doc.evals[0];
  assert.deepEqual(fromExpectations.assertions, onlyExpectations.expectations);
  assert.deepEqual(fromAssertions.expectations, onlyAssertions.assertions);
  assert.notEqual(fromExpectations.assertions, fromExpectations.expectations, 'the two lists must not share one array');
});

test('assertions and expectations that differ are reported and left alone', () => {
  const evaluation = standardCase({ expectations: ['Something else.'] });
  const result = normalizedCase(evaluation);
  assert.deepEqual(result.doc.evals[0].assertions, evaluation.assertions);
  assert.deepEqual(result.doc.evals[0].expectations, evaluation.expectations);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /eval 1: assertions and expectations differ/);
});

test('case keys come out in the standard order, unknown keys after them in their own order', () => {
  const result = normalizedCase({
    zebra: 1,
    expectations: ['x'],
    checks: [],
    files: [],
    expected_skill: null,
    alpha: 2,
    expected_output: 'e',
    prompt: 'p',
    id: 9,
  });
  assert.deepEqual(Object.keys(result.doc.evals[0]), [...CASE_KEY_ORDER, 'zebra', 'alpha']);
});

test('the name comes first at the top level and other keys are kept', () => {
  const result = normalizeEvalDocument({ defaults: { a: 1 }, evals: [standardCase()], skill_name: 'demo' });
  assert.deepEqual(Object.keys(result.doc), ['skill_name', 'evals', 'defaults']);
  const agent = normalizeEvalDocument({ evals: [standardCase()], agent_name: 'reviewer' }, undefined, { kind: 'agent' });
  assert.deepEqual(Object.keys(agent.doc), ['agent_name', 'evals']);
});

test('a {path, content} object becomes a fixture file under the case folder', () => {
  const result = normalizedCase(standardCase({ id: 3, files: [{ path: 'src/package.json', content: '{"a":1}' }] }));
  assert.deepEqual(result.doc.evals[0].files, ['evals/files/3/src/package.json']);
  assert.deepEqual(result.actions, [{ type: 'write', path: 'evals/files/3/src/package.json', content: '{"a":1}' }]);
  assert.deepEqual(result.problems, []);
});

test('an object that is malformed or escapes the case folder is reported and nothing is written', () => {
  for (const entry of [
    { path: '../outside.txt', content: 'x' },
    { path: '/etc/passwd', content: 'x' },
    { path: 'a\\b.txt', content: 'x' },
    { path: 'a.txt' },
    { content: 'x' },
    { path: '', content: 'x' },
    42,
  ]) {
    const result = normalizedCase(standardCase({ files: [entry] }));
    assert.deepEqual(result.actions, [], JSON.stringify(entry));
    assert.equal(result.problems.length, 1, JSON.stringify(entry));
    assert.deepEqual(result.doc.evals[0].files, [entry], 'the entry is left as written');
  }
});

test('inline fixture text is written to a numbered file', () => {
  const inline = 'ROUND-1 FIXTURE\n\nSkeptic\nVOTE: A';
  const long = 'x'.repeat(256);
  const result = normalizedCase(standardCase({ id: 4, files: [inline, long] }));
  assert.deepEqual(result.doc.evals[0].files, ['evals/files/4/fixture-1.txt', 'evals/files/4/fixture-2.txt']);
  assert.deepEqual(result.actions, [
    { type: 'write', path: 'evals/files/4/fixture-1.txt', content: inline },
    { type: 'write', path: 'evals/files/4/fixture-2.txt', content: long },
  ]);
});

test('a fixture elsewhere under evals/ moves into the case folder', () => {
  const lookup = lookupOf({ 'evals/fixtures/notes/plan.md': textFile() });
  const result = normalizedCase(standardCase({ id: 5, files: ['evals/fixtures/notes/plan.md'] }), lookup);
  assert.deepEqual(result.doc.evals[0].files, ['evals/files/5/notes/plan.md']);
  assert.deepEqual(result.actions, [{ type: 'move', from: 'evals/fixtures/notes/plan.md', to: 'evals/files/5/notes/plan.md' }]);
});

test('a fixture used by several cases moves to the shared folder once', () => {
  const lookup = lookupOf({ 'evals/fixtures/a.diff': textFile() });
  const result = normalizeEvalDocument(skillDoc([
    standardCase({ id: 1, files: ['evals/fixtures/a.diff'] }),
    standardCase({ id: 2, files: ['evals/fixtures/a.diff'] }),
  ]), lookup);
  assert.deepEqual(result.doc.evals.map((evaluation) => evaluation.files), [
    ['evals/files/shared/a.diff'],
    ['evals/files/shared/a.diff'],
  ]);
  assert.deepEqual(result.actions, [{ type: 'move', from: 'evals/fixtures/a.diff', to: 'evals/files/shared/a.diff' }]);
});

test('a path written from evals/ is rewritten from the skill folder', () => {
  const lookup = lookupOf({ 'evals/files/3/fixture-1.txt': textFile(), 'evals/fixtures/b.md': textFile() });
  const kept = normalizedCase(standardCase({ id: 3, files: ['files/3/fixture-1.txt'] }), lookup);
  assert.deepEqual(kept.doc.evals[0].files, ['evals/files/3/fixture-1.txt']);
  assert.deepEqual(kept.actions, []);

  const moved = normalizedCase(standardCase({ id: 3, files: ['fixtures/b.md'] }), lookup);
  assert.deepEqual(moved.doc.evals[0].files, ['evals/files/3/b.md']);
  assert.deepEqual(moved.actions, [{ type: 'move', from: 'evals/fixtures/b.md', to: 'evals/files/3/b.md' }]);
});

test('a skill file outside evals/ is copied in, not moved', () => {
  const lookup = lookupOf({ 'references/adapters/rust.md': textFile() });
  const result = normalizedCase(standardCase({ id: 4, files: ['references/adapters/rust.md'] }), lookup);
  assert.deepEqual(result.doc.evals[0].files, ['evals/files/4/rust.md']);
  assert.deepEqual(result.actions, [{ type: 'copy', from: 'references/adapters/rust.md', to: 'evals/files/4/rust.md' }]);
});

test('a path already under evals/files is kept even when the file is missing', () => {
  const result = normalizedCase(standardCase({ files: ['evals/files/1/gone.txt'] }));
  assert.deepEqual(result.doc.evals[0].files, ['evals/files/1/gone.txt']);
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.problems, [], 'the check reports a missing fixture; the normaliser has nothing to repair');
});

test('a path that resolves nowhere is reported and left as written', () => {
  const result = normalizedCase(standardCase({ id: 7, files: ['docs/missing.md'] }));
  assert.deepEqual(result.doc.evals[0].files, ['docs/missing.md']);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /eval 7: files\[0\] "docs\/missing\.md" does not name a file/);
});

test('two different sources that would land on one fixture path are reported', () => {
  const lookup = lookupOf({ 'evals/fixtures/a.md': textFile(), 'evals/other/a.md': textFile() });
  const result = normalizedCase(standardCase({ id: 2, files: ['evals/fixtures/a.md', 'evals/other/a.md'] }), lookup);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /evals\/files\/2\/a\.md/);
  assert.deepEqual(result.actions, []);
});

test('agent evals have no fixture folder: a non-empty files list is reported', () => {
  const doc = { agent_name: 'reviewer', evals: [standardCase({ files: ['x.md'] })] };
  const result = normalizeEvalDocument(doc, lookupOf({ 'x.md': textFile() }), { kind: 'agent' });
  assert.deepEqual(result.actions, []);
  assert.equal(result.problems.length, 1);
});

test('a document without an evals list is reported and returned as it was', () => {
  for (const doc of [{ skill_name: 'demo' }, { skill_name: 'demo', evals: 'no' }, null, []]) {
    const result = normalizeEvalDocument(doc);
    assert.deepEqual(result.doc, doc);
    assert.equal(result.problems.length, 1);
  }
  const withBadCase = normalizeEvalDocument(skillDoc([standardCase(), 'not a case']));
  assert.equal(withBadCase.problems.length, 1);
  assert.equal(withBadCase.doc.evals[1], 'not a case');
});

test('only legacy fixtures under evals/fixtures move; other files under evals/ are copied or refused', () => {
  const lookup = lookupOf({
    'evals/live-smoke.json': textFile(),
    'evals/environment/Dockerfile': textFile(),
    'evals/config.yml': textFile(),
    'evals/fixtures/a.md': textFile(),
  });
  const copied = normalizedCase(standardCase({ id: 1, files: ['evals/live-smoke.json'] }), lookup);
  assert.deepEqual(copied.actions, [{ type: 'copy', from: 'evals/live-smoke.json', to: 'evals/files/1/live-smoke.json' }]);
  assert.deepEqual(copied.problems, []);

  for (const controlFile of ['evals/environment/Dockerfile', 'evals/config.yml']) {
    const refused = normalizedCase(standardCase({ id: 1, files: [controlFile] }), lookup);
    assert.deepEqual(refused.actions, [], controlFile);
    assert.equal(refused.problems.length, 1, controlFile);
    assert.match(refused.problems[0], /evaluator control file/, controlFile);
  }

  const moved = normalizedCase(standardCase({ id: 1, files: ['evals/fixtures/a.md'] }), lookup);
  assert.deepEqual(moved.actions, [{ type: 'move', from: 'evals/fixtures/a.md', to: 'evals/files/1/a.md' }]);
});

test('no fixture action is planned for a case whose id is not a non-negative integer', () => {
  for (const id of ['..', '.', 'x y', '3', -1, 1.5]) {
    const result = normalizedCase(standardCase({ id, files: [{ path: 'environment/Dockerfile', content: 'FROM x' }] }));
    assert.deepEqual(result.actions, [], String(id));
    assert.equal(result.problems.length, 1, String(id));
  }
});

test('a legacy fixture that a case left unrepaired still names is copied, not moved away from it', () => {
  const lookup = lookupOf({ 'evals/fixtures/a.md': textFile() });
  const result = normalizeEvalDocument(skillDoc([
    standardCase({ id: 1, files: ['evals/fixtures/a.md'] }),
    standardCase({ id: 'x y', files: ['evals/fixtures/a.md'] }),
  ]), lookup);
  assert.deepEqual(result.actions, [{ type: 'copy', from: 'evals/fixtures/a.md', to: 'evals/files/1/a.md' }]);
  assert.equal(result.problems.length, 1);
});

test('duplicate keys in one JSON object are found at any depth, and keys in separate objects are not', () => {
  assert.deepEqual(duplicateKeys('{"evals":[{"id":1,"expectations":["a"],"expectations":["b"]}]}'), ['expectations']);
  assert.deepEqual(duplicateKeys('{"a":1,"b":{"a":2},"c":[{"a":3},{"a":4}]}'), []);
  assert.deepEqual(duplicateKeys('{"a":"x\\"a\\":","a":2}'), ['a']);
  assert.deepEqual(duplicateKeys('{"k":{"z":1,"z":2},"k2":{"y":1,"y":1}}'), ['z', 'y']);
  assert.deepEqual(duplicateKeys('[1, "{\\"a\\":1,\\"a\\":2}"]'), []);
  assert.deepEqual(duplicateKeys('{"\\n":1,"n":2}'), [], 'an escaped key is not the letter it escapes');
  assert.deepEqual(duplicateKeys('{"\\u0041":1,"A":2}'), ['A'], 'two spellings of one key are one key');
});

test('a document with a duplicate key is reported and not rewritten', () => {
  const raw = '{"skill_name":"demo","evals":[{"id":1,"prompt":"p","expected_output":"e","files":[],"expectations":["ours"],"expectations":["theirs"]}]}';
  const result = normalizeEvalDocument(JSON.parse(raw), lookupOf(), { raw });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /duplicate key "expectations"/);
  assert.deepEqual(result.actions, []);
  assert.equal(result.doc, null, 'no rewritten document is offered');
});

test('normalising twice equals normalising once, for every input shape', () => {
  const lookup = lookupOf({
    'evals/fixtures/a.diff': textFile(),
    'evals/fixtures/b.md': textFile(),
    'references/x.md': textFile(),
    'evals/files/9/kept.txt': textFile(),
  });
  const messy = skillDoc([
    { expectations: ['one'], id: 1, prompt: 'p', expected_output: 'e' },
    { id: 2, prompt: 'p', expected_output: 'e', files: [{ path: 'package.json', content: '{}' }], assertions: ['two'] },
    { id: 3, prompt: 'p', expected_output: 'e', files: ['inline\ntext'], expectations: ['three'], extra: true },
    { id: 4, prompt: 'p', expected_output: 'e', files: ['evals/fixtures/a.diff', 'fixtures/b.md'], expectations: ['four'] },
    { id: 5, prompt: 'p', expected_output: 'e', files: ['evals/fixtures/a.diff', 'references/x.md'], expectations: ['five'] },
    { id: 9, prompt: 'p', expected_output: 'e', files: ['evals/files/9/kept.txt'], expectations: ['nine'], expected_skill: null },
  ]);
  const once = normalizeEvalDocument(messy, lookup);
  assert.deepEqual(once.problems, []);

  // After the first run's actions are applied, the fixture folder holds the targets and the sources are gone.
  const after = Object.fromEntries(once.actions.map((action) => [action.type === 'write' ? action.path : action.to, textFile()]));
  const afterLookup = lookupOf({ ...after, 'references/x.md': textFile(), 'evals/files/9/kept.txt': textFile() });
  const twice = normalizeEvalDocument(once.doc, afterLookup);
  assert.deepEqual(twice.doc, once.doc);
  assert.deepEqual(twice.actions, []);
  assert.deepEqual(twice.problems, []);
  assert.equal(serializeEvalDocument(twice.doc), serializeEvalDocument(once.doc));
});

test('serialising uses two-space JSON with one trailing newline and keeps non-ASCII text', () => {
  const text = serializeEvalDocument(skillDoc([standardCase({ prompt: 'café → naïve' })]));
  assert.ok(text.startsWith('{\n  "skill_name": "demo",\n  "evals": [\n    {\n      "id": 1,'));
  assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'));
  assert.ok(text.includes('café → naïve'));
  assert.ok(text.includes('"files": []'));
});

// ---------------------------------------------------------------- the check

const checked = (evals, lookup = lookupOf(), options) => checkEvalDocument(skillDoc(evals), lookup, options);
const errorsFor = (overrides, lookup) => checked([standardCase(overrides)], lookup).errors;

const sixCases = () => [1, 2, 3, 4, 5, 6].map((id) => standardCase(id === 6 ? { id, expected_skill: null } : { id }));

test('a standard document of six cases with a negative one has no errors and no warnings', () => {
  assert.deepEqual(checked(sixCases()), { errors: [], warnings: [] });
});

test('fewer than six cases and a missing negative case are warnings, not errors', () => {
  const result = checked([standardCase()]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], new RegExp(`1 case.*at least ${MIN_CASES}`));
  assert.match(result.warnings[1], /no negative case/);

  const noNegative = checked(sixCases().map(({ expected_skill: _omitted, ...evaluation }) => evaluation));
  assert.equal(noNegative.warnings.length, 1);
  assert.match(noNegative.warnings[0], /no negative case/);
});

test('agent evals are not held to the case-count rule', () => {
  const result = checkEvalDocument({ agent_name: 'reviewer', evals: [standardCase()] }, lookupOf(), { kind: 'agent' });
  assert.deepEqual(result, { errors: [], warnings: [] });
});

test('an id that is not an integer is an error', () => {
  for (const id of ['1', 1.5, null, undefined]) {
    const errors = errorsFor({ id });
    assert.equal(errors.length, 1, String(id));
    assert.match(errors[0], /id must be an integer/);
  }
});

test('files must be a list of strings', () => {
  const { files: _omitted, ...withoutFiles } = standardCase();
  assert.match(checked([withoutFiles]).errors[0], /eval 1: files must be a list/);
  assert.match(errorsFor({ files: 'evals/files/1/a.txt' })[0], /files must be a list/);
  assert.match(errorsFor({ files: [{ path: 'a', content: 'b' }] })[0], /files\[0\] must be a path string/);
});

test('a fixture path must sit under evals/files and name a small text file', () => {
  const lookup = lookupOf({
    'evals/files/1/ok.txt': textFile(MAX_BYTES),
    'evals/files/1/big.txt': textFile(MAX_BYTES + 1),
    'evals/files/1/image.png': { kind: 'file', bytes: 10, isText: false },
    'evals/files/1/folder': { kind: 'dir' },
    'evals/files/1/link.txt': { kind: 'other' },
    'evals/fixtures/a.md': textFile(),
    'references/x.md': textFile(),
  });
  assert.deepEqual(errorsFor({ files: ['evals/files/1/ok.txt'] }, lookup), []);
  const expectations = [
    ['evals/fixtures/a.md', /must start with evals\/files\//],
    ['references/x.md', /must start with evals\/files\//],
    ['evals/files/../../SKILL.md', /must not contain \.\./],
    ['evals\\files\\1\\ok.txt', /must start with evals\/files\//],
    ['evals/files/1/gone.txt', /does not exist/],
    ['evals/files/1/folder', /is not a regular file/],
    ['evals/files/1/link.txt', /is not a regular file/],
    ['evals/files/1/big.txt', /larger than 64 KB/],
    ['evals/files/1/image.png', /is not text/],
  ];
  for (const [path, pattern] of expectations) {
    const errors = errorsFor({ files: [path] }, lookup);
    assert.equal(errors.length, 1, path);
    assert.match(errors[0], pattern, path);
  }
});

test('a fixture name must be usable on every platform CI runs on, and must not be picked up as a repo test', () => {
  const names = [
    'evals/files/1/what?.txt', 'evals/files/1/a:b.txt', 'evals/files/1/star*.md', 'evals/files/1/quote".txt',
    'evals/files/1/pipe|.txt', 'evals/files/1/lt<gt>.txt', 'evals/files/1/trailing-dot.', 'evals/files/1/trailing-space ',
    'evals/files/1/NUL', 'evals/files/1/con.txt', 'evals/files/1/sub/COM1.log', 'evals/files/1/cart.test.mjs',
  ];
  const lookup = lookupOf(Object.fromEntries(names.map((name) => [name, textFile()])));
  for (const name of names.slice(0, -1)) {
    const errors = errorsFor({ files: [name] }, lookup);
    assert.equal(errors.length, 1, name);
    assert.match(errors[0], /is not a valid file name on Windows/, name);
  }
  const testFile = errorsFor({ files: ['evals/files/1/cart.test.mjs'] }, lookup);
  assert.equal(testFile.length, 1);
  assert.match(testFile[0], /would be run by npm test/);

  const fine = ['evals/files/1/cart.test.mjs.txt', 'evals/files/1/console.txt', 'evals/files/1/src/a b.ts', 'evals/files/1/.env.example'];
  const fineLookup = lookupOf(Object.fromEntries(fine.map((name) => [name, textFile()])));
  for (const name of fine) assert.deepEqual(errorsFor({ files: [name] }, fineLookup), [], name);
});

test('a backslash anywhere in a fixture path is refused, as Git for Windows refuses it', () => {
  const lookup = lookupOf({ 'evals/files/1\\a.txt': textFile() });
  const errors = errorsFor({ files: ['evals/files/1\\a.txt'] }, lookup);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /is not a valid file name on Windows/);
});

test('fewer than two or more than five assertions is a warning', () => {
  const tooFew = checked([...sixCases().slice(1), standardCase({ id: 1, assertions: ['One.'], expectations: ['One.'] })]);
  assert.deepEqual(tooFew.errors, []);
  assert.ok(tooFew.warnings.some((line) => /eval 1: 1 assertion; the standard asks for 2 to 5/.test(line)), tooFew.warnings.join('\n'));
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];
  const tooMany = checked([...sixCases().slice(1), standardCase({ id: 1, assertions: six, expectations: six })]);
  assert.ok(tooMany.warnings.some((line) => /eval 1: 6 assertions; the standard asks for 2 to 5/.test(line)), tooMany.warnings.join('\n'));
});

test('agent evals must have an empty files list', () => {
  const doc = { agent_name: 'reviewer', evals: [standardCase({ files: ['evals/files/1/a.txt'] })] };
  const result = checkEvalDocument(doc, lookupOf({ 'evals/files/1/a.txt': textFile() }), { kind: 'agent' });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /agent evals cannot carry fixture files/);
});

test('assertions must be a non-empty list of non-blank strings', () => {
  for (const assertions of [undefined, [], 'one', [''], ['  '], [{ text: 'x' }]]) {
    const errors = errorsFor({ assertions, expectations: assertions });
    assert.ok(errors.some((line) => /assertions must be a non-empty list of sentences/.test(line)), JSON.stringify(assertions));
  }
});

test('expectations must repeat assertions exactly', () => {
  assert.match(errorsFor({ expectations: ['Different.'] })[0], /expectations must be the same list as assertions/);
  const { expectations: _omitted, ...withoutExpectations } = standardCase();
  assert.match(checked([withoutExpectations]).errors[0], /expectations must be the same list as assertions/);
  assert.match(
    errorsFor({ assertions: ['a', 'b'], expectations: ['b', 'a'] })[0],
    /expectations must be the same list as assertions/,
  );
});

test('expected_skill, when present, is null or a skill name', () => {
  assert.deepEqual(errorsFor({ expected_skill: null }), []);
  assert.deepEqual(errorsFor({ expected_skill: 'other-skill' }), []);
  for (const value of [false, '', 0, []]) {
    assert.match(errorsFor({ expected_skill: value })[0], /expected_skill must be null or a skill name/);
  }
});

test('the check reports a document it cannot read instead of throwing', () => {
  for (const doc of [null, {}, { skill_name: 'demo', evals: {} }]) {
    const result = checkEvalDocument(doc, lookupOf());
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /evals must be a list/);
  }
  const result = checked([standardCase(), null]);
  assert.match(result.errors[0], /eval at position 2 is not an object/);
});
