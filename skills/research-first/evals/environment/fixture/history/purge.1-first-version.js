'use strict';

const { deleteLabel } = require('../carriers/client');
const { findPurgeable, forget } = require('./store');
const { pool } = require('../db');

const RETENTION_DAYS = 90;

async function purgeLabels() {
  const labelIds = await findPurgeable(RETENTION_DAYS);
  let purged = 0;

  for (const labelId of labelIds) {
    await deleteLabel(labelId);
    await forget(labelId);
    purged += 1;
  }

  return { candidates: labelIds.length, purged };
}

if (require.main === module) {
  purgeLabels()
    .then((result) => {
      console.log(`purged ${result.purged} of ${result.candidates} labels`);
      return pool.end();
    })
    .catch((error) => {
      console.error('purge failed', error);
      process.exit(1);
    });
}

module.exports = { purgeLabels };
