/* =========================================================
   ZEZEHIBI app.js  —  Calendar-first Diary (double-tap edit)
   ========================================================= */

/* ---------- Utilities ---------- */
const WJP = ["日","月","火","水","木","金","土"];
const pad = n => String(n).padStart(2, "0");
const toISO = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const fmtJP = iso => {
  const [y,m,dd] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, dd);
  return `${m}月${dd}日(${WJP[dt.getDay()]})`;
};
const newId = () => "id_"+Math.random().toString(36).slice(2,8)+Date.now().toString(36);
const esc = s => (s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* ---------- Storage (with migration) ---------- */
const STORAGE_KEY = "zezehibi.v2";
function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const json = JSON.parse(raw);
      if (!Array.isArray(json.entries)) json.entries = [];
      if (!Array.isArray(json.schedules)) json.schedules = [];
      return json;
    }
    // migrate from old
    const old = localStorage.getItem("journal.v1");
    if (old) {
      const base = JSON.parse(old);
      const migrated = {
        entries: Array.isArray(base.entries)? base.entries : [],
        schedules: Array.isArray(base.schedules)? base.schedules : []
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }catch(_){}
  return { entries:[], schedules:[] };
}
let db = loadDB();
const saveDB = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

/* ---------- State ---------- */
const state = {
  screen: "diary",
  monthDiary: (()=>{ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })(),
  monthSched: (()=>{ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })(),
  selDate: toISO(new Date()),
  currentEntryId: null
};

/* ---------- DOM ---------- */
// header
const todayBadge = document.getElementById("todayBadge");

// tabs & screens
const tabDiary  = document.getElementById("tabDiary");
const tabSched  = document.getElementById("tabSched");
const tabSearch = document.getElementById("tabSearch");
const tabCoord  = document.getElementById("tabCoord");

const screenDiary  = document.getElementById("screenDiary");
const screenSched  = document.getElementById("screenSched");
const screenSearch = document.getElementById("screenSearch");
const screenCoord  = document.getElementById("screenCoord");
const screenEditor = document.getElementById("screenEditor");

// diary calendar
const prevM = document.getElementById("prevM");
const nextM = document.getElementById("nextM");
const monthLabel = document.getElementById("monthLabel");
const calGrid = document.getElementById("calGrid");
const selISO = document.getElementById("selISO");
const selJP  = document.getElementById("selJP");

// day summary (存在しなくてもOKに)
const daySummary = document.getElementById("daySummary");

// schedule tab minimal
const sPrevM = document.getElementById("sPrevM");
const sNextM = document.getElementById("sNextM");
const schedMonthLabel = document.getElementById("schedMonthLabel");
const schedGrid = document.getElementById("schedGrid");
const schedKPI = document.getElementById("schedKPI");
const schedList = document.getElementById("schedList");

// search
const q = document.getElementById("q");
const searchDiary = document.getElementById("searchDiary");
const searchSched = document.getElementById("searchSched");

// editor dialog within screenEditor
const editorDlg = document.getElementById("editorDlg");
const backToCalendar = document.getElementById("backToCalendar");
const dateInput = document.getElementById("dateInput");
const wakeEl = document.getElementById("wake");
const breakfastEl = document.getElementById("breakfast");
const lunchEl = document.getElementById("lunch");
const dinnerEl = document.getElementById("dinner");
const titleEl = document.getElementById("title");
const bodyEl = document.getElementById("body");
const editISO = document.getElementById("editISO");
const editJP = document.getElementById("editJP");
const saveState = document.getElementById("saveState");
const deleteEntryBtn = document.getElementById("deleteEntry");
const saveEntryBtn = document.getElementById("saveEntry");

/* ---------- Common helpers ---------- */
function showScreen(name){
  state.screen = name;
  // toggle tab active
  [tabDiary, tabSched, tabSearch, tabCoord].forEach(b=>b.classList.remove("tab-active","active"));
  if (name==="diary") tabDiary.classList.add("tab-active","active");
  if (name==="sched") tabSched.classList.add("tab-active","active");
  if (name==="search") tabSearch.classList.add("tab-active","active");
  if (name==="coord") tabCoord.classList.add("tab-active","active");

  // toggle screens
  [screenDiary, screenSched, screenSearch, screenCoord, screenEditor].forEach(s=>{
    s.hidden = true; s.classList.remove("active","screen-active");
  });
  const map = { diary:screenDiary, sched:screenSched, search:screenSearch, coord:screenCoord, editor:screenEditor };
  const tgt = map[name];
  tgt.hidden = false; tgt.classList.add("active","screen-active");
  // reflow info if needed
  if (name==="diary") renderDiary();
  if (name==="sched") renderSched();
}

/* ---------- Diary data helpers ---------- */
const entryOn = dateISO => db.entries.find(e=>e.date===dateISO) || null;
function ensureEntry(dateISO){
  let e = db.entries.find(x=>x.date===dateISO);
  if (!e) {
    e = { id:newId(), date:dateISO, title:"", body:"", wake:"", breakfast:"", lunch:"", dinner:"",
          createdAt:Date.now(), updatedAt:Date.now() };
    db.entries.push(e); saveDB();
  }
  return e;
}

/* ---------- Diary: calendar render ---------- */
function startOfCalendarGrid(dFirst){
  // get Sunday-start of grid containing the 1st of month
  const firstDow = dFirst.getDay();     // 0..6
  const start = new Date(dFirst);
  start.setDate(1 - firstDow);
  start.setHours(0,0,0,0);
  return start;
}

function renderDiary(){
  // header and today
  const t = new Date();
  if (todayBadge) todayBadge.textContent = `${t.getFullYear()}年${t.getMonth()+1}月${t.getDate()}日(${WJP[t.getDay()]})`;

  // month label
  const y = state.monthDiary.getFullYear(), m = state.monthDiary.getMonth();
  if (monthLabel) monthLabel.textContent = `${y}年 ${m+1}月`;

  // day summary (選択日の表示は見出し用)
  if (selISO) selISO.textContent = state.selDate;
  if (selJP)  selJP.textContent  = fmtJP(state.selDate);

  // grid
  calGrid.innerHTML = "";
  const gridStart = startOfCalendarGrid(state.monthDiary);
  const todayISO = toISO(new Date());

  for (let i=0;i<42;i++){
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate()+i);
    const iso = toISO(d);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    const inMonth = (d.getMonth()===state.monthDiary.getMonth());
    if (!inMonth) cell.classList.add("out");
    const dow = d.getDay();
    if (dow===0) cell.classList.add("sun");
    if (dow===6) cell.classList.add("sat");
    if (iso===todayISO) cell.classList.add("today");
    if (iso===state.selDate) cell.classList.add("selected");

    // content
    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = d.getDate();
    const tags = document.createElement("div");
    tags.className = "day-tags";

    // show diary title lines (up to 3 lines via CSS line-clamp)
    const e = entryOn(iso);
    if (e && (e.title||e.body)){
      const title = (e.title||"").trim();
      const tagText = title || (e.body||"").split(/\r?\n/)[0];
      tags.innerHTML = esc(tagText || "");
    } else {
      tags.textContent = "";
    }

    cell.appendChild(num);
    cell.appendChild(tags);

    // interactions
    cell.addEventListener("click", ()=>{
      state.selDate = iso;
      renderDiary(); // re-highlight only
    });

    // support both dblclick and double-tap
    let lastTap = 0;
    cell.addEventListener("touchend", (ev)=>{
      const now = Date.now();
      if (now - lastTap < 300) {
        // double tap
        openEditorFor(iso);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }, {passive:true});

    cell.addEventListener("dblclick", ()=>{
      openEditorFor(iso);
    });

    calGrid.appendChild(cell);
  }
}

/* ---------- Editor open/fill/save ---------- */
function openEditorFor(dateISO){
  const e = ensureEntry(dateISO);
  state.currentEntryId = e.id;

  // fill
  dateInput.value = e.date;
  wakeEl.value = e.wake || "";
  breakfastEl.value = e.breakfast || "";
  lunchEl.value = e.lunch || "";
  dinnerEl.value = e.dinner || "";
  titleEl.value = e.title || "";
  bodyEl.value = e.body || "";
  editISO.textContent = e.date;
  editJP.textContent = fmtJP(e.date);
  saveState.textContent = "—";

  showScreen("editor");
}

function currentEntry(){
  return db.entries.find(e=>e.id===state.currentEntryId)||null;
}

function saveEntry(){
  const cur = currentEntry(); if (!cur) return;
  cur.date = dateInput.value || cur.date;
  cur.wake = wakeEl.value.trim();
  cur.breakfast = breakfastEl.value.trim();
  cur.lunch = lunchEl.value.trim();
  cur.dinner = dinnerEl.value.trim();
  cur.title = titleEl.value.trim();
  cur.body  = bodyEl.value;
  cur.updatedAt = Date.now();
  saveDB();
  state.selDate = cur.date;
  editISO.textContent = cur.date;
  editJP.textContent  = fmtJP(cur.date);
  saveState.textContent = "保存済み";
  setTimeout(()=> saveState.textContent="—", 1200);
}

function deleteEntry(){
  const cur = currentEntry(); if (!cur) return;
  if (!confirm("この日記を削除しますか？")) return;
  db.entries = db.entries.filter(x=>x.id!==cur.id);
  saveDB();
  showScreen("diary");
  renderDiary();
}

/* ---------- Schedules (minimal render) ---------- */
function renderSched(){
  const y = state.monthSched.getFullYear(), m = state.monthSched.getMonth();
  if (schedMonthLabel) schedMonthLabel.textContent = `${y}年 ${m+1}月`;

  if (!schedGrid) return;
  schedGrid.innerHTML = "";
  const gridStart = startOfCalendarGrid(state.monthSched);
  for (let i=0;i<42;i++){
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate()+i);
    const iso = toISO(d);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    const inMonth = (d.getMonth()===state.monthSched.getMonth());
    if (!inMonth) cell.classList.add("out");
    const dow = d.getDay();
    if (dow===0) cell.classList.add("sun");
    if (dow===6) cell.classList.add("sat");

    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = d.getDate();

    const tags = document.createElement("div");
    tags.className = "day-tags";
    const items = db.schedules.filter(s=>s.date===iso);
    if (items.length){
      tags.innerHTML = esc(items[0].title||"(無題)");
    }

    cell.appendChild(num);
    cell.appendChild(tags);
    cell.addEventListener("click", ()=>{
      state.selDate = iso;
      renderSchedList();
    });
    schedGrid.appendChild(cell);
  }

  const startISO = toISO(new Date(y, m, 1));
  const endISO   = toISO(new Date(y, m+1, 0));
  const cnt = db.schedules.filter(s=>s.date>=startISO && s.date<=endISO).length;
  if (schedKPI) schedKPI.textContent = `今月の予定: ${cnt}`;
  renderSchedList();
}

function renderSchedList(){
  if (!schedList) return;
  const list = db.schedules
    .filter(s=>s.date===state.selDate)
    .sort((a,b)=> (a.start||"") < (b.start||"") ? -1: 1);

  schedList.innerHTML = "";
  if (!list.length){
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "この日の予定はまだありません。";
    schedList.appendChild(empty);
    return;
  }
  list.forEach(s=>{
    const row = document.createElement("div");
    row.className = "card";
    const time = [s.start||"", s.end?`– ${s.end}`:""].filter(Boolean).join(" ");
    row.innerHTML = `<div class="card-title">${esc(s.title||"(無題)")}</div>
                     <div class="card-sub">${fmtJP(s.date)} ${time}</div>
                     ${s.note? `<div class="card-sub">${esc(s.note)}</div>`:""}`;
    schedList.appendChild(row);
  });
}

/* ---------- Search ---------- */
function handleSearch(){
  if (!q) return;
  const key = (q.value||"").toLowerCase().trim();
  if (searchDiary) searchDiary.innerHTML = "";
  if (searchSched) searchSched.innerHTML = "";
  if (!key){
    if (searchDiary) searchDiary.innerHTML = `<div class="card">キーワードを入力してください。</div>`;
    if (searchSched) searchSched.innerHTML = `<div class="card">キーワードを入力してください。</div>`;
    return;
  }

  // diary
  const dres = db.entries
    .filter(e => (`${e.title||""} ${e.body||""} ${e.breakfast||""} ${e.lunch||""} ${e.dinner||""}`).toLowerCase().includes(key))
    .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
    .slice(0,120);
  if (searchDiary){
    if (!dres.length) {
      searchDiary.innerHTML = `<div class="card">該当なし</div>`;
    } else {
      dres.forEach(e=>{
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `<div class="card-title">${esc(e.title||"(無題)")}</div>
                          <div class="card-sub">${fmtJP(e.date)} / ${e.date}</div>`;
        card.addEventListener("click", ()=>{
          state.selDate = e.date;
          state.monthDiary = new Date(Number(e.date.slice(0,4)), Number(e.date.slice(5,7))-1, 1);
          showScreen("diary");
          renderDiary();
          openEditorFor(e.date);
        });
        searchDiary.appendChild(card);
      });
    }
  }

  // schedules
  const sres = db.schedules
    .filter(s=> (`${s.title||""} ${s.note||""} ${s.party||""}`).toLowerCase().includes(key))
    .sort((a,b)=> (a.date+a.start) < (b.date+b.start) ? -1 : 1)
    .slice(0,120);
  if (searchSched){
    if (!sres.length) {
      searchSched.innerHTML = `<div class="card">該当なし</div>`;
    } else {
      sres.forEach(s=>{
        const card = document.createElement("div");
        card.className = "card";
        const time = [s.start||"", s.end?`– ${s.end}`:""].filter(Boolean).join(" ");
        card.innerHTML = `<div class="card-title">${esc(s.title||"(無題)")}</div>
                          <div class="card-sub">${fmtJP(s.date)} / ${s.date} ${time}</div>`;
        searchSched.appendChild(card);
      });
    }
  }
}

/* ---------- Events wiring ---------- */
// tabs
tabDiary && tabDiary.addEventListener("click", ()=> showScreen("diary"));
tabSched && tabSched.addEventListener("click", ()=> showScreen("sched"));
tabSearch && tabSearch.addEventListener("click", ()=> showScreen("search"));
tabCoord && tabCoord.addEventListener("click", ()=> showScreen("coord"));

// diary month nav
prevM && prevM.addEventListener("click", ()=>{
  state.monthDiary.setMonth(state.monthDiary.getMonth()-1);
  renderDiary();
});
nextM && nextM.addEventListener("click", ()=>{
  state.monthDiary.setMonth(state.monthDiary.getMonth()+1);
  renderDiary();
});

// schedule month nav
sPrevM && sPrevM.addEventListener("click", ()=>{
  state.monthSched.setMonth(state.monthSched.getMonth()-1);
  renderSched();
});
sNextM && sNextM.addEventListener("click", ()=>{
  state.monthSched.setMonth(state.monthSched.getMonth()+1);
  renderSched();
});

// editor
backToCalendar && backToCalendar.addEventListener("click", ()=>{
  showScreen("diary");
  renderDiary();
});
saveEntryBtn && saveEntryBtn.addEventListener("click", saveEntry);
deleteEntryBtn && deleteEntryBtn.addEventListener("click", deleteEntry);

// auto-save typing (debounced)
let typingTimer = null;
[dateInput, wakeEl, breakfastEl, lunchEl, dinnerEl, titleEl, bodyEl].forEach(el=>{
  el && el.addEventListener("input", ()=>{
    if (saveState) saveState.textContent = "保存中…";
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(saveEntry, 350);
  });
});

// search
q && q.addEventListener("input", handleSearch);

/* ---------- Init ---------- */
(function init(){
  // bootstrap first entry (optional)
  if (!db.entries.length){
    const today = toISO(new Date());
    db.entries.push({
      id:newId(), date:today,
      title:"はじめての日記", body:"ここにメモできます。",
      wake:"", breakfast:"", lunch:"", dinner:"",
      createdAt:Date.now(), updatedAt:Date.now()
    });
    saveDB();
  }
  state.selDate = toISO(new Date());
  renderDiary();
  showScreen("diary");
  renderSched();
  handleSearch();
})();

/* ---------- PWA: Service Worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}
