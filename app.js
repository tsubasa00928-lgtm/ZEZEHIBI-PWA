/* =========================================================
   是々日々 app.js ― Firebase同期版 / Googleログイン
   ========================================================= */

/* -----------------------------
   Firebase インポート
----------------------------- */
// Firebase Web v10 (ESM CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.2/firebase-analytics.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js";

/* -----------------------------
   Firebase 初期化（あなたの設定）
----------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAXhTD5pg9_PdNH-7qNHVt9SlCHXxXAzSY",
  authDomain: "zezehibi.firebaseapp.com",
  projectId: "zezehibi",
  storageBucket: "zezehibi.firebasestorage.app",
  messagingSenderId: "222553318634",
  appId: "1:222553318634:web:a0454885d44758b085e393",
  measurementId: "G-CGMZN2RB9G"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

/* =========================================================
   DOM 要素取得
========================================================= */
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const googleLoginBtn = document.getElementById("google-login");

const monthLabel = document.getElementById("month-label");
const calendarGrid = document.getElementById("calendar-grid");
const todayLabel = document.getElementById("today-label");

const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");

const tabButtons = document.querySelectorAll(".tab-btn");
const screens = {
  calendar: document.getElementById("screen-calendar"),
  diary: document.getElementById("screen-diary"),
  search: document.getElementById("screen-search"),
  coord: document.getElementById("screen-coord")
};

/* =========================================================
   日記データ管理（ローカル＋クラウド）
========================================================= */

// ローカルストレージキー
const LOCAL_KEY = "zezehibi_diary";

// ローカルキャッシュ {dateKey: {title, body}}
let diaryData = loadLocalDiary();

// ログイン中の Firebase ユーザー
let currentUser = null;

/* -----------------------------
   ローカル読み込み
----------------------------- */
function loadLocalDiary() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveLocalDiary() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(diaryData));
}

/* -----------------------------
   日付ユーティリティ
----------------------------- */
function pad(n) {
  return n.toString().padStart(2, "0");
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateKeyFromYMD(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function formatJP(d) {
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${wd}）`;
}

/* =========================================================
   カレンダー描画
========================================================= */

let currentDate = new Date(); // 今表示している月
let lastTap = 0;
let lastTapKey = null;

function renderCalendar() {
  // 今日表示
  todayLabel.textContent = formatJP(new Date());

  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  monthLabel.textContent = `${y}年${m}月`;

  // カレンダー生成
  calendarGrid.innerHTML = "";
  const first = new Date(y, m - 1, 1);
  const firstDay = first.getDay();
  const prevLast = new Date(y, m - 1, 0).getDate();
  const thisLast = new Date(y, m, 0).getDate();

  for (let i = 0; i < 42; i++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";

    let dayNum;
    let cY = y;
    let cM = m;
    let inMonth = true;

    if (i < firstDay) {
      dayNum = prevLast - (firstDay - 1 - i);
      inMonth = false;
      if (m === 1) cM = 12, cY = y - 1;
      else cM = m - 1;
      cell.classList.add("out");
    } else if (i >= firstDay + thisLast) {
      dayNum = i - (firstDay + thisLast - 1);
      inMonth = false;
      if (m === 12) cM = 1, cY = y + 1;
      else cM = m + 1;
      cell.classList.add("out");
    } else {
      dayNum = i - firstDay + 1;
    }

    const key = dateKeyFromYMD(cY, cM, dayNum);
    cell.dataset.key = key;

    // 曜日色
    if (i % 7 === 0) cell.classList.add("sun");
    if (i % 7 === 6) cell.classList.add("sat");

    // 今日
    if (key === dateKey(new Date())) {
      cell.classList.add("today");
    }

    // 日付数字
    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = dayNum;
    cell.appendChild(num);

    // タイトル
    const tag = document.createElement("div");
    tag.className = "day-tags";
    tag.textContent = diaryData[key]?.title ?? "";
    cell.appendChild(tag);

    // クリック（ダブルタップ判定つき）
    cell.addEventListener("click", () => handleTap(key));

    calendarGrid.appendChild(cell);
  }
}

/* =========================================================
   日記編集モーダル
========================================================= */

const diaryModal = document.createElement("dialog");
diaryModal.className = "modal";
document.body.appendChild(diaryModal);

// モーダル内部（HTML生成）
diaryModal.innerHTML = `
  <form method="dialog" class="modal-body">
    <div class="field-label">
      <span id="modal-date"></span>
      <input id="modal-title" type="text" placeholder="タイトル">
    </div>
    <div class="field-label">
      <span>本文</span>
      <textarea id="modal-body" rows="6"></textarea>
    </div>
    <div class="modal-actions">
      <button type="button" class="danger-btn" id="modal-delete">削除</button>
      <div class="flex-spacer"></div>
      <button type="button" class="sub-btn" id="modal-cancel">閉じる</button>
      <button type="submit" class="primary-btn" id="modal-save">保存</button>
    </div>
  </form>
`;

const modalDate = diaryModal.querySelector("#modal-date");
const modalTitle = diaryModal.querySelector("#modal-title");
const modalBody = diaryModal.querySelector("#modal-body");
const modalDelete = diaryModal.querySelector("#modal-delete");
const modalCancel = diaryModal.querySelector("#modal-cancel");
const modalSave = diaryModal.querySelector("#modal-save");

let editingKey = null;

/* -----------------------------
   モーダルを開く
----------------------------- */
function openDiary(key) {
  editingKey = key;

  modalDate.textContent = formatJP(new Date(key));

  const entry = diaryData[key] ?? {};
  modalTitle.value = entry.title ?? "";
  modalBody.value = entry.body ?? "";

  diaryModal.showModal();
}

/* -----------------------------
   保存
----------------------------- */
async function saveDiary() {
  if (!editingKey) return;

  const title = modalTitle.value.trim();
  const body = modalBody.value.trim();

  diaryData[editingKey] = { title, body };
  saveLocalDiary();
  renderCalendar();

  if (currentUser) {
    const ref = doc(db, "users", currentUser.uid, "entries", editingKey);
    await setDoc(ref, {
      title,
      body,
      updatedAt: serverTimestamp()
    });
  }

  diaryModal.close();
}

/* -----------------------------
   削除
----------------------------- */
async function deleteDiary() {
  if (!editingKey) return;

  delete diaryData[editingKey];
  saveLocalDiary();
  renderCalendar();

  if (currentUser) {
    const ref = doc(db, "users", currentUser.uid, "entries", editingKey);
    await deleteDoc(ref);
  }

  diaryModal.close();
}

modalSave.onclick = saveDiary;
modalDelete.onclick = deleteDiary;
modalCancel.onclick = () => diaryModal.close();

/* =========================================================
   ダブルタップ判定
========================================================= */

function handleTap(key) {
  const now = Date.now();
  if (lastTapKey === key && now - lastTap < 350) {
    openDiary(key);
  }
  lastTapKey = key;
  lastTap = now;
}

/* =========================================================
   Firebase ログイン / ログアウト
========================================================= */

// Googleログイン
googleLoginBtn.onclick = () => {
  signInWithPopup(auth, provider)
    .catch((err) => alert("ログインに失敗しました: " + err.message));
};

// 認証状態
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    // Firestore から読み込み
    await loadFromCloud();
    renderCalendar();
  } else {
    // ログアウト → ローカルのみ
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");

    diaryData = loadLocalDiary();
    renderCalendar();
  }
});

/* -----------------------------
   Firestore → ローカルへ読み込み
----------------------------- */
async function loadFromCloud() {
  if (!currentUser) return;

  const snap = await getDocs(
    collection(db, "users", currentUser.uid, "entries")
  );

  snap.forEach((docSnap) => {
    diaryData[docSnap.id] = {
      title: docSnap.data().title ?? "",
      body: docSnap.data().body ?? ""
    };
  });

  saveLocalDiary();
}

/* =========================================================
   タブ切替
========================================================= */
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;

    tabButtons.forEach((b) => b.classList.remove("tab-active"));
    btn.classList.add("tab-active");

    for (const key in screens) {
      screens[key].classList.remove("screen-active");
    }
    screens[target].classList.add("screen-active");
  });
});

/* =========================================================
   月移動
========================================================= */
prevMonthBtn.onclick = () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
};

nextMonthBtn.onclick = () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
};

/* =========================================================
   初期表示
========================================================= */
renderCalendar();
