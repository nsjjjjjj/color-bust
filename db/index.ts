import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type DatabaseResult = {
  meta: {
    changes: number;
    last_row_id: number | bigint;
  };
};

export class PreparedQuery {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: SQLInputValue[];

  constructor(database: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: SQLInputValue[]): PreparedQuery {
    return new PreparedQuery(this.#database, this.#sql, values);
  }

  async run(): Promise<DatabaseResult> {
    const result = this.#database.prepare(this.#sql).run(...this.#values);
    return {
      meta: {
        changes: Number(result.changes),
        last_row_id: result.lastInsertRowid,
      },
    };
  }

  async first<T>(): Promise<T | null> {
    return (this.#database.prepare(this.#sql).get(...this.#values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return {
      results: this.#database.prepare(this.#sql).all(...this.#values) as T[],
    };
  }
}

export class AppDatabase {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(path);
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA busy_timeout = 5000");
  }

  prepare(sql: string): PreparedQuery {
    return new PreparedQuery(this.#database, sql);
  }

  async batch(statements: PreparedQuery[]): Promise<DatabaseResult[]> {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const results: DatabaseResult[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.#database.exec("COMMIT");
      return results;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

const databasePath = process.env.DATABASE_PATH ?? resolve(process.env.DATA_DIR ?? "data", "deck-mayhem.sqlite");
if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

const globalDatabase = globalThis as typeof globalThis & {
  __deckMayhemDatabase?: AppDatabase;
};

export function getD1(): AppDatabase {
  globalDatabase.__deckMayhemDatabase ??= new AppDatabase(databasePath);
  return globalDatabase.__deckMayhemDatabase;
}
