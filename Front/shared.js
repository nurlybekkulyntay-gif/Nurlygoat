const API_BASE = "http://localhost:8000";

function setToken(token) {
  localStorage.setItem("stm_token", token);
}

function getToken() {
  return localStorage.getItem("stm_token");
}

function clearToken() {
  localStorage.removeItem("stm_token");
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.borderColor = isError ? "#ef4444" : "#22c55e";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  return response;
}
