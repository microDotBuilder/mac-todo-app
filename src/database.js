// src/database.js
"use strict";

class Database {
  /**
   * storage must implement the storage interface:
   *  - init(): Promise<void> (optional)
   *  - close(): Promise<void> (optional)
   *  - getAllTodos({ limit, offset } = {}): Promise<Todo[]>
   *  - getTodoById(id): Promise<Todo | null>
   *  - addTodo(todoData): Promise<Todo>
   *  - updateTodo(id, patch): Promise<Todo | null>
   *  - deleteTodo(id): Promise<boolean>
   */
  constructor(storage) {
    if (!storage) throw new Error("storage implementation required");
    this.storage = storage;
  }

  async init() {
    if (typeof this.storage.init === "function") {
      await this.storage.init();
    }
  }

  async close() {
    if (typeof this.storage.close === "function") {
      await this.storage.close();
    }
  }

  async getAllTodos(opts = {}) {
    return this.storage.getAllTodos(opts);
  }

  async getTodoById(id) {
    return this.storage.getTodoById(id);
  }

  /**
   *
   * @param {TodoData} todoData
   * @typedef {Object} TodoData
   * @property {string} title
   * @property {string} description
   * @property {boolean} done
   * @property {string} createdAt
   * @property {string} updatedAt
   * @returns
   */
  async addTodo(todoData) {
    return this.storage.addTodo(todoData);
  }

  async updateTodo(id, patch) {
    return this.storage.updateTodo(id, patch);
  }

  async deleteTodo(id) {
    return this.storage.deleteTodo(id);
  }
}

module.exports = Database;
