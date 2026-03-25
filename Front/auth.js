const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

function passwordMeetsRules(password) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = loginForm.username.value.trim();
    const password = loginForm.password.value;

    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.detail || "Login failed", true);
      return;
    }

    const data = await response.json();
    setToken(data.token);
    window.location.href = "/dashboard";
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user_id = registerForm.userId.value.trim();
    const username = registerForm.username.value.trim();
    const password = registerForm.password.value;
    const confirmPassword = registerForm.confirmPassword.value;

    if (password !== confirmPassword) {
      showToast("Passwords do not match", true);
      return;
    }
    if (!passwordMeetsRules(password)) {
      showToast("Password does not meet requirements", true);
      return;
    }

    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      showToast(error.detail || "Registration failed", true);
      return;
    }

    showToast("Account created! Please login.");
    setTimeout(() => {
      window.location.href = "/login";
    }, 800);
  });
}
