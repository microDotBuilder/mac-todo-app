const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron/main");
const path = require("node:path");
const Database = require("./database.js");
const FileStorage = require("./storage/fileStorage.js");

console.log(`__dirname : ${__dirname}`);
const fileStoragePath = path.join(__dirname, "/db/todo.json");

const database = new Database(
  new FileStorage({
    filepath: fileStoragePath,
  })
);
let win;
(() => {
  try {
    database.init();
    console.log("Database initialized");
  } catch (error) {
    console.error(error);
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

  // Update renderer navigation state whenever navigation occurs
  const sendNavState = () => {
    if (!win || !win.webContents) return;
    win.webContents.send("nav:update", {
      canGoBack: win.webContents.navigationHistory.canGoBack(),
      canGoForward: win.webContents.navigationHistory.canGoForward(),
    });
  };

  win.webContents.on("did-navigate", sendNavState);
  win.webContents.on("did-navigate-in-page", sendNavState);
  // Also send initial state when ready
  win.webContents.on("did-finish-load", sendNavState);
}

ipcMain.handle("dark-mode:toggle", () => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = "light";
  } else {
    nativeTheme.themeSource = "dark";
  }
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle("dark-mode:system", () => {
  nativeTheme.themeSource = "system";
});

// Navigate to next page (this creates a new history entry)
ipcMain.on("next-page", () => {
  if (win) {
    win.loadFile("src/next.html");
  }
});

// Go back in history
ipcMain.on("back-page", () => {
  if (win && win.webContents.navigationHistory.canGoBack()) {
    win.webContents.navigationHistory.goBack();
  }
});

// Go forward in history
ipcMain.on("forward-page", () => {
  if (win && win.webContents.navigationHistory.canGoForward()) {
    win.webContents.navigationHistory.goForward();
  }
});

// Allow renderer to ask whether it can go back/forward
ipcMain.handle("nav:can-go-back", () => {
  return !!(
    win &&
    win.webContents &&
    win.webContents.navigationHistory.canGoBack()
  );
});
ipcMain.handle("nav:can-go-forward", () => {
  return !!(
    win &&
    win.webContents &&
    win.webContents.navigationHistory.canGoForward()
  );
});

ipcMain.on("todo:add", (event, todo) => {
  //add todo to database
  console.log(`todo : ${JSON.stringify(todo, null, 2)}`);
  try {
    console.log(`adding todo : ${JSON.stringify(todo, null, 2)}`);
    database.addTodo(todo);
    console.log(`todo added : ${JSON.stringify(todo, null, 2)}`);
  } catch (error) {
    console.error(error);
  }
});

ipcMain.handle("todo:get", async () => {
  try {
    const todos = await database.getAllTodos();
    // console.log(`todos : ${JSON.stringify(todos, null, 2)}`);
    return todos;
  } catch (error) {
    console.error(error);
    throw error;
  }
});

ipcMain.handle("todo:update", async (event, todoData) => {
  try {
    console.log(`updating todo : ${JSON.stringify(todoData, null, 2)}`);
    const updatedTodo = await database.updateTodo(todoData.id, todoData);
    console.log(`todo updated : ${JSON.stringify(updatedTodo, null, 2)}`);
    return updatedTodo;
  } catch (error) {
    console.error(error);
    throw error;
  }
});

ipcMain.handle("todo:delete", async (event, todoData) => {
  try {
    console.log(`deleting todo : ${JSON.stringify(todoData, null, 2)}`);
    const deleted = await database.deleteTodo(todoData.id);
    console.log(`todo deleted : ${deleted}`);
    return deleted;
  } catch (error) {
    console.error(error);
    throw error;
  }
});

ipcMain.handle("todo:get-by-id", async (event, id) => {
  try {
    console.log(`getting todo by id : ${id}`);
    const todo = await database.getTodoById(id);
    console.log(`todo retrieved : ${JSON.stringify(todo, null, 2)}`);
    return todo;
  } catch (error) {
    console.error(error);
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
    console.log("Database closed");
  } catch (error) {
    console.error(error);
  }
  if (process.platform !== "darwin") app.quit();
});
