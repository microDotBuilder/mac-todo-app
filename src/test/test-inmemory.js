// test/test-filestorage.js
"use strict";

const assert = require("assert").strict;
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const FileStorage = require("../storage/fileStorage.js");

async function runTests() {
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "todo-test-"));
  const dbDir = path.join(tmpBase, "db");
  const filePath = path.join(dbDir, "todo.json");

  // create parent dir and an empty file to simulate your existing empty file
  await fs.mkdir(dbDir, { recursive: true });
  await fs.writeFile(filePath, "", "utf8");

  // 1) init with empty file
  const storage = new FileStorage({
    filepath: filePath,
    pretty: true,
    mode: "onClose",
  });
  await storage.init();
  let all = await storage.getAllTodos();
  assert.equal(Array.isArray(all), true);
  assert.equal(all.length, 0);

  // 2) add 3 todos
  const a = await storage.addTodo({ title: "One", description: "first" });
  const b = await storage.addTodo({ title: "Two" });
  const c = await storage.addTodo({ title: "Three" });

  assert.ok(a.id && b.id && c.id);
  all = await storage.getAllTodos();
  assert.equal(all.length, 3);

  // 3) limit/offset
  const limited = await storage.getAllTodos({ limit: 2, offset: 1 });
  assert.equal(limited.length, 2);
  assert.equal(limited[0].id, b.id);

  // 4) update existing
  const updated = await storage.updateTodo(b.id, {
    title: "Two edited",
    done: true,
  });
  assert.equal(updated.title, "Two edited");
  assert.equal(updated.done, true);

  // 5) update missing -> null
  const updMissing = await storage.updateTodo("no-such", { title: "x" });
  assert.equal(updMissing, null);

  // 6) delete existing
  const del = await storage.deleteTodo(c.id);
  assert.equal(del, true);
  all = await storage.getAllTodos();
  assert.equal(all.length, 2);

  // 7) delete missing
  const delMissing = await storage.deleteTodo("no-such");
  assert.equal(delMissing, false);

  // 8) flush() should write pretty JSON
  await storage.flush();

  // read file and check content
  const disk = await fs.readFile(filePath, "utf8");
  assert.ok(disk.trim().length > 0);
  const parsed = JSON.parse(disk);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 2);

  // quick check for pretty printing (has newlines and indentation)
  assert.ok(
    disk.includes("\n  "),
    "expected pretty-printed JSON (with indentation)"
  );

  // 9) immediate mode writes per-operation
  const storage2 = new FileStorage({
    filepath: filePath,
    pretty: true,
    mode: "immediate",
  });
  await storage2.init();

  // start fresh: delete any todos
  const existing = await storage2.getAllTodos();
  for (const t of existing) {
    await storage2.deleteTodo(t.id);
  }
  // after deletes in immediate mode file should be updated
  const afterDeletes = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(afterDeletes.length, 0);

  // add one in immediate mode and ensure file contains it
  const added = await storage2.addTodo({ title: "Immediate" });
  const disk2 = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(disk2.length, 1);
  assert.equal(disk2[0].title, "Immediate");

  await storage2.close();

  // cleanup
  await fs.rm(tmpBase, { recursive: true, force: true });

  console.log("FileStorage tests passed ✅");
}

runTests().catch((err) => {
  console.error("Tests failed ❌");
  console.error(err);
  process.exitCode = 1;
});
