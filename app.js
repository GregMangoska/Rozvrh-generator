"use strict";

const STORAGE_KEY = "ttg_v1";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const DAY_DEFAULTS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const PRESETS = [
  {
    name: "Clean Light", preset: true,
    pageBg: { type: "color", color: "#ffffff", gradientCss: "", image: "", pos: "center", size: "cover" },
    headerTitleBg: "#1e293b", headerTitleText: "#ffffff",
    font: "Inter", dayHeaderBg: "#eef2f7", dayHeaderText: "#334155",
    itemTextColor: "#111827", subTextColor: "#475569", itemShape: "rounded",
    gridLineColor: "#cbd5e1", breakLineColor: "#94a3b8", cellPad: "normal"
  },
  {
    name: "Dark", preset: true,
    pageBg: { type: "color", color: "#0f172a", gradientCss: "", image: "", pos: "center", size: "cover" },
    headerTitleBg: "#334155", headerTitleText: "#f8fafc",
    font: "Inter", dayHeaderBg: "#1e293b", dayHeaderText: "#e2e8f0",
    itemTextColor: "#f8fafc", subTextColor: "#cbd5e1", itemShape: "rounded",
    gridLineColor: "#475569", breakLineColor: "#64748b", cellPad: "normal"
  },
  {
    name: "Pastel", preset: true,
    pageBg: { type: "gradient", color: "#fdf2f8", gradientCss: "linear-gradient(135deg,#fdf2f8,#e0f2fe,#fef9c3)", image: "", pos: "center", size: "cover" },
    headerTitleBg: "#fbcfe8", headerTitleText: "#831843",
    font: "Lora", dayHeaderBg: "#fce7f3", dayHeaderText: "#9d174d",
    itemTextColor: "#500724", subTextColor: "#831843", itemShape: "pill",
    gridLineColor: "#f9a8d4", breakLineColor: "#ec4899", cellPad: "spacious"
  },
  {
    name: "Print High-Contrast", preset: true,
    pageBg: { type: "color", color: "#ffffff", gradientCss: "", image: "", pos: "center", size: "cover" },
    headerTitleBg: "#ffffff", headerTitleText: "#000000",
    font: "Roboto", dayHeaderBg: "#ffffff", dayHeaderText: "#000000",
    itemTextColor: "#000000", subTextColor: "#000000", itemShape: "sharp",
    gridLineColor: "#000000", breakLineColor: "#000000", cellPad: "compact"
  }
];

function uid() {
  return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function defaultTheme() {
  return deepClone(PRESETS[0]);
}

function defaultPeriods(count, startMinutes, length, brk) {
  const periods = [];
  let t = startMinutes;
  for (let i = 0; i < count; i++) {
    periods.push({
      id: uid(), label: String(i + 1),
      start: fmtTime(t), end: fmtTime(t + length),
      breakAfter: i < count - 1 ? brk > 0 : false
    });
    t += length + brk;
  }
  return periods;
}

function fmtTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function timeToMin(s) {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

let state = { activePlanId: null, plans: [] };
const undoStack = [];
const redoStack = [];

function activePlan() {
  return state.plans.find((p) => p.id === state.activePlanId) || null;
}

function gridKey(dayId, periodIdx) {
  return dayId + "." + periodIdx;
}

function subjectById(plan, id) {
  return plan.catalog.find((s) => s.id === id) || null;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.plans)) {
        state = parsed;
        return;
      }
    }
  } catch (e) {
    /* ignore corrupt state */
  }
  state = { activePlanId: null, plans: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast("Could not save: storage is full. Remove or compress background images.", true);
  }
}

function touch(plan) {
  plan.updatedAt = Date.now();
}

function pushUndo() {
  const p = activePlan();
  if (!p) return;
  undoStack.push(deepClone(p));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
}

function mutate(fn) {
  const p = activePlan();
  if (!p) return;
  pushUndo();
  fn(p);
  touch(p);
  renderAll();
  save();
}

function undo() {
  const p = activePlan();
  if (!p || undoStack.length === 0) return;
  redoStack.push(deepClone(p));
  const snap = undoStack.pop();
  Object.keys(p).forEach((k) => delete p[k]);
  Object.assign(p, snap);
  renderAll();
  save();
}

function redo() {
  const p = activePlan();
  if (!p || redoStack.length === 0) return;
  undoStack.push(deepClone(p));
  const snap = redoStack.pop();
  Object.keys(p).forEach((k) => delete p[k]);
  Object.assign(p, snap);
  renderAll();
  save();
}

function toast(msg, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

let confirmResolve = null;
function askConfirm(message, okLabel) {
  $("#confirm-text").textContent = message;
  $("#confirm-ok").textContent = okLabel || "OK";
  openModal("#confirm-dialog");
  return new Promise((resolve) => { confirmResolve = resolve; });
}
function closeConfirm(result) {
  closeModal("#confirm-dialog");
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

function openModal(id) {
  $("#backdrop").classList.remove("hidden");
  $(id).classList.remove("hidden");
}
function closeModal(id) {
  $(id).classList.add("hidden");
  if (!document.querySelector(".modal:not(.hidden)")) $("#backdrop").classList.add("hidden");
}
function closeAllModals() {
  $$(".modal").forEach((m) => m.classList.add("hidden"));
  $("#backdrop").classList.add("hidden");
  $("#cell-editor").classList.add("hidden");
}

/* ============================== Router ============================== */

function showLanding() {
  $("#screen-editor").classList.add("hidden");
  $("#screen-landing").classList.remove("hidden");
  $("#hamburger-sheet").classList.remove("open");
}

function showEditor() {
  $("#screen-landing").classList.add("hidden");
  $("#screen-editor").classList.remove("hidden");
  renderAll();
}

function openHamburger() {
  renderPlanList();
  $("#hamburger-sheet").classList.add("open");
  $("#backdrop").classList.remove("hidden");
}

function closeHamburger() {
  $("#hamburger-sheet").classList.remove("open");
  if (!document.querySelector(".modal:not(.hidden)")) $("#backdrop").classList.add("hidden");
}

function renderPlanList() {
  const list = $("#plan-list");
  list.innerHTML = "";
  state.plans.forEach((p) => {
    const item = document.createElement("div");
    item.className = "plan-item" + (p.id === state.activePlanId ? " active" : "");
    item.innerHTML =
      '<div class="plan-name" data-open="' + p.id + '"></div>' +
      '<div class="plan-actions">' +
      '<button class="mini-btn" data-dup="' + p.id + '" title="Duplicate">&#10697;</button>' +
      '<button class="mini-btn" data-rename="' + p.id + '" title="Rename">&#9998;</button>' +
      '<button class="mini-btn" data-clear="' + p.id + '" title="Clear lessons">&#9003;</button>' +
      '<button class="mini-btn danger" data-del="' + p.id + '" title="Delete">&#128465;</button>' +
      "</div>";
    item.querySelector(".plan-name").textContent = p.name || "Untitled";
    list.appendChild(item);
  });
}

/* ============================== Plan CRUD ============================== */

function createPlan(name, days, periods) {
  const plan = {
    id: uid(),
    name: name || "Untitled",
    days: days.map((label) => ({ id: uid(), label })),
    periods,
    catalog: [],
    grid: {},
    theme: defaultTheme(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.plans.push(plan);
  state.activePlanId = plan.id;
  save();
}

function duplicatePlan(id) {
  const src = state.plans.find((p) => p.id === id);
  if (!src) return;
  const copy = deepClone(src);
  copy.id = uid();
  copy.name = (src.name || "Untitled") + " (copy)";
  copy.days = src.days.map((d) => ({ id: uid(), label: d.label }));
  copy.periods = src.periods.map((pr) => ({ ...pr, id: uid() }));
  const oldDayIds = src.days.map((d) => d.id);
  const newGrid = {};
  Object.keys(src.grid).forEach((k) => {
    const [dayId, idx] = k.split(".");
    const di = oldDayIds.indexOf(dayId);
    if (di >= 0) newGrid[gridKey(copy.days[di].id, idx)] = src.grid[k];
  });
  copy.grid = newGrid;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  state.plans.push(copy);
  state.activePlanId = copy.id;
  save();
}

function deletePlan(id) {
  const idx = state.plans.findIndex((p) => p.id === id);
  if (idx < 0) return;
  state.plans.splice(idx, 1);
  if (state.activePlanId === id) {
    state.activePlanId = state.plans.length ? state.plans[0].id : null;
  }
  save();
  if (state.plans.length === 0) showLanding();
  else { renderPlanList(); renderAll(); }
}

async function promptRenamePlan(id) {
  const p = state.plans.find((x) => x.id === id);
  if (!p) return;
  const name = await promptText("Rename plan", p.name || "");
  if (name == null) return;
  p.name = name || "Untitled";
  touch(p);
  save();
  renderPlanList();
  if (id === state.activePlanId) renderAll();
}

function promptText(title, initial) {
  return new Promise((resolve) => {
    const modal = $("#subject-modal");
    $("#subject-modal-title").textContent = title;
    $("#subject-full").value = initial || "";
    $("#subject-full").placeholder = "Name";
    $("#subject-short").closest(".field").classList.add("hidden");
    $("#subject-color").closest(".field").classList.add("hidden");
    $("#subject-save").dataset.mode = "text";
    openModal("#subject-modal");
    $("#subject-full").focus();
    window._promptTextResolve = resolve;
  });
}

function clearPlan(id) {
  const p = state.plans.find((x) => x.id === id);
  if (!p) return;
  if (id === state.activePlanId) {
    mutate((plan) => { plan.grid = {}; });
  } else {
    p.grid = {};
    touch(p);
    save();
  }
  toast("Plan cleared");
}

/* ============================== Rendering ============================== */

function renderAll() {
  const plan = activePlan();
  if (!plan) return;
  applyTheme(plan.theme);
  $("#plan-title").value = plan.name || "";
  const titleBand = $("#title-band");
  titleBand.textContent = plan.theme.titleText || "";
  renderGrid();
  renderCatalog();
  updateUndoButtons();
  document.title = (plan.name ? plan.name + " · " : "") + "Timetable Generator";
}

function updateUndoButtons() {
  $("#btn-undo").disabled = undoStack.length === 0;
  $("#btn-redo").disabled = redoStack.length === 0;
}

function renderGrid() {
  const plan = activePlan();
  const table = $("#timetable");
  table.style.setProperty("--period-count", plan.periods.length);
  table.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "tt-cell corner";
  table.appendChild(corner);

  plan.periods.forEach((pr, idx) => {
    const head = document.createElement("div");
    head.className = "tt-cell period-head" + (pr.breakAfter ? " break-after" : "");
    head.innerHTML =
      '<div class="p-label">' + escapeHtml(pr.label || (idx + 1)) + '.</div>' +
      (pr.start || pr.end ? '<div class="p-time">' + escapeHtml(pr.start || "") + (pr.start && pr.end ? "–" + escapeHtml(pr.end) : "") + "</div>" : "");
    table.appendChild(head);
  });

  plan.days.forEach((day) => {
    const label = document.createElement("div");
    label.className = "tt-cell day-label";
    label.textContent = day.label;
    label.dataset.dayId = day.id;
    table.appendChild(label);

    plan.periods.forEach((pr, idx) => {
      const cell = document.createElement("div");
      cell.className = "tt-cell grid-cell" + (pr.breakAfter ? " break-after" : "");
      cell.dataset.key = gridKey(day.id, idx);
      cell.dataset.dayId = day.id;
      cell.dataset.periodIdx = String(idx);
      table.appendChild(cell);
    });
  });

  plan.days.forEach((day) => {
    plan.periods.forEach((pr, idx) => {
      renderCell(day.id, idx);
    });
  });
}

function renderCell(dayId, periodIdx) {
  const plan = activePlan();
  const el = document.querySelector('.grid-cell[data-key="' + gridKey(dayId, periodIdx) + '"]');
  if (!el) return;
  const cell = plan.grid[gridKey(dayId, periodIdx)];
  el.innerHTML = "";
  el.classList.remove("has-lesson");
  if (!cell) return;
  if (cell.kind === "oe") {
    el.appendChild(buildOeElement(cell));
    el.classList.add("has-lesson");
  } else if (cell.kind === "all" && cell.lesson && cell.lesson.subjectId) {
    el.appendChild(buildLessonElement(cell.lesson));
    el.classList.add("has-lesson");
  }
}

function buildLessonElement(lesson) {
  const plan = activePlan();
  const subject = subjectById(plan, lesson.subjectId);
  const el = document.createElement("div");
  el.className = "lesson";
  el.style.background = lessonBg(lesson, subject);
  el.style.color = lesson.textColor || plan.theme.itemTextColor;
  el.style.setProperty("--tt-sub-text", lesson.subTextColor || plan.theme.subTextColor);
  el.innerHTML =
    '<div class="subject-short">' + escapeHtml(subject ? subject.short || subject.fullName : "") + "</div>" +
    '<div class="meta">' +
    (lesson.teacher ? '<span class="t">' + escapeHtml(lesson.teacher) + "</span>" : "") +
    (lesson.roomNum || lesson.roomName
      ? '<span class="r">' + escapeHtml([lesson.roomNum, lesson.roomName].filter(Boolean).join(" ")) + "</span>"
      : "") +
    "</div>";
  return el;
}

function buildOeElement(cell) {
  const plan = activePlan();
  const el = document.createElement("div");
  el.className = "lesson-oe";
  el.appendChild(buildHalf(cell.odd, "O", "o"));
  const divider = document.createElement("div");
  divider.className = "divider";
  el.appendChild(divider);
  el.appendChild(buildHalf(cell.even, "E", "e"));
  return el;
}

function buildHalf(lesson, tag, cls) {
  const plan = activePlan();
  const half = document.createElement("div");
  half.className = "half " + cls;
  if (!lesson || !lesson.subjectId) {
    half.classList.add("free");
    half.textContent = "free";
    return half;
  }
  const subject = subjectById(plan, lesson.subjectId);
  half.style.background = lessonBg(lesson, subject);
  half.style.color = lesson.textColor || plan.theme.itemTextColor;
  half.style.setProperty("--tt-sub-text", lesson.subTextColor || plan.theme.subTextColor);
  half.innerHTML =
    '<div class="tag">' + tag + "</div>" +
    '<div class="content">' +
    '<div class="subject-short">' + escapeHtml(subject ? subject.short || subject.fullName : "") + "</div>" +
    '<div class="meta">' +
    (lesson.teacher ? '<span class="t">' + escapeHtml(lesson.teacher) + "</span>" : "") +
    (lesson.roomNum || lesson.roomName
      ? '<span class="r">' + escapeHtml([lesson.roomNum, lesson.roomName].filter(Boolean).join(" ")) + "</span>"
      : "") +
    "</div></div>";
  return half;
}

function lessonBg(lesson, subject) {
  if (lesson.bgImage) return 'url("' + lesson.bgImage + '") center/cover no-repeat';
  if (lesson.bgColor) return lesson.bgColor;
  if (subject) return subject.color || "#5b8def";
  return "rgba(91,141,239,0.25)";
}

/* ============================== Catalog ============================== */

function renderCatalog() {
  const plan = activePlan();
  const list = $("#catalog-list");
  const q = ($("#catalog-search").value || "").toLowerCase().trim();
  list.innerHTML = "";
  const filtered = plan.catalog.filter((s) =>
    !q || (s.fullName || "").toLowerCase().includes(q) || (s.short || "").toLowerCase().includes(q)
  );
  filtered.forEach((s) => {
    const card = document.createElement("div");
    card.className = "subject-card";
    card.dataset.subjectId = s.id;
    card.innerHTML =
      '<div class="swatch" style="background:' + escapeHtml(s.color || "#5b8def") + '"></div>' +
      '<div class="subject-name">' + escapeHtml(s.fullName) + '</div>' +
      '<button class="subject-more" data-edit="' + s.id + '" title="Edit">&#8942;</button>';
    list.appendChild(card);
  });
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.padding = "12px 4px";
    empty.textContent = q ? "No subjects match." : "No subjects yet. Add one with +.";
    list.appendChild(empty);
  }
}

function openSubjectEditor(subjectId) {
  const plan = activePlan();
  const subject = subjectId ? subjectById(plan, subjectId) : null;
  $("#subject-modal-title").textContent = subject ? "Edit subject" : "Add subject";
  $("#subject-full").value = subject ? subject.fullName : "";
  $("#subject-short").value = subject ? subject.short : "";
  $("#subject-color").value = subject ? subject.color : "#5b8def";
  $("#subject-full").closest(".field").classList.remove("hidden");
  $("#subject-short").closest(".field").classList.remove("hidden");
  $("#subject-color").closest(".field").classList.remove("hidden");
  $("#subject-save").dataset.mode = "subject";
  $("#subject-save").dataset.subjectId = subjectId || "";
  openModal("#subject-modal");
  $("#subject-full").focus();
}

function saveSubjectFromModal() {
  const mode = $("#subject-save").dataset.mode;
  if (mode === "text") {
    const val = $("#subject-full").value;
    if (window._promptTextResolve) {
      const r = window._promptTextResolve;
      window._promptTextResolve = null;
      r(val);
    }
    closeModal("#subject-modal");
    return;
  }
  const plan = activePlan();
  const id = $("#subject-save").dataset.subjectId;
  const fullName = $("#subject-full").value.trim();
  const short = $("#subject-short").value.trim();
  const color = $("#subject-color").value;
  if (!fullName) { toast("Full name is required", true); return; }
  if (id) {
    mutate((p) => {
      const s = subjectById(p, id);
      if (s) { s.fullName = fullName; s.short = short || fullName.slice(0, 3); s.color = color; }
    });
  } else {
    mutate((p) => {
      p.catalog.push({ id: uid(), fullName, short: short || fullName.slice(0, 3), color });
    });
  }
  closeModal("#subject-modal");
  renderCatalog();
}

function deleteSubject(id) {
  mutate((p) => {
    p.catalog = p.catalog.filter((s) => s.id !== id);
    Object.keys(p.grid).forEach((k) => {
      const c = p.grid[k];
      if (c.kind === "all" && c.lesson && c.lesson.subjectId === id) delete p.grid[k];
      else if (c.kind === "oe") {
        if (c.odd && c.odd.subjectId === id) c.odd = null;
        if (c.even && c.even.subjectId === id) c.even = null;
        if (!c.odd && !c.even) delete p.grid[k];
      }
    });
  });
}

/* ============================== Cell editor ============================== */

let editingCell = null;
let cellDraft = null;

function openCellEditor(dayId, periodIdx) {
  const plan = activePlan();
  editingCell = { dayId, periodIdx };
  const cell = plan.grid[gridKey(dayId, periodIdx)];
  cellDraft = cell ? deepClone(cell) : { kind: "all", lesson: emptyLesson() };
  renderCellEditor();
  positionPopover(dayId, periodIdx);
}

function emptyLesson() {
  return { subjectId: null, teacher: "", roomNum: "", roomName: "", bgColor: null, bgImage: null, textColor: null, subTextColor: null };
}

function defaultBgColor(subjectId) {
  const s = subjectById(activePlan(), subjectId);
  return (s && s.color) || "#5b8def";
}

function subjectOptions(selectedId) {
  const plan = activePlan();
  let html = '<option value="">— no subject —</option>';
  plan.catalog.forEach((s) => {
    html += '<option value="' + s.id + '"' + (s.id === selectedId ? " selected" : "") + ">" +
      escapeHtml(s.fullName) + " (" + escapeHtml(s.short || "") + ")</option>";
  });
  return html;
}

function renderCellEditor() {
  const pop = $("#cell-editor");
  pop.classList.remove("hidden");
  pop.innerHTML = "";

  const isOe = cellDraft.kind === "oe";

  let html =
    '<div class="ce-section"><h4>Lesson</h4>' +
    '<div class="ce-mode-toggle">' +
    '<button class="btn' + (!isOe ? " active" : "") + '" data-mode="all">Every week</button>' +
    '<button class="btn' + (isOe ? " active" : "") + '" data-mode="oe">Differs odd / even week</button>' +
    "</div></div>";

  if (!isOe) {
    const lesson = cellDraft.lesson || emptyLesson();
    html += lessonFieldsHtml("main", lesson, false);
    html += '<div class="ce-section"><h4>Overrides</h4>' + overridesHtml(lesson) + "</div>";
  } else {
    html += '<div class="ce-section"><h4>Odd week <span style="color:#f59e0b">(O)</span></h4>' +
      lessonFieldsHtml("odd", cellDraft.odd || emptyLesson(), true) + "</div>";
    html += '<div class="ce-section"><h4>Even week <span style="color:#34d399">(E)</span></h4>' +
      lessonFieldsHtml("even", cellDraft.even || emptyLesson(), true) + "</div>";
  }

  html += '<div class="ce-actions">' +
    '<button class="btn btn-danger" id="ce-remove">Remove</button>' +
    '<button class="btn" id="ce-cancel">Cancel</button>' +
    '<button class="btn btn-primary" id="ce-done">Done</button>' +
    "</div>";

  pop.innerHTML = html;

  pop.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => switchCellMode(b.dataset.mode));
  });

  $("#ce-done").addEventListener("click", () => { collectForm(); commitCellDraft(); pop.classList.add("hidden"); });
  $("#ce-cancel").addEventListener("click", () => pop.classList.add("hidden"));
  $("#ce-remove").addEventListener("click", () => {
    mutate((p) => { delete p.grid[gridKey(editingCell.dayId, editingCell.periodIdx)]; });
    pop.classList.add("hidden");
    toast("Lesson removed");
  });

  pop.querySelectorAll(".ce-half").forEach((half) => {
    const freeBox = half.querySelector(".js-free");
    if (freeBox) {
      const syncFree = () => {
        half.querySelectorAll("input, select").forEach((inp) => {
          if (!inp.classList.contains("js-free")) inp.disabled = freeBox.checked;
        });
        half.classList.toggle("is-free", freeBox.checked);
      };
      freeBox.addEventListener("change", syncFree);
      syncFree();
    }
  });

  pop.querySelectorAll(".js-subject").forEach((sel) => {
    sel.addEventListener("change", (e) => syncColorSwatch(e.target));
    syncColorSwatch(sel);
  });

  const bgReset = pop.querySelector(".js-bg-reset");
  if (bgReset) bgReset.addEventListener("click", () => {
    const scope = pop.querySelector(".ce-half");
    const sel = scope.querySelector(".js-subject");
    pop.querySelector(".js-bgcolor").value = defaultBgColor(sel.value);
  });
  const textReset = pop.querySelector(".js-text-reset");
  if (textReset) textReset.addEventListener("click", () => {
    pop.querySelector(".js-textcolor").value = activePlan().theme.itemTextColor || "#111827";
  });
  const subReset = pop.querySelector(".js-subtext-reset");
  if (subReset) subReset.addEventListener("click", () => {
    pop.querySelector(".js-subtextcolor").value = activePlan().theme.subTextColor || "#475569";
  });
  const imgClear = pop.querySelector(".js-bgimg-clear");
  if (imgClear) imgClear.addEventListener("click", () => {
    collectForm();
    if (cellDraft.lesson) cellDraft.lesson.bgImage = null;
    renderCellEditor();
  });
  const imgInput = pop.querySelector(".js-bgimage");
  if (imgInput) imgInput.addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const url = await fileToDataUrl(f, 800);
      collectForm();
      cellDraft.lesson = cellDraft.lesson || emptyLesson();
      cellDraft.lesson.bgImage = url;
      renderCellEditor();
    } catch (err) { toast(err.message, true); }
  });
}

function syncColorSwatch(sel) {
  const wrap = sel.closest(".ce-subject-row");
  if (!wrap) return;
  const plan = activePlan();
  const s = subjectById(plan, sel.value);
  wrap.querySelector(".color-input").value = s ? s.color : "#5b8def";
}

function lessonFieldsHtml(name, lesson, isHalf) {
  return '<div class="ce-half">' +
    (isHalf ? '<label class="check" style="margin-bottom:8px"><input type="checkbox" class="js-free" ' + (!lesson || !lesson.subjectId ? "checked" : "") + '> Free (no lesson this week)</label>' : "") +
    '<div class="ce-subject-row">' +
    '<select class="js-subject">' + subjectOptions(lesson.subjectId) + "</select>" +
    '<input type="color" class="color-input" value="' + defaultBgColor(lesson.subjectId) + '" title="Subject color" />' +
    "</div>" +
    '<div class="ce-grid">' +
    '<div><label>Teacher initials</label><input type="text" class="js-teacher" value="' + escapeHtml(lesson.teacher || "") + '" placeholder="Mü" /></div>' +
    '<div><label>Room number</label><input type="text" class="js-roomnum" maxlength="3" value="' + escapeHtml(lesson.roomNum || "") + '" placeholder="123" /></div>' +
    '<div><label>Room name</label><input type="text" class="js-roomname" value="' + escapeHtml(lesson.roomName || "") + '" placeholder="TVO" /></div>' +
    "</div>" +
    "</div>";
}

function overridesHtml(lesson) {
  const plan = activePlan();
  const subjectColor = defaultBgColor(lesson.subjectId);
  return '<div class="ce-grid">' +
    '<div><label>Item background</label><div class="ce-subject-row" style="margin:0">' +
    '<input type="color" class="js-bgcolor" value="' + (lesson.bgColor || subjectColor) + '" /><button type="button" class="btn btn-ghost js-bg-reset" style="flex:0 0 auto">auto</button></div></div>' +
    '<div><label>Item image</label><input type="file" class="js-bgimage" accept="image/*" />' +
    (lesson.bgImage ? '<button type="button" class="btn btn-ghost js-bgimg-clear" style="margin-top:4px">Remove image</button>' : "") + "</div>" +
    '<div><label>Text color</label><div class="ce-subject-row" style="margin:0">' +
    '<input type="color" class="js-textcolor" value="' + (lesson.textColor || plan.theme.itemTextColor || "#111827") + '" /><button type="button" class="btn btn-ghost js-text-reset" style="flex:0 0 auto">auto</button></div></div>' +
    '<div><label>Teacher/room text</label><div class="ce-subject-row" style="margin:0">' +
    '<input type="color" class="js-subtextcolor" value="' + (lesson.subTextColor || plan.theme.subTextColor || "#475569") + '" /><button type="button" class="btn btn-ghost js-subtext-reset" style="flex:0 0 auto">auto</button></div></div>' +
    "</div>";
}

function readLessonFromScope(scope, isHalf) {
  const subjectId = scope.querySelector(".js-subject") ? scope.querySelector(".js-subject").value : null;
  if (isHalf) {
    const free = scope.querySelector(".js-free");
    if (free && free.checked) return null;
  }
  if (!subjectId) return null;
  return {
    subjectId,
    teacher: scope.querySelector(".js-teacher").value.trim(),
    roomNum: scope.querySelector(".js-roomnum").value.trim(),
    roomName: scope.querySelector(".js-roomname").value.trim(),
    bgColor: null, bgImage: null, textColor: null, subTextColor: null
  };
}

function collectForm() {
  const pop = $("#cell-editor");
  if (!cellDraft) return;
  if (cellDraft.kind === "oe") {
    const halves = pop.querySelectorAll(".ce-half");
    cellDraft.odd = readLessonFromScope(halves[0], true);
    cellDraft.even = readLessonFromScope(halves[1], true);
  } else {
    const scope = pop.querySelector(".ce-half");
    const lesson = readLessonFromScope(scope, false);
    if (!lesson) { cellDraft.lesson = null; return; }
    const prev = cellDraft.lesson || emptyLesson();
    lesson.bgImage = prev.bgImage;
    const bg = pop.querySelector(".js-bgcolor");
    const tc = pop.querySelector(".js-textcolor");
    const sc = pop.querySelector(".js-subtextcolor");
    const subjectColor = defaultBgColor(lesson.subjectId);
    const theme = activePlan().theme;
    lesson.bgColor = (bg && bg.value !== subjectColor) ? bg.value : null;
    lesson.textColor = (tc && tc.value !== (theme.itemTextColor || "#111827")) ? tc.value : null;
    lesson.subTextColor = (sc && sc.value !== (theme.subTextColor || "#475569")) ? sc.value : null;
    cellDraft.lesson = lesson;
  }
}

function commitCellDraft() {
  const key = gridKey(editingCell.dayId, editingCell.periodIdx);
  mutate((p) => {
    let cell = null;
    if (cellDraft.kind === "all") {
      if (cellDraft.lesson && cellDraft.lesson.subjectId) cell = { kind: "all", lesson: cellDraft.lesson };
    } else {
      if (cellDraft.odd || cellDraft.even) cell = { kind: "oe", odd: cellDraft.odd, even: cellDraft.even };
    }
    if (cell) p.grid[key] = cell;
    else delete p.grid[key];
  });
}

function switchCellMode(mode) {
  collectForm();
  if (mode === "oe") {
    const base = (cellDraft.kind === "all" && cellDraft.lesson) ? cellDraft.lesson
      : (cellDraft.odd || cellDraft.even || emptyLesson());
    cellDraft = { kind: "oe", odd: deepClone(base), even: deepClone(base) };
  } else {
    const base = cellDraft.odd || cellDraft.even || emptyLesson();
    cellDraft = { kind: "all", lesson: deepClone(base) };
  }
  renderCellEditor();
}

function positionPopover(dayId, periodIdx) {
  const cell = document.querySelector('.grid-cell[data-key="' + gridKey(dayId, periodIdx) + '"]');
  const pop = $("#cell-editor");
  if (!cell) return;
  const r = cell.getBoundingClientRect();
  pop.style.left = "0";
  pop.style.top = "0";
  pop.style.transform = "none";
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight) top = Math.max(8, r.top - ph - 8);
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

/* ============================== Drag & drop ============================== */

let drag = null;
let suppressNextClick = false;

function startPointerDown(e) {
  const card = e.target.closest(".subject-card");
  const gridEl = e.target.closest(".grid-cell.has-lesson");
  if (!card && !gridEl) return;

  let source;
  let ghostContent;
  if (card) {
    const plan = activePlan();
    const s = subjectById(plan, card.dataset.subjectId);
    if (!s) return;
    source = { type: "catalog", subjectId: s.id };
    ghostContent = s.short || s.fullName;
  } else {
    source = { type: "grid", dayId: gridEl.dataset.dayId, periodIdx: gridEl.dataset.periodIdx };
    ghostContent = gridEl.querySelector(".subject-short") ? gridEl.querySelector(".subject-short").textContent : "";
  }

  const startX = e.clientX, startY = e.clientY;
  const pointerType = e.pointerType || "mouse";
  const startTime = Date.now();
  let started = false;
  let longPressTimer = pointerType === "touch"
    ? setTimeout(() => { if (!started) beginDrag(); }, 120)
    : null;

  function beginDrag() {
    started = true;
    drag = {
      source, ghostContent,
      x: startX, y: startY,
      pointerType,
      moveSource: source.type === "grid"
    };
    document.body.classList.add("dragging");
    $("#timetable").classList.add("dragging");
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 0);
    if (source.type === "catalog") $("#catalog").classList.remove("delete-zone");
    createGhost();
    e.preventDefault();
  }

  function createGhost() {
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = ghostContent;
    const plan = activePlan();
    const s = subjectById(plan, source.type === "catalog" ? source.subjectId : null);
    if (source.type === "grid") {
      const cell = plan.grid[gridKey(source.dayId, source.periodIdx)];
      const ls = cell && cell.kind === "all" ? cell.lesson : (cell && cell.kind === "oe" ? (cell.odd || cell.even) : null);
      const subj = ls ? subjectById(plan, ls.subjectId) : null;
      ghost.style.background = subj ? subj.color : "#5b8def";
    } else if (s) {
      ghost.style.background = s.color;
    }
    ghost.style.left = startX + "px";
    ghost.style.top = startY + "px";
    document.body.appendChild(ghost);
    drag.ghost = ghost;
  }

  function onMove(ev) {
    if (!started) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        beginDrag();
      } else {
        return;
      }
    }
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (drag.ghost) {
      drag.ghost.style.left = ev.clientX + "px";
      drag.ghost.style.top = ev.clientY + "px";
    }
    updateDropTarget(ev.clientX, ev.clientY);
    autoScroll(ev.clientX, ev.clientY);
    ev.preventDefault();
  }

  function onUp(ev) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    if (!started) return;
    finishDrag(ev.clientX, ev.clientY);
  }

  function onCancel() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    cancelDrag();
  }

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
}

function updateDropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  $$(".grid-cell").forEach((c) => {
    c.classList.remove("drop-valid", "drop-replace");
  });
  $("#catalog").classList.remove("delete-zone");

  if (!el) return;
  const cell = el.closest(".grid-cell");
  const catalog = el.closest("#catalog");

  if (cell) {
    const key = cell.dataset.key;
    const plan = activePlan();
    const occupied = plan.grid[key];
    if (occupied) cell.classList.add("drop-replace");
    else cell.classList.add("drop-valid");
    drag.hoverCell = cell;
    drag.hoverCatalog = false;
  } else if (catalog) {
    $("#catalog").classList.add("delete-zone");
    drag.hoverCell = null;
    drag.hoverCatalog = true;
  } else {
    drag.hoverCell = null;
    drag.hoverCatalog = false;
  }
}

function autoScroll(x, y) {
  const scroller = $("#canvas-scroll");
  const margin = 60;
  const r = scroller.getBoundingClientRect();
  let dx = 0, dy = 0;
  if (x < r.left + margin) dx = -14;
  else if (x > r.right - margin) dx = 14;
  if (y < r.top + margin) dy = -14;
  else if (y > r.bottom - margin) dy = 14;
  if (dx || dy) scroller.scrollBy(dx, dy);
}

function cancelDrag() {
  cleanupDrag();
}

function cleanupDrag() {
  document.body.classList.remove("dragging");
  $("#timetable").classList.remove("dragging");
  $("#catalog").classList.remove("delete-zone");
  $$(".grid-cell").forEach((c) => c.classList.remove("drop-valid", "drop-replace"));
  if (drag && drag.ghost) drag.ghost.remove();
  drag = null;
}

async function finishDrag(x, y) {
  const source = drag.source;
  const plan = activePlan();
  const el = document.elementFromPoint(x, y);
  cleanupDrag();

  if (!el) return;
  const cell = el.closest(".grid-cell");
  const catalog = el.closest("#catalog");
  const key = cell ? cell.dataset.key : null;

  if (catalog || (!cell && el.closest(".canvas-scroll"))) {
    if (source.type === "grid") {
      mutate((p) => { delete p.grid[gridKey(source.dayId, source.periodIdx)]; });
      toast("Lesson removed");
    }
    return;
  }

  if (cell) {
    const [dayId, periodIdx] = key.split(".");
    const occupied = plan.grid[key];

    if (source.type === "catalog") {
      if (occupied) {
        const ok = await askConfirm("This cell already has a lesson. Replace it?", "Replace");
        if (!ok) { toast("Drag to the correct hour"); return; }
        mutate((p) => {
          p.grid[key] = { kind: "all", lesson: { ...emptyLesson(), subjectId: source.subjectId } };
        });
      } else {
        mutate((p) => {
          p.grid[key] = { kind: "all", lesson: { ...emptyLesson(), subjectId: source.subjectId } };
        });
      }
    } else if (source.type === "grid") {
      const fromKey = gridKey(source.dayId, source.periodIdx);
      if (fromKey === key) return;
      const moving = plan.grid[fromKey];
      if (occupied) {
        const ok = await askConfirm("This cell already has a lesson. Replace it?", "Replace");
        if (!ok) { toast("Drag to the correct hour"); return; }
        mutate((p) => {
          delete p.grid[fromKey];
          p.grid[key] = moving;
        });
      } else {
        mutate((p) => {
          delete p.grid[fromKey];
          p.grid[key] = moving;
        });
      }
    }
  }
}

/* ============================== Theme ============================== */

function applyTheme(theme) {
  const root = $("#export-root");
  const t = theme || defaultTheme();
  root.style.background = bgValue(t.pageBg);
  root.style.setProperty("--tt-title-bg", t.headerTitleBg || "transparent");
  root.style.setProperty("--tt-title-text", t.headerTitleText || "#111");
  root.style.setProperty("--tt-font", "'" + (t.font || "Inter") + "', system-ui, sans-serif");
  root.style.setProperty("--tt-day-bg", t.dayHeaderBg || "#eef2f7");
  root.style.setProperty("--tt-day-text", t.dayHeaderText || "#334155");
  root.style.setProperty("--tt-item-text", t.itemTextColor || "#111");
  root.style.setProperty("--tt-sub-text", t.subTextColor || "#475569");
  root.style.setProperty("--tt-item-radius", t.itemShape === "sharp" ? "0px" : t.itemShape === "pill" ? "999px" : "6px");
  root.style.setProperty("--tt-grid-line", t.gridLineColor || "#cbd5e1");
  root.style.setProperty("--tt-break-line", t.breakLineColor || "#94a3b8");
  root.style.setProperty("--tt-cell-pad", t.cellPad === "compact" ? "3px" : t.cellPad === "spacious" ? "12px" : "6px");
}

function bgValue(pb) {
  if (!pb) return "#ffffff";
  if (pb.type === "gradient") return pb.gradientCss || "#ffffff";
  if (pb.type === "image" && pb.image) {
    return "url(" + pb.image + ") " + (pb.pos || "center") + "/" + (pb.size || "cover") + " no-repeat";
  }
  return pb.color || "#ffffff";
}

let themeDraft = null;

function openThemeModal() {
  const plan = activePlan();
  themeDraft = deepClone(plan.theme);
  renderThemePresets();
  fillThemeForm(themeDraft);
  openModal("#theme-modal");
}

function renderThemePresets() {
  const wrap = $("#theme-presets");
  wrap.innerHTML = "";
  PRESETS.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "preset-card" + (themeDraft.name === p.name ? " active" : "");
    card.innerHTML =
      '<div class="swatch-row"><i style="background:' + p.headerTitleBg + '"></i>' +
      '<i style="background:' + p.dayHeaderBg + '"></i><i style="background:' + p.itemTextColor + '"></i></div>' +
      escapeHtml(p.name);
    card.addEventListener("click", () => {
      themeDraft = { ...deepClone(p), name: p.name, preset: false };
      fillThemeForm(themeDraft);
      renderThemePresets();
      previewTheme();
    });
    wrap.appendChild(card);
  });
}

function fillThemeForm(t) {
  $("#theme-title-text").value = t.titleText || "";
  $("#theme-title-bg").value = t.headerTitleBg || "#1e293b";
  $("#theme-title-fg").value = t.headerTitleText || "#ffffff";
  $("#theme-day-bg").value = t.dayHeaderBg || "#eef2f7";
  $("#theme-day-fg").value = t.dayHeaderText || "#334155";
  $("#theme-item-fg").value = t.itemTextColor || "#111827";
  $("#theme-sub-fg").value = t.subTextColor || "#475569";
  $("#theme-font").value = t.font || "Inter";
  $("#theme-shape").value = t.itemShape || "rounded";
  $("#theme-grid-line").value = t.gridLineColor || "#cbd5e1";
  $("#theme-break-line").value = t.breakLineColor || "#94a3b8";
  $("#theme-density").value = t.cellPad || "normal";
  $("#theme-page-bg").value = t.pageBg && t.pageBg.color ? t.pageBg.color : "#ffffff";
  $("#theme-page-bg2").value = (t.pageBg && t.pageBg.color2) || "#e0f2fe";
  setBgType((t.pageBg && t.pageBg.type) || "color");
  $("#bg-image-row").classList.toggle("hidden", !(t.pageBg && t.pageBg.type === "image"));
}

function setBgType(type) {
  themeDraft.pageBg = themeDraft.pageBg || { type: "color", color: "#ffffff", gradientCss: "", image: "", pos: "center", size: "cover" };
  themeDraft.pageBg.type = type;
  if (type === "gradient" && !themeDraft.pageBg.gradientCss) {
    themeDraft.pageBg.gradientCss = "linear-gradient(135deg,#ffffff,#e0f2fe)";
  }
  $("#bg-color-row").classList.toggle("hidden", type === "image");
  $("#bg-image-row").classList.toggle("hidden", type !== "image");
  ["#bg-type-color", "#bg-type-gradient", "#bg-type-image"].forEach((s, i) => {
    const t = ["color", "gradient", "image"][i];
    $(s).classList.toggle("active", type === t);
  });
  previewTheme();
}

function readThemeForm() {
  const t = themeDraft;
  t.titleText = $("#theme-title-text").value;
  t.headerTitleBg = $("#theme-title-bg").value;
  t.headerTitleText = $("#theme-title-fg").value;
  t.dayHeaderBg = $("#theme-day-bg").value;
  t.dayHeaderText = $("#theme-day-fg").value;
  t.itemTextColor = $("#theme-item-fg").value;
  t.subTextColor = $("#theme-sub-fg").value;
  t.font = $("#theme-font").value;
  t.itemShape = $("#theme-shape").value;
  t.gridLineColor = $("#theme-grid-line").value;
  t.breakLineColor = $("#theme-break-line").value;
  t.cellPad = $("#theme-density").value;
  if (t.pageBg.type === "gradient") {
    t.pageBg.gradientCss = "linear-gradient(135deg," + $("#theme-page-bg").value + "," + $("#theme-page-bg2").value + ")";
    t.pageBg.color = $("#theme-page-bg").value;
    t.pageBg.color2 = $("#theme-page-bg2").value;
  } else if (t.pageBg.type === "color") {
    t.pageBg.color = $("#theme-page-bg").value;
    t.pageBg.gradientCss = "";
  }
}

function previewTheme() {
  readThemeForm();
  applyTheme(themeDraft);
}

async function saveTheme() {
  readThemeForm();
  const plan = activePlan();
  pushUndo();
  plan.theme = deepClone(themeDraft);
  plan.theme.preset = false;
  touch(plan);
  applyTheme(plan.theme);
  $("#title-band").textContent = plan.theme.titleText || "";
  save();
  closeModal("#theme-modal");
  toast("Theme saved");
}

/* ============================== Image helper ============================== */

function fileToDataUrl(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const max = maxSide || 1400;
      if (w > max || h > max) {
        const ratio = Math.min(max / w, max / h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

/* ============================== Export ============================== */

let exportScale = 2;

async function doExport() {
  const plan = activePlan();
  const includeHeader = $("#export-header").checked;
  const titleBand = $("#title-band");
  titleBand.classList.toggle("hide-title", !includeHeader);
  document.body.classList.add("exporting");
  try {
    const node = $("#export-root");
    const t = plan.theme;
    const bgColor = (t.pageBg && t.pageBg.type === "color") ? (t.pageBg.color || "#ffffff") : "#ffffff";
    const dataUrl = await htmlToImage.toPng(node, { pixelRatio: exportScale, backgroundColor: bgColor, cacheBust: true });
    const a = document.createElement("a");
    a.download = (plan.name || "timetable").replace(/[\\/:*?"<>|]/g, "_") + ".png";
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("PNG downloaded");
  } catch (e) {
    toast("Export failed: " + e.message, true);
  } finally {
    titleBand.classList.remove("hide-title");
    document.body.classList.remove("exporting");
  }
}

/* ============================== Wizard ============================== */

let wizardDays = DAY_DEFAULTS.slice();
let wizardPeriods = 8;

function openWizard() {
  $("#wiz-name").value = "";
  wizardDays = DAY_DEFAULTS.slice();
  wizardPeriods = 8;
  $("#wiz-periods-value").textContent = wizardPeriods;
  renderWizardDays();
  openModal("#wizard-modal");
}

function renderWizardDays() {
  const wrap = $("#wiz-days");
  wrap.innerHTML = "";
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((d) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (wizardDays.includes(d) ? " active" : "");
    chip.textContent = d.slice(0, 3);
    chip.addEventListener("click", () => {
      const i = wizardDays.indexOf(d);
      if (i >= 0) wizardDays.splice(i, 1);
      else wizardDays.push(d);
      wizardDays.sort((a, b) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(a) - ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(b));
      renderWizardDays();
    });
    wrap.appendChild(chip);
  });
}

function finishWizard() {
  const name = $("#wiz-name").value.trim() || "Untitled";
  if (wizardDays.length === 0) { toast("Select at least one day", true); return; }
  const startMin = timeToMin($("#wiz-start").value) ?? (7 * 60 + 45);
  const len = Math.max(10, parseInt($("#wiz-len").value, 10) || 45);
  const brk = Math.max(0, parseInt($("#wiz-break").value, 10) || 0);
  const periods = defaultPeriods(wizardPeriods, startMin, len, brk);
  createPlan(name, wizardDays, periods);
  closeModal("#wizard-modal");
  closeHamburger();
  showEditor();
  toast("Plan created");
}

/* ============================== Schedule modal ============================== */

let scheduleDraft = null;

function openSchedule() {
  const plan = activePlan();
  scheduleDraft = {
    days: plan.days.map((d) => ({ id: d.id, label: d.label })),
    periods: plan.periods.map((p) => ({ id: p.id, label: p.label, start: p.start, end: p.end, breakAfter: p.breakAfter }))
  };
  renderScheduleDays();
  renderSchedulePeriods();
  openModal("#schedule-modal");
}

function renderScheduleDays() {
  const wrap = $("#schedule-days");
  wrap.innerHTML = "";
  scheduleDraft.days.forEach((d) => {
    const row = document.createElement("div");
    row.className = "day-row";
    row.innerHTML =
      '<input type="text" value="' + escapeHtml(d.label) + '" />' +
      '<button class="remove" title="Remove day">&times;</button>';
    row.querySelector(".remove").addEventListener("click", () => {
      if (scheduleDraft.days.length <= 1) { toast("Need at least one day", true); return; }
      scheduleDraft.days = scheduleDraft.days.filter((x) => x.id !== d.id);
      renderScheduleDays();
    });
    wrap.appendChild(row);
  });
}

function renderSchedulePeriods() {
  const wrap = $("#schedule-periods");
  wrap.innerHTML = "";
  scheduleDraft.periods.forEach((pr, i) => {
    const row = document.createElement("div");
    row.className = "period-row";
    row.dataset.id = pr.id;
    row.innerHTML =
      '<input type="text" class="s-label" value="' + escapeHtml(pr.label) + '" placeholder="' + (i + 1) + '" />' +
      '<input type="time" class="s-start" value="' + escapeHtml(pr.start || "") + '" />' +
      '<input type="time" class="s-end" value="' + escapeHtml(pr.end || "") + '" />' +
      '<label class="p-break"><input type="checkbox" class="s-break" ' + (pr.breakAfter ? "checked" : "") + '> break</label>' +
      '<button class="remove" title="Remove period">&times;</button>';
    row.querySelector(".remove").addEventListener("click", () => {
      if (scheduleDraft.periods.length <= 3) { toast("Minimum 3 periods", true); return; }
      scheduleDraft.periods = scheduleDraft.periods.filter((x) => x.id !== pr.id);
      renderSchedulePeriods();
    });
    wrap.appendChild(row);
  });
}

function readScheduleDraft() {
  const dayInputs = $$("#schedule-days .day-row input");
  dayInputs.forEach((inp, i) => {
    if (scheduleDraft.days[i]) scheduleDraft.days[i].label = inp.value.trim() || "Day";
  });
  $$("#schedule-periods .period-row").forEach((row) => {
    const pr = scheduleDraft.periods.find((x) => x.id === row.dataset.id);
    if (!pr) return;
    pr.label = row.querySelector(".s-label").value.trim();
    pr.start = row.querySelector(".s-start").value;
    pr.end = row.querySelector(".s-end").value;
    pr.breakAfter = row.querySelector(".s-break").checked;
  });
}

function saveSchedule() {
  const plan = activePlan();
  readScheduleDraft();
  const newDays = scheduleDraft.days.map((d) => ({ id: d.id, label: d.label }));
  const newPeriods = scheduleDraft.periods.map((p) => ({ id: p.id, label: p.label, start: p.start, end: p.end, breakAfter: p.breakAfter }));

  pushUndo();
  const oldDayIds = plan.days.map((d) => d.id);
  const newGrid = {};
  Object.keys(plan.grid).forEach((k) => {
    const parts = k.split(".");
    const di = oldDayIds.indexOf(parts[0]);
    const pi = parseInt(parts[1], 10);
    if (di >= 0 && di < newDays.length && pi < newPeriods.length) {
      newGrid[gridKey(newDays[di].id, pi)] = plan.grid[k];
    }
  });
  plan.days = newDays;
  plan.periods = newPeriods;
  plan.grid = newGrid;
  touch(plan);
  save();
  renderAll();
  closeModal("#schedule-modal");
}

/* ============================== Wire-up ============================== */

function wireEvents() {
  $("#landing-create").addEventListener("click", openWizard);

  $("#btn-hamburger").addEventListener("click", openHamburger);
  $("#btn-new-plan").addEventListener("click", () => { closeHamburger(); openWizard(); });
  $("#btn-schedule").addEventListener("click", openSchedule);
  $("#btn-theme").addEventListener("click", openThemeModal);
  $("#btn-export").addEventListener("click", () => openModal("#export-modal"));
  $("#btn-undo").addEventListener("click", undo);
  $("#btn-redo").addEventListener("click", redo);
  $("#btn-toggle-catalog").addEventListener("click", () => $("#catalog").classList.toggle("open"));
  $("#btn-add-subject").addEventListener("click", () => openSubjectEditor(null));

  $("#backdrop").addEventListener("click", () => {
    closeHamburger();
    closeAllModals();
  });

  $("#hamburger-sheet").addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    const dupBtn = e.target.closest("[data-dup]");
    const renBtn = e.target.closest("[data-rename]");
    const delBtn = e.target.closest("[data-del]");
    const clearBtn = e.target.closest("[data-clear]");
    if (openBtn) {
      state.activePlanId = openBtn.dataset.open;
      save();
      closeHamburger();
      undoStack.length = 0; redoStack.length = 0;
      showEditor();
    } else if (dupBtn) {
      duplicatePlan(dupBtn.dataset.dup);
      closeHamburger();
      undoStack.length = 0; redoStack.length = 0;
      renderPlanList();
      showEditor();
      toast("Plan duplicated");
    } else if (renBtn) {
      promptRenamePlan(renBtn.dataset.rename);
    } else if (delBtn) {
      deletePlanFlow(delBtn.dataset.del);
    } else if (clearBtn) {
      clearPlanFlow(clearBtn.dataset.clear);
    }
  });

  $("#plan-title").addEventListener("input", debounce((e) => {
    const plan = activePlan();
    if (!plan) return;
    plan.name = e.target.value;
    touch(plan);
    save();
  }, 300));

  $("#catalog-search").addEventListener("input", debounce(renderCatalog, 150));

  $("#catalog-list").addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      e.stopPropagation();
      showSubjectMenu(editBtn.dataset.edit, editBtn);
    }
  });

  $("#wiz-periods-minus").addEventListener("click", () => {
    wizardPeriods = Math.max(3, wizardPeriods - 1);
    $("#wiz-periods-value").textContent = wizardPeriods;
  });
  $("#wiz-periods-plus").addEventListener("click", () => {
    wizardPeriods = Math.min(12, wizardPeriods + 1);
    $("#wiz-periods-value").textContent = wizardPeriods;
  });
  $("#wiz-cancel").addEventListener("click", () => closeModal("#wizard-modal"));
  $("#wiz-create").addEventListener("click", finishWizard);

  $("#schedule-add-day").addEventListener("click", () => {
    if (scheduleDraft.days.length >= 7) { toast("Maximum 7 days", true); return; }
    scheduleDraft.days.push({ id: uid(), label: "Day " + (scheduleDraft.days.length + 1) });
    renderScheduleDays();
  });
  $("#schedule-add-period").addEventListener("click", () => {
    if (scheduleDraft.periods.length >= 12) { toast("Maximum 12 periods", true); return; }
    const prev = scheduleDraft.periods[scheduleDraft.periods.length - 1];
    const start = prev && prev.end ? prev.end : "08:00";
    const end = timeToMin(start) != null ? fmtTime(timeToMin(start) + 45) : "";
    scheduleDraft.periods.push({ id: uid(), label: String(scheduleDraft.periods.length + 1), start, end, breakAfter: false });
    renderSchedulePeriods();
  });
  $("#schedule-cancel").addEventListener("click", () => closeModal("#schedule-modal"));
  $("#schedule-save").addEventListener("click", saveSchedule);

  $("#subject-save").addEventListener("click", saveSubjectFromModal);
  $("#subject-cancel").addEventListener("click", () => {
    if (window._promptTextResolve) {
      const r = window._promptTextResolve;
      window._promptTextResolve = null;
      r(null);
    }
    closeModal("#subject-modal");
  });

  $("#theme-cancel").addEventListener("click", () => {
    const plan = activePlan();
    applyTheme(plan.theme);
    $("#title-band").textContent = plan.theme.titleText || "";
    closeModal("#theme-modal");
  });
  $("#theme-save").addEventListener("click", saveTheme);

  ["#theme-title-text", "#theme-title-bg", "#theme-title-fg", "#theme-day-bg", "#theme-day-fg",
   "#theme-item-fg", "#theme-sub-fg", "#theme-font", "#theme-shape", "#theme-grid-line",
   "#theme-break-line", "#theme-density", "#theme-page-bg", "#theme-page-bg2"
  ].forEach((sel) => {
    $(sel).addEventListener("input", previewTheme);
    $(sel).addEventListener("change", previewTheme);
  });
  $("#bg-type-color").addEventListener("click", () => setBgType("color"));
  $("#bg-type-gradient").addEventListener("click", () => setBgType("gradient"));
  $("#bg-type-image").addEventListener("click", () => setBgType("image"));
  $("#bg-image-clear").addEventListener("click", () => {
    themeDraft.pageBg.image = "";
    $("#theme-page-image").value = "";
    previewTheme();
  });
  $("#theme-page-image").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      themeDraft.pageBg.image = await fileToDataUrl(f, 1400);
      themeDraft.pageBg.type = "image";
      setBgType("image");
      previewTheme();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#export-scale").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-scale]");
    if (!btn) return;
    exportScale = parseInt(btn.dataset.scale, 10);
    $$("#export-scale .btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
  $("#export-cancel").addEventListener("click", () => closeModal("#export-modal"));
  $("#export-download").addEventListener("click", async () => {
    $("#export-download").disabled = true;
    await doExport();
    $("#export-download").disabled = false;
    closeModal("#export-modal");
  });

  $("#confirm-cancel").addEventListener("click", () => closeConfirm(false));
  $("#confirm-ok").addEventListener("click", () => closeConfirm(true));

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (e.key === "Escape") {
      if (drag) cancelDrag();
      else if (!$("#cell-editor").classList.contains("hidden")) $("#cell-editor").classList.add("hidden");
      else if ($("#hamburger-sheet").classList.contains("open")) closeHamburger();
      else closeAllModals();
    }
  });

  $("#timetable").addEventListener("pointerdown", startPointerDown);
  $("#catalog-list").addEventListener("pointerdown", startPointerDown);

  $("#timetable").addEventListener("click", (e) => {
    if (suppressNextClick) { suppressNextClick = false; return; }
    const cell = e.target.closest(".grid-cell");
    if (!cell) return;
    if (cell.classList.contains("has-lesson")) {
      openCellEditor(cell.dataset.dayId, parseInt(cell.dataset.periodIdx, 10));
    }
  });

  const titleBand = $("#title-band");
  titleBand.addEventListener("input", debounce(() => {
    const plan = activePlan();
    if (!plan) return;
    if (!plan.theme.__titleTouched) { pushUndo(); plan.theme.__titleTouched = true; }
    plan.theme.titleText = titleBand.textContent;
    touch(plan);
    save();
  }, 300));
  titleBand.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); }
  });

  document.addEventListener("pointerdown", (e) => {
    const pop = $("#cell-editor");
    if (!pop.classList.contains("hidden") && !pop.contains(e.target)) {
      if (!e.target.closest(".grid-cell")) pop.classList.add("hidden");
    }
  });
}

function showSubjectMenu(subjectId, anchor) {
  const existing = document.querySelector(".subject-context");
  if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.className = "subject-context";
  menu.style.cssText = "position:fixed;z-index:70;background:var(--panel-bg);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);padding:6px;display:flex;flex-direction:column;";
  menu.innerHTML =
    '<button class="mini-btn" data-act="edit" style="text-align:left;padding:8px 12px">Edit subject</button>' +
    '<button class="mini-btn danger" data-act="del" style="text-align:left;padding:8px 12px">Delete subject</button>';
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.min(r.left, window.innerWidth - 180) + "px";
  menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 90) + "px";
  document.body.appendChild(menu);
  menu.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    menu.remove();
    if (act.dataset.act === "edit") openSubjectEditor(subjectId);
    else if (act.dataset.act === "del") deleteSubjectFlow(subjectId);
  });
  setTimeout(() => {
    document.addEventListener("pointerdown", function closeMenu(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("pointerdown", closeMenu); }
    });
  }, 0);
}

async function deleteSubjectFlow(id) {
  const ok = await askConfirm("Delete this subject? Lessons using it will be removed from the grid.", "Delete");
  if (ok) { deleteSubject(id); toast("Subject deleted"); }
}

async function deletePlanFlow(id) {
  const ok = await askConfirm("Delete this plan? This cannot be undone.", "Delete");
  if (ok) {
    deletePlan(id);
    closeHamburger();
    toast("Plan deleted");
  }
}

async function clearPlanFlow(id) {
  const ok = await askConfirm("Clear all lessons from this plan?", "Clear");
  if (ok) clearPlan(id);
}

function init() {
  load();
  wireEvents();
  if (state.plans.length === 0) {
    showLanding();
  } else {
    if (!state.activePlanId || !activePlan()) state.activePlanId = state.plans[0].id;
    showEditor();
  }
}

init();
