// src/storage/fileStorage.js
"use strict";

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

function generateUuid() {
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // lightweight fallback UUIDv4 (not cryptographically strong)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class FileStorage {
  /**
   * options:
   *  - filepath: string (default 'db/todo.json')
   *  - pretty: boolean (default true)
   *  - mode: 'onClose' | 'immediate' (default 'onClose')
   *  - fsModule: optional injection for fs/promises (for testing)
   */
  constructor(options = {}) {
    const {
      filepath = path.join("db", "todo.json"),
      pretty = true,
      mode = "onClose",
      fsModule = fs,
    } = options;

    if (!["onClose", "immediate"].includes(mode)) {
      throw new Error("mode must be 'onClose' or 'immediate'");
    }

    this.filepath = filepath;
    this.pretty = !!pretty;
    this.mode = mode;
    this.fs = fsModule;

    this._map = new Map();
    this._inited = false;
    this._dirty = false;
  }

  async init() {
    if (this._inited) return;
    this._inited = true;

    const dir = path.dirname(this.filepath);
    try {
      await this.fs.mkdir(dir, { recursive: true });
    } catch (err) {
      // If mkdir fails, let the error surface
      throw err;
    }

    // If file missing or empty or invalid, treat as empty array (do not overwrite file yet)
    let content = null;
    try {
      content = await this.fs.readFile(this.filepath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        // missing file — start with empty
        this._map = new Map();
        this._dirty = true; // since in-memory differs from disk (no file)
        return;
      }
      throw err;
    }

    if (!content || content.trim().length === 0) {
      // empty file
      this._map = new Map();
      this._dirty = true;
      return;
    }

    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        // invalid shape -> treat as empty
        this._map = new Map();
        this._dirty = true;
        return;
      }
      const map = new Map();
      for (const item of parsed) {
        if (item && typeof item.id === "string") {
          map.set(item.id, item);
        }
      }
      this._map = map;
      this._dirty = false;
      return;
    } catch (err) {
      // invalid JSON
      this._map = new Map();
      this._dirty = true;
      return;
    }
  }

  async close() {
    if (!this._inited) return;
    if (this.mode === "onClose" && this._dirty) {
      console.log("Writing to disk");
      await this._writeToDisk();
      console.log("Written to disk");
    }
    this._inited = false;
  }

  async flush() {
    await this._writeToDisk();
  }

  _ensureInit() {
    if (!this._inited) {
      // allow lazy init
      this._inited = true;
      if (!this._map) this._map = new Map();
      this._dirty = true;
    }
  }

  _clone(todo) {
    return { ...todo };
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
    this._map.set(todo.id, todo);
    this._dirty = true;

    if (this.mode === "immediate") {
      await this._writeToDisk();
    }

    return this._clone(todo);
  }

  async getAllTodos({ limit = null, offset = 0 } = {}) {
    this._ensureInit();
    const items = Array.from(this._map.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    if (limit == null) return items.map((i) => this._clone(i));
    return items.slice(offset, offset + limit).map((i) => this._clone(i));
  }

  async getTodoById(id) {
    this._ensureInit();
    if (!this._map.has(id)) return null;
    return this._clone(this._map.get(id));
  }

  async updateTodo(id, patch = {}) {
    this._ensureInit();
    if (!this._map.has(id)) return null;
    const existing = this._map.get(id);
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
    this._map.set(id, updated);
    this._dirty = true;

    if (this.mode === "immediate") {
      await this._writeToDisk();
    }

    return this._clone(updated);
  }

  async deleteTodo(id) {
    this._ensureInit();
    if (!this._map.has(id)) return false;
    this._map.delete(id);
    this._dirty = true;

    if (this.mode === "immediate") {
      await this._writeToDisk();
    }

    return true;
  }

  async _writeToDisk() {
    const dir = path.dirname(this.filepath);
    const tmpName = `${path.basename(
      this.filepath
    )}.tmp-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(16)}`;
    const tmpPath = path.join(dir, tmpName);

    // Prepare array sorted by createdAt asc
    const arr = Array.from(this._map.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );

    const json = this.pretty
      ? JSON.stringify(arr, null, 2) + "\n"
      : JSON.stringify(arr);

    try {
      console.log("Writing to temp file");
      console.log(`tmpPath : ${tmpPath}`);
      // write temp file then rename
      await this.fs.writeFile(tmpPath, json, "utf8");
      console.log("Renaming temp file");
      await this.fs.rename(tmpPath, this.filepath);
      console.log("Renamed temp file");
      this._dirty = false;
    } catch (err) {
      // cleanup tmp file if exists (best-effort)
      try {
        await this.fs.rm(tmpPath, { force: true });
      } catch (e) {
        // ignore
      }
      throw err;
    }
  }
}

module.exports = FileStorage;
