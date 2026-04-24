import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';

const META_TABLE = 'SequelizeMeta';

interface Migration {
  up: (params: { context: ReturnType<Sequelize['getQueryInterface']> }) => Promise<void>;
  down: (params: { context: ReturnType<Sequelize['getQueryInterface']> }) => Promise<void>;
}

async function ensureMeta(sequelize: Sequelize): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "${META_TABLE}" (
      name VARCHAR(255) NOT NULL,
      PRIMARY KEY (name)
    )
  `);
}

function migrationFiles(): string[] {
  const ext = path.extname(__filename).slice(1) || 'js';
  const dir = path.join(__dirname, 'migrations');
  return fs.readdirSync(dir).filter(f => f.endsWith(`.${ext}`)).sort();
}

function loadMigration(file: string): Migration {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(__dirname, 'migrations', file)) as Migration;
}

export async function migrateUp(sequelize: Sequelize): Promise<void> {
  await ensureMeta(sequelize);
  const qi = sequelize.getQueryInterface();
  const [rows] = await sequelize.query(`SELECT name FROM "${META_TABLE}"`);
  const applied = new Set((rows as { name: string }[]).map(r => r.name));

  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    await loadMigration(file).up({ context: qi });
    await sequelize.query(`INSERT INTO "${META_TABLE}" (name) VALUES (:name)`, {
      replacements: { name: file },
    });
    console.log(`Migrated:  ${file}`);
  }
}

export async function migrateDown(sequelize: Sequelize): Promise<void> {
  const qi = sequelize.getQueryInterface();
  const [rows] = await sequelize.query(
    `SELECT name FROM "${META_TABLE}" ORDER BY name DESC LIMIT 1`,
  );
  const last = (rows as { name: string }[])[0];
  if (!last) { console.log('Nothing to undo'); return; }

  await loadMigration(last.name).down({ context: qi });
  await sequelize.query(`DELETE FROM "${META_TABLE}" WHERE name = :name`, {
    replacements: { name: last.name },
  });
  console.log(`Reverted:  ${last.name}`);
}

export async function migrateStatus(sequelize: Sequelize): Promise<void> {
  const files = migrationFiles();
  let applied: Set<string>;
  try {
    const [rows] = await sequelize.query(`SELECT name FROM "${META_TABLE}"`);
    applied = new Set((rows as { name: string }[]).map(r => r.name));
  } catch {
    applied = new Set();
  }
  console.log('Executed:', files.filter(f => applied.has(f)));
  console.log('Pending: ', files.filter(f => !applied.has(f)));
}
