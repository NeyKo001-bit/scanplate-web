const HISTORY_KEY = "scanplate_history";
const DIAL_CIRCUMFERENCE = 2 * Math.PI * 42;

const statusEl = document.getElementById("status");
const resultCard = document.getElementById("result-card");
const foodListEl = document.getElementById("food-list");
const historyListEl = document.getElementById("history-list");
const cameraInput = document.getElementById("camera-input");

// ---------- Onglets ----------
document.querySelectorAll(".tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === id));
  if (id === "view-history") renderHistory();
}

// ---------- Capture + analyse ----------
cameraInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  cameraInput.value = ""; // permet de reprendre la même photo à nouveau plus tard

  setStatus("Analyse de l'assiette en cours…", false);
  resultCard.style.display = "none";

  try {
    const { base64, mimeType, dataUrl } = await fileToBase64(file);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mimeType })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur inconnue");

    setStatus("", false);
    renderResult(data);
    saveToHistory(data, dataUrl);
  } catch (err) {
    setStatus(err.message, true);
  }
});

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: file.type, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Affichage résultat ----------
function renderResult(data) {
  const { foods, totals } = data;

  document.getElementById("total-kcal").textContent = Math.round(totals.calories);
  document.getElementById("total-protein").textContent = `${Math.round(totals.protein)}g`;
  document.getElementById("total-carbs").textContent = `${Math.round(totals.carbs)}g`;
  document.getElementById("total-fat").textContent = `${Math.round(totals.fat)}g`;

  const proteinKcal = totals.protein * 4;
  const carbsKcal = totals.carbs * 4;
  const fatKcal = totals.fat * 9;
  const sumKcal = proteinKcal + carbsKcal + fatKcal || 1;

  setArc("arc-protein", proteinKcal / sumKcal, 0);
  setArc("arc-carbs", carbsKcal / sumKcal, proteinKcal / sumKcal);
  setArc("arc-fat", fatKcal / sumKcal, (proteinKcal + carbsKcal) / sumKcal);

  foodListEl.innerHTML = "";
  foods.forEach((f) => {
    const row = document.createElement("div");
    row.className = "food-row";
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(f.name)}</div>
        <div class="grams">${Math.round(f.estimatedGrams)} g</div>
      </div>
      <div class="kcal">${Math.round(f.calories)} kcal</div>
    `;
    foodListEl.appendChild(row);
  });

  resultCard.style.display = "block";
}

function setArc(id, fraction, offsetFraction) {
  const el = document.getElementById(id);
  const len = fraction * DIAL_CIRCUMFERENCE;
  el.setAttribute("stroke-dasharray", `${len} ${DIAL_CIRCUMFERENCE}`);
  el.setAttribute("stroke-dashoffset", `${-offsetFraction * DIAL_CIRCUMFERENCE}`);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Historique (localStorage) ----------
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(data, thumbnailDataUrl) {
  const history = loadHistory();
  history.unshift({
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    thumbnail: thumbnailDataUrl,
    foods: data.foods,
    totals: data.totals
  });
  // Garde un historique raisonnable pour ne pas saturer le localStorage
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60)));
}

function renderHistory() {
  const history = loadHistory();
  historyListEl.innerHTML = "";

  if (history.length === 0) {
    historyListEl.innerHTML = `<div class="empty-state">Aucun scan pour l'instant.<br/>Ton premier repas scanné apparaîtra ici.</div>`;
    return;
  }

  history.forEach((item) => {
    const el = document.createElement("div");
    el.className = "history-item";
    const date = new Date(item.date);
    const dateStr = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `
      <img src="${item.thumbnail}" alt="" />
      <div class="meta">
        <div class="date">${dateStr}</div>
        <div>${item.foods.length} aliment${item.foods.length > 1 ? "s" : ""}</div>
      </div>
      <div class="kcal">${Math.round(item.totals.calories)}<span style="font-size:10px;color:var(--ink-muted)"> kcal</span></div>
    `;
    el.addEventListener("click", () => {
      renderResult(item);
      showView("view-scan");
    });
    historyListEl.appendChild(el);
  });
}

// ---------- Service worker (installable comme une appli) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
