const HISTORY_KEY = "scanplate_history";
const FAT_OPTIONS = ["Je ne sais pas", "Huile d'olive", "Beurre", "Autre huile", "Aucune"];

// ---------- État courant de l'écran résultat ----------
let currentImageDataUrl = null;
let currentImageBase64 = null;
let currentImageMimeType = null;
let currentResult = null;       // { foods:[{id,name,estimatedGrams,calories,proteins,carbs,fats}], totalCalories, totalProteins, totalCarbs, totalFats }
let currentRecordId = null;     // id du scan dans l'historique local
let hasBeenRefined = false;
let cameFromScreen = "screen-home";
let selectedFatType = FAT_OPTIONS[0];

// ---------- Références DOM ----------
const el = (id) => document.getElementById(id);

// ---------- Navigation entre écrans (= NavigationStack / TabView) ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.target === id));
  if (id === "screen-history") renderHistory();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

el("btn-back").addEventListener("click", () => showScreen(cameFromScreen));

// ---------- Feuille : choisir une photo (= confirmationDialog) ----------
el("btn-scan").addEventListener("click", () => el("source-sheet").classList.add("active"));
el("btn-cancel-source").addEventListener("click", () => el("source-sheet").classList.remove("active"));
["input-camera", "input-gallery"].forEach((id) => {
  el(id).parentElement; // no-op, garde la structure claire
  document.querySelector(`label[for="${id}"]`).addEventListener("click", () => {
    el("source-sheet").classList.remove("active");
  });
});

el("input-camera").addEventListener("change", (e) => handleNewPhoto(e.target.files[0]));
el("input-gallery").addEventListener("change", (e) => handleNewPhoto(e.target.files[0]));

async function handleNewPhoto(file) {
  if (!file) return;
  el("input-camera").value = "";
  el("input-gallery").value = "";

  const { base64, mimeType, dataUrl } = await fileToBase64(file);
  currentImageDataUrl = dataUrl;
  currentImageBase64 = base64;
  currentImageMimeType = mimeType;
  currentResult = null;
  currentRecordId = null;
  hasBeenRefined = false;
  cameFromScreen = "screen-home";

  el("result-title").textContent = "Résultat";
  el("result-photo").src = dataUrl;
  showScreen("screen-result");
  await analyze();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve({ base64: dataUrl.split(",")[1], mimeType: file.type, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Analyse initiale (= GeminiVisionService.analyze) ----------
async function analyze() {
  el("loading-state").style.display = "block";
  el("error-state").style.display = "none";
  el("result-body").style.display = "none";

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "analyze",
        imageBase64: currentImageBase64,
        mimeType: currentImageMimeType
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur inconnue");

    currentResult = data;
    currentRecordId = addHistoryRecord(data, currentImageDataUrl);
    el("loading-state").style.display = "none";
    renderResult();
  } catch (err) {
    el("loading-state").style.display = "none";
    el("error-state").style.display = "block";
    el("error-text").textContent = err.message;
  }
}

el("btn-retry").addEventListener("click", () => analyze());

// ---------- Affichage du résultat (= resultContent) ----------
function renderResult() {
  const r = currentResult;
  el("refined-badge").style.display = hasBeenRefined ? "block" : "none";
  el("v-calories").textContent = Math.round(r.totalCalories);
  el("v-proteins").textContent = Math.round(r.totalProteins);
  el("v-carbs").textContent = Math.round(r.totalCarbs);
  el("v-fats").textContent = Math.round(r.totalFats);

  const list = el("food-list");
  list.innerHTML = "";
  r.foods.forEach((f) => {
    const row = document.createElement("div");
    row.className = "food-row";
    row.innerHTML = `
      <div class="food-top">
        <span class="food-name">${escapeHtml(f.name)}</span>
        <span class="food-kcal">${Math.round(f.calories)} kcal</span>
      </div>
      <div class="food-detail">~${Math.round(f.estimatedGrams)} g · P ${Math.round(f.proteins)}g · G ${Math.round(f.carbs)}g · L ${Math.round(f.fats)}g</div>
    `;
    list.appendChild(row);
  });

  el("result-body").style.display = "block";
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Feuille "Affiner le résultat" (= refinementSheet, V2) ----------
el("btn-refine").addEventListener("click", openRefineSheet);
el("btn-cancel-refine").addEventListener("click", () => el("refine-sheet").classList.remove("active"));

function openRefineSheet() {
  const gramsList = el("refine-grams-list");
  gramsList.innerHTML = "";
  currentResult.foods.forEach((f) => {
    const row = document.createElement("div");
    row.className = "gram-row";
    row.innerHTML = `
      <span class="gram-name">${escapeHtml(f.name)}</span>
      <span><input type="number" inputmode="numeric" data-food-id="${f.id}" value="${Math.round(f.estimatedGrams)}" /> g</span>
    `;
    gramsList.appendChild(row);
  });

  selectedFatType = FAT_OPTIONS[0];
  const fatOptionsEl = el("refine-fat-options");
  fatOptionsEl.innerHTML = "";
  FAT_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "fat-option" + (opt === selectedFatType ? " selected" : "");
    row.dataset.value = opt;
    row.innerHTML = `<span>${opt}</span><span class="check">✓</span>`;
    row.addEventListener("click", () => {
      selectedFatType = opt;
      fatOptionsEl.querySelectorAll(".fat-option").forEach((n) => n.classList.toggle("selected", n.dataset.value === opt));
    });
    fatOptionsEl.appendChild(row);
  });

  el("refine-sauce").value = "";
  el("refine-error").style.display = "none";
  el("refine-sheet").classList.add("active");
}

el("btn-confirm-refine").addEventListener("click", refine);

async function refine() {
  const confirmBtn = el("btn-confirm-refine");
  confirmBtn.textContent = "...";
  confirmBtn.disabled = true;

  const adjustedGrams = {};
  document.querySelectorAll("#refine-grams-list input").forEach((input) => {
    const value = parseFloat(input.value.replace(",", "."));
    if (!isNaN(value)) adjustedGrams[input.dataset.foodId] = value;
  });

  const hiddenSauce = el("refine-sauce").value.trim();

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "refine",
        imageBase64: currentImageBase64,
        mimeType: currentImageMimeType,
        previousResult: currentResult,
        refinementAnswers: {
          fatType: selectedFatType === "Je ne sais pas" ? null : selectedFatType,
          hiddenSauce,
          adjustedGrams
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur inconnue");

    currentResult = data;
    hasBeenRefined = true;
    if (currentRecordId) updateHistoryRecord(currentRecordId, data, true);
    el("refine-sheet").classList.remove("active");
    renderResult();
  } catch (err) {
    el("refine-error").textContent = err.message;
    el("refine-error").style.display = "block";
  } finally {
    confirmBtn.textContent = "Recalculer";
    confirmBtn.disabled = false;
  }
}

// ---------- Historique local (= ScanHistoryStore, localStorage au lieu de fichiers) ----------
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function addHistoryRecord(result, thumbnailDataUrl) {
  const history = loadHistory();
  const id = `${Date.now()}`;
  history.unshift({ id, date: new Date().toISOString(), thumbnail: thumbnailDataUrl, result, isRefined: false });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60)));
  return id;
}

function updateHistoryRecord(id, result, isRefined) {
  const history = loadHistory();
  const idx = history.findIndex((r) => r.id === id);
  if (idx === -1) return;
  history[idx] = { ...history[idx], result, isRefined };
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
  const history = loadHistory();
  const listEl = el("history-list");
  listEl.innerHTML = "";

  if (history.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><span class="emoji">🕓</span>Aucun scan pour l'instant<br/><span style="font-size:13px">Tes scans précédents apparaîtront ici.</span></div>`;
    return;
  }

  history.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-row";
    const dateStr = new Date(item.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    row.innerHTML = `
      <img src="${item.thumbnail}" alt="" />
      <div class="meta">
        <div class="kcal-line">
          <span>${Math.round(item.result.totalCalories)} kcal</span>
          ${item.isRefined ? '<span class="affine-tag">✓ Affiné</span>' : ""}
        </div>
        <div class="date-line">${dateStr}</div>
      </div>
    `;
    row.addEventListener("click", () => openExistingRecord(item));
    listEl.appendChild(row);
  });
}

function openExistingRecord(item) {
  currentImageDataUrl = item.thumbnail;
  currentImageBase64 = item.thumbnail.split(",")[1];
  currentImageMimeType = item.thumbnail.substring(5, item.thumbnail.indexOf(";"));
  currentResult = item.result;
  currentRecordId = item.id;
  hasBeenRefined = item.isRefined;
  cameFromScreen = "screen-history";

  el("result-title").textContent = "Détail du scan";
  el("result-photo").src = item.thumbnail;
  el("loading-state").style.display = "none";
  el("error-state").style.display = "none";
  showScreen("screen-result");
  renderResult();
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
