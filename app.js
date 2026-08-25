(() => {
  "use strict";

  const STORAGE_KEY = "multicrono.projects.v1";

  /** @typedef {{id:string,name:string,totalMs:number,isRunning:boolean,startedAt:number|null,notes:Array,history:Object<string,number>}} Project */

  /** @type {Project[]} */
  let projects = load();

  const grid = document.getElementById("timer-grid");
  const emptyState = document.getElementById("empty-state");
  const summarySection = document.getElementById("summary-section");
  const summaryList = document.getElementById("summary-list");
  const grandTotalValue = document.getElementById("grand-total-value");
  const template = document.getElementById("card-template");
  const noteTemplate = document.getElementById("note-template");
  const dayTemplate = document.getElementById("day-template");
  const addForm = document.getElementById("add-form");
  const nameInput = document.getElementById("project-name");
  const toast = document.getElementById("toast");

  const calOpenBtn = document.getElementById("cal-open-btn");
  const calOpenLabel = calOpenBtn.querySelector(".cal-open-label");
  const calSection = document.getElementById("calendar-section");
  const calPrevBtn = document.getElementById("cal-prev");
  const calNextBtn = document.getElementById("cal-next");
  const calTitle = document.getElementById("cal-title");
  const calGrid = document.getElementById("cal-grid");
  const calDetailDate = document.getElementById("cal-detail-date");
  const calDetailList = document.getElementById("cal-detail-list");
  const calDetailEmpty = document.getElementById("cal-detail-empty");
  const calDetailTotal = document.getElementById("cal-detail-total");

  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFileInput = document.getElementById("import-file-input");

  let calMonthCursor = new Date();
  calMonthCursor.setDate(1);
  let calSelectedDate = dateISO();

  function dateISO(d = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Old legacy key format was "YYYY-M-D" (zero-based month, unpadded).
  function legacyKeyToIso(key) {
    const parts = String(key).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const [y, monthZeroBased, d] = parts;
    return dateISO(new Date(y, monthZeroBased, d));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed.map((p) => {
        const notes = p.notes || [];
        const history = p.history ? { ...p.history } : {};

        // Migrate the old single "today" bucket into the new per-day history
        // so upgrading doesn't silently drop whatever was tracked today.
        if (p.todayMs && p.todayDate) {
          const legacyKey = legacyKeyToIso(p.todayDate);
          if (legacyKey && !(legacyKey in history)) history[legacyKey] = p.todayMs;
        }

        const { todayMs, todayDate, ...rest } = p;
        return { ...rest, notes, history };
      });
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (err) {
      showToast("No se pudo guardar: almacenamiento lleno o bloqueado");
    }
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function fmt(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function liveElapsed(p) {
    return p.totalMs + (p.isRunning && p.startedAt ? Date.now() - p.startedAt : 0);
  }

  function liveToday(p) {
    const banked = (p.history && p.history[dateISO()]) || 0;
    return banked + (p.isRunning && p.startedAt ? Date.now() - p.startedAt : 0);
  }

  function formatDayLabel(dateKey, todayIso) {
    if (dateKey === todayIso) return "Hoy";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateKey === dateISO(yesterday)) return "Ayer";
    const [y, m, d] = dateKey.split("-").map(Number);
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d} ${months[m - 1]}`;
  }

  function formatNoteTime(ms) {
    const d = new Date(ms);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === now.toDateString()) return hhmm;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm}`;
  }

  const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  function elapsedForDate(p, dateKey) {
    let ms = (p.history && p.history[dateKey]) || 0;
    if (p.isRunning && p.startedAt && dateKey === dateISO()) ms += Date.now() - p.startedAt;
    return ms;
  }

  function dayTotalMs(dateKey) {
    return projects.reduce((sum, p) => sum + elapsedForDate(p, dateKey), 0);
  }

  function dayBreakdown(dateKey) {
    return projects
      .map((p) => ({ name: p.name, ms: elapsedForDate(p, dateKey) }))
      .filter((x) => x.ms > 0)
      .sort((a, b) => b.ms - a.ms);
  }

  function fmtCompact(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0 && m === 0) return "";
    if (m === 0) return `${h}h`;
    if (h === 0) return `${m}m`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // ---------- Rendering ----------

  function renderAll() {
    grid.innerHTML = "";
    emptyState.hidden = projects.length !== 0;

    for (const p of projects) {
      grid.appendChild(buildCard(p));
    }

    renderSummary();
    refreshCalendarIfOpen();
    document.title = projects.some((p) => p.isRunning) ? "● Multicrono" : "Multicrono";
  }

  function buildCard(p) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = p.id;
    node.classList.toggle("running", p.isRunning);

    const nameEl = node.querySelector(".card-name");
    nameEl.textContent = p.name;

    node.querySelector(".digits").textContent = fmt(liveElapsed(p));
    node.querySelector(".stat-today").textContent = fmt(liveToday(p));
    node.querySelector(".stat-total").textContent = fmt(liveElapsed(p));

    const toggleBtn = node.querySelector(".btn-toggle");
    const iconPlay = node.querySelector(".icon-play");
    const iconPause = node.querySelector(".icon-pause");
    const toggleLabel = node.querySelector(".toggle-label");
    iconPlay.hidden = p.isRunning;
    iconPause.hidden = !p.isRunning;
    toggleLabel.textContent = p.isRunning ? "Pausar" : "Iniciar";

    toggleBtn.addEventListener("click", () => toggleProject(p.id));
    armConfirm(node.querySelector(".btn-reset"), "Reiniciar", "¿Seguro?", () => resetProject(p.id));
    armConfirm(node.querySelector(".delete-btn"), null, null, () => deleteProject(p.id), true);

    nameEl.addEventListener("click", () => startRename(nameEl, p.id));
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nameEl.blur(); }
      if (e.key === "Escape") { nameEl.textContent = p.name; nameEl.blur(); }
    });

    wireNotes(node, p);
    wireDays(node, p);

    return node;
  }

  function wireNotes(node, p) {
    const toggle = node.querySelector(".notes-toggle");
    const panel = node.querySelector(".notes-panel");
    const countEl = node.querySelector(".notes-count");
    const listEl = node.querySelector(".notes-list");
    const form = node.querySelector(".notes-form");
    const input = node.querySelector(".notes-input");

    countEl.textContent = (p.notes || []).length;
    renderNotesList(listEl, p);

    toggle.addEventListener("click", () => {
      const wasHidden = panel.hidden;
      panel.hidden = !wasHidden;
      toggle.classList.toggle("open", wasHidden);
      if (wasHidden) input.focus();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      addNote(p.id, text, node);
      input.value = "";
      input.focus();
    });
  }

  function renderNotesList(listEl, p) {
    listEl.innerHTML = "";
    const notes = p.notes || [];
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      const li = noteTemplate.content.firstElementChild.cloneNode(true);
      li.dataset.id = note.id;
      li.querySelector(".note-time").textContent = formatNoteTime(note.at);
      li.querySelector(".note-elapsed").textContent = fmt(note.elapsedMs || 0);
      li.querySelector(".note-text").textContent = note.text;
      li.querySelector(".note-delete").addEventListener("click", () => {
        deleteNote(p.id, note.id, listEl);
      });
      listEl.appendChild(li);
    }
  }

  function wireDays(node, p) {
    const toggle = node.querySelector(".days-toggle");
    const panel = node.querySelector(".days-panel");
    const countEl = node.querySelector(".days-count");
    const listEl = node.querySelector(".days-list");

    updateDaysCount(countEl, p);
    renderDaysList(listEl, p);

    toggle.addEventListener("click", () => {
      const wasHidden = panel.hidden;
      panel.hidden = !wasHidden;
      toggle.classList.toggle("open", wasHidden);
      if (wasHidden) renderDaysList(listEl, p);
    });
  }

  function updateDaysCount(countEl, p) {
    const days = new Set(Object.keys(p.history || {}));
    days.add(dateISO());
    countEl.textContent = days.size;
  }

  function renderDaysList(listEl, p) {
    listEl.innerHTML = "";
    const todayIso = dateISO();
    const entries = { ...(p.history || {}) };
    if (!(todayIso in entries)) entries[todayIso] = 0;

    const sortedDates = Object.keys(entries).sort((a, b) => b.localeCompare(a));
    for (const dateKey of sortedDates) {
      const li = dayTemplate.content.firstElementChild.cloneNode(true);
      li.dataset.date = dateKey;
      const isToday = dateKey === todayIso;
      if (isToday) li.classList.add("day-item-today");
      li.querySelector(".day-date").textContent = formatDayLabel(dateKey, todayIso);
      li.querySelector(".day-value").textContent = fmt(isToday ? liveToday(p) : entries[dateKey]);
      listEl.appendChild(li);
    }
  }

  // ---------- Calendar ----------

  function toggleCalendar() {
    const wasHidden = calSection.hidden;
    calSection.hidden = !wasHidden;
    calOpenBtn.classList.toggle("open", wasHidden);
    calOpenLabel.textContent = wasHidden ? "Ocultar calendario" : "Ver calendario";
    if (wasHidden) {
      calMonthCursor = new Date();
      calMonthCursor.setDate(1);
      calSelectedDate = dateISO();
      renderCalendar();
    }
  }

  function renderCalendar() {
    const year = calMonthCursor.getFullYear();
    const month = calMonthCursor.getMonth();
    calTitle.textContent = `${MONTH_NAMES[month]} ${year}`;

    const todayIso = dateISO();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first grid

    calGrid.innerHTML = "";

    for (let i = 0; i < leadingBlanks; i++) {
      const blank = document.createElement("span");
      blank.className = "cal-day cal-day-empty";
      calGrid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = dateISO(new Date(year, month, day));
      const total = dayTotalMs(dateKey);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-day";
      btn.dataset.date = dateKey;
      if (dateKey === todayIso) btn.classList.add("cal-day-today");
      if (dateKey === calSelectedDate) btn.classList.add("cal-day-selected");
      if (total > 0) {
        const intensity = Math.min(1, total / (8 * 3600 * 1000));
        btn.style.setProperty("--intensity", intensity.toFixed(2));
        btn.classList.add("cal-day-has-data");
      }

      const num = document.createElement("span");
      num.className = "cal-day-num";
      num.textContent = String(day);
      btn.appendChild(num);

      if (total > 0) {
        const totalEl = document.createElement("span");
        totalEl.className = "cal-day-total";
        totalEl.textContent = fmtCompact(total);
        btn.appendChild(totalEl);
      }

      btn.addEventListener("click", () => {
        calSelectedDate = dateKey;
        renderCalendar();
      });

      calGrid.appendChild(btn);
    }

    renderCalendarDetail();
  }

  function renderCalendarDetail() {
    const d = new Date(calSelectedDate + "T00:00:00");
    const weekday = WEEKDAY_NAMES[d.getDay()];
    calDetailDate.textContent = `${weekday}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;

    const breakdown = dayBreakdown(calSelectedDate);
    calDetailList.innerHTML = "";
    calDetailEmpty.hidden = breakdown.length !== 0;

    let total = 0;
    for (const { name, ms } of breakdown) {
      total += ms;
      const row = document.createElement("div");
      row.className = "cal-detail-row";
      row.innerHTML = `<span class="cal-detail-name">${escapeHtml(name)}</span><span class="cal-detail-value">${fmt(ms)}</span>`;
      calDetailList.appendChild(row);
    }
    calDetailTotal.textContent = breakdown.length ? `Total: ${fmt(total)}` : "";
  }

  function refreshCalendarIfOpen() {
    if (calSection.hidden) return;
    renderCalendar();
  }

  calOpenBtn.addEventListener("click", toggleCalendar);
  calPrevBtn.addEventListener("click", () => {
    calMonthCursor.setMonth(calMonthCursor.getMonth() - 1);
    renderCalendar();
  });
  calNextBtn.addEventListener("click", () => {
    calMonthCursor.setMonth(calMonthCursor.getMonth() + 1);
    renderCalendar();
  });

  // Native confirm()/alert() are unreliable inside an installed iOS PWA
  // (Safari suppresses them in standalone mode), so confirmation is a
  // plain "click again to confirm" arm/disarm cycle on the button itself.
  function armConfirm(btn, idleLabel, confirmLabel, onConfirm, iconOnly = false) {
    let armed = false;
    let timer = null;

    const disarm = () => {
      armed = false;
      btn.classList.remove("confirming");
      if (!iconOnly) btn.textContent = idleLabel;
      clearTimeout(timer);
    };

    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.classList.add("confirming");
        if (!iconOnly) btn.textContent = confirmLabel;
        timer = setTimeout(disarm, 2800);
        return;
      }
      clearTimeout(timer);
      onConfirm();
    });
  }

  function startRename(nameEl, id) {
    nameEl.contentEditable = "true";
    nameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const commit = () => {
      nameEl.contentEditable = "false";
      const val = nameEl.textContent.trim().slice(0, 40);
      const p = projects.find((x) => x.id === id);
      if (val) {
        p.name = val;
        save();
      }
      nameEl.textContent = p.name;
      nameEl.removeEventListener("blur", commit);
    };
    nameEl.addEventListener("blur", commit, { once: true });
  }

  function renderSummary() {
    if (projects.length === 0) {
      summarySection.hidden = true;
      return;
    }
    summarySection.hidden = false;
    summaryList.innerHTML = "";

    const withTotals = projects.map((p) => ({ p, total: liveElapsed(p) }));
    const max = Math.max(1, ...withTotals.map((x) => x.total));
    withTotals.sort((a, b) => b.total - a.total);

    for (const { p, total } of withTotals) {
      const row = document.createElement("div");
      row.className = "summary-row";
      row.innerHTML = `
        <span class="summary-name">${escapeHtml(p.name)}</span>
        <span class="summary-bar-track"><span class="summary-bar-fill" style="width:${(total / max) * 100}%"></span></span>
        <span class="summary-value">${fmt(total)}</span>
      `;
      summaryList.appendChild(row);
    }

    const grandToday = projects.reduce((sum, p) => sum + liveToday(p), 0);
    grandTotalValue.textContent = fmt(grandToday);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Live tick (no full re-render, just text updates) ----------

  function tick() {
    let anyRunning = false;
    for (const p of projects) {
      if (!p.isRunning) continue;
      anyRunning = true;
      const card = grid.querySelector(`.card[data-id="${p.id}"]`);
      if (!card) continue;
      card.querySelector(".digits").textContent = fmt(liveElapsed(p));
      card.querySelector(".stat-today").textContent = fmt(liveToday(p));
      card.querySelector(".stat-total").textContent = fmt(liveElapsed(p));
      const todayRow = card.querySelector(".day-item-today .day-value");
      if (todayRow) todayRow.textContent = fmt(liveToday(p));
    }
    if (anyRunning) {
      renderSummary();
      refreshCalendarIfOpen();
      document.title = "● Multicrono";
    }
  }

  // ---------- Actions ----------

  function addProject(name) {
    projects.push({
      id: uid(),
      name,
      totalMs: 0,
      isRunning: false,
      startedAt: null,
      notes: [],
      history: {},
    });
    save();
    renderAll();
  }

  function toggleProject(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (!p.history) p.history = {};

    if (p.isRunning) {
      const delta = Date.now() - p.startedAt;
      p.totalMs += delta;
      const dateKey = dateISO();
      p.history[dateKey] = (p.history[dateKey] || 0) + delta;
      p.isRunning = false;
      p.startedAt = null;
    } else {
      p.isRunning = true;
      p.startedAt = Date.now();
    }
    save();
    renderAll();
  }

  function resetProject(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    p.totalMs = 0;
    p.history = {};
    p.isRunning = false;
    p.startedAt = null;
    save();
    renderAll();
    showToast(`"${p.name}" reiniciado`);
  }

  function addNote(id, text, cardNode) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    if (!p.notes) p.notes = [];
    p.notes.push({ id: uid(), text: text.slice(0, 200), at: Date.now(), elapsedMs: liveElapsed(p) });
    save();
    cardNode.querySelector(".notes-count").textContent = p.notes.length;
    renderNotesList(cardNode.querySelector(".notes-list"), p);
  }

  function deleteNote(projectId, noteId, listEl) {
    const p = projects.find((x) => x.id === projectId);
    if (!p) return;
    p.notes = (p.notes || []).filter((n) => n.id !== noteId);
    save();
    const cardNode = listEl.closest(".card");
    cardNode.querySelector(".notes-count").textContent = p.notes.length;
    renderNotesList(listEl, p);
  }

  function deleteProject(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    projects = projects.filter((x) => x.id !== id);
    save();
    renderAll();
    showToast(`"${p.name}" eliminado`);
  }

  // ---------- Backup / restore ----------

  function exportData() {
    const payload = {
      app: "multicrono",
      exportedAt: new Date().toISOString(),
      projects,
    };
    const json = JSON.stringify(payload, null, 2);
    const stamp = dateISO().replace(/-/g, "");
    const filename = `multicrono-backup-${stamp}.json`;

    // The Android wrapper's WebView has no native handling for blob://
    // download links, so app.js hands the file to it directly when present.
    if (window.AndroidBridge && window.AndroidBridge.saveFile) {
      const base64 = btoa(unescape(encodeURIComponent(json)));
      window.AndroidBridge.saveFile(base64, filename);
      return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Copia de seguridad descargada");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let incoming;
      try {
        const parsed = JSON.parse(reader.result);
        incoming = Array.isArray(parsed) ? parsed : parsed.projects;
        if (!Array.isArray(incoming)) throw new Error("formato inesperado");
      } catch {
        showToast("Ese archivo no es una copia de seguridad válida");
        return;
      }

      // Merge by id: never deletes what's already here, only adds or
      // overwrites matching projects, so a bad/old backup can't wipe data.
      let added = 0;
      let updated = 0;
      for (const raw of incoming) {
        if (!raw || !raw.id || !raw.name) continue;
        const clean = {
          id: raw.id,
          name: raw.name,
          totalMs: Number(raw.totalMs) || 0,
          isRunning: false,
          startedAt: null,
          notes: Array.isArray(raw.notes) ? raw.notes : [],
          history: raw.history && typeof raw.history === "object" ? raw.history : {},
        };
        const idx = projects.findIndex((p) => p.id === clean.id);
        if (idx === -1) { projects.push(clean); added++; }
        else { projects[idx] = clean; updated++; }
      }

      save();
      renderAll();
      showToast(`Restaurado: ${added} nuevo(s), ${updated} actualizado(s)`);
    };
    reader.readAsText(file);
  }

  exportBtn.addEventListener("click", exportData);
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files[0];
    if (file) importData(file);
    importFileInput.value = "";
  });

  // ---------- Init ----------

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    addProject(name);
    nameInput.value = "";
    nameInput.focus();
  });

  // Persist banked time before the tab actually closes, so a running
  // timer never silently loses the seconds since its last tick.
  window.addEventListener("beforeunload", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });

  renderAll();
  setInterval(tick, 1000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
