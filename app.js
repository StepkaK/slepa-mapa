/**
 * Slepá mapa ČR – Hlavní aplikační logika
 */

const CONFIG = {
  mapCenter: [49.8175, 15.4730],
  defaultZoom: 8,
  roundTime: 30,
  toleranceKm: 30
};

// Aplikační stav
const state = {
  map: null,
  targets: [],
  availableTargets: [],
  currentTarget: null,
  score: 0,
  timer: null,
  timeLeft: CONFIG.roundTime,
  activeMarker: null,
  abortController: null
};

// Inicializace aplikace
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEventListeners();
  loadSelectedJson();
});

/**
 * Navázání událostí na prvky
 */
function initEventListeners() {
  const jsonSelect = document.getElementById("json-select");
  const nextBtn = document.getElementById("next-btn");
  const nextHeaderBtn = document.getElementById("next-header-btn");

  if (jsonSelect) {
    jsonSelect.addEventListener("change", loadSelectedJson);
  }
  
  if (nextBtn) {
    nextBtn.addEventListener("click", nextRound);
  }

  if (nextHeaderBtn) {
    nextHeaderBtn.addEventListener("click", nextRound);
  }
}

/**
 * Inicializace Leaflet mapy (Pouze Esri ArcGIS vrstvy)
 */
function initMap() {
  // 1. ZÁKLAD: Čistá slepá mapa (Esri World Light Gray Base)
  const baseSlepaMapa = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
    minZoom: 7
  });

  // 2. VRSTVA: Hranice (Esri World Boundaries and Places)
  const overlayHranice = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.65
  });

  // 3. VRSTVA: Popisky (Esri Canvas Light Reference)
  const overlayPopisky = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.85
  });

  state.map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false,
    layers: [baseSlepaMapa]
  }).setView(CONFIG.mapCenter, CONFIG.defaultZoom);

  const overlayMaps = {
    "Hranice": overlayHranice,
    "Popisky a názvy": overlayPopisky
  };

  L.control.layers(null, overlayMaps, { collapsed: true }).addTo(state.map);
  state.map.on('click', handleMapClick);
}

/**
 * Načtení datové sady podle výběru
 */
async function loadSelectedJson() {
  const selectElem = document.getElementById("json-select");
  const fileName = selectElem ? selectElem.value : "mesta.json";

  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  try {
    const response = await fetch(fileName, { signal: state.abortController.signal });
    if (!response.ok) {
      throw new Error(`HTTP chyba ${response.status} při načítání ${fileName}`);
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Načtený JSON neobsahuje platné pole cílů.");
    }

    state.targets = data;
    state.availableTargets = [...data];
    
    nextRound();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error("Chyba při načítání JSON dat:", err);
    
    const targetElem = document.getElementById("target-name");
    if (targetElem) targetElem.textContent = "Chyba načítání dat";
  }
}

/**
 * Zahájení nového kola
 */
function nextRound() {
  hideModal();
  clearInterval(state.timer);

  if (state.activeMarker) {
    state.map.removeLayer(state.activeMarker);
    state.activeMarker = null;
  }

  if (state.availableTargets.length === 0) {
    state.availableTargets = [...state.targets];
  }

  const randomIndex = Math.floor(Math.random() * state.availableTargets.length);
  state.currentTarget = state.availableTargets.splice(randomIndex, 1)[0];

  const targetElem = document.getElementById("target-name");
  if (targetElem && state.currentTarget) {
    targetElem.textContent = state.currentTarget.name;
  }

  resetTimer();
}

/**
 * Zpracování kliknutí do mapy
 */
function handleMapClick(e) {
  if (!state.currentTarget || state.timeLeft <= 0) return;

  clearInterval(state.timer);

  const clickedCoords = [e.latlng.lat, e.latlng.lng];
  const distance = calculateDistance(clickedCoords, state.currentTarget.coords);

  state.activeMarker = L.marker(state.currentTarget.coords).addTo(state.map);

  let title = "";
  let text = "";

  if (distance <= CONFIG.toleranceKm) {
    state.score += 1;
    updateScoreUI();
    title = "Výborně!";
    text = `Vedle o ${Math.round(distance)} km. Získáváš 1 bod.`;
  } else {
    title = "Vedle!";
    text = `Cíl byl vzdálený ${Math.round(distance)} km od tvého tipu.`;
  }

  showModal(title, text);
}

/**
 * Správa časovače
 */
function resetTimer() {
  clearInterval(state.timer);
  state.timeLeft = CONFIG.roundTime;
  
  updateTimerUI();

  state.timer = setInterval(() => {
    state.timeLeft--;
    updateTimerUI();

    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      showModal("Čas vypršel!", `Správné místo bylo: ${state.currentTarget.name}`);
      state.activeMarker = L.marker(state.currentTarget.coords).addTo(state.map);
    }
  }, 1000);
}

/**
 * Pomocné funkce
 */
function calculateDistance(coords1, coords2) {
  const R = 6371;
  const dLat = (coords2[0] - coords1[0]) * Math.PI / 180;
  const dLon = (coords2[1] - coords1[1]) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) ** 2 +
    Math.cos(coords1[0] * Math.PI / 180) * Math.cos(coords2[0] * Math.PI / 180) * 
    Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function updateScoreUI() {
  const scoreElem = document.getElementById("score");
  if (scoreElem) scoreElem.textContent = state.score;
}

function updateTimerUI() {
  const timerElem = document.getElementById("timer");
  if (timerElem) timerElem.textContent = state.timeLeft;
}

function showModal(title, text) {
  const titleElem = document.getElementById("modal-title");
  const textElem = document.getElementById("modal-text");
  const overlayElem = document.getElementById("overlay");

  if (titleElem) titleElem.textContent = title;
  if (textElem) textElem.textContent = text;
  if (overlayElem) overlayElem.style.display = "flex";
}

function hideModal() {
  const overlayElem = document.getElementById("overlay");
  if (overlayElem) overlayElem.style.display = "none";
}
