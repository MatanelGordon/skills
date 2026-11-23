'use strict';

const path = require('node:path');
const jobs = require('../../config/jobs.json');
const { salesByDay } = require('../reports/queries');
const { deliver } = require('./deliver');

const EXPORTERS_DIR = path.join(__dirname, '..', 'exporters');

async function runJob(name, today = new Date()) {
  const job = jobs[name];
  if (!job) throw new Error(`unknown job '${name}'`);

  const day = today.toISOString().slice(0, 10);
  const exporter = require(path.join(EXPORTERS_DIR, job.format));
  const rows = await salesByDay(job.partnerId, day, day);
  await deliver(job.target, exporter.exportReport(rows));
  return { name, rows: rows.length };
}

if (require.main === module) {
  runJob(process.argv[2])
    .then((result) => console.log(`${result.name}: delivered ${result.rows} rows`))
    .catch((error) => {
      console.error('job failed', error);
      process.exit(1);
    });
}

module.exports = { runJob };
