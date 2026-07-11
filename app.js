// ==========================================================================
// ScanPlate — logique de l'app web (fidèle à la V6 de l'app iOS Swift)
// ==========================================================================

const STORAGE_HISTORY_KEY = 'scanplate_history_v1';
const STORAGE_PROFILE_KEY = 'scanplate_profile_v1';

// -------------------- Stockage local (équivalent ScanHistoryStore) --------
const Store = {
  getHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  saveHistory(records) {
    try { localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(records)); }
    catch (e) { console.error('Stockage historique plein', e); }
  },
  addRecord(imageDataUrl, result) {
    const records = Store.getHistory();
    const id = crypto.randomUUID();
    const record = { id, date: new Date().toISOString(), imageDataUrl, result, isRefined: false };
    records.unshift(record);
    Store.saveHistory(records);
    return id;
  },
  updateRecord(id, result, isRefined = true) {
    const records = Store.getHistory();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return;
    records[idx] = { ...records[idx], result, isRefined };
    Store.saveHistory(records);
  },
  deleteRecord(id) {
    const records = Store.getHistory().filter(r => r.id !== id);
    Store.saveHistory(records);
  },
  getProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  saveProfile(profile) {
    localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
  }
};

// -------------------- TDEE (équivalent UserProfile.swift) -----------------
function calculateBMR(profile) {
  const { sex, age, weightKg, heightCm } = profile;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}
function calculateTDEE(profile) {
  return calculateBMR(profile) * profile.activity;
}
function calculateGoal(tdee, goal) {
  if (goal === 'lose') return tdee - 500;
  if (goal === 'gain') return tdee + 400;
  return tdee;
}

// -------------------- Navigation entre écrans ------------------------------
const screens = ['home', 'history', 'stats', 'profile'];
function showScreen(name) {
  screens.forEach(s => {
    document.getElementById(`screen-${s}`).hidden = (s !== name);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
  if (name === 'home') renderGoalProgress();
  if (name === 'history') renderHistory();
  if (name === 'stats') renderStats();
  if (name === 'profile') renderProfile();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// -------------------- Toast -------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

// -------------------- HOME : barre de progression (goalProgressView) -------
function renderGoalProgress() {
  const container = document.getElementById('goal-progress-container');
  const profile = Store.getProfile();
  container.innerHTML = '';
  if (!profile) return;

  const tdee = calculateTDEE(profile);
  const goal = calculateGoal(tdee, profile.goal);
  if (!(goal > 0)) return; // garde V5 : objectif nul/négatif

  const today = new Date().toDateString();
  const caloriesToday = Store.getHistory()
    .filter(r => new Date(r.date).toDateString() === today)
    .reduce((sum, r) => sum + (r.result.totalCalories || 0), 0);

  const pct = Math.min(caloriesToday, goal) / goal * 100;
  const over = caloriesToday - goal;

  const card = document.createElement('div');
  card.className = 'goal-card';
  card.innerHTML = `
    <div class="goal-card-header">
      <strong>Aujourd'hui</strong>
      <span class="goal-value">${Math.round(caloriesToday)} / ${Math.round(goal)} kcal</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    ${over > 0 ? `<div class="goal-over">+${Math.round(over)} kcal au-dessus de l'objectif</div>` : ''}
  `;
  container.appendChild(card);
}

// -------------------- SOURCE PICKER (caméra / galerie) ---------------------
const sourceOverlay = document.getElementById('source-picker-overlay');
document.getElementById('btn-open-source-picker').addEventListener('click', () => { sourceOverlay.hidden = false; });
document.getElementById('btn-cancel-source').addEventListener('click', () => { sourceOverlay.hidden = true; });
document.getElementById('btn-take-photo').addEventListener('click', () => {
  sourceOverlay.hidden = true;
  document.getElementById('file-camera').click();
});
document.getElementById('btn-pick-gallery').addEventListener('click', () => {
  sourceOverlay.hidden = true;
  document.getElementById('file-gallery').click();
});
document.getElementById('file-camera').addEventListener('change', handleFileSelected);
document.getElementById('file-gallery').addEventListener('change', handleFileSelected);

function handleFileSelected(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  resizeAndCompressImage(file, 900, 0.72).then(dataUrl => {
    openResultScreen({ mode: 'new', imageDataUrl: dataUrl });
  });
}

// Redimensionne + compresse côté navigateur, équivalent jpegData(compressionQuality:)
function resizeAndCompressImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
        else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// -------------------- RESULT SCREEN -----------------------------------------
let currentRecordId = null;   // id du ScanRecord si on vient de l'historique / après sauvegarde
let currentImageDataUrl = null;
let currentResult = null;
let currentIsRefined = false;

document.getElementById('result-close-btn').addEventListener('click', () => {
  document.getElementById('screen-result').hidden = true;
});

async function openResultScreen({ mode, imageDataUrl, existingRecord }) {
  document.getElementById('screen-result').hidden = false;
  document.getElementById('result-photo').src = imageDataUrl || existingRecord.imageDataUrl;
  document.getElementById('result-body').hidden = true;
  document.getElementById('result-error').hidden = true;
  document.getElementById('result-refined-tag').hidden = true;

  if (mode === 'existing') {
    currentRecordId = existingRecord.id;
    currentImageDataUrl = existingRecord.imageDataUrl;
    currentResult = existingRecord.result;
    currentIsRefined = existingRecord.isRefined;
    renderResultBody();
    return;
  }

  // Nouvelle analyse (V1)
  currentRecordId = null;
  currentImageDataUrl = imageDataUrl;
  currentResult = null;
  currentIsRefined = false;
  document.getElementById('result-loading').hidden = false;

  try {
    const result = await callAnalyze(imageDataUrl);
    document.getElementById('result-loading').hidden = true;
    currentResult = result;
    currentRecordId = Store.addRecord(imageDataUrl, result);
    renderResultBody();
    renderGoalProgress();
  } catch (err) {
    document.getElementById('result-loading').hidden = true;
    showResultError(err);
  }
}

function showResultError(err) {
  const box = document.getElementById('result-error');
  box.hidden = false;
  box.textContent = "Erreur : " + (err && err.message ? err.message : "impossible d'analyser cette photo.");
}

function renderResultBody() {
  const r = currentResult;
  document.getElementById('result-calories').textContent = Math.round(r.totalCalories);
  document.getElementById('result-proteins').textContent = Math.round(r.totalProteins) + 'g';
  document.getElementById('result-carbs').textContent = Math.round(r.totalCarbs) + 'g';
  document.getElementById('result-fats').textContent = Math.round(r.totalFats) + 'g';

  document.getElementById('result-refined-tag').hidden = !currentIsRefined;

  const list = document.getElementById('result-foods-list');
  list.innerHTML = '';
  r.foods.forEach(food => {
    const row = document.createElement('div');
    row.className = 'food-row';
    row.innerHTML = `
      <div>
        <div class="food-name">${escapeHtml(food.name)}</div>
        <div class="food-sub">${Math.round(food.estimatedGrams)} g · P ${Math.round(food.proteins)}g · G ${Math.round(food.carbs)}g · L ${Math.round(food.fats)}g</div>
      </div>
      <div class="food-cals">${Math.round(food.calories)} kcal</div>
    `;
    list.appendChild(row);
  });

  document.getElementById('result-body').hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// -------------------- REFINE (mode avancé V2) -------------------------------
const refineOverlay = document.getElementById('refine-overlay');
document.getElementById('btn-refine').addEventListener('click', openRefineSheet);
document.getElementById('refine-cancel-btn').addEventListener('click', () => { refineOverlay.hidden = true; });

function openRefineSheet() {
  document.getElementById('refine-fat-type').value = '';
  document.getElementById('refine-hidden-sauce').value = '';
  const list = document.getElementById('refine-foods-list');
  list.innerHTML = '';
  currentResult.foods.forEach((food, i) => {
    const row = document.createElement('div');
    row.className = 'refine-food-row';
    row.innerHTML = `
      <div class="refine-food-label"><b>${escapeHtml(food.name)}</b><span>estimation : ${Math.round(food.estimatedGrams)} g</span></div>
      <input class="form-input" type="number" inputmode="decimal" data-food-index="${i}" value="${Math.round(food.estimatedGrams)}">
    `;
    list.appendChild(row);
  });
  refineOverlay.hidden = false;
}

document.getElementById('refine-confirm-btn').addEventListener('click', async () => {
  const fatType = document.getElementById('refine-fat-type').value.trim();
  const hiddenSauce = document.getElementById('refine-hidden-sauce').value.trim();
  const adjustedGrams = {};
  document.querySelectorAll('#refine-foods-list input').forEach(input => {
    const idx = Number(input.dataset.foodIndex);
    const val = parseFloat(input.value);
    if (!isNaN(val)) adjustedGrams[idx] = val;
  });

  refineOverlay.hidden = true;
  document.getElementById('result-body').hidden = true;
  document.getElementById('result-loading').hidden = false;

  try {
    const result = await callRefine(currentImageDataUrl, currentResult, { fatType, hiddenSauce, adjustedGrams });
    document.getElementById('result-loading').hidden = true;
    currentResult = result;
    currentIsRefined = true;
    if (currentRecordId) Store.updateRecord(currentRecordId, result, true);
    renderResultBody();
    renderGoalProgress();
  } catch (err) {
    document.getElementById('result-loading').hidden = true;
    document.getElementById('result-body').hidden = false;
    showToast("Erreur : " + (err && err.message ? err.message : "affinage impossible."));
  }
});

// -------------------- Appels API (proxy serveur, clé cachée) ---------------
async function callAnalyze(imageDataUrl) {
  const base64 = imageDataUrl.split(',')[1];
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 })
  });
  if (!res.ok) throw new Error((await res.text()) || `Erreur serveur (${res.status})`);
  return res.json();
}

async function callRefine(imageDataUrl, previousResult, answers) {
  const base64 = imageDataUrl.split(',')[1];
  const res = await fetch('/api/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, previousResult, ...answers })
  });
  if (!res.ok) throw new Error((await res.text()) || `Erreur serveur (${res.status})`);
  return res.json();
}

// -------------------- HISTORIQUE (V3 cliquable + V4 suppression) -----------
function renderHistory() {
  const records = Store.getHistory();
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  list.innerHTML = '';

  if (records.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  records.forEach(record => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const dateStr = new Date(record.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    row.innerHTML = `
      ${record.imageDataUrl
        ? `<img class="history-thumb" src="${record.imageDataUrl}" alt="">`
        : `<div class="history-thumb-placeholder">🖼️</div>`}
      <div class="history-info">
        <div><span class="history-cals">${Math.round(record.result.totalCalories)} kcal</span>${record.isRefined ? '<span class="history-refined">✓ Affiné</span>' : ''}</div>
        <div class="history-date">${dateStr}</div>
      </div>
      <button class="history-delete" data-id="${record.id}" aria-label="Supprimer">✕</button>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.history-delete')) return;
      openResultScreen({ mode: 'existing', existingRecord: record });
    });
    row.querySelector('.history-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Supprimer ce scan de l\'historique ?')) {
        Store.deleteRecord(record.id);
        renderHistory();
        renderGoalProgress();
      }
    });
    list.appendChild(row);
  });
}

// -------------------- STATS (V6) --------------------------------------------
let statsPeriod = 7;
document.getElementById('stats-period-picker').addEventListener('click', (e) => {
  const btn = e.target.closest('.segmented-btn');
  if (!btn) return;
  document.querySelectorAll('#stats-period-picker .segmented-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  statsPeriod = Number(btn.dataset.period);
  renderStats();
});

function renderStats() {
  const records = Store.getHistory();
  const profile = Store.getProfile();
  const goal = profile ? calculateGoal(calculateTDEE(profile), profile.goal) : null;

  const empty = document.getElementById('stats-empty');
  if (records.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }

  // Regroupe par jour, jours sans scan à 0 (comme la V6 Swift)
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = statsPeriod - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: d, total: 0 });
  }
  records.forEach(r => {
    const rd = new Date(r.date);
    rd.setHours(0, 0, 0, 0);
    const entry = days.find(d => d.date.getTime() === rd.getTime());
    if (entry) entry.total += (r.result.totalCalories || 0);
  });

  drawBarChart(days, goal);

  const avg = days.reduce((s, d) => s + d.total, 0) / days.length;
  document.getElementById('stats-average').textContent =
    `Moyenne : ${Math.round(avg)} kcal/jour sur ${statsPeriod} jours`;
}

function drawBarChart(days, goal) {
  const canvas = document.getElementById('stats-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const padding = { top: 16, right: 16, bottom: 28, left: 16 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  const maxVal = Math.max(goal || 0, ...days.map(d => d.total), 100) * 1.15;

  const barGap = days.length > 10 ? 2 : 6;
  const barW = (chartW / days.length) - barGap;

  days.forEach((d, i) => {
    const x = padding.left + i * (chartW / days.length) + barGap / 2;
    const h = (d.total / maxVal) * chartH;
    const y = padding.top + chartH - h;
    ctx.fillStyle = '#34C759';
    ctx.fillRect(x, y, barW, h);
  });

  // Ligne pointillée : objectif
  if (goal) {
    const y = padding.top + chartH - (goal / maxVal) * chartH;
    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Labels de dates (jour/mois), espacés pour rester lisibles
  ctx.fillStyle = '#6B6B70';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  const labelEvery = days.length <= 7 ? 1 : Math.ceil(days.length / 6);
  days.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== days.length - 1) return;
    const x = padding.left + i * (chartW / days.length) + (chartW / days.length) / 2;
    const label = d.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
    ctx.fillText(label, x, H - 10);
  });
}

// -------------------- PROFIL (V4 TDEE) --------------------------------------
function segmentedSetup(containerId, onChange) {
  const container = document.getElementById(containerId);
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    container.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    onChange(btn.dataset.value);
  });
}
segmentedSetup('profile-sex', () => {});
segmentedSetup('profile-goal', () => {});

function getSegmentedValue(containerId) {
  return document.querySelector(`#${containerId} .segmented-btn.active`).dataset.value;
}
function setSegmentedValue(containerId, value) {
  document.querySelectorAll(`#${containerId} .segmented-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function renderProfile() {
  const profile = Store.getProfile();
  if (!profile) {
    document.getElementById('profile-result').hidden = true;
    return;
  }
  setSegmentedValue('profile-sex', profile.sex);
  setSegmentedValue('profile-goal', profile.goal);
  document.getElementById('profile-age').value = profile.age;
  document.getElementById('profile-weight').value = profile.weightKg;
  document.getElementById('profile-height').value = profile.heightCm;
  document.getElementById('profile-activity').value = String(profile.activity);
  showProfileResult(profile);
}

function showProfileResult(profile) {
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(profile);
  const goal = calculateGoal(tdee, profile.goal);
  document.getElementById('profile-bmr').textContent = `${Math.round(bmr)} kcal`;
  document.getElementById('profile-tdee').textContent = `${Math.round(tdee)} kcal`;
  document.getElementById('profile-daily-goal').textContent = `${Math.round(goal)} kcal`;
  document.getElementById('profile-result').hidden = false;
}

document.getElementById('profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const profile = {
    sex: getSegmentedValue('profile-sex'),
    age: Number(document.getElementById('profile-age').value),
    weightKg: Number(document.getElementById('profile-weight').value),
    heightCm: Number(document.getElementById('profile-height').value),
    activity: Number(document.getElementById('profile-activity').value),
    goal: getSegmentedValue('profile-goal')
  };
  if (!profile.age || !profile.weightKg || !profile.heightCm) {
    showToast('Remplis tous les champs pour calculer ton objectif.');
    return;
  }
  Store.saveProfile(profile);
  showProfileResult(profile);
  showToast('Profil enregistré.');
  renderGoalProgress();
});

// -------------------- Service worker (mise à jour auto du cache) -----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            showToast('ScanPlate a été mis à jour.');
          }
        });
      });
    }).catch(() => {});
  });
}

// -------------------- Init --------------------------------------------------
renderGoalProgress();
