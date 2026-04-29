// Fail-fast schema-drift check. Does NOT apply migrations — that's `drizzle-kit migrate`.
// Resolves Architecture §Gap Analysis Gap #1.
//
// Reads the local journal, computes the SHA-256 of each migration SQL file, and
// compares to the hashes recorded in the DB's `drizzle.__drizzle_migrations` table.
// Exit 0 when applied state matches journal; exit 1 (with details) on any drift.
//
// Must be invoked from the `apps/api/` directory (the `db:check` npm script does this).

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Pool } from 'pg';

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  version: string;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const drizzleDir = join(process.cwd(), 'drizzle');

async function readJournal(): Promise<Journal> {
  const raw = await readFile(join(drizzleDir, 'meta', '_journal.json'), 'utf-8');
  return JSON.parse(raw) as Journal;
}

async function expectedHashFor(tag: string): Promise<string> {
  const sql = await readFile(join(drizzleDir, `${tag}.sql`), 'utf-8');
  return createHash('sha256').update(sql).digest('hex');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const journal = await readJournal();
  const sortedEntries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  const expected = await Promise.all(
    sortedEntries.map(async (entry) => ({
      tag: entry.tag,
      hash: await expectedHashFor(entry.tag),
    })),
  );

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let applied: { hash: string }[];
  try {
    const result = await pool.query<{ hash: string }>(
      'SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id ASC',
    );
    applied = result.rows;
  } catch (err) {
    await pool.end();
    console.error(
      'ERROR: Could not read drizzle.__drizzle_migrations. ' +
        'The database has no migrations table — run `drizzle-kit migrate` first.',
    );
    console.error(`(underlying: ${(err as Error).message})`);
    process.exit(1);
  }

  await pool.end();

  if (applied.length !== expected.length) {
    const latestExpected = expected[expected.length - 1];
    const latestTag = latestExpected ? latestExpected.tag : '(none)';
    console.error(
      `ERROR: Schema drift. Expected ${expected.length} migration(s) ` +
        `(latest tag '${latestTag}'), but DB has ${applied.length} applied.`,
    );
    console.error('Run `drizzle-kit migrate` to bring the DB up to date.');
    process.exit(1);
  }

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const app = applied[i];
    if (!exp || !app) {
      console.error(`ERROR: Internal: missing entry at index ${i}.`);
      process.exit(1);
    }
    if (app.hash !== exp.hash) {
      console.error(
        `ERROR: Schema drift at migration #${i} (tag '${exp.tag}'). ` +
          `Expected hash ${exp.hash}, applied hash ${app.hash}.`,
      );
      console.error(
        'The migration file has been edited after it was applied. Generate a new migration instead.',
      );
      process.exit(1);
    }
  }

  // Silent on success per AC #6 ("exits 0 silently").
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('ERROR: Unexpected failure in fail-fast check:', err);
  process.exit(1);
});
