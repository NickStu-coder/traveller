import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { expect, it } from 'vitest';

const run = promisify(execFile);

it.skipIf(process.env.TRAVELLER_DATABASE_TESTS !== '1')('installs an empty database and preserves access state on repeated startup', async () => {
  const source = new URL(process.env.DATABASE_URL ?? '');
  if (source.pathname !== '/traveller_test' || !['localhost', '127.0.0.1', 'database'].includes(source.hostname))
    throw new Error('Migration tests require the dedicated traveller_test database');
  const databaseName = `traveller_install_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: source.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  source.pathname = `/${databaseName}`;
  const database = new pg.Client({ connectionString: source.href });
  const env = { ...process.env, DATABASE_URL: source.href, TRAVELLER_AUTH_MODE: 'individual' };
  for (const key of Object.keys(env)) if (key.startsWith('SIDEDOOR_IMPORT_')) delete env[key as keyof typeof env];
  const root = resolve('../..');
  const install = () => run('npm', ['run', 'db:push'], { cwd: root, env, timeout: 90_000, maxBuffer: 1024 * 1024 });
  try {
    await database.connect();
    await install();
    const migrations = await database.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
    expect(migrations.rows.map(row => row.migration_name)).toEqual([
      '20261006000000_upstream_baseline', '20261006010000_traveller_profiles',
      '20261006020000_traveller_workers', '20261006030000_traveller_trips_alerts',
      '20261006040000_traveller_delivery',
    ]);
    const accessBefore = (await database.query('SELECT state FROM "SidedoorState" WHERE id = \'access\'')).rows[0]?.state;
    expect(accessBefore).toMatchObject({ mode: 'individual', principals: [] });
    await install();
    expect((await database.query('SELECT state FROM "SidedoorState" WHERE id = \'access\'')).rows[0]?.state).toEqual(accessBefore);
    expect((await database.query('SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows[0]?.count).toBe(5);
  } finally {
    await database.end();
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}, 180_000);
