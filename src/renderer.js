// renderer.js

// Dark mode buttons (your original handlers)
document
  .getElementById("toggle-dark-mode")
  .addEventListener("click", async () => {
    const isDarkMode = await window.darkMode.toggle();
    document.getElementById("theme-source").innerHTML = isDarkMode
      ? "Dark"
      : "Light";
  });

document
  .getElementById("reset-to-system")
  .addEventListener("click", async () => {
    await window.darkMode.system();
    document.getElementById("theme-source").innerHTML = "System";
  });

// Run initial check once DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  // Refresh UI
  updateSqlFlag();
  refreshTodoList();
});

async function updateSqlFlag() {
  const sqlFlag = await window.sqlFlag.get();
  const el = document.getElementById("sql-flag");
  if (!el) return;
  el.classList.remove("is-sql", "is-file");
  if (sqlFlag) {
    el.classList.add("is-sql");
    el.textContent = "SQL";
    el.title = "SQL storage";
  } else {
    el.classList.add("is-file");
    el.textContent = "File";
    el.title = "File storage";
  }
}

// Function to refresh the todo list
async function refreshTodoList() {
  try {
    const todos = await window.todo.getTodos();
    const todoList = document.getElementById("todo-list");
    todoList.innerHTML = "";
    todos.forEach((todo) => {
      //each todo should have a button to edit and delete and mark complete
      const editButton = document.createElement("button");
      editButton.innerHTML = "Edit";
      editButton.className = "btn btn-outline btn-edit";
      editButton.disabled = !!todo.done;
      if (todo.done) {
        editButton.title = "Cannot edit a completed todo";
      }
      editButton.addEventListener("click", () => {
        window.todo.navigateToEdit(todo.id);
      });
      const deleteButton = document.createElement("button");
      deleteButton.innerHTML = "Delete";
      deleteButton.className = "btn btn-danger btn-delete";
      deleteButton.addEventListener("click", async () => {
        if (confirm("Are you sure you want to delete this todo?")) {
          try {
            const result = await window.todo.deleteTodo(todo);
            if (result) {
              alert("Todo deleted successfully");
              await refreshTodoList();
            } else {
              console.error("Error deleting todo:");
            }
          } catch (error) {
            console.error("Error deleting todo:", error);
          }
        }
      });
      const markCompleteButton = document.createElement("button");
      markCompleteButton.innerHTML = todo.done
        ? "Mark Incomplete"
        : "Mark Complete";
      markCompleteButton.className = `btn ${
        todo.done ? "btn-warning" : "btn-success"
      } btn-complete`;
      markCompleteButton.addEventListener("click", async () => {
        try {
          await window.todo.updateTodo({ ...todo, done: !todo.done });
          await refreshTodoList();
        } catch (error) {
          console.error("Error marking todo as complete:", error);
        }
      });
      const li = document.createElement("li");
      li.className = `todo-item ${todo.done ? "completed" : ""}`;

      const todoContent = document.createElement("div");
      todoContent.className = "todo-content";

      const titleElement = document.createElement("h3");
      titleElement.textContent = todo.title;

      const descriptionElement = document.createElement("p");
      descriptionElement.textContent = todo.description || "No description";

      const metaElement = document.createElement("div");
      metaElement.className = "todo-meta";
      metaElement.innerHTML = `
        <span class="priority ${todo.priority || "medium"}">${(
        todo.priority || "medium"
      ).toUpperCase()}</span>
        <span class="status ${todo.done ? "done" : "pending"}">${
        todo.done ? "Completed" : "Pending"
      }</span>
        <span class="date">${new Date(
          todo.createdAt
        ).toLocaleDateString()}</span>
      `;

      todoContent.appendChild(titleElement);
      todoContent.appendChild(descriptionElement);
      todoContent.appendChild(metaElement);

      const buttonContainer = document.createElement("div");
      buttonContainer.className = "todo-actions";
      buttonContainer.appendChild(editButton);
      buttonContainer.appendChild(markCompleteButton);
      buttonContainer.appendChild(deleteButton);

      li.appendChild(todoContent);
      li.appendChild(buttonContainer);
      todoList.appendChild(li);
    });
  } catch (error) {
    console.error("Error refreshing todo list:", error);
  }
}

// Todo functionality
document.getElementById("add-todo").addEventListener("click", async () => {
  const todo = document.getElementById("title").value;
  const description = document.getElementById("description").value;
  if (!todo || !description) {
    alert("Please enter a title and description");
    return;
  }
  await window.todo.addTodo({ title: todo, description: description });
  // Clear the form
  document.getElementById("title").value = "";
  document.getElementById("description").value = "";
  // Refresh the todo list
  await refreshTodoList();
});

document.getElementById("get-todos").addEventListener("click", async () => {
  await refreshTodoList();
});
