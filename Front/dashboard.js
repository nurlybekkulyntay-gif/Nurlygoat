const taskListEl = document.getElementById("taskList");
const taskForm = document.getElementById("taskForm");
const emptyState = document.getElementById("emptyState");
const emptyCreate = document.getElementById("emptyCreate");
const logoutBtn = document.getElementById("logoutBtn");
const userAvatar = document.getElementById("userAvatar");

const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const closeModal = document.getElementById("closeModal");

let currentEditId = null;
let taskCache = [];

async function ensureAuth() {
  const response = await authFetch("/api/me");
  if (!response.ok) {
    clearToken();
    window.location.href = "/login";
    return null;
  }
  const user = await response.json();
  if (userAvatar) {
    userAvatar.textContent = user.username.slice(0, 1).toUpperCase();
  }
  return user;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function renderTasks(tasks) {
  taskListEl.innerHTML = "";
  if (!tasks.length) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "task-card";
    card.dataset.id = task.id;

    const titleClass = task.is_completed ? "task-title completed" : "task-title";

    card.innerHTML = `
      <div class="task-header">
        <div class="${titleClass}">
          <input type="checkbox" class="task-check" ${task.is_completed ? "checked" : ""} />
          <span>${task.title}</span>
        </div>
        <div class="task-actions">
          <button class="btn btn-secondary edit-btn" type="button">Edit</button>
          <button class="btn btn-danger delete-btn" type="button">Delete</button>
        </div>
      </div>
      ${task.description ? `<div class="helper-text">${task.description}</div>` : ""}
      ${task.image_url ? `<img class="task-image" src="${API_BASE}${task.image_url}" alt="Task image" />` : ""}
      <div class="task-meta">Created ${formatDate(task.created_at)}</div>
      <div class="comment-box">
        <div class="comment-list"></div>
        <form class="comment-form">
          <input name="comment" type="text" placeholder="Write a comment..." required />
          <button class="btn btn-secondary" type="submit">Reply</button>
        </form>
      </div>
    `;

    taskListEl.appendChild(card);

    const commentList = card.querySelector(".comment-list");
    loadComments(task.id, commentList);

    const check = card.querySelector(".task-check");
    check.addEventListener("change", () => toggleTask(task.id, check.checked));

    const editBtn = card.querySelector(".edit-btn");
    editBtn.addEventListener("click", () => openEditModal(task.id));

    const deleteBtn = card.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    const commentForm = card.querySelector(".comment-form");
    commentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = commentForm.comment;
      addComment(task.id, input.value.trim(), commentList, input);
    });
  });
}

async function loadTasks() {
  const response = await authFetch("/api/tasks");
  if (!response.ok) {
    showToast("Failed to load tasks", true);
    return;
  }
  taskCache = await response.json();
  renderTasks(taskCache);
}

async function createTask(formData) {
  const response = await authFetch("/api/tasks", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    showToast(error.detail || "Could not create task", true);
    return;
  }

  showToast("Task added successfully");
  await loadTasks();
}

async function toggleTask(taskId, is_completed) {
  const response = await authFetch(`/api/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_completed }),
  });

  if (!response.ok) {
    showToast("Could not update task", true);
    return;
  }
  await loadTasks();
}

async function deleteTask(taskId) {
  const shouldDelete = confirm("Delete this task?");
  if (!shouldDelete) return;

  const response = await authFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
  if (!response.ok) {
    showToast("Could not delete task", true);
    return;
  }

  showToast("Task deleted");
  await loadTasks();
}

function openEditModal(taskId) {
  const task = taskCache.find((item) => item.id === taskId);
  if (!task) return;
  currentEditId = taskId;
  editForm.editTitle.value = task.title;
  editForm.editDescription.value = task.description || "";
  editForm.editImage.value = "";
  editModal.classList.add("active");
}

function closeEditModal() {
  editModal.classList.remove("active");
  currentEditId = null;
}

async function saveEdit() {
  if (!currentEditId) return;

  const title = editForm.editTitle.value.trim();
  const description = editForm.editDescription.value.trim();
  const response = await authFetch(`/api/tasks/${currentEditId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
  });

  if (!response.ok) {
    const error = await response.json();
    showToast(error.detail || "Could not update task", true);
    return;
  }

  const imageFile = editForm.editImage.files[0];
  if (imageFile) {
    const formData = new FormData();
    formData.append("image", imageFile);
    const imageResponse = await authFetch(`/api/tasks/${currentEditId}/image`, {
      method: "POST",
      body: formData,
    });
    if (!imageResponse.ok) {
      showToast("Image upload failed", true);
      return;
    }
  }

  closeEditModal();
  showToast("Task updated");
  await loadTasks();
}

async function loadComments(taskId, container) {
  const response = await authFetch(`/api/tasks/${taskId}/comments`);
  if (!response.ok) {
    container.innerHTML = "";
    return;
  }
  const comments = await response.json();
  container.innerHTML = comments
    .map(
      (comment) => `
      <div class="comment">
        <strong>${comment.username}</strong>
        <div class="helper-text">${comment.content}</div>
      </div>
    `
    )
    .join("");
}

async function addComment(taskId, content, container, inputEl) {
  if (!content) return;
  const response = await authFetch(`/api/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    showToast("Could not add comment", true);
    return;
  }

  inputEl.value = "";
  await loadComments(taskId, container);
}

if (taskForm) {
  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("title", taskForm.taskTitle.value.trim());
    formData.append("description", taskForm.taskDescription.value.trim());
    const file = taskForm.taskImage.files[0];
    if (file) {
      formData.append("image", file);
    }
    await createTask(formData);
    taskForm.reset();
    taskForm.taskTitle.focus();
  });
}

if (emptyCreate) {
  emptyCreate.addEventListener("click", () => {
    taskForm.taskTitle.focus();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await authFetch("/api/auth/logout", { method: "POST" });
    clearToken();
    window.location.href = "/login";
  });
}

if (closeModal) {
  closeModal.addEventListener("click", closeEditModal);
}

if (editForm) {
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEdit();
  });
}

if (editModal) {
  editModal.addEventListener("click", (event) => {
    if (event.target === editModal) {
      closeEditModal();
    }
  });
}

(async () => {
  const user = await ensureAuth();
  if (!user) return;
  await loadTasks();
  taskForm.taskTitle.focus();
})();
