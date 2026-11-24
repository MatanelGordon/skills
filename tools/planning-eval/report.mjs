/**
 * Turns scored attempts (from score.mjs) into counts and a Markdown report.
 * Negative cases (`expected_skill: null`) keep their own rows but stay out of
 * the totals: loading the skill there is a false trigger, not a help.
 */
const ARMS = Object.freeze(['with-skill', 'without-skill']);
const LOADED_ONLY = 'with-skill, loaded';
const NOT_APPLICABLE = 'n/a';

const emptyCount = () => ({
  scored: 0, invalid: 0, factsReflected: 0, consultable: 0, sourceConsulted: 0, loaded: 0,
});

// `consultable` counts the scored attempts whose case says where its fact lives.
const addTrial = (count, trial) => (trial.status === 'invalid'
  ? { ...count, invalid: count.invalid + 1 }
  : {
    ...count,
    scored: count.scored + 1,
    factsReflected: count.factsReflected + (trial.factsReflected ? 1 : 0),
    consultable: count.consultable + (trial.sourceConsulted === null ? 0 : 1),
    sourceConsulted: count.sourceConsulted + (trial.sourceConsulted ? 1 : 0),
    loaded: count.loaded + (trial.loaded ? 1 : 0),
  });

const compareCaseIds = (left, right) => left.localeCompare(right, 'en', { numeric: true });
const isCounted = (trial) => trial.status === 'scored' || trial.status === 'invalid';

/** Counts per case and arm, per arm, and for the with-skill attempts that loaded the skill. */
export function summarise(trials) {
  const counted = trials.filter(isCounted);
  const caseIds = [...new Set(counted.map((trial) => trial.caseId))].sort(compareCaseIds);

  const cases = caseIds.flatMap((caseId) => ARMS
    .map((arm) => ({ caseId, arm, trials: counted.filter((trial) => trial.caseId === caseId && trial.arm === arm) }))
    .filter((group) => group.trials.length > 0)
    .map((group) => ({ caseId: group.caseId, arm: group.arm, ...group.trials.reduce(addTrial, emptyCount()) })));

  const totalled = counted.filter((trial) => !trial.negative);
  const totalFor = (keep) => totalled.filter(keep).reduce(addTrial, emptyCount());
  const totals = {
    'with-skill': totalFor((trial) => trial.arm === 'with-skill'),
    [LOADED_ONLY]: totalFor((trial) => trial.arm === 'with-skill' && trial.status === 'scored' && trial.loaded),
    'without-skill': totalFor((trial) => trial.arm === 'without-skill'),
  };
  return { cases, totals };
}

const ratio = (count, of) => `${count}/${of}`;

function row(label, arm, count) {
  const loaded = arm === 'without-skill' ? NOT_APPLICABLE : ratio(count.loaded, count.scored);
  const opened = count.consultable ? ratio(count.sourceConsulted, count.consultable) : NOT_APPLICABLE;
  const facts = ratio(count.factsReflected, count.scored);
  return `| ${label} | ${arm} | ${count.scored} | ${loaded} | ${opened} | ${facts} | ${count.invalid} |`;
}

const scoredIn = (trials, caseId, arm) => trials
  .filter((trial) => trial.caseId === caseId && trial.arm === arm && trial.status === 'scored');

/** One row per reply check: how many scored attempts passed it in each arm. */
function checkRows(trials) {
  const caseIds = [...new Set(trials.filter((trial) => trial.status === 'scored').map((trial) => trial.caseId))]
    .sort(compareCaseIds);
  return caseIds.flatMap((caseId) => {
    const sample = trials.find((trial) => trial.caseId === caseId && trial.status === 'scored');
    return sample.facts.map((fact, index) => {
      const cell = (arm) => {
        const scored = scoredIn(trials, caseId, arm);
        return scored.length ? ratio(scored.filter((trial) => trial.facts[index].passed).length, scored.length) : 'not run';
      };
      const check = fact.check.replaceAll('|', '\\|');
      return `| ${caseId} | \`${check}\` | ${cell('with-skill')} | ${cell('without-skill')} |`;
    });
  });
}

/** Lines under the tables for what the counts leave out. */
function notes(trials) {
  const byCase = (keep) => [...new Set(trials.filter(keep).map((trial) => trial.caseId))].sort(compareCaseIds);
  const negative = byCase((trial) => trial.negative && isCounted(trial))
    .map((caseId) => `Case ${caseId} is a negative case (\`expected_skill: null\`): its rows are shown, its attempts are not in the totals.`);
  const skipped = byCase((trial) => (trial.skippedChecks ?? []).length > 0).map((caseId) => {
    const types = [...new Set(trials.filter((trial) => trial.caseId === caseId).flatMap((trial) => trial.skippedChecks ?? []))];
    return `case ${caseId}: ${types.map((type) => `\`${type}\``).join(', ')} not checked here (it needs the container); SkillEvaluator applies it.`;
  });
  const unscored = trials.filter((trial) => trial.status === 'no-checks').length;
  const unscoredLine = unscored ? [`${unscored} attempt(s) belong to cases without reply checks and are not counted.`] : [];
  return [...negative, ...skipped, ...unscoredLine];
}

/** The report as Markdown: one row per case and arm, the totals, then each reply check. */
export function renderMarkdown(report) {
  const { cases, totals } = report.summary;
  const extra = notes(report.trials);
  const lines = [
    `### ${report.skill}`,
    '',
    '| Case | Arm | Scored attempts | Skill loaded | Source opened | Facts reflected | Invalid |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...cases.map((count) => row(count.caseId, count.arm, count)),
    ...Object.entries(totals).map(([arm, count]) => row('all', arm, count)),
    '',
    '| Case | Reply check | with-skill | without-skill |',
    '| --- | --- | --- | --- |',
    ...checkRows(report.trials),
    ...(extra.length ? ['', ...extra] : []),
  ];
  return `${lines.join('\n')}\n`;
}
