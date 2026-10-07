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
  userLatLng: null,
  isAnswered: false,
  
  // Vrstvy na mapě
  markers: {
    userMarker: null,
    targetMarker: null,
    polyline: null
  },
  
  abortController: null
};

// Inicializace aplikace po načtení DOM
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEventListeners();
  loadSelectedJson();
});

/**
 * Registrace posluchačů událostí
 */
function initEventListeners() {
  const jsonSelect = document.getElementById("json-select");
  const nextBtn = document.getElementById("next-btn");
  const nextHeaderBtn = document.getElementById("next-header-btn");
  const confirmBtn = document.getElementById("confirm-btn");

  if (jsonSelect) jsonSelect.addEventListener("change", loadSelectedJson);
  if (nextBtn) nextBtn.addEventListener("click", nextRound);
  if (nextHeaderBtn) nextHeaderBtn.addEventListener("click", nextRound);
  if (confirmBtn) confirmBtn.addEventListener("click", evaluateAnswer);
}

/**
 * Inicializace Leaflet mapy (Čisté Esri ArcGIS vrstvy bez API klíče)
 */
function initMap() {
  // Základní slepá mapa
  const baseSlepaMapa = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    minZoom: 7
  });

  // Hranice
  const overlayHranice = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.65
  });

  // Popisky
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
  const fileName = selectElem ? selectElem.value : "zajimavosti.json";

  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  try {
    const response = await fetch(`${fileName}?v=${Date.now()}`, { signal: state.abortController.signal });
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
    if (targetElem) targetElem.textContent = `Nenalezen soubor ${fileName}!`;
  }
}

/**
 * Zahájení nového kola
 */
function nextRound() {
  hideModal();
  clearInterval(state.timer);
  clearMapLayers();

  state.userLatLng = null;
  state.isAnswered = false;

  // Deaktivace tlačítka Hotovo
  const confirmBtn = document.getElementById("confirm-btn");
  if (confirmBtn) confirmBtn.disabled = true;

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
 * Kliknutí do mapy – pokládá / přesouvá ORANŽOVÝ bod
 */
function handleMapClick(e) {
  if (state.isAnswered || !state.currentTarget) return;

  state.userLatLng = L.latLng(e.latlng.lat, e.latlng.lng);

  // Pokud bod ještě neexistuje, vytvoříme ho
  if (!state.markers.userMarker) {
    state.markers.userMarker = L.circleMarker(state.userLatLng, {
      radius: 9,
      fillColor: '#ff922b', // Oranžová barva pro nastavení tipu
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(state.map);
  } else {
    // Jinak ho pouze posuneme na nové místo
    state.markers.userMarker.setLatLng(state.userLatLng);
  }

  // Povolíme tlačítko Hotovo
  const confirmBtn = document.getElementById("confirm-btn");
  if (confirmBtn) confirmBtn.disabled = false;
}

/**
 * Vyhodnocení tipu po kliknutí na tlačítko "Hotovo"
 */
function evaluateAnswer() {
  if (state.isAnswered || !state.userLatLng) return;

  state.isAnswered = true;
  clearInterval(state.timer);

  const targetLatLng = L.latLng(state.currentTarget.coords[0], state.currentTarget.coords[1]);
  const distanceKm = Math.round(state.userLatLng.distanceTo(targetLatLng) / 1000);
  const isSuccess = distanceKm <= CONFIG.toleranceKm;

  // Změna barvy uživatelského bodu podle výsledku
  const finalColor = isSuccess ? '#198754' : '#dc3545'; // Zelená vs Červená
  state.markers.userMarker.setStyle({ fillColor: finalColor });

  // Vykreslení přesného cíle (černá tečka)
  state.markers.targetMarker = L.circleMarker(targetLatLng, {
    radius: 7,
    fillColor: '#212529',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1
  }).addTo(state.map);

  // Čárkovaná čára propojující tip a cíl
  state.markers.polyline = L.polyline([state.userLatLng, targetLatLng], {
    color: finalColor,
    weight: 3,
    dashArray: '5, 8'
  }).addTo(state.map);

  if (isSuccess) {
    state.score += 1;
    updateScoreUI();
  }

  showModal(
    isSuccess ? 'Výborně!' : 'Mimo toleranci',
    `Vedle o <strong>${distanceKm} km</strong>.<br>Tolerance pro bod je ${CONFIG.toleranceKm} km.`
  );
}

/**
 * Vypršení času
 */
function handleTimeout() {
  if (state.isAnswered) return;
  state.isAnswered = true;

  const targetLatLng = L.latLng(state.currentTarget.coords[0], state.currentTarget.coords[1]);

  state.markers.targetMarker = L.circleMarker(targetLatLng, {
    radius: 9,
    fillColor: '#dc3545',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1
  }).addTo(state.map);

  showModal('Čas vypršel!', `Správná poloha pro <strong>${state.currentTarget.name}</strong> byla zobrazena na mapě.`);
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
      handleTimeout();
    }
  }, 1000);
}

/**
 * Pomocné funkce
 */
function clearMapLayers() {
  Object.keys(state.markers).forEach(key => {
    if (state.markers[key]) {
      state.map.removeLayer(state.markers[key]);
      state.markers[key] = null;
    }
  });
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
  if (textElem) textElem.innerHTML = text;
  if (overlayElem) overlayElem.style.display = "flex";
}

function hideModal() {
  const overlayElem = document.getElementById("overlay");
  if (overlayElem) overlayElem.style.display = "none";
}
