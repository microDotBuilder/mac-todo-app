// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("darkMode", {
  toggle: () => ipcRenderer.invoke("dark-mode:toggle"),
  system: () => ipcRenderer.invoke("dark-mode:system"),
});

// Removed goToNextPage and nav exposures

contextBridge.exposeInMainWorld("todo", {
  addTodo: (todo) => ipcRenderer.send("todo:add", todo),
  getTodos: () => ipcRenderer.invoke("todo:get"),
  getTodoById: (id) => ipcRenderer.invoke("todo:get-by-id", id),
  getCurrentTodoId: () => ipcRenderer.invoke("todo:get-current-id"),
  updateTodo: (todo) => ipcRenderer.invoke("todo:update", todo),
  deleteTodo: (todo) => ipcRenderer.invoke("todo:delete", todo),
  navigateToEdit: (todoId) => ipcRenderer.send("navigate:edit", todoId),
  navigateToMain: () => ipcRenderer.send("navigate:main"),
});

contextBridge.exposeInMainWorld("sqlFlag", {
  get: () => ipcRenderer.invoke("sql-flag:get"),
});
