"use strict";

const assert = require("assert").strict;
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const SqliteFileStorage = require("../storage/sqliteFileStorage.js");

const SCHEMA_SQL = `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  run_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER IF NOT EXISTS todos_touch_updated_at
AFTER UPDATE ON todos
FOR EACH ROW
BEGIN
  UPDATE todos
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at);
CREATE INDEX IF NOT EXISTS idx_todos_done ON todos (done);
`;

async function runTests() {
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "todo-sqlite-test-"));
  const dbDir = path.join(tmpBase, "db");
  const schemaPath = path.join(dbDir, "schema.sql");
  const dbFile = path.join(dbDir, "todo.db");

  await fs.mkdir(dbDir, { recursive: true });
  await fs.writeFile(schemaPath, SCHEMA_SQL, "utf8");

  const storage = new SqliteFileStorage({
    filepath: dbFile,
    schemaPath,
    busyTimeout: 2000,
  });

  // init should create DB file and schema
  await storage.init();

  // DB file should exist
  const stat = await fs.stat(dbFile);
  assert.ok(stat.isFile(), "sqlite db file should exist");

  // start with empty
  let all = await storage.getAllTodos();
  assert.equal(Array.isArray(all), true);
  assert.equal(all.length, 0);

  // add 3 todos with tiny delays to ensure distinct createdAt timestamps
  const t1 = await storage.addTodo({ title: "S1", description: "first" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const t2 = await storage.addTodo({ title: "S2" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const t3 = await storage.addTodo({ title: "S3" });

  assert.ok(t1.id && t2.id && t3.id);
  all = await storage.getAllTodos();
  assert.equal(all.length, 3);
  assert.equal(all[0].id, t1.id, "ordered by createdAt asc");
  assert.equal(all[1].id, t2.id, "ordered by createdAt asc");
  assert.equal(all[2].id, t3.id, "ordered by createdAt asc");

  // get by id
  const fetched = await storage.getTodoById(t2.id);
  assert.deepEqual(fetched, t2);

  // missing get returns null
  const missing = await storage.getTodoById("no-such");
  assert.equal(missing, null);

  // update t2
  const before = await storage.getTodoById(t2.id);
  const updated = await storage.updateTodo(t2.id, {
    title: "S2-ed",
    done: true,
  });
  assert.equal(updated.title, "S2-ed");
  assert.equal(updated.done, true);
  assert.equal(updated.createdAt, before.createdAt);
  assert.notEqual(updated.updatedAt, before.updatedAt);

  // update missing -> null
  const updMissing = await storage.updateTodo("no-such-id", { title: "x" });
  assert.equal(updMissing, null);

  // delete t3
  const deleted = await storage.deleteTodo(t3.id);
  assert.equal(deleted, true);
  all = await storage.getAllTodos();
  assert.equal(all.length, 2);

  // delete missing returns false
  const delMissing = await storage.deleteTodo("no-such");
  assert.equal(delMissing, false);

  // close storage
  await storage.close();

  // Re-open and ensure data persisted
  const storage2 = new SqliteFileStorage({ filepath: dbFile, schemaPath });
  await storage2.init();
  const afterReopen = await storage2.getAllTodos();
  assert.equal(afterReopen.length, 2);

  // clean up
  await storage2.close();
  await fs.rm(tmpBase, { recursive: true, force: true });

  console.log("SqliteFileStorage tests passed ✅");
}

runTests().catch((err) => {
  console.error("SqliteFileStorage tests failed ❌");
  console.error(err);
  process.exitCode = 1;
});
