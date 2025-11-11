// 是々日々 app.js

// -------------------- 永続化 --------------------

const STORAGE_KEY = "zezehibi-db-v1";

let db = {
  // entry: { date, title, body, wake, breakfast, lunch, dinner }
  entries: [],
  updatedAt: null
};

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      db.updatedAt = new Date().toISOString();
      saveDB();
      return;
    }
    const parsed = JSON.parse(raw);
    db = Object.assign({ entries: [], updatedAt: null }, parsed);
    if (!Array.isArray(db.entries)) db.entries = [];
  } catch (e) {
    console.error("loadDB failed", e);
  }
}

function saveDB() {
  try {
    db.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("saveDB failed", e);
  }
}

// -------------------- 日付ユーティリティ --------------------

function toISO(date) {
  return date.toISOString().slice(0, 10);
}
function formatJP(date) {
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 (${w})`;
}

// -------------------- カレンダー --------------------

let current = new Date();

function setMonthLabel() {
  document.getElementById("labelMonth").textContent =
    `${current.getFullYear()}年 ${current.getMonth() + 1}月`;
}

function buildCalendar() {
  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";

  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const nextMonthFirst = new Date(year, month + 1, 1);
  const lastDate = new Date(nextMonthFirst - 1).getDate();
  const startDate = new Date(year, month, 1 - startDay);
  const todayISO = toISO(new Date());

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const iso = toISO(d);
    const inMonth = d.getMonth() === month;

    const cell = document.createElement("div");
    cell.className = "day-cell";

    const num = document.createElement("div");
    num.className = "day-number";
    if (!inMonth) num.classList.add("other");
    if (iso === todayISO) num.classList.add("today");
    num.textContent = d.getDate();
    cell.appendChild(num);

    // エントリ
    const entry = db.entries.find((e) => e.date === iso);
    if (entry) {
      const ev = document.createElement("div");
      ev.className = "day-events";

      // 表示優先：タイトル > 食事 > 起床
      const labels = [];
      if (entry.title) labels.push(entry.title);
      const meals = [entry.breakfast, entry.lunch, entry.dinner].filter(Boolean);
      if (meals.length) labels.push(meals.join(" / "));
      if (!labels.length && (entry.body || "").trim()) {
        labels.push("記録あり");
      }
      ev.textContent = labels.join(" ｜ ").slice(0, 18);
      cell.appendChild(ev);
    }

    cell.addEventListener("click", () => openEditor(iso));
    grid.appendChild(cell);
  }
}

// -------------------- 記帳画面 --------------------

function openEditor(dateIso) {
  const screen = document.getElementById("editorScreen");
  const date = new Date(dateIso);
  document.getElementById("editorDate").textContent = formatJP(date);

  const e = db.entries.find((x) => x.date === dateIso) || {};

  document.getElementById("editorTitle").value = e.title || "";
  document.getElementById("editorBody").value = e.body || "";
  document.getElementById("editorWake").value = e.wake || "";
  document.getElementById("editorBreakfast").value = e.breakfast || "";
  document.getElementById("editorLunch").value = e.lunch || "";
  document.getElementById("editorDinner").value = e.dinner || "";

  screen.dataset.date = dateIso;
  screen.classList.add("show");
}

function closeEditor() {
  document.getElementById("editorScreen").classList.remove("show");
}

function setupEditorEvents() {
  document.getElementById("btnEditorBack").addEventListener("click", closeEditor);

  document.getElementById("btnSaveEntry").addEventListener("click", () => {
    const screen = document.getElementById("editorScreen");
    const date = screen.dataset.date;
    if (!date) return;

    const title = document.getElementById("editorTitle").value.trim();
    const body = document.getElementById("editorBody").value.trim();
    const wake = document.getElementById("editorWake").value;
    const breakfast = document.getElementById("editorBreakfast").value.trim();
    const lunch = document.getElementById("editorLunch").value.trim();
    const dinner = document.getElementById("editorDinner").value.trim();

    let entry = db.entries.find((e) => e.date === date);
    if (!entry) {
      entry = { date };
      db.entries.push(entry);
    }

    entry.title = title;
    entry.body = body;
    entry.wake = wake;
    entry.breakfast = breakfast;
    entry.lunch = lunch;
    entry.dinner = dinner;

    // 空エントリは削除
    if (
      !entry.title &&
      !entry.body &&
      !entry.wake &&
      !entry.breakfast &&
      !entry.lunch &&
      !entry.dinner
    ) {
      db.entries = db.entries.filter((e) => e !== entry);
    }

    saveDB();
    buildCalendar();
    closeEditor();
  });

  document.getElementById("btnDeleteEntry").addEventListener("click", () => {
    const screen = document.getElementById("editorScreen");
    const date = screen.dataset.date;
    if (!date) return;

    db.entries = db.entries.filter((e) => e.date !== date);
    saveDB();
    buildCalendar();
    closeEditor();
  });
}

// -------------------- タブ --------------------

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.toggle("active", s.id === id);
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      showScreen(target);
      tabs.forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  const gear = document.getElementById("btnSettingsShortcut");
  if (gear) {
    gear.addEventListener("click", () => {
      const t = document.querySelector('.tab-btn[data-target="screen-settings"]');
      t && t.click();
    });
  }
}

// -------------------- 検索 --------------------

function escapeHTML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setupSearch() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResult");
  if (!input || !box) return;

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (!q) {
      box.innerHTML = "";
      return;
    }
    const lower = q.toLowerCase();

    const hits = db.entries.filter((e) => {
      return (
        (e.title || "").toLowerCase().includes(lower) ||
        (e.body || "").toLowerCase().includes(lower)
      );
    });

    if (!hits.length) {
      box.innerHTML = "<div>該当する記録がありません。</div>";
      return;
    }

    box.innerHTML = hits
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(
        (e) => `
        <div style="margin-bottom:6px">
          <div style="font-size:10px;color:#8c93a5">${e.date}</div>
          <div style="font-size:12px">${escapeHTML(e.title || "(無題)")}</div>
        </div>`
      )
      .join("");
  });
}

// -------------------- 設定（インポート／エクスポート） --------------------

function setupSettings() {
  const btnExport = document.getElementById("btnExportJSON");
  const out = document.getElementById("exportOutput");
  const fileInput = document.getElementById("importFile");
  const btnImport = document.getElementById("btnImportJSON");

  if (btnExport && out) {
    btnExport.addEventListener("click", () => {
      out.value = JSON.stringify(db, null, 2);
      out.scrollTop = 0;
    });
  }

  if (btnImport && fileInput) {
    btnImport.addEventListener("click", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        alert("インポートするJSONファイルを選択してください。");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (!imported || !Array.isArray(imported.entries)) {
            throw new Error("形式が不正です");
          }
          db = Object.assign({ entries: [] }, imported);
          saveDB();
          buildCalendar();
          alert("インポートが完了しました。");
        } catch (err) {
          console.error(err);
          alert("インポートに失敗しました。JSONの内容を確認してください。");
        }
      };
      reader.readAsText(file, "utf-8");
    });
  }
}

// -------------------- その他 --------------------

function setTodayBadge() {
  const el = document.getElementById("todayBadge");
  const d = new Date();
  el.textContent = `${d.getMonth() + 1}/${d.getDate()} 今日`;
}

function setupServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((err) => console.log("SW registration failed", err));
  }
}

// -------------------- 初期化 --------------------

function init() {
  loadDB();
  setTodayBadge();
  setMonthLabel();
  buildCalendar();

  setupTabs();
  setupEditorEvents();
  setupSearch();
  setupSettings();
  setupServiceWorker();

  document.getElementById("btnPrevMonth").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    setMonthLabel();
    buildCalendar();
  });

  document.getElementById("btnNextMonth").addEventListener("click", () => {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    setMonthLabel();
    buildCalendar();
  });
}

init();
