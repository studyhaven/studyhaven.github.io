// ── Firebase ──
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, addDoc, getDocs, deleteDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-messaging.js";

// ── FCM VAPID key ──
const FCM_VAPID_KEY = "BIsaiVaW0Mj5TDpRL7wkxYIUEGn9_KPiogUeREeUGbbDgcFxXI8gw-1seOKLYNUE2qlqzhyXNz5Er1yDc6SvkOA";

const firebaseConfig = {
  apiKey: "AIzaSyBhrDmhz7xPfHIVPUrgJzQTWD7L005U9jo",
  authDomain: "studyhaven-35eab.firebaseapp.com",
  projectId: "studyhaven-35eab",
  storageBucket: "studyhaven-35eab.firebasestorage.app",
  messagingSenderId: "1088021134661",
  appId: "1:1088021134661:web:ccfbe3efcb367a15b6122c",
};

const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const messaging = getMessaging(app);
let currentUser = null;

// ── Helpers ──
const $ = id => document.getElementById(id);
function nowTime() { return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }
function todayISO() { return new Date().toISOString().split("T")[0]; }

// ════════════════════════════
//  TOAST
// ════════════════════════════
let toastTimer;
function showToast(msg, type = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (type ? " " + type : "");
  void t.offsetHeight;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// ════════════════════════════
//  ALARM NOTIFICATION SYSTEM
// ════════════════════════════
let alarmNotifCount = 0;
function showAlarmNotification({ title, subtitle, emailSubject, emailBody }) {
  const id = "alarm-" + (++alarmNotifCount);
  const container = $("alarm-notifications");

  if (Notification.permission === "default") Notification.requestPermission();
  if (Notification.permission === "granted") {
    const n = new Notification("⏰ StudyHaven Reminder", { body: title });
    setTimeout(() => n.close(), 8000);
  }

  const mailtoLink = `mailto:?subject=${encodeURIComponent(emailSubject || "StudyHaven Reminder")}&body=${encodeURIComponent(emailBody || title)}`;
  const el = document.createElement("div");
  el.className = "alarm-notif";
  el.id = id;
  el.innerHTML = `
    <div class="alarm-notif-icon">⏰</div>
    <div class="alarm-notif-body">
      <div class="alarm-notif-title">${title}</div>
      ${subtitle ? `<div class="alarm-notif-sub">${subtitle}</div>` : ""}
      <div class="alarm-notif-actions">
        <button class="alarm-notif-btn alarm-notif-dismiss" onclick="window._dismissAlarm('${id}')">Dismiss</button>
        <a href="${mailtoLink}" target="_blank">
          <button class="alarm-notif-btn alarm-notif-email">📧 Email reminder</button>
        </a>
      </div>
    </div>
    <button class="alarm-notif-close" onclick="window._dismissAlarm('${id}')" title="Close">✕</button>
  `;
  container.appendChild(el);
  playBeep();
  setTimeout(() => window._dismissAlarm(id), 60000);
}

window._dismissAlarm = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = "none";
  el.style.opacity = "0";
  el.style.transform = "translateX(-20px)";
  el.style.transition = "opacity .25s, transform .25s";
  setTimeout(() => el.remove(), 280);
};

// ════════════════════════════
//  AUTH
// ════════════════════════════
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  $("dash-username").textContent = user.displayName || user.email.split("@")[0];
  loadTasks();
  loadAllLogs();
  registerFCMToken();
  recoverTimerSession();
  initializeGradioChat();
  initTimerHistory();
});
$("btn-logout").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ── Init labels ──
$("chat-init-time").textContent = nowTime();
$("tracker-today").textContent  = new Date().toLocaleDateString([], { weekday:"long", month:"long", day:"numeric" });

// ════════════════════════════
//  FCM PUSH NOTIFICATIONS
// ════════════════════════════
async function registerFCMToken() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (FCM_VAPID_KEY === "YOUR_VAPID_KEY_HERE") {
    console.warn("StudyHaven: Replace FCM_VAPID_KEY with your real VAPID key to enable push notifications.");
    return;
  }

  const btn = $("btn-enable-notif");

  if (Notification.permission === "denied") {
    btn.style.display = "flex";
    btn.title = "Notifications blocked — click for help";
    btn.addEventListener("click", () => {
      showToast("To enable: click the 🔒 lock in your address bar → Notifications → Allow, then refresh.", "error");
    }, { once: true });
  } else if (Notification.permission === "granted") {
    const ok = await _doRegisterToken(btn, true);
    if (!ok) btn.style.display = "flex";
  } else {
    btn.style.display = "flex";
    btn.addEventListener("click", () => _doRegisterToken(btn, false), { once: true });
  }
}

async function _doRegisterToken(btn, silent) {
  const bellIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`;
  if (btn && !silent) { btn.innerHTML = bellIcon + " Enabling..."; }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      if (btn) { btn.style.display = "flex"; btn.innerHTML = bellIcon + " Enable Notifications"; }
      if (!silent) showToast("Notification permission denied.", "error");
      return false;
    }

    const swReg = await navigator.serviceWorker.register(
      "https://studyhaven.github.io/firebase-messaging-sw.js", { scope: "/" }
    );

    await new Promise((resolve, reject) => {
      if (swReg.active) { resolve(); return; }
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { reject(new Error("No service worker found")); return; }
      sw.addEventListener("statechange", e => {
        if (e.target.state === "activated") resolve();
        if (e.target.state === "redundant")  reject(new Error("SW became redundant"));
      });
    });

    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) { console.warn("StudyHaven: getToken returned empty"); return false; }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila";

    await setDoc(
      doc(db, "users", currentUser.uid, "fcmTokens", "current"),
      { token, createdAt: Date.now(), userAgent: navigator.userAgent.slice(0, 200) }
    );

    const { getDocs, collection: col } = await import("https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js");
    const oldTokensSnap = await getDocs(col(db, "users", currentUser.uid, "fcmTokens"));
    const deletePromises = oldTokensSnap.docs
      .filter(d => d.id !== "current")
      .map(d => d.ref.delete());
    if (deletePromises.length) await Promise.all(deletePromises);

    await setDoc(
      doc(db, "users", currentUser.uid, "settings", "profile"),
      { timezone }, { merge: true }
    );

    if (btn) {
      btn.style.display = "flex";
      btn.className = "dash-notif-btn enabled";
      btn.innerHTML = bellIcon + " Notifications On";
      setTimeout(() => { btn.style.display = "none"; }, 3000);
    }
    console.info(`StudyHaven: FCM token registered. Timezone: ${timezone}`);
    if (!silent) showToast("Push notifications enabled! ✓", "success");
    return true;

  } catch (err) {
    const isBlockedByExtension =
      err.message.includes("push service error") ||
      err.message.includes("Registration failed") ||
      err.message.includes("ERR_BLOCKED");

    const userMsg = isBlockedByExtension
      ? "Blocked by ad blocker — disable it for this site and try again."
      : err.message;

    if (btn) {
      btn.style.display = "flex";
      btn.innerHTML = bellIcon + " Enable Notifications";
      btn.title = userMsg;
      btn.onclick = () => _doRegisterToken(btn, false);
    }
    console.warn("StudyHaven: FCM registration failed:", err.message);
    if (!silent) showToast(userMsg, "error");
    return false;
  }
}

onMessage(messaging, payload => {
  const n = payload.notification || {};
  const d = payload.data || {};
  showAlarmNotification({
    title:        n.body  || d.body  || "StudyHaven Reminder",
    subtitle:     d.subtitle || "",
    emailSubject: d.emailSubject || "StudyHaven Reminder",
    emailBody:    d.emailBody   || n.body || "",
  });
});

// ════════════════════════════
//  TAB SWITCHING
// ════════════════════════════
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected","false"); });
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    btn.setAttribute("aria-selected","true");
    $("panel-" + btn.dataset.tab).classList.add("active");
  });
});

function initSubtabs(panelId) {
  document.querySelectorAll(`#${panelId} .subtab-btn`).forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(`#${panelId} .subtab-btn`).forEach(b => b.classList.remove("active"));
      document.querySelectorAll(`#${panelId} .subtab-panel`).forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $("subtab-" + btn.dataset.subtab).classList.add("active");
    });
  });
}
initSubtabs("panel-time");
initSubtabs("panel-tracker");

// ════════════════════════════
//  TEXT-TO-SPEECH (TTS) — Kokoro server-side via /gradio_api/call/tts
//  Falls back to browser speechSynthesis if the server call fails.
// ════════════════════════════

// TTS state — persisted in localStorage
let ttsEnabled = localStorage.getItem("haven_tts") === "true";
console.log("🔊 TTS initialized from localStorage:", ttsEnabled, "(raw value:", localStorage.getItem("haven_tts"), ")");

// Track currently playing audio so we can stop it
let ttsAudio = null;

function stopSpeaking() {
  // Stop server audio
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = "";
    ttsAudio = null;
  }
  // Stop browser fallback
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// ── Server-side TTS via Kokoro ──
async function speakWithServer(text) {
  try {
    // POST to /tts — send the text, get back an event_id
    const postRes = await fetch(`${HAVEN_SPACE}/gradio_api/call/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text] }),
    });

    if (!postRes.ok) throw new Error(`TTS POST failed: ${postRes.status}`);

    const { event_id } = await postRes.json();
    if (!event_id) throw new Error("No event_id from TTS");

    // Poll the SSE stream for the completed audio
    const streamRes = await fetch(`${HAVEN_SPACE}/gradio_api/call/tts/${event_id}`);
    if (!streamRes.ok) throw new Error(`TTS stream failed: ${streamRes.status}`);

    const reader  = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";
    let   audioUrl = null;

    outer:
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop();

      for (const frame of frames) {
        if (!frame.trim()) continue;
        const lines     = frame.split("\n");
        const eventLine = lines.find(l => l.startsWith("event:"));
        const dataLine  = lines.find(l => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.replace("event:", "").trim();
        const dataStr   = dataLine.replace("data:", "").trim();

        if (eventType === "complete") {
          try {
            const parsed = JSON.parse(dataStr);
            // Gradio returns audio as { path, url } or a direct URL string
            const audioData = Array.isArray(parsed) ? parsed[0] : parsed;
            if (audioData && audioData.url) {
              audioUrl = audioData.url;
            } else if (typeof audioData === "string") {
              audioUrl = audioData;
            }
          } catch(e) {
            console.warn("TTS parse error:", e.message);
          }
          reader.cancel();
          break outer;
        }
      }
    }

    if (!audioUrl) throw new Error("No audio URL returned from TTS");

    // Play the audio
    stopSpeaking();
    ttsAudio = new Audio(audioUrl);
    ttsAudio.volume = 1.0;
    await ttsAudio.play();
    return true; // success

  } catch(err) {
    console.warn("Server TTS failed, falling back to browser TTS:", err.message);
    return false; // signal fallback needed
  }
}

// ── Browser fallback TTS (used if server TTS fails) ──
let ttsVoice = null;

function loadTTSVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const preferred = [
    "Samantha", "Karen", "Moira", "Tessa",
    "Google UK English Female", "Google US English",
    "Microsoft Aria Online (Natural)", "Microsoft Jenny Online (Natural)",
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { ttsVoice = v; break; }
  }
  if (!ttsVoice) {
    ttsVoice = voices.find(v => v.lang.startsWith("en") && /female|woman/i.test(v.name))
      || voices.find(v => v.lang.startsWith("en"))
      || voices[0] || null;
  }
}
window.speechSynthesis?.addEventListener("voiceschanged", loadTTSVoices);
loadTTSVoices();

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/#+\s/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function speakWithBrowser(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(stripMarkdown(text));
  utt.rate = 0.95; utt.pitch = 1.05; utt.volume = 1.0;
  if (ttsVoice) utt.voice = ttsVoice;
  window.speechSynthesis.speak(utt);
}

// ── Main entry point called after AI responds ──
async function speakText(text) {
  if (!ttsEnabled || !text) return;
  stopSpeaking();

  // Try server-side Kokoro first, fall back to browser
  const serverOk = await speakWithServer(text);
  if (!serverOk) speakWithBrowser(text);
}

function updateTTSButton() {
  const btn = $("btn-tts-toggle");
  if (!btn) return;

  if (ttsEnabled) {
    btn.title = "Text-to-speech ON — click to turn off";
    btn.setAttribute("aria-pressed", "true");
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
      <span>TTS On</span>`;
    btn.style.cssText = `
      all:unset; cursor:pointer; display:flex; align-items:center; gap:.3rem;
      font-family:'DM Sans',sans-serif; font-size:.75rem; font-weight:500;
      color:white !important; padding:.35rem .75rem;
      border:1px solid var(--sage) !important; border-radius:var(--radius-pill);
      background:var(--sage) !important; transition:all .2s ease; white-space:nowrap; flex-shrink:0;
    `;
  } else {
    btn.title = "Text-to-speech OFF — click to turn on";
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
      </svg>
      <span>TTS Off</span>`;
    btn.style.cssText = `
      all:unset; cursor:pointer; display:flex; align-items:center; gap:.3rem;
      font-family:'DM Sans',sans-serif; font-size:.75rem; font-weight:500;
      color:var(--muted) !important; padding:.35rem .75rem;
      border:1px solid #e2e2e2 !important; border-radius:var(--radius-pill);
      background:white !important; transition:all .2s ease; white-space:nowrap; flex-shrink:0;
    `;
  }
}

function toggleTTS() {
  // Toggle the state
  ttsEnabled = !ttsEnabled;
  
  // Save to localStorage as a string (important!)
  localStorage.setItem("haven_tts", String(ttsEnabled));
  
  console.log("🔊 TTS toggled to:", ttsEnabled);

  if (!ttsEnabled) {
    stopSpeaking();
    showToast("Text-to-speech off", "");
  } else {
    showToast("Text-to-speech on 🔊", "success");
    // Speak a short demo so the user knows it's working
    speakText("Text to speech is now on. I'll read Haven's responses aloud.");
  }

  // Update button UI immediately
  updateTTSButton();
}

// Expose to HTML onclick (used in header button)
window.toggleTTS = toggleTTS;

// ════════════════════════════
//  AI COMPANION — Gradio 6 /gradio_api/call/chat
// ════════════════════════════

const HAVEN_SPACE = "https://studyhaven-haven.hf.space";
const HAVEN_API   = `${HAVEN_SPACE}/gradio_api/call/chat`;

const HAVEN_SYSTEM_MSG = `Your name is Haven. You are a warm, empathetic therapist-friend chatbot. If anyone asks your name, tell them you are Haven. Follow these rules strictly:

1. **NO SCHOOL WORK**: Never provide direct answers to homework, essays, exams, quizzes, assignments, or any academic work. If a user asks for school-related answers, gently redirect them and offer emotional support or motivation instead (e.g., "I'm not able to do your homework for you, but I believe in you! Want to talk about what's stressing you out about it?").

2. **LIMITED GENERAL INFO**: You may share general, non-academic information if the user genuinely asks (e.g., fun facts, life advice, health tips), but keep it brief and always bring the focus back to how the user is feeling.

3. **THERAPIST-FRIEND FOCUS**: Your primary role is to motivate, comfort, and emotionally support the user like a caring friend who happens to have therapy skills. Be warm, validating, non-judgmental, and encouraging. Use active listening techniques. Ask follow-up questions about their feelings.

4. **LANGUAGE**: Detect whether the user is writing in English or Tagalog (Filipino), and respond in the same language. You may also mix Tagalog and English (Taglish) naturally if the user does. Switch languages fluidly based on the user's preference.

5. **TONE**: Always be positive, uplifting, and supportive. Celebrate small wins. Normalize struggles. Remind users they are not alone.

Example responses:
- If asked for homework: "Hindi ko magagawa ang assignment para sa iyo, pero nandito ako para suportahan ka! Anong part ang pinaka-nahihirapan ka?"
- If user is sad: "It's okay to feel that way. Your feelings are valid. Would you like to talk more about what's been going on?"
`;

let chatHistory = [];
let aiInFlight  = false;

const chatHistoryRef = () => collection(db, "users", currentUser.uid, "aiChat");

function formatTimestamp(ts) {
  if (!ts) return nowTime();
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function cleanHistory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(m =>
    m &&
    typeof m === "object" &&
    typeof m.role === "string" && m.role.length > 0 &&
    typeof m.content === "string" && m.content.length > 0
  );
}

async function loadChatHistoryFromFirebase() {
  try {
    const snap = await getDocs(query(chatHistoryRef(), orderBy("timestamp", "asc")));
    const raw = snap.docs.map(d => ({
      role:      d.data().role,
      content:   d.data().content,
      timestamp: d.data().timestamp,
    }));
    chatHistory = cleanHistory(raw);
    console.log(`📚 Loaded ${chatHistory.length} valid messages from Firebase`);
  } catch(e) {
    console.warn("loadChatHistory error:", e.message);
    chatHistory = [];
  }
}

async function saveChatMessageToFirebase(role, content, timestamp) {
  try {
    await addDoc(chatHistoryRef(), { role, content, timestamp });
  } catch(e) {
    console.error("Error saving chat message:", e);
  }
}

async function clearChatHistory() {
  const btn = $("btn-chat-clear");
  if (btn) { btn.disabled = true; btn.textContent = "Clearing…"; }
  try {
    stopSpeaking(); // stop any TTS in progress
    const snap = await getDocs(chatHistoryRef());
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
    chatHistory = [];
    renderChatHistoryUI();
    showToast("Conversation cleared ✓", "success");
  } catch(e) {
    console.error("Clear chat error:", e);
    showToast("Could not clear messages.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🗑️ Clear"; }
  }
}

async function initializeGradioChat() {
  await loadChatHistoryFromFirebase();
  renderChatHistoryUI();

  // Wire up buttons with robust attachment - use addEventListener only
  const attachButtonListeners = () => {
    const clearBtn = $("btn-chat-clear");
    if (clearBtn && !clearBtn._hasListener) {
      clearBtn.addEventListener("click", clearChatHistory);
      clearBtn._hasListener = true;
      console.log("✓ Clear button listener attached");
    }

    const ttsBtn = $("btn-tts-toggle");
    if (ttsBtn && !ttsBtn._hasListener) {
      // Use addEventListener only - don't double-bind!
      ttsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔊 TTS button clicked");
        toggleTTS();
      });
      ttsBtn._hasListener = true;
      console.log("✓ TTS button listener attached");
    }

    // Retry if buttons not found
    if (!clearBtn || !ttsBtn) {
      console.log("⏳ Buttons not ready, retrying in 500ms...");
      setTimeout(attachButtonListeners, 500);
      return;
    }
    
    // One final update to make sure UI is correct
    updateTTSButton();
  };

  // Wait for DOM to be truly ready before attaching
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachButtonListeners);
  } else {
    setTimeout(attachButtonListeners, 200);
  }

  // Set initial TTS button state
  updateTTSButton();
}

function extractReply(parsed) {
  console.log("🔍 Raw complete data:", JSON.stringify(parsed));

  if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
    const history = parsed[0];
    const last = history[history.length - 1];
    if (last && typeof last.content === "string") return last.content;
    if (last && Array.isArray(last.content)) {
      const textBlock = last.content.find(b => b.type === "text");
      if (textBlock) return textBlock.text;
    }
  }
  if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
  if (typeof parsed === "string") return parsed;
  if (parsed && typeof parsed.content === "string") return parsed.content;

  console.warn("⚠️ Could not extract reply from shape:", typeof parsed, parsed);
  return null;
}

async function sendMessageToGradio(userMessage) {
  if (!userMessage.trim()) return null;
  if (aiInFlight) {
    showToast("Please wait — Haven is still thinking…", "error");
    return null;
  }
  aiInFlight = true;

  const safeHistory = cleanHistory(chatHistory).map(({ role, content }) => ({ role, content }));

  try {
    const postRes = await fetch(HAVEN_API, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          userMessage,
          safeHistory,
          HAVEN_SYSTEM_MSG,
          512,
          0.7,
          0.95,
        ]
      }),
    });

    if (!postRes.ok) {
      const txt = await postRes.text();
      console.error("Haven POST error:", txt);
      throw new Error(`POST failed: HTTP ${postRes.status}`);
    }

    const { event_id } = await postRes.json();
    if (!event_id) throw new Error("No event_id returned from Haven");

    const streamRes = await fetch(`${HAVEN_SPACE}/gradio_api/call/chat/${event_id}`);
    if (!streamRes.ok) throw new Error(`SSE stream failed: HTTP ${streamRes.status}`);

    const reader  = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";
    let   aiReply = null;

    outer:
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split("\n\n");
      buffer = frames.pop();

      for (const frame of frames) {
        if (!frame.trim()) continue;
        const lines     = frame.split("\n");
        const eventLine = lines.find(l => l.startsWith("event:"));
        const dataLine  = lines.find(l => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.replace("event:", "").trim();
        const dataStr   = dataLine.replace("data:", "").trim();

        if (eventType === "error") {
          if (!dataStr || dataStr === "null") continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed && parsed.message) throw new Error("Haven error: " + parsed.message);
          } catch(parseErr) {
            if (parseErr.message && parseErr.message.startsWith("Haven error:")) throw parseErr;
            continue;
          }
        }

        if (eventType === "complete") {
          try {
            aiReply = extractReply(JSON.parse(dataStr));
          } catch(e) {
            console.warn("Could not parse complete event:", e.message);
          }
          reader.cancel();
          break outer;
        }
      }
    }

    return aiReply || "I couldn't generate a response. Please try again.";

  } catch(err) {
    console.error("❌ Haven fetch error:", err);
    return "Sorry, I'm having trouble connecting right now. Please try again in a moment.";
  } finally {
    aiInFlight = false;
  }
}

function appendChatMessage(text, role, timestamp) {
  if (typeof text !== "string") return;
  const win = $("chat-window");
  if (!win) return;
  const wrap = document.createElement("div");
  wrap.className = "chat-msg " + role;
  const bub = document.createElement("div");
  bub.className = "msg-bubble";
  bub.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  const t = document.createElement("span");
  t.className = "msg-time";
  t.textContent = formatTimestamp(timestamp);
  wrap.appendChild(bub);
  wrap.appendChild(t);
  win.appendChild(wrap);
  setTimeout(() => { win.scrollTop = win.scrollHeight; }, 50);
}

function renderChatHistoryUI() {
  const win = $("chat-window");
  if (!win) return;
  win.innerHTML = "";

  if (chatHistory.length === 0) {
    const greeting = document.createElement("div");
    greeting.className = "chat-msg ai";
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = "Hi there! I'm Haven, your AI companion 🌿 I'm here to listen and support you through academic pressure. How are you feeling today?";
    const timeEl = document.createElement("span");
    timeEl.className = "msg-time";
    timeEl.textContent = nowTime();
    greeting.appendChild(bubble);
    greeting.appendChild(timeEl);
    win.appendChild(greeting);
  } else {
    chatHistory.forEach(msg => {
      appendChatMessage(
        msg.content,
        msg.role === "assistant" ? "ai" : "user",
        msg.timestamp
      );
    });
  }
  setTimeout(() => { win.scrollTop = win.scrollHeight; }, 100);
}

async function sendMessage(text) {
  if (!text.trim()) return;

  // Stop any current TTS before sending
  stopSpeaking();

  const sendTime = Date.now();
  appendChatMessage(text, "user", sendTime);
  $("chat-input").value = "";

  const win = $("chat-window");
  const typingEl = document.createElement("div");
  typingEl.className = "chat-msg ai typing-indicator";
  typingEl.id = "typing-bubble";
  typingEl.innerHTML = `<div class="msg-bubble">
    <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
  </div>`;
  win.appendChild(typingEl);
  setTimeout(() => { win.scrollTop = win.scrollHeight; }, 50);

  const aiResponse = await sendMessageToGradio(text);
  const replyTime  = Date.now();

  const typing = $("typing-bubble");
  if (typing) typing.remove();

  if (aiResponse) {
    appendChatMessage(aiResponse, "ai", replyTime);
    // ── Speak the AI response if TTS is enabled ──
    speakText(aiResponse);

    chatHistory.push({ role: "user",      content: text,       timestamp: sendTime });
    chatHistory.push({ role: "assistant", content: aiResponse, timestamp: replyTime });
    await saveChatMessageToFirebase("user",      text,       sendTime);
    await saveChatMessageToFirebase("assistant", aiResponse, replyTime);
  } else {
    appendChatMessage("Sorry, something went wrong. Please try again.", "ai", Date.now());
  }
}

if ($("btn-chat-send")) {
  $("btn-chat-send").addEventListener("click", () => sendMessage($("chat-input").value));
}
if ($("chat-input")) {
  $("chat-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage($("chat-input").value);
    }
  });
}
window.sendChip = btn => sendMessage(btn.textContent);

// ════════════════════════════
//  TASKS
// ════════════════════════════
let tasks = [];
const tasksRef = () => collection(db, "users", currentUser.uid, "tasks");

async function loadTasks() {
  try {
    const snap = await getDocs(query(tasksRef(), orderBy("createdAt","asc")));
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn("loadTasks:", e.message); tasks = []; }
  renderTasks();
}

$("btn-tm-add-task").addEventListener("click", addTask);
$("tm-task-title").addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });

async function addTask() {
  const title    = $("tm-task-title").value.trim();
  const deadline = $("tm-task-deadline").value;
  const alarm    = $("tm-task-alarm").value;
  const priority = $("tm-task-priority").value;

  if (!title && !deadline && !alarm) { showToast("Task name, deadline and alarm are all required.", "error"); return; }
  if (!title)    { showToast("Please enter a task title.", "error"); return; }
  if (!deadline) { showToast("Please set a deadline.", "error"); return; }
  if (!alarm)    { showToast("Please set an alarm time.", "error"); return; }

  const task = { title, priority, completed: false, deadline, alarmTime: alarm, alarmEnabled: true, createdAt: Date.now() };
  try {
    const ref = await addDoc(tasksRef(), task);
    tasks.push({ id: ref.id, ...task });
    $("tm-task-title").value = ""; $("tm-task-deadline").value = ""; $("tm-task-alarm").value = ""; $("tm-task-priority").value = "medium";
    renderTasks(); showToast("Task added! ✓", "success");
  } catch(e) { console.error(e); showToast("Could not save task.", "error"); }
}

window.deleteTmTask = async id => {
  try { await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id)); tasks = tasks.filter(t => t.id !== id); renderTasks(); }
  catch { showToast("Could not delete.", "error"); }
};

window.toggleTmTask = async id => {
  const t = tasks.find(t => t.id === id); if (!t) return;
  t.completed = !t.completed;
  try { await setDoc(doc(db, "users", currentUser.uid, "tasks", id), t); } catch { t.completed = !t.completed; }
  renderTasks();
};

window.toggleTmAlarm = async id => {
  const t = tasks.find(t => t.id === id); if (!t) return;
  t.alarmEnabled = !t.alarmEnabled;
  try { await setDoc(doc(db, "users", currentUser.uid, "tasks", id), t); } catch { t.alarmEnabled = !t.alarmEnabled; }
  renderTasks();
};

window.openReAlarm = function(id) {
  document.querySelectorAll(".realarm-popup.open").forEach(p => p.classList.remove("open"));
  const popup = document.getElementById("realarm-popup-" + id);
  if (popup) popup.classList.toggle("open");
};
window.closeReAlarm = function(id) {
  const popup = document.getElementById("realarm-popup-" + id);
  if (popup) popup.classList.remove("open");
};
window.saveReAlarm = async function(id) {
  const input = document.getElementById("realarm-input-" + id);
  if (!input || !input.value) { showToast("Pick a time first.", "error"); return; }
  const t = tasks.find(t => t.id === id); if (!t) return;
  t.alarmTime = input.value;
  t.alarmEnabled = true;
  try {
    await setDoc(doc(db, "users", currentUser.uid, "tasks", id), t);
    renderTasks();
    showToast("Re-alarm set for " + input.value + " ✓", "success");
  } catch { showToast("Could not save alarm.", "error"); }
};

document.addEventListener("click", e => {
  if (!e.target.closest(".task-actions-wrap")) {
    document.querySelectorAll(".realarm-popup.open").forEach(p => p.classList.remove("open"));
  }
});

let tmFilter = "all";
document.querySelectorAll("[data-tm-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tm-filter]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); tmFilter = btn.dataset.tmFilter; renderTasks();
  });
});

function renderTasks() {
  const list = $("tm-task-list"), empty = $("tm-task-empty");
  const upcoming  = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed);
  $("tm-upcoming-count").textContent = upcoming.length;
  $("tm-completed-count").textContent = completed.length;
  const pOrd = { high:0, medium:1, low:2 };
  let filtered = tmFilter === "done" ? completed
    : tmFilter === "all" ? [...upcoming.sort((a,b) => (pOrd[a.priority]??1)-(pOrd[b.priority]??1) || new Date(a.deadline)-new Date(b.deadline)), ...completed]
    : upcoming.filter(t => t.priority === tmFilter).sort((a,b) => new Date(a.deadline)-new Date(b.deadline));

  list.querySelectorAll(".tm-task-item").forEach(e => e.remove());
  if (!filtered.length) { list.appendChild(empty); empty.style.display = "flex"; return; }
  empty.style.display = "none";

  const PL = { high:"🔴 High", medium:"🟡 Medium", low:"🟢 Low" };
  filtered.forEach(t => {
    const el = document.createElement("div");
    el.className = "tm-task-item" + (t.completed ? " done" : "");
    const dl = new Date(t.deadline + "T00:00:00").toLocaleDateString([], { month:"short", day:"numeric" });

    const alarmHtml = `
      <button class="tm-icon-btn ${t.alarmEnabled?"alarm-on":"alarm-off"}" onclick="window.toggleTmAlarm('${t.id}')" title="${t.alarmEnabled?"Disable alarm":"Enable alarm"}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 5.72l-4.6-3.86-1.29 1.53 4.6 3.86L22 5.72zM7.88 3.39L6.6 1.86 2 5.71l1.29 1.53 4.59-3.85zM12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9-4.02-9-9-9zm0 16c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
      </button>`;

    const reAlarmHtml = `
      <div class="task-actions-wrap">
        <button class="tm-icon-btn realarm" onclick="window.openReAlarm('${t.id}')" title="Change alarm time">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <div class="realarm-popup" id="realarm-popup-${t.id}">
          <label>Set alarm time</label>
          <input type="time" id="realarm-input-${t.id}" value="${t.alarmTime||""}">
          <div class="realarm-popup-btns">
            <button class="realarm-set" onclick="window.saveReAlarm('${t.id}')">Save</button>
            <button class="realarm-cancel" onclick="window.closeReAlarm('${t.id}')">Cancel</button>
          </div>
        </div>
      </div>`;

    el.innerHTML = `
      <button class="task-check ${t.completed?"checked":""}" onclick="window.toggleTmTask('${t.id}')">${t.completed?"✓":""}</button>
      <div class="task-info">
        <div class="task-name">${t.title}</div>
        <div class="task-meta">
          <span class="priority-dot ${t.priority||"medium"}"></span><span>${PL[t.priority]||""}</span>
          <span>📅 ${dl}</span>
          ${t.alarmTime ? `<span style="color:${t.alarmEnabled?"var(--sage)":"#ccc"}">🔔 ${t.alarmTime}</span>` : ""}
          ${t.completed ? `<span style="color:#22c55e;font-size:.72rem">✓ Done</span>` : ""}
        </div>
      </div>
      ${alarmHtml}
      ${reAlarmHtml}
      <button class="tm-icon-btn delete" onclick="window.deleteTmTask('${t.id}')" title="Delete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>`;
    list.appendChild(el);
  });
}

// ════════════════════════════
//  TIMER
// ════════════════════════════
const CIRC = 2 * Math.PI * 52;
let timerInterval = null, timerRunning = false, timerTotal = 25*60, timerLeft = 25*60;
const ringEl = $("ring-fill");
ringEl.style.strokeDasharray  = CIRC;
ringEl.style.strokeDashoffset = "0";

function updateTimer() {
  const h = Math.floor(timerLeft / 3600);
  const m = Math.floor((timerLeft % 3600) / 60);
  const s = timerLeft % 60;
  if (h > 0) {
    $("timer-min").textContent = String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
    $("timer-sec").textContent = String(s).padStart(2,"0");
  } else {
    $("timer-min").textContent = String(m).padStart(2,"0");
    $("timer-sec").textContent = String(s).padStart(2,"0");
  }
  ringEl.style.strokeDashoffset = CIRC * (1 - (timerTotal > 0 ? timerLeft/timerTotal : 1));
}

function setTimerSeconds(secs) {
  if (timerRunning) { showToast("Pause the timer first.", "error"); return; }
  timerTotal = secs; timerLeft = timerTotal;
  updateTimer();
}

function getDurationInSeconds() {
  const h = parseInt($("timer-h").value) || 0;
  const m = parseInt($("timer-m").value) || 0;
  const s = parseInt($("timer-s").value) || 0;
  return Math.max(5, h * 3600 + m * 60 + s);
}

function updateRepeatHint() {
  const on = $("timer-repeat").checked;
  const hint = $("repeat-hint");
  hint.style.display = on ? "block" : "none";
  if (on) {
    const h = parseInt($("timer-h").value) || 0;
    const m = parseInt($("timer-m").value) || 0;
    const s = parseInt($("timer-s").value) || 0;
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (s) parts.push(`${s}s`);
    $("repeat-interval-display").textContent = parts.join(" ") || "0s";
  }
}

$("timer-repeat").addEventListener("change", updateRepeatHint);
$("timer-h").addEventListener("input", updateRepeatHint);
$("timer-m").addEventListener("input", updateRepeatHint);
$("timer-s").addEventListener("input", updateRepeatHint);

const SPECIAL_EMAILS = [
  "aa1305589@gmail.com",
  "styx.johnalex@gmail.com",
  "goldniroger@gmail.com",
  "blehhnigga@gmail.com",
  "niggernigger@gmail.com"
];

let currentAudio = null;

function getAlarmSoundPath() {
  if (currentUser && currentUser.email && SPECIAL_EMAILS.includes(currentUser.email)) {
    const randomNum = Math.floor(Math.random() * 8) + 1;
    return `assets/audio/test/test (${randomNum}).mp3`;
  }
  return "assets/audio/alarm.mp3";
}

function playAlarmSound(loud = false) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  try {
    const audioPath = getAlarmSoundPath();
    currentAudio = new Audio(audioPath);
    currentAudio.volume = loud ? 1.0 : 0.7;

    if (loud) {
      currentAudio.loop = true;
      currentAudio.play().catch(e => {
        console.warn("Audio playback failed:", e);
        currentAudio = null;
      });
      setTimeout(() => {
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      }, 5000);
    } else {
      currentAudio.play().catch(e => {
        console.warn("Audio playback failed:", e);
        currentAudio = null;
      });
    }
  } catch (e) {
    console.warn("Alarm sound error:", e);
  }
}

function playBeep() { playAlarmSound(false); }

// ════════════════════════════
//  TIMER FIRESTORE SYNC
// ════════════════════════════
const timerSessionRef = () =>
  doc(db, "users", currentUser.uid, "settings", "timerSession");

async function saveTimerSession(endsAt, durationSecs, repeat) {
  if (!currentUser) return;
  try {
    await setDoc(timerSessionRef(), {
      endsAt, durationSecs, repeat,
      status: "running", startedAt: Date.now(),
    });
  } catch {}
}

async function cancelTimerSession() {
  if (!currentUser) return;
  try {
    await setDoc(timerSessionRef(), { status: "cancelled", cancelledAt: Date.now() }, { merge: true });
  } catch {}
  hideTimerRecoveryBanner();
}

// ════════════════════════════
//  TIMER HISTORY (up to 10 sessions)
// ════════════════════════════
const timerHistoryRef = () =>
  collection(db, "users", currentUser.uid, "timerHistory");

async function saveTimerCompletion(durationSecs) {
  if (!currentUser) {
    console.warn("Cannot save timer: currentUser not set");
    return;
  }
  try {
    console.log("Saving timer completion for user:", currentUser.uid);
    // Add new timer completion
    await addDoc(timerHistoryRef(), {
      durationSecs,
      completedAt: Date.now(),
      formattedTime: formatDuration(durationSecs)
    });
    console.log("✓ Timer saved successfully");
    
    // Keep only last 10 entries (with separate error handling)
    try {
      const snap = await getDocs(query(timerHistoryRef(), orderBy("completedAt", "asc")));
      if (snap.size > 10) {
        const docsToDelete = snap.docs.slice(0, snap.size - 10);
        for (const doc of docsToDelete) {
          await deleteDoc(doc.ref);
        }
      }
    } catch(cleanupError) {
      console.warn("Cleanup error (non-critical):", cleanupError.message);
    }
    
    // Refresh the display in background (don't await, don't block)
    loadAndDisplayTimerHistory().catch(e => console.warn("History refresh failed:", e.message));
  } catch(e) {
    console.error("🔴 Timer history save error:", e.code, e.message);
    if (e.code === "permission-denied") {
      showToast("Timer saved locally (cloud sync pending)", "warning");
    }
  }
}

function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

async function loadAndDisplayTimerHistory() {
  if (!currentUser) {
    console.warn("Cannot load timer history: currentUser not set");
    return;
  }
  try {
    console.log("Loading timer history for user:", currentUser.uid);
    const snap = await getDocs(query(
      timerHistoryRef(),
      orderBy("completedAt", "desc")
    ));
    
    const historyContainer = $("timer-history-list");
    if (!historyContainer) {
      console.log("Timer history container not found");
      return;
    }
    
    if (snap.empty) {
      historyContainer.innerHTML = '<p style="font-size:.85rem; color:var(--muted); padding:.5rem;">No previous timers yet. Complete your first session!</p>';
      return;
    }
    
    let html = '<div style="font-size:.8rem; color:var(--muted); margin-bottom:.5rem;">Last 10 sessions:</div>';
    snap.docs.forEach((doc, idx) => {
      const data = doc.data();
      const date = new Date(data.completedAt).toLocaleDateString([], { month: "short", day: "numeric" });
      const time = new Date(data.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      html += `
        <div style="padding:.4rem .5rem; border-radius:.5rem; background:rgba(147,51,234,0.05); margin-bottom:.3rem; display:flex; justify-content:space-between; align-items:center; font-size:.8rem;">
          <span>#${snap.size - idx}: ${data.formattedTime}</span>
          <span style="color:var(--muted);">${date} ${time}</span>
        </div>
      `;
    });
    
    historyContainer.innerHTML = html;
    console.log("✓ Timer history loaded:", snap.size, "entries");
  } catch(e) {
    console.error("🔴 Timer history load error:", e.code, e.message);
    const historyContainer = $("timer-history-list");
    if (historyContainer) {
      historyContainer.innerHTML = `<p style="font-size:.8rem; color:#d76969; padding:.5rem;">History unavailable (${e.code})</p>`;
    }
  }
}

// Load timer history on initialization
async function initTimerHistory() {
  if (currentUser) {
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for DOM
    await loadAndDisplayTimerHistory();
  }
}


async function recoverTimerSession() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(timerSessionRef());
    if (!snap.exists()) return;
    const session = snap.data();
    if (session.status !== "running") return;

    const remaining = Math.round((session.endsAt - Date.now()) / 1000);

    if (remaining <= 0) {
      if (session.repeat) {
        timerTotal = session.durationSecs;
        timerLeft  = timerTotal;
        $("timer-h").value = Math.floor(session.durationSecs / 3600);
        $("timer-m").value = Math.floor((session.durationSecs % 3600) / 60);
        $("timer-s").value = session.durationSecs % 60;
        $("timer-repeat").checked = true;
        updateRepeatHint(); updateTimer();
        showTimerRecoveryBanner(timerTotal, session.durationSecs, true);
        startTimer();
      } else {
        await cancelTimerSession();
      }
      return;
    }

    timerTotal = session.durationSecs;
    timerLeft  = remaining;
    $("timer-h").value = Math.floor(session.durationSecs / 3600);
    $("timer-m").value = Math.floor((session.durationSecs % 3600) / 60);
    $("timer-s").value = session.durationSecs % 60;
    $("timer-repeat").checked = session.repeat || false;
    updateRepeatHint(); updateTimer();
    showTimerRecoveryBanner(remaining, session.durationSecs, session.repeat);
    startTimer();
  } catch(e) {
    console.warn("Timer recovery failed:", e.message);
  }
}

function showTimerRecoveryBanner(remaining, total, repeat) {
  let banner = $("timer-recovery-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "timer-recovery-banner";
    banner.style.cssText = `
      position:fixed; bottom:1.25rem; left:50%; transform:translateX(-50%);
      background:var(--charcoal); color:white;
      padding:.65rem 1.25rem; border-radius:var(--radius-pill);
      font-family:'DM Sans',sans-serif; font-size:.85rem;
      display:flex; align-items:center; gap:.75rem;
      box-shadow:0 8px 32px rgba(0,0,0,0.25); z-index:9999;
      animation: slideUp .3s ease;
    `;
    document.body.appendChild(banner);
  }
  const mins = Math.floor(remaining / 60), secs = remaining % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  banner.innerHTML = `
    <span>⏱️ Timer resumed — <strong>${timeStr} left</strong>${repeat ? " · repeat on" : ""}</span>
    <button onclick="resetTimer()" style="
      all:unset; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3);
      padding:.25rem .7rem; border-radius:20px; cursor:pointer; font-size:.8rem;
      font-family:'DM Sans',sans-serif; white-space:nowrap;
    ">Stop Timer</button>
  `;
}

function hideTimerRecoveryBanner() {
  const banner = $("timer-recovery-banner");
  if (banner) banner.remove();
}

function startTimer() {
  if (timerLeft <= 0) { timerLeft = timerTotal; updateTimer(); }
  timerRunning = true;
  $("play-icon").style.display = "none"; $("pause-icon").style.display = "block";

  const repeat = $("timer-repeat").checked;
  const endsAt = Date.now() + timerLeft * 1000;
  saveTimerSession(endsAt, timerTotal, repeat);

  timerInterval = setInterval(() => {
    timerLeft--;
    updateTimer();
    if (timerLeft <= 0) {
      clearInterval(timerInterval); timerInterval = null; timerRunning = false;
      $("play-icon").style.display = "block"; $("pause-icon").style.display = "none";

      if ($("timer-repeat").checked) {
        timerLeft = timerTotal;
        updateTimer();
        const nextEndsAt = Date.now() + timerTotal * 1000;
        saveTimerSession(nextEndsAt, timerTotal, true);
        playAlarmSound(true);
        showAlarmNotification({
          title: "⏰ Timer complete! Starting next cycle.",
          subtitle: "Your study session has ended. Next cycle beginning shortly.",
          emailSubject: "StudyHaven: Timer Complete",
          emailBody: "Your study timer just finished! Next repeat cycle starting. 🌿"
        });
        // Save completion in background (don't wait for it)
        saveTimerCompletion(timerTotal);
        setTimeout(() => {
          if ($("timer-repeat").checked) startTimer();
        }, 1500);
      } else {
        cancelTimerSession();
        hideTimerRecoveryBanner();
        playAlarmSound(true);
        showAlarmNotification({
          title: "⏰ Timer complete! Time for a break.",
          subtitle: "Your study session has ended.",
          emailSubject: "StudyHaven: Timer Complete",
          emailBody: "Your study timer just finished! Time to take a well-deserved break. 🌿"
        });
        // Save completion in background (don't wait for it)
        saveTimerCompletion(timerTotal);
      }
    }
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval); timerInterval = null;
  $("play-icon").style.display = "block"; $("pause-icon").style.display = "none";
  cancelTimerSession();
}

function resetTimer() {
  timerRunning = false;
  clearInterval(timerInterval); timerInterval = null;
  cancelTimerSession();
  $("timer-repeat").checked = false;
  updateRepeatHint();
  timerLeft = timerTotal;
  updateTimer();
  $("play-icon").style.display = "block"; $("pause-icon").style.display = "none";
}

$("btn-timer-play").addEventListener("click",  () => timerRunning ? pauseTimer() : startTimer());
$("btn-timer-reset").addEventListener("click", resetTimer);
$("btn-set-timer").addEventListener("click", () => {
  const secs = getDurationInSeconds();
  if (secs < 5) { showToast("Timer must be at least 5 seconds.", "error"); return; }
  setTimerSeconds(secs);
  updateRepeatHint();
});
updateTimer();

// ── Task alarm checker ──
const firedAlarms = new Set();
setInterval(() => {
  const now  = new Date();
  const curr = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  tasks.forEach(t => {
    if (!t.alarmEnabled || !t.alarmTime) return;
    const key = t.id + "_" + curr;
    if (t.alarmTime === curr && !firedAlarms.has(key)) {
      firedAlarms.add(key);
      playAlarmSound(true);
      showAlarmNotification({
        title: `Reminder: ${t.title}`,
        subtitle: `${t.completed ? "✓ Completed task" : `Due: ${t.deadline}`} · ${t.priority} priority`,
        emailSubject: `StudyHaven Reminder: ${t.title}`,
        emailBody: `Reminder for your task: "${t.title}"\nDue: ${t.deadline}\nPriority: ${t.priority}\nStatus: ${t.completed ? "Completed" : "Pending"}`
      });
    }
  });
  if (firedAlarms.size > 200) firedAlarms.clear();
}, 5000);

// ════════════════════════════
//  TRACKER DATA
// ════════════════════════════
let actLogs = [], calLogs = [], calGoal = 2000, chart = null;
const actRef = () => collection(db, "users", currentUser.uid, "activityLogs");
const calRef = () => collection(db, "users", currentUser.uid, "calorieLogs");

async function loadAllLogs() {
  try {
    const [a,c] = await Promise.all([
      getDocs(query(actRef(), orderBy("createdAt","asc"))),
      getDocs(query(calRef(), orderBy("createdAt","asc"))),
    ]);
    actLogs = a.docs.map(d => ({id:d.id,...d.data()}));
    calLogs = c.docs.map(d => ({id:d.id,...d.data()}));
    try {
      const g = await getDoc(doc(db,"users",currentUser.uid,"settings","tracker"));
      if (g.exists()) { calGoal = g.data().calorieGoal||2000; $("calorie-goal").value = calGoal; }
    } catch {}
  } catch(e) { console.warn("loadAllLogs:", e.message); actLogs = []; calLogs = []; }
  renderAll();
  updateActivityUnit();
}

const ACTIVITY_UNITS = {
  exercise: { label: "(minutes)", step: "1" },
  study:    { label: "(hours)",   step: "0.5" },
  sleep:    { label: "(hours)",   step: "0.5" },
  water:    { label: "(glasses)", step: "1" },
  breaks:   { label: "(count)",   step: "1" },
};

function getUsedHoursToday() {
  const td = todayISO();
  const exerciseMin = actLogs.filter(l => l.type === "exercise" && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  const studyHrs    = actLogs.filter(l => l.type === "study"    && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  const sleepHrs    = actLogs.filter(l => l.type === "sleep"    && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  return Math.round((exerciseMin / 60 + studyHrs + sleepHrs) * 100) / 100;
}

function getRemainingHours() {
  return Math.max(0, Math.round((24 - getUsedHoursToday()) * 100) / 100);
}

function updateActivityUnit() {
  const type = $("activity-type").value;
  const cfg  = ACTIVITY_UNITS[type];
  $("activity-unit-label").textContent = cfg.label;
  const inp  = $("activity-value");
  inp.step   = cfg.step;
  inp.max    = "";

  const hint = $("activity-max-hint");
  if (type === "exercise" || type === "study" || type === "sleep") {
    const remHrs = getRemainingHours();
    const remInUnit = type === "exercise" ? Math.round(remHrs * 60) : remHrs;
    const unitLabel = type === "exercise" ? "min" : "hrs";
    if (remHrs <= 0) {
      hint.textContent = "⛔ No time remaining today (24 hr pool full)";
      hint.style.color = "#ef4444";
    } else {
      hint.textContent = `Remaining today: ${remInUnit} ${unitLabel} (shared 24 hr pool with exercise, study & sleep)`;
      hint.style.color = "";
    }
    hint.style.display = "block";
  } else {
    hint.style.display = "none";
  }
}
$("activity-type").addEventListener("change", updateActivityUnit);
updateActivityUnit();

$("btn-log-activity").addEventListener("click", async () => {
  const type = $("activity-type").value;
  const val  = parseFloat($("activity-value").value);
  if (!val || val <= 0) { showToast("Please enter a valid value.", "error"); return; }

  if (type === "exercise" || type === "study" || type === "sleep") {
    const addedHrs = type === "exercise" ? val / 60 : val;
    const usedHrs  = getUsedHoursToday();
    if (usedHrs + addedHrs > 24) {
      const remHrs = Math.max(0, 24 - usedHrs);
      const remInUnit = type === "exercise" ? Math.round(remHrs * 60) : Math.round(remHrs * 10) / 10;
      const unitLabel = type === "exercise" ? "minutes" : "hours";
      showToast(`Can't log — only ${remInUnit} ${unitLabel} remaining in today's 24 hr pool.`, "error");
      updateActivityUnit();
      return;
    }
  }

  const entry = { type, value: val, date: todayISO(), createdAt: Date.now() };
  try {
    const r = await addDoc(actRef(), entry);
    actLogs.push({ id: r.id, ...entry });
    $("activity-value").value = "";
    showToast("Activity logged! ✓", "success");
    updateActivityUnit();
    renderAll();
  } catch(e) { console.error(e); showToast("Could not save. Check Firestore rules.", "error"); }
});

$("btn-log-calorie").addEventListener("click", async () => {
  const raw  = $("calorie-amount").value;
  const cal  = parseFloat(raw);
  const meal = $("meal-name").value.trim() || "Meal";
  if (!raw || isNaN(cal) || cal <= 0) { showToast("Please enter a valid calorie amount.", "error"); return; }
  const entry = { calories: cal, meal, date: todayISO(), time: nowTime(), createdAt: Date.now() };
  try { const r = await addDoc(calRef(), entry); calLogs.push({id:r.id,...entry}); $("calorie-amount").value=""; $("meal-name").value=""; showToast("Calories logged! ✓","success"); renderCals(); }
  catch(e) { console.error(e); showToast("Could not save. Check Firestore rules.","error"); }
});

function onGoalChange() {
  const v = parseInt($("calorie-goal").value); if (!v||v<1) return;
  calGoal = v;
  setDoc(doc(db,"users",currentUser.uid,"settings","tracker"), {calorieGoal:calGoal}).catch(()=>{});
  renderCals();
}
$("calorie-goal").addEventListener("change", onGoalChange);
$("calorie-goal").addEventListener("blur",   onGoalChange);

function weekDays(offset=0) {
  const today = new Date(), day = today.getDay(), days = [];
  for (let i=0;i<7;i++) { const d=new Date(today); d.setDate(today.getDate()-day-offset*7+i); days.push(d.toISOString().split("T")[0]); }
  return days;
}
function sum(logs, type, dates) { return logs.filter(l=>l.type===type&&dates.includes(l.date)).reduce((s,l)=>s+(l.value||0),0); }
function avg7(type) {
  const cut = new Date(); cut.setDate(cut.getDate()-7);
  const cutS = cut.toISOString().split("T")[0];
  const rel  = actLogs.filter(l=>l.type===type&&l.date>=cutS);
  return rel.length ? Math.round(rel.reduce((s,l)=>s+l.value,0)/7*10)/10 : 0;
}

function renderAll() { renderToday(); renderChart(); renderWeekly(); renderAvgs(); renderCals(); }

function renderToday() {
  const td = todayISO();
  ["exercise","study","sleep","water","breaks"].forEach(t => {
    const el = $("tsc-"+t); if (!el) return;
    el.textContent = Math.round(actLogs.filter(l=>l.type===t&&l.date===td).reduce((s,l)=>s+l.value,0)*10)/10;
  });
}

function renderChart() {
  const canvas = $("weekly-chart"); if (!canvas) return;
  const td = todayISO();

  const exerciseMin = actLogs.filter(l => l.type === "exercise" && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  const studyHrs    = actLogs.filter(l => l.type === "study"    && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  const sleepHrs    = actLogs.filter(l => l.type === "sleep"    && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  const waterGl     = actLogs.filter(l => l.type === "water"    && l.date === td).reduce((s,l) => s + (l.value||0), 0);
  const breaksN     = actLogs.filter(l => l.type === "breaks"   && l.date === td).reduce((s,l) => s + (l.value||0), 0);

  const exerciseHrs = exerciseMin / 60;
  const waterHrsEq  = waterGl  * 0.25;
  const breaksHrsEq = breaksN  * 0.25;

  const normVals = [exerciseHrs, studyHrs, sleepHrs, waterHrsEq, breaksHrsEq];
  const grand    = normVals.reduce((a, b) => a + b, 0);

  const labels = ["Exercise", "Study", "Sleep", "Water", "Breaks"];
  const colors = ["#f97316", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981"];

  function fmtMins(totalMins) {
    const m = Math.round(totalMins);
    if (m === 0) return "0 min";
    const h = Math.floor(m / 60), rem = m % 60;
    if (h === 0) return `${rem} min`;
    if (rem === 0) return `${h} hr`;
    return `${h}h ${rem}m`;
  }
  function fmtHrs(h) {
    if (h === 0) return "0 hr";
    const whole = Math.floor(h), frac = Math.round((h - whole) * 60);
    if (frac === 0) return `${whole} hr`;
    return `${whole}h ${frac}m`;
  }

  const displayVals = [
    fmtMins(exerciseMin), fmtHrs(studyHrs), fmtHrs(sleepHrs),
    `${Math.round(waterGl)} glasses`, `${Math.round(breaksN)} breaks`,
  ];

  if (chart) { chart.destroy(); chart = null; }

  if (grand === 0) {
    $("pie-center-val").textContent = "—";
    $("pie-center-sub").textContent = "no data yet";
    $("pie-pct-grid").innerHTML = `<div style="grid-column:1/-1;text-align:center;font-size:.82rem;color:var(--muted);padding:.5rem">Log activities today to see your breakdown!</div>`;
    chart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: { labels, datasets: [{ data: [1,1,1,1,1], backgroundColor: colors.map(c => c + "33"), borderWidth: 0 }] },
      options: { cutout: "68%", plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: false }
    });
    return;
  }

  const pcts = normVals.map(v => Math.round(v / grand * 1000) / 10);

  chart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: normVals, backgroundColor: colors, borderWidth: 3, borderColor: "#faf8f4", hoverOffset: 8 }]
    },
    options: {
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${pcts[ctx.dataIndex]}% (${displayVals[ctx.dataIndex]})` } }
      },
      onClick(evt, elems) {
        if (elems.length) {
          const i = elems[0].index;
          $("pie-center-val").textContent = pcts[i] + "%";
          $("pie-center-sub").textContent = labels[i];
        }
      },
      animation: { animateRotate: true, duration: 600 }
    }
  });

  const maxIdx = pcts.indexOf(Math.max(...pcts));
  $("pie-center-val").textContent = pcts[maxIdx] + "%";
  $("pie-center-sub").textContent = labels[maxIdx];

  $("pie-pct-grid").innerHTML = labels.map((l, i) => `
    <div class="pie-pct-item">
      <span class="pie-pct-color" style="background:${colors[i]}"></span>
      <span class="pie-pct-label">${l}</span>
      <span class="pie-pct-val">${pcts[i]}%</span>
      <span class="pie-pct-raw">${displayVals[i]}</span>
    </div>`).join("");
}

function renderWeekly() {
  const tw=weekDays(0), lw=weekDays(1);
  const cur={e:sum(actLogs,"exercise",tw),s:sum(actLogs,"study",tw),sl:sum(actLogs,"sleep",tw)};
  const prv={e:sum(actLogs,"exercise",lw),s:sum(actLogs,"study",lw),sl:sum(actLogs,"sleep",lw)};
  const setWR=(key,c,p,u)=>{
    const ce=$("wr-"+key+"-cur"),pe=$("wr-"+key+"-prev"),ch=$("wr-"+key+"-change"); if(!ce)return;
    ce.textContent=(Math.round(c*10)/10)+" "+u; pe.textContent=(Math.round(p*10)/10)+" "+u;
    const d=c-p,pct=p>0?((d/p)*100).toFixed(1):0,sign=d>=0?"+":"",arrow=d>=0?"↗":"↘";
    ch.textContent=`${arrow} ${sign}${Math.round(d*10)/10} ${u} (${sign}${pct}%)`;
    ch.className="wr-change "+(d>0?"up":d<0?"down":"flat");
  };
  setWR("ex",cur.e,prv.e,"min"); setWR("st",cur.s,prv.s,"hrs"); setWR("sl",cur.sl,prv.sl,"hrs");
  const noData=cur.e===0&&cur.s===0&&cur.sl===0;
  const allUp=cur.e>prv.e&&cur.s>prv.s&&cur.sl>prv.sl;
  const someUp=cur.e>prv.e||cur.s>prv.s||cur.sl>prv.sl;
  $("wr-summary").textContent = noData?"📝 Start logging activities to see your weekly progress!":allUp?"🌟 Amazing — you've improved in all areas this week!":someUp?"👍 Good progress! Keep consistent for even better results!":"💪 Keep going! Every week is a new opportunity to improve.";
}

function renderAvgs() {
  ["exercise","study","sleep","water","breaks"].forEach(t => { const el=$("avg-"+t); if(el) el.textContent=avg7(t); });
}

function renderCals() {
  const td = todayISO();
  const total = calLogs.filter(l=>l.date===td).reduce((s,l)=>s+(l.calories||0),0);
  $("cal-today").textContent = Math.round(total);
  $("cal-goal-display").textContent = calGoal;
  const rem = calGoal - total;
  $("cal-remaining").textContent = rem >= 0 ? `${Math.round(rem)} calories remaining` : `${Math.round(Math.abs(rem))} calories over goal`;
  const bar = $("cal-bar-fill");
  bar.style.width = Math.min(total/calGoal*100,100)+"%";
  bar.classList.toggle("over", total > calGoal);
  renderRecs(total);
  renderMeals(td);
}

function renderRecs(total) {
  const recs = getCalRecs(total, calGoal);
  const card = $("cal-recs-card");
  card.style.borderColor = recs.status==="low"?"rgba(59,130,246,0.3)":recs.status==="high"?"rgba(239,68,68,0.3)":"rgba(34,197,94,0.3)";
  card.style.background  = recs.status==="low"?"#eff6ff":recs.status==="high"?"#fef2f2":"#f0fdf4";
  $("cal-recs-msg").textContent = recs.message;
  $("cal-foods-list").innerHTML = recs.foods.map(f=>`<div class="food-item"><strong>${f.name}</strong><span class="food-meta">${f.desc} — <span class="food-cal">${f.cal} cal</span> · ${f.benefit}</span></div>`).join("");
  const avs = $("cal-avoid-section");
  if (recs.avoid?.length) { avs.style.display="block"; $("cal-avoid-list").innerHTML=recs.avoid.map(a=>`<div class="avoid-item">${a}</div>`).join(""); }
  else avs.style.display="none";
}

function renderMeals(td) {
  const el=$("meals-list"), meals=calLogs.filter(l=>l.date===td);
  el.innerHTML = meals.length
    ? meals.map(l=>`<div class="meal-log-item"><div><div class="meal-name">${l.meal}</div><div class="meal-time">${l.time||""}</div></div><div><div class="meal-cal">${Math.round(l.calories)}</div><div class="meal-cal-sub">calories</div></div></div>`).join("")
    : `<div class="tracker-empty"><span style="font-size:2rem">🍽️</span><p>No meals logged today.</p></div>`;
}

function getCalRecs(total, goal) {
  if (total < goal * 0.5) return { status:"low", message:"You need more calories to maintain energy for studying.",
    foods:[{name:"🥑 Avocado toast",desc:"2 slices whole wheat + ½ avocado",cal:350,benefit:"Healthy fats & energy"},{name:"🍌 Banana + peanut butter",desc:"1 banana + 2 tbsp PB",cal:280,benefit:"Quick energy & protein"},{name:"🥜 Trail mix",desc:"¼ cup nuts + dried fruit",cal:200,benefit:"Nutrient-dense snack"},{name:"🍚 Brown rice bowl",desc:"Rice + chicken + veggies",cal:450,benefit:"Balanced macros"},{name:"🥛 Protein smoothie",desc:"Milk + protein + banana",cal:320,benefit:"Easy complete nutrition"}] };
  if (total > goal * 1.2) return { status:"high", message:"You're over your goal. Focus on lighter options.",
    foods:[{name:"🥗 Garden salad",desc:"2 cups greens + vinaigrette",cal:85,benefit:"Low cal, high fiber"},{name:"🥒 Cucumber+hummus",desc:"1 cup cucumber + 3 tbsp hummus",cal:110,benefit:"Light and refreshing"},{name:"🍎 Fresh apple",desc:"1 medium apple",cal:95,benefit:"Natural sweetness"},{name:"🥕 Veggie sticks",desc:"Carrot & celery + dip",cal:70,benefit:"Satisfying crunch"},{name:"🫖 Green tea",desc:"Unsweetened",cal:0,benefit:"Metabolism boost"}],
    avoid:["🍕 Avoid: Pizza (1 slice ≈ 285 cal)","🍰 Avoid: Pastries (1 slice ≈ 400+ cal)","🥤 Avoid: Soda (12oz ≈ 140 cal)","🍟 Avoid: Fries (medium ≈ 365 cal)"] };
  const rem = Math.round(goal - total);
  return { status:"good", message:`Great job! ${rem>0?rem+" calories remaining":"You've hit your goal!"} 🎉`,
    foods:[{name:"🐟 Grilled salmon",desc:"4oz + steamed veggies",cal:280,benefit:"Lean protein & omega-3s"},{name:"🥦 Veggie stir-fry",desc:"1.5 cups + olive oil",cal:150,benefit:"Vitamins & fiber"},{name:"🍠 Sweet potato",desc:"1 medium baked",cal:180,benefit:"Complex carbs"},{name:"🥤 Infused water",desc:"Lemon/cucumber/mint",cal:0,benefit:"Stay hydrated"},{name:"🍇 Mixed berries",desc:"1 cup strawberries & blueberries",cal:85,benefit:"Antioxidants"}] };
}

// ════════════════════════════
//  CALORIE CALCULATOR
// ════════════════════════════
let calcGoalType = "maintain";

$("btn-calc-toggle").addEventListener("click", () => {
  const body = $("cal-calc-body");
  const btn  = $("btn-calc-toggle");
  const open = body.classList.toggle("open");
  btn.setAttribute("aria-expanded", open);
});

document.querySelectorAll(".goal-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".goal-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    calcGoalType = pill.dataset.goal;
  });
});

$("btn-run-calc").addEventListener("click", runCalcCalories);

function runCalcCalories() {
  const age      = parseInt($("calc-age").value);
  const sex      = $("calc-sex").value;
  const heightCm = parseFloat($("calc-height-cm").value);
  const weight   = parseFloat($("calc-weight").value);
  const activity = parseFloat($("calc-activity").value);

  if (!age || !heightCm || !weight || age < 10 || age > 100 || heightCm < 100 || weight < 30) {
    showToast("Please fill in all fields with valid values.", "error");
    return;
  }

  let bmr;
  if (sex === "male") {
    bmr = 10 * weight + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * heightCm - 5 * age - 161;
  }

  const tdee = Math.round(bmr * activity);

  let target;
  if (calcGoalType === "loss")      target = Math.round(tdee - 500);
  else if (calcGoalType === "gain") target = Math.round(tdee + 300);
  else                              target = tdee;
  target = Math.max(1200, target);

  const proteinPct = sex === "male" ? 0.30 : 0.28;
  const carbPct    = 0.45;
  const fatPct     = 1 - proteinPct - carbPct;
  const proteinG   = Math.round((target * proteinPct) / 4);
  const carbG      = Math.round((target * carbPct) / 4);
  const fatG       = Math.round((target * fatPct) / 9);

  const goalLabels = { maintain: "Maintain weight", loss: "Lose ~0.5 kg/week", gain: "Lean bulk" };
  const goalColors = { maintain: "#22c55e", loss: "#3b82f6", gain: "#f97316" };

  $("calc-result-kcal").textContent = target.toLocaleString();
  $("calc-result-kcal").style.color = goalColors[calcGoalType];

  $("calc-breakdown").innerHTML = `
    <div class="breakdown-item">
      <span class="breakdown-label">BMR</span>
      <span class="breakdown-val">${Math.round(bmr).toLocaleString()}</span>
      <span class="breakdown-sub">kcal at rest</span>
    </div>
    <div class="breakdown-item">
      <span class="breakdown-label">TDEE</span>
      <span class="breakdown-val">${tdee.toLocaleString()}</span>
      <span class="breakdown-sub">kcal with activity</span>
    </div>
    <div class="breakdown-item">
      <span class="breakdown-label">Goal</span>
      <span class="breakdown-val" style="font-size:.9rem;color:${goalColors[calcGoalType]}">${goalLabels[calcGoalType]}</span>
      <span class="breakdown-sub">${calcGoalType === "maintain" ? "±0 kcal" : calcGoalType === "loss" ? "−500 kcal" : "+300 kcal"}</span>
    </div>
  `;

  $("calc-macros").innerHTML = `
    <div class="macro-item protein">
      <span class="macro-name">🥩 Protein</span>
      <span class="macro-grams">${proteinG}g</span>
      <span class="macro-pct">${Math.round(proteinPct * 100)}% of calories</span>
    </div>
    <div class="macro-item carbs">
      <span class="macro-name">🌾 Carbs</span>
      <span class="macro-grams">${carbG}g</span>
      <span class="macro-pct">${Math.round(carbPct * 100)}% of calories</span>
    </div>
    <div class="macro-item fat">
      <span class="macro-name">🥑 Fat</span>
      <span class="macro-grams">${fatG}g</span>
      <span class="macro-pct">${Math.round(fatPct * 100)}% of calories</span>
    </div>
  `;

  const resultEl = $("cal-calc-result");
  resultEl.style.display = "block";
  resultEl.dataset.target = target;
}

$("btn-use-result").addEventListener("click", () => {
  const target = parseInt($("cal-calc-result").dataset.target);
  if (!target) return;
  $("calorie-goal").value = target;
  calGoal = target;
  setDoc(doc(db, "users", currentUser.uid, "settings", "tracker"), { calorieGoal: calGoal }).catch(() => {});
  renderCals();
  showToast(`Daily goal set to ${target.toLocaleString()} kcal ✓`, "success");
  $("calorie-goal").scrollIntoView({ behavior: "smooth", block: "center" });
});