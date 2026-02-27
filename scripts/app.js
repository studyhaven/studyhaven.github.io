// ─────────────────────────────────────
//  Firebase imports (ES module)
// ─────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js";

// ─────────────────────────────────────
//  Firebase config
// ─────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBhrDmhz7xPfHIVPUrgJzQTWD7L005U9jo",
  authDomain: "studyhaven-35eab.firebaseapp.com",
  projectId: "studyhaven-35eab",
  storageBucket: "studyhaven-35eab.firebasestorage.app",
  messagingSenderId: "1088021134661",
  appId: "1:1088021134661:web:ccfbe3efcb367a15b6122c",
  measurementId: "G-7Q7BNQFPJV",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─────────────────────────────────────
//  State
// ─────────────────────────────────────
let authMode = "signup"; // "signup" | "login"
let toastTimer = null;

// ─────────────────────────────────────
//  Page routing
// ─────────────────────────────────────
function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

function showLanding() {
  showPage("page-landing");
}

function showAuth(mode = "signup") {
  authMode = mode;
  updateAuthUI();
  showPage("page-auth");
  // Auto-focus email on desktop
  setTimeout(() => {
    const el = document.getElementById("input-email");
    if (el && window.innerWidth >= 768) el.focus();
  }, 100);
}

function showDashboard(email) {
  const name = (email || "").split("@")[0];
  document.getElementById("dash-username").textContent = name;
  showPage("page-dashboard");
}

// ─────────────────────────────────────
//  Auth UI helpers
// ─────────────────────────────────────
function updateAuthUI() {
  const isSignup = authMode === "signup";

  document.getElementById("auth-badge").textContent       = isSignup ? "Mood" : "Welcome";
  document.getElementById("auth-heading").textContent     = isSignup ? "How are you feeling today?" : "Welcome back!";
  document.getElementById("auth-submit-text").textContent = isSignup ? "Sign up" : "Log in";
  document.getElementById("auth-switch-text").textContent = isSignup
    ? "Already have an account?"
    : "Don't have an account?";
  document.getElementById("auth-switch-btn").textContent  = isSignup ? "Log in" : "Sign up";
  document.getElementById("hint-password").style.display  = isSignup ? "block" : "none";
  document.getElementById("confirm-password-group").style.display = isSignup ? "block" : "none";
  document.getElementById("toggle-password").classList.remove("hidden");
  document.getElementById("password-match-warning").style.display = "none";

  // Clear fields
  document.getElementById("input-email").value    = "";
  document.getElementById("input-password").value = "";
  document.getElementById("input-confirm-password").value = "";
  
  // Reset password input types to password
  document.getElementById("input-password").type = "password";
  document.getElementById("input-confirm-password").type = "password";
}

function toggleAuthMode() {
  authMode = authMode === "signup" ? "login" : "signup";
  updateAuthUI();
  setTimeout(() => {
    const el = document.getElementById("input-email");
    if (el && window.innerWidth >= 768) el.focus();
  }, 50);
}

// ─────────────────────────────────────
//  Password visibility toggle
// ─────────────────────────────────────
function togglePasswordVisibility(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);
  
  if (input.type === "password") {
    input.type = "text";
    button.classList.add("active");
  } else {
    input.type = "password";
    button.classList.remove("active");
  }
}

// ─────────────────────────────────────
//  Real-time password matching validation
// ─────────────────────────────────────
function validatePasswordMatch() {
  const password = document.getElementById("input-password").value;
  const confirmPassword = document.getElementById("input-confirm-password").value;
  const warningEl = document.getElementById("password-match-warning");
  
  if (confirmPassword.length === 0) {
    warningEl.style.display = "none";
    return;
  }
  
  if (password === confirmPassword) {
    warningEl.textContent = "✓ Passwords match";
    warningEl.className = "form-hint password-match-success";
    warningEl.style.display = "block";
  } else {
    warningEl.textContent = "✗ Passwords do not match";
    warningEl.className = "form-hint password-match-warning";
    warningEl.style.display = "block";
  }
}

// ─────────────────────────────────────
//  Firebase: Auth actions
// ─────────────────────────────────────
async function handleAuth() {
  const email              = document.getElementById("input-email").value.trim();
  const password           = document.getElementById("input-password").value;
  const confirmPassword    = document.getElementById("input-confirm-password").value;

  if (!email || !password) {
    showToast("Please fill in all fields.", "error");
    return;
  }

  if (authMode === "signup") {
    if (!confirmPassword) {
      showToast("Please confirm your password.", "error");
      document.getElementById("input-confirm-password").focus();
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }
  }

  setLoading(true);

  try {
    if (authMode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      showToast("Account created! Welcome 🌿", "success");
        window.location.href = "dashboard.html";
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      showToast("Welcome back! 🌿", "success");
        window.location.href = "dashboard.html";
    }
  } catch (err) {
    showToast(friendlyError(err.code), "error");
  } finally {
    setLoading(false);
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    showToast("Logged out. See you soon!", "success");
    showLanding();
  } catch {
    showToast("Could not log out. Please try again.", "error");
  }
}

// ─────────────────────────────────────
//  Loading state
// ─────────────────────────────────────
function setLoading(active) {
  const btn     = document.getElementById("auth-submit");
  const spinner = document.getElementById("auth-spinner");
  btn.disabled                  = active;
  spinner.style.display         = active ? "block" : "none";
}

// ─────────────────────────────────────
//  Error messages
// ─────────────────────────────────────
function friendlyError(code) {
  const map = {
    "auth/email-already-in-use":  "That email is already registered. Try logging in.",
    "auth/invalid-email":         "Please enter a valid email address.",
    "auth/weak-password":         "Password must be at least 6 characters.",
    "auth/user-not-found":        "No account found. Please sign up first.",
    "auth/wrong-password":        "Incorrect password. Please try again.",
    "auth/invalid-credential":    "Incorrect email or password.",
    "auth/too-many-requests":     "Too many attempts. Please try again later.",
    "auth/network-request-failed":"No internet connection. Please check your network.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ─────────────────────────────────────
//  Toast
// ─────────────────────────────────────
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (type ? " " + type : "");
  // Trigger reflow for re-animation
  void t.offsetHeight;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// ─────────────────────────────────────
//  Auth state observer (auto-redirect to standalone dashboard)
// ─────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';

  if (user) {
    // User is signed in → redirect away from public/auth pages
    if (currentFile !== 'dashboard.html') {
      console.log("User already signed in → redirecting to dashboard");
      window.location.href = "dashboard.html";
    }
    // Optional: you could also update UI on dashboard.html here if needed
  } else {
    // User is signed out → redirect away from protected pages (if any)
    if (currentFile === 'dashboard.html') {
      console.log("No user → redirecting to index");
      window.location.href = "index.html";  // or wherever your login/landing is
    }
  }
});

// ─────────────────────────────────────
//  Keyboard: Enter submits auth form
// ─────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const activePage = document.querySelector(".page.active")?.id;
    if (activePage === "page-auth") handleAuth();
  }
});

// ─────────────────────────────────────
//  Carousel (mobile cards)
// ─────────────────────────────────────
function initCarousel() {
  const track  = document.querySelector(".cards");
  const dots   = document.querySelectorAll(".carousel-dots .dot");
  if (!track || !dots.length) return;

  const cards  = track.querySelectorAll(".card");
  let activeIdx = 0;

  // Update dot states
  function setActiveDot(idx) {
    dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    activeIdx = idx;
  }

  // Scroll to card by index
  function scrollToCard(idx) {
    const card = cards[idx];
    if (!card) return;
    track.scrollTo({ left: card.offsetLeft - 20, behavior: "smooth" });
  }

  // Dot clicks
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const idx = parseInt(dot.dataset.index, 10);
      scrollToCard(idx);
      setActiveDot(idx);
    });
  });

  // Update active dot on scroll (throttled)
  let scrollTimer;
  track.addEventListener("scroll", () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const scrollLeft = track.scrollLeft;
      let closest = 0;
      let minDist = Infinity;
      cards.forEach((card, i) => {
        const dist = Math.abs(card.offsetLeft - 20 - scrollLeft);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      setActiveDot(closest);
    }, 60);
  });

  // ── Drag to scroll (mouse) ──
  let isDown = false, startX, scrollStart;

  track.addEventListener("mousedown", (e) => {
    // Only activate drag on mobile-width or when flex layout
    if (window.innerWidth >= 640) return;
    isDown = true;
    track.classList.add("dragging");
    startX = e.pageX;
    scrollStart = track.scrollLeft;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const dx = e.pageX - startX;
    track.scrollLeft = scrollStart - dx;
  });

  document.addEventListener("mouseup", () => {
    if (!isDown) return;
    isDown = false;
    track.classList.remove("dragging");
  });

  // Re-init on resize (grid↔carousel switch)
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth !== lastWidth) {
      lastWidth = window.innerWidth;
      setActiveDot(0);
      track.scrollLeft = 0;
    }
  });
}

// Run after DOM is ready
document.addEventListener("DOMContentLoaded", initCarousel);

// ─────────────────────────────────────
//  Google Sign-In
// ─────────────────────────────────────
async function handleGoogleSignIn() {
  const btn     = document.getElementById("btn-google");
  const spinner = document.getElementById("google-spinner");
  btn.disabled          = true;
  spinner.style.display = "block";

  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const name = cred.user.displayName || cred.user.email;
    showToast("Welcome, " + name + "! 🌿", "success");
    showDashboard(cred.user.email);
  } catch (err) {
    // Silently ignore user-dismissed popup
    if (
      err.code !== "auth/popup-closed-by-user" &&
      err.code !== "auth/cancelled-popup-request"
    ) {
      showToast(friendlyError(err.code), "error");
    }
  } finally {
    btn.disabled          = false;
    spinner.style.display = "none";
  }
}

window.showLanding        = showLanding;
window.showAuth           = showAuth;
window.toggleAuthMode     = toggleAuthMode;
window.handleAuth         = handleAuth;
window.handleLogout       = handleLogout;
window.handleGoogleSignIn = handleGoogleSignIn;

// ─────────────────────────────────────
//  Researcher Modal Carousel
// ─────────────────────────────────────
let modalIdx = 0;
let modalTotal = 0;

function initModal() {
  const slides = document.querySelectorAll(".modal-slide");
  const dotsContainer = document.getElementById("modal-dots");
  modalTotal = slides.length;

  dotsContainer.innerHTML = "";
  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.className = "mdot" + (i === 0 ? " active" : "");
    dot.setAttribute("aria-label", "Researcher " + (i + 1));
    dot.addEventListener("click", () => goToSlide(i));
    dotsContainer.appendChild(dot);
  });

  goToSlide(0);
}

function goToSlide(idx) {
  modalIdx = Math.max(0, Math.min(idx, modalTotal - 1));
  const track = document.getElementById("modal-track");
  track.style.transform = `translateX(-${modalIdx * 100}%)`;

  document.querySelectorAll(".modal-dots .mdot").forEach((d, i) => {
    d.classList.toggle("active", i === modalIdx);
  });

  document.getElementById("modal-prev").disabled = modalIdx === 0;
  document.getElementById("modal-next").disabled = modalIdx === modalTotal - 1;
}

function modalPrev() { goToSlide(modalIdx - 1); }
function modalNext() { goToSlide(modalIdx + 1); }

function openModal() {
  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
  initModal();
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
}

// Keyboard: Esc closes, arrows navigate
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("modal-overlay").classList.contains("open")) return;
  if (e.key === "Escape")     closeModal();
  if (e.key === "ArrowLeft")  modalPrev();
  if (e.key === "ArrowRight") modalNext();
});

window.openModal          = openModal;
window.closeModal         = closeModal;
window.handleOverlayClick = handleOverlayClick;
window.modalPrev          = modalPrev;
window.modalNext          = modalNext;
window.handleLogout       = handleLogout;
window.handleGoogleSignIn = handleGoogleSignIn;
window.showAuth           = showAuth;
window.showLanding        = showLanding;
window.toggleAuthMode     = toggleAuthMode;
window.handleAuth         = handleAuth;
window.togglePasswordVisibility = togglePasswordVisibility;
window.validatePasswordMatch    = validatePasswordMatch;
