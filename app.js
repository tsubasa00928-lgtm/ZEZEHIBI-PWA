// app.js  --- main logic + Firebase + calendar + diary sync

// ===== Firebase (v11) import =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ===== Firebase config (ZEZEHIBI プロジェクト) =====
const firebaseConfig = {
  apiKey: "AIzaSyAXhTD5pg9_PdNH-7qNHVt9SlCHXxXAzSY",
  authDomain: "zezehibi.firebaseapp.com",
  projectId: "zezehibi",
  storageBucket: "zezehibi.firebasestorage.app",
  messagingSenderId: "222553318634",
  appId: "1:222553318634:web:a0454885d44758b085e393",
  measurementId: "G-CGMZN2RB9G",
};

// ===== Initialize Firebase =====
const app = initializeApp(firebaseConfig);
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  // ローカル環境(file://)などでは analytics が失敗するので無視
}

const auth = getAuth(app);
const db = getFirestore(app);

// ===== App state =====
let currentUserId = null;
let currentDate = new Date();
let selectedDateStr = formatDateKey(currentDate); // YYYY-MM-DD

// ローカルキャッシュ（日記）
let cacheEntries = loadLocalEntries();

// ===== Utility =====
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function loadLocalEntries() {
  try {
    const raw = localStorage.getItem("zezehibi_entries");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function saveLocalEntries() {
  localStorage.setItem("zezehibi_entries", JSON.stringify(cacheEntries));
}

// ===== DOM refs =====
const todayLabel = document.getElementById("todayLabel");
const monthLabel = document.getElementById("monthLabel");
const calendarGrid = document.getElementById("calendarGrid");

const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

const screenCalendar = document.getElementById("screen-calendar");
const screenDiary = document.getElementById("screen-diary");
const screenSchedule = document.getElementById("screen-schedule");
const screenSearch = document.getElementById("screen-search");
const screenAdjust = document.getElementById("screen-adjust");

const diaryDateTitle = document.getElementById("diaryDateTitle");
const diaryTitleInput = document.getElementById("diaryTitleInput");
const diaryBodyInput = document.getElementById("diaryBodyInput");
const sleepInput = document.getElementById("sleepInput");
const wakeInput = document.getElementById("wakeInput");
const mealsInput = document.getElementById("mealsInput");

const saveDiaryBtn = document.getElementById("saveDiaryBtn");
const deleteDiaryBtn = document.getElementById("deleteDiaryBtn");
const backToCalendarBtn = document.getElementById("backToCalendarBtn");

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

const tabButtons = document.querySelectorAll(".tab-btn");

// ===== 初期処理 =====
initAuth();
setupBasicUI();
renderCalendar();

// --- Auth: 匿名ログインしてUIDを持つ ---
function initAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUserId = user.uid;
      // Firestore から軽く同期（必要最低限）
      // ここでは全部取得してローカルにマージ
      syncFromFirestore().catch(console.error);
    } else {
      signInAnonymously(auth).catch(console.error);
    }
  });
}

// Firestore → ローカルへ同期
async function syncFromFirestore() {
  if (!currentUserId) return;
  const colRef = collection(db, "users", currentUserId, "entries");
  const snapshot = await getDocs(colRef);
  snapshot.forEach((docSnap) => {
    cacheEntries[docSnap.id] = docSnap.data();
  });
  saveLocalEntries();
  renderCalendar(); // タイトルを反映
}

// ===== UI イベントのセットアップ =====
function setupBasicUI() {
  const now = new Date();
  const label = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  todayLabel.textContent = label;

  prevMonthBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  nextMonthBtn.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  backToCalendarBtn.addEventListener("click", () => {
    switchScreen("calendar");
  });

  saveDiaryBtn.addEventListener("click", () => {
    saveDiary().catch(console.error);
  });
  deleteDiaryBtn.addEventListener("click", () => {
    deleteDiary().catch(console.error);
  });

  // タブ切り替え
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen;
      tabButtons.forEach((b) => b.classList.remove("tab-active", "active"));
      btn.classList.add("tab-active", "active");
      switchScreen(screen);
    });
  });

  // 検索
  searchInput.addEventListener("input", () => {
    renderSearchResults(searchInput.value.trim());
  });
}

// ===== 画面切り替え =====
function switchScreen(screenName) {
  const screens = {
    calendar: screenCalendar,
    diary: screenDiary,
    schedule: screenSchedule,
    search: screenSearch,
    adjust: screenAdjust,
  };
  Object.values(screens).forEach((el) => el.classList.remove("screen-active", "active"));
  const target = screens[screenName];
  if (target) target.classList.add("screen-active", "active");
}

// ===== カレンダー描画 =====
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11

  monthLabel.textContent = `${year}年${month + 1}月`;

  // 1日の曜日
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0(日)〜6(土)
  // 月末日
  const lastDay = new Date(year, month + 1, 0).getDate();

  // 前月の末日
  const prevLastDay = new Date(year, month, 0).getDate();

  calendarGrid.innerHTML = "";

  const totalCells = 42; // 7×6
  let dayNum = 1;
  let nextMonthDay = 1;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";

    let thisDate;
    let displayNum;
    let isOut = false;

    if (i < startWeekday) {
      // 前月
      displayNum = prevLastDay - startWeekday + 1 + i;
      thisDate = new Date(year, month - 1, displayNum);
      isOut = true;
    } else if (dayNum > lastDay) {
      // 次月
      displayNum = nextMonthDay++;
      thisDate = new Date(year, month + 1, displayNum);
      isOut = true;
    } else {
      // 今月
      displayNum = dayNum++;
      thisDate = new Date(year, month, displayNum);
    }

    const dateKey = formatDateKey(thisDate);

    // 曜日クラス
    const weekday = thisDate.getDay();
    if (weekday === 0) cell.classList.add("sun");
    if (weekday === 6) cell.classList.add("sat");
    if (isOut) cell.classList.add("out");

    // 今日ハイライト
    const today = new Date();
    if (
      thisDate.getFullYear() === today.getFullYear() &&
      thisDate.getMonth() === today.getMonth() &&
      thisDate.getDate() === today.getDate()
    ) {
      cell.classList.add("today");
    }

    // 選択中
    if (dateKey === selectedDateStr) {
      cell.classList.add("selected");
    }

    // 中身
    const numEl = document.createElement("div");
    numEl.className = "day-num";
    numEl.textContent = displayNum;

    const tagsEl = document.createElement("div");
    tagsEl.className = "day-tags";
    const entry = cacheEntries[dateKey];
    if (entry && entry.title) {
      tagsEl.textContent = entry.title;
    } else if (entry && entry.body) {
      tagsEl.textContent = entry.body.slice(0, 18);
    } else {
      tagsEl.textContent = "";
    }

    cell.appendChild(numEl);
    cell.appendChild(tagsEl);

    // シングルタップで選択、ダブルタップで日記画面へ
    let lastTapTime = 0;
    cell.addEventListener("click", () => {
      const now = Date.now();
      const delta = now - lastTapTime;
      lastTapTime = now;

      selectedDateStr = dateKey;
      renderCalendar(); // 選択ハイライト更新

      if (delta < 280) {
        // ダブルタップ / ダブルクリックとみなす
        openDiaryScreen(dateKey);
      }
    });

    calendarGrid.appendChild(cell);
  }
}

// ===== 日記画面オープン =====
function openDiaryScreen(dateKey) {
  selectedDateStr = dateKey;
  const d = parseDateKey(dateKey);
  diaryDateTitle.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日の日記`;

  const entry = cacheEntries[dateKey] || {};
  diaryTitleInput.value = entry.title || "";
  diaryBodyInput.value = entry.body || "";
  sleepInput.value = entry.sleep || "";
  wakeInput.value = entry.wake || "";
  mealsInput.value = entry.meals || "";

  switchScreen("diary");
}

// ===== 日記保存 =====
async function saveDiary() {
  const data = {
    date: selectedDateStr,
    title: diaryTitleInput.value.trim(),
    body: diaryBodyInput.value.trim(),
    sleep: sleepInput.value || "",
    wake: wakeInput.value || "",
    meals: mealsInput.value.trim(),
    updatedAt: new Date().toISOString(),
  };

  // 空なら削除扱いでもいいが、ここではそのまま保存
  cacheEntries[selectedDateStr] = data;
  saveLocalEntries();
  renderCalendar();

  if (currentUserId) {
    const ref = doc(db, "users", currentUserId, "entries", selectedDateStr);
    await setDoc(ref, data, { merge: true });
  }
  alert("保存しました");
}

// ===== 日記削除 =====
async function deleteDiary() {
  if (!cacheEntries[selectedDateStr]) return;
  if (!confirm("この日の記録を削除しますか？")) return;

  delete cacheEntries[selectedDateStr];
  saveLocalEntries();
  renderCalendar();

  if (currentUserId) {
    const ref = doc(db, "users", currentUserId, "entries", selectedDateStr);
    await setDoc(ref, { deleted: true }, { merge: true });
  }
  diaryTitleInput.value = "";
  diaryBodyInput.value = "";
  sleepInput.value = "";
  wakeInput.value = "";
  mealsInput.value = "";
  alert("削除しました");
}

// ===== 検索 =====
function renderSearchResults(keyword) {
  searchResults.innerHTML = "";
  if (!keyword) return;

  const lower = keyword.toLowerCase();
  const entries = Object.entries(cacheEntries)
    .filter(([dateKey, e]) => {
      if (!e || e.deleted) return false;
      const text = `${e.title || ""} ${e.body || ""}`.toLowerCase();
      return text.includes(lower);
    })
    .sort(([a], [b]) => (a < b ? 1 : -1)); // 新しい順

  for (const [dateKey, e] of entries) {
    const d = parseDateKey(dateKey);
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = e.title || `${d.getMonth() + 1}月${d.getDate()}日`;

    const sub = document.createElement("div");
    sub.className = "card-sub";
    sub.textContent = (e.body || "").slice(0, 50);

    card.appendChild(title);
    card.appendChild(sub);

    card.addEventListener("click", () => {
      selectedDateStr = dateKey;
      openDiaryScreen(dateKey);
    });

    searchResults.appendChild(card);
  }
}
