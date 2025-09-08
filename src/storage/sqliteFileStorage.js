"use strict";

const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3");

function generateUuid() {
  const crypto = require("crypto");
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class SqliteFileStorage {
  /**
   * options:
   *  - filepath: string (path to sqlite db file, default 'db/todo.db')
   *  - schemaPath: optional path to SQL schema file (default process.cwd()/db/schema.sql)
   *  - busyTimeout: ms to set PRAGMA busy_timeout (default 5000)
   */
  constructor(options = {}) {
    const {
      filepath = path.join("db", "todo.db"),
      schemaPath = path.join(process.cwd(), "db", "schema.sql"),
      busyTimeout = 5000,
    } = options;

    this.filepath = filepath;
    this.schemaPath = schemaPath;
    this.busyTimeout = Number(busyTimeout) || 5000;

    this.db = null;
    this._inited = false;
  }

  async init() {
    if (this._inited) return;
    const dir = path.dirname(this.filepath);
    await fs.mkdir(dir, { recursive: true });

    this.db = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.filepath, (err) => {
        if (err) return reject(err);
        // prefer serialized execution for correctness
        if (typeof db.serialize === "function") db.serialize();
        resolve(db);
      });
    });

    // useful pragmas
    await this._exec(`PRAGMA foreign_keys = ON;`);
    await this._exec(`PRAGMA journal_mode = WAL;`);
    await this._exec(`PRAGMA busy_timeout = ${this.busyTimeout};`);

    // Load schema file, fallback to embedded minimal schema
    let schemaSql = null;
    try {
      schemaSql = await fs.readFile(this.schemaPath, "utf8");
    } catch (err) {
      // fallback to a minimal inline schema if no file available
      schemaSql = `
PRAGMA foreign_keys = ON;
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at);
CREATE INDEX IF NOT EXISTS idx_todos_done ON todos (done);
      `;
    }
    await this._exec(schemaSql);

    this._inited = true;
  }

  async close() {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      this.db.close((err) => (err ? reject(err) : resolve()));
    });
    this.db = null;
    this._inited = false;
  }

  _ensureInit() {
    if (!this._inited) {
      throw new Error("SqliteFileStorage not initialized. Call init() first.");
    }
  }

  async addTodo(todoData) {
    this._ensureInit();
    if (
      !todoData ||
      typeof todoData.title !== "string" ||
      todoData.title.trim() === ""
    ) {
      throw new Error("title is required and must be a non-empty string");
    }
    const now = new Date().toISOString();
    const todo = {
      id: generateUuid(),
      title: todoData.title,
      description:
        typeof todoData.description === "string" ? todoData.description : "",
      done: !!todoData.done,
      createdAt: now,
      updatedAt: now,
    };

    const sql = `INSERT INTO todos (id, title, description, done, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [
      todo.id,
      todo.title,
      todo.description,
      todo.done ? 1 : 0,
      todo.createdAt,
      todo.updatedAt,
    ];
    await this._run(sql, params);
    return { ...todo };
  }

  async getAllTodos({ limit = null, offset = 0 } = {}) {
    this._ensureInit();
    let sql = `SELECT id, title, description, done, created_at, updated_at
               FROM todos
               ORDER BY created_at ASC`;
    const params = [];
    if (limit != null) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }
    const rows = await this._all(sql, params);
    return rows.map((r) => this._rowToTodo(r));
  }

  async getTodoById(id) {
    this._ensureInit();
    const row = await this._get(
      `SELECT id, title, description, done, created_at, updated_at FROM todos WHERE id = ?`,
      [id]
    );
    if (!row) return null;
    return this._rowToTodo(row);
  }

  async updateTodo(id, patch = {}) {
    this._ensureInit();
    const existing = await this.getTodoById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = {
      ...existing,
      title: typeof patch.title === "string" ? patch.title : existing.title,
      description:
        patch.description !== undefined
          ? String(patch.description)
          : existing.description,
      done: typeof patch.done === "boolean" ? patch.done : existing.done,
      updatedAt: now,
    };

    const sql = `UPDATE todos
                 SET title = ?, description = ?, done = ?, updated_at = ?
                 WHERE id = ?`;
    const params = [
      updated.title,
      updated.description,
      updated.done ? 1 : 0,
      updated.updatedAt,
      id,
    ];
    await this._run(sql, params);
    return { ...updated };
  }

  async deleteTodo(id) {
    this._ensureInit();
    const info = await this._run(`DELETE FROM todos WHERE id = ?`, [id]);
    return info.changes > 0;
  }

  _rowToTodo(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      done: row.done === 1 || row.done === true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  _run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  _get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) =>
        err ? reject(err) : resolve(row)
      );
    });
  }

  _all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) =>
        err ? reject(err) : resolve(rows)
      );
    });
  }
}

module.exports = SqliteFileStorage;
