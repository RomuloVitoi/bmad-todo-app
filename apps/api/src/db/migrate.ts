// Fail-fast schema-drift check. Does NOT apply migrations — that's `drizzle-kit migrate`.
// Resolves Architecture §Gap Analysis Gap #1.
//
// Reads the local journal, computes the SHA-256 of each migration SQL file, and
// compares to the hashes recorded in the DB's `drizzle.__drizzle_migrations` table.
// Exit 0 when applied state matches journal; exit 1 (with details) on any drift.
//
// Resolves `drizzle/` relative to this module so the script works from any cwd.

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

const drizzleDir = join(import.meta.dirname, '..', '..', 'drizzle');

async function readJournal(): Promise<Journal> {
  const journalPath = join(drizzleDir, 'meta', '_journal.json');
  let raw: string;
  try {
    raw = await readFile(journalPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        `ERROR: ${journalPath} not found. Run \`drizzle-kit generate\` from apps/api/, ` +
          `or invoke db:check from apps/api/.`,
      );
    } else {
      console.error(`ERROR: Could not read ${journalPath}: ${(err as Error).message}`);
    }
    process.exit(1);
  }
  try {
    return JSON.parse(raw) as Journal;
  } catch (err) {
    console.error(`ERROR: ${journalPath} is malformed JSON: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function expectedHashFor(tag: string): Promise<string> {
  const sqlPath = join(drizzleDir, `${tag}.sql`);
  let sql: string;
  try {
    sql = await readFile(sqlPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        `ERROR: Migration SQL file ${sqlPath} is missing (referenced by _journal.json tag '${tag}'). ` +
          `The migration was never committed, or your working tree is out of sync.`,
      );
    } else {
      console.error(`ERROR: Could not read ${sqlPath}: ${(err as Error).message}`);
    }
    process.exit(1);
  }
  return createHash('sha256').update(sql).digest('hex');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const journal = await readJournal();
  const sortedEntries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  if (sortedEntries.length === 0) {
    console.error(
      'ERROR: drizzle/meta/_journal.json has no migration entries. ' +
        'No schema is being tracked — run `drizzle-kit generate` to author the first migration.',
    );
    process.exit(1);
  }

  const expected = await Promise.all(
    sortedEntries.map(async (entry) => ({
      tag: entry.tag,
      hash: await expectedHashFor(entry.tag),
    })),
  );
  // Safe: we exited above if sortedEntries.length === 0.
  const latestTag = expected[expected.length - 1]!.tag;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    let applied: { hash: string }[];
    try {
      const result = await pool.query<{ hash: string }>(
        'SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id ASC',
      );
      applied = result.rows;
    } catch (err) {
      console.error(
        'ERROR: Could not read drizzle.__drizzle_migrations. ' +
          'The database has no migrations table — run `drizzle-kit migrate` first.',
      );
      console.error(`(underlying: ${(err as Error).message})`);
      process.exit(1);
    }

    if (applied.length < expected.length) {
      console.error(
        `ERROR: Schema drift. Expected ${expected.length} migration(s) ` +
          `(latest tag '${latestTag}'), but DB has only ${applied.length} applied.`,
      );
      console.error('Run `drizzle-kit migrate` to bring the DB up to date.');
      process.exit(1);
    }

    if (applied.length > expected.length) {
      console.error(
        `ERROR: DB has ${applied.length} migration(s) applied, but your working tree only ` +
          `knows about ${expected.length} (latest tag '${latestTag}').`,
      );
      console.error(
        'Pull/rebase your working tree to match the deployed schema. ' +
          'Do NOT run `drizzle-kit migrate` — that would attempt to roll-forward against an already-ahead DB.',
      );
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
  } finally {
    await pool.end();
  }

  // Silent on success per AC #6 ("exits 0 silently").
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('ERROR: Unexpected failure in fail-fast check:', err);
  process.exit(1);
});
