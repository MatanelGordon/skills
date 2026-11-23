// The only module that builds SQL. Routes call these helpers and never db.query directly.
const TABLES = new Set(['invoices', 'customers']);
const DEFAULT_LIMIT = 100;

function assertKnownTable(table) {
  if (!TABLES.has(table)) throw new Error(`unknown table: ${table}`);
}

export async function findAll(db, table, filters = {}, { limit = DEFAULT_LIMIT } = {}) {
  assertKnownTable(table);
  const columns = Object.keys(filters);
  const where = columns.length
    ? `WHERE ${columns.map((column, index) => `${column} = $${index + 1}`).join(' AND ')}`
    : '';
  const values = columns.map((column) => filters[column]);
  const result = await db.query(`SELECT * FROM ${table} ${where} ORDER BY id LIMIT ${Number(limit)}`, values);
  return result.rows;
}

export async function findById(db, table, id) {
  assertKnownTable(table);
  const result = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function insert(db, table, row) {
  assertKnownTable(table);
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const result = await db.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    columns.map((column) => row[column]),
  );
  return result.rows[0];
}
