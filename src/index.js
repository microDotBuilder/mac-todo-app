const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron/main");
const path = require("node:path");
const Database = require("./database.js");
const FileStorage = require("./storage/fileStorage.js");
const SqliteFileStorage = require("./storage/sqliteFileStorage.js");
const { getLogger } = require("./logger/logg.js");

const logger = getLogger("main");

logger.info(`__dirname : ${__dirname}`);

const fileStoragePath = path.join(__dirname, "db", "todo.json");
const sqliteFileStoragePath = path.join(__dirname, "db", "todo.db");

const SQLITE_FLAG = true;
if (SQLITE_FLAG) logger.info("Using SQLite File Storage feature flag");

const fileStorage = SQLITE_FLAG
  ? new SqliteFileStorage({
      filepath: sqliteFileStoragePath,
    })
  : new FileStorage({
      filepath: fileStoragePath,
    });
const database = new Database(fileStorage);
let win;
(() => {
  try {
    database.init();
    logger.info("Database initialized");
  } catch (error) {
    logger.error(error);
  }
})();

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("src/index.html");

  // No history navigation UI anymore
}

ipcMain.handle("dark-mode:toggle", () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = "light";
  } else {
    nativeTheme.themeSource = "dark";
  }
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle("sql-flag:get", () => {
  return SQLITE_FLAG;
});

ipcMain.handle("dark-mode:system", () => {
  nativeTheme.themeSource = "system";
});

// Removed navigation-related IPC and events

ipcMain.on("todo:add", (event, todo) => {
  //add todo to database
  logger.info(`todo : ${JSON.stringify(todo, null, 2)}`);
  try {
    logger.info(`adding todo : ${JSON.stringify(todo, null, 2)}`);
    database.addTodo(todo);
    logger.info(`todo added : ${JSON.stringify(todo, null, 2)}`);
  } catch (error) {
    logger.error(error);
  }
});

ipcMain.handle("todo:get", async () => {
  try {
    const todos = await database.getAllTodos();
    // log(levels.info, `todos : ${JSON.stringify(todos, null, 2)}`);
    return todos;
  } catch (error) {
    logger.error(error);
    throw error;
  }
});

ipcMain.handle("todo:update", async (event, todoData) => {
  try {
    logger.info(`updating todo : ${JSON.stringify(todoData, null, 2)}`);
    const updatedTodo = await database.updateTodo(todoData.id, todoData);
    logger.info(`todo updated : ${JSON.stringify(updatedTodo, null, 2)}`);
    return updatedTodo;
  } catch (error) {
    logger.error(error);
    throw error;
  }
});

ipcMain.handle("todo:delete", async (event, todoData) => {
  try {
    logger.info(`deleting todo : ${JSON.stringify(todoData, null, 2)}`);
    const deleted = await database.deleteTodo(todoData.id);
    logger.info(`todo deleted : ${deleted}`);
    return deleted;
  } catch (error) {
    logger.error(error);
    throw error;
  }
});

ipcMain.handle("todo:get-by-id", async (event, id) => {
  try {
    logger.info(`getting todo by id : ${id}`);
    const todo = await database.getTodoById(id);
    logger.info(`todo retrieved : ${JSON.stringify(todo, null, 2)}`);
    return todo;
  } catch (error) {
    logger.error(error);
    throw error;
  }
});

// Navigate to edit page
ipcMain.on("navigate:edit", (event, todoId) => {
  if (win) {
    win.loadFile("src/edit/edit.html");
    // Store the todo ID for the edit page to retrieve
    win.todoId = todoId;
  }
});

// Navigate back to main page
ipcMain.on("navigate:main", () => {
  if (win) {
    win.loadFile("src/index.html");
    win.todoId = null; // Clear the stored todo ID
  }
});

// Get current todo ID for edit page
ipcMain.handle("todo:get-current-id", () => {
  return win ? win.todoId : null;
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  try {
    database.close();
    logger.info("Database closed");
  } catch (error) {
    logger.error(error);
  }
  if (process.platform !== "darwin") app.quit();
});
