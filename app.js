/**
 * Slepá mapa ČR – Hlavní aplikační logika
 */

const CONFIG = {
  mapCenter: [49.8175, 15.4730],
  defaultZoom: 8,
  minZoom: 7,
  maxZoom: 10,
  roundTime: 30,
  toleranceKm: 30
};

// Aplikační stav
const state = {
  map: null,
  targets: [],
  currentIndex: 0,
  currentTarget: null,
  score: 0,
  timer: null,
  timeLeft: CONFIG.roundTime,
  userLatLng: null,
  isAnswered: false,
  
  markers: {
    userMarker: null,
    targetMarker: null,
    polyline: null
  },
  
  abortController: null
};

// Inicializace po načtení stránky
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEventListeners();
  loadSelectedJson();
});

function initEventListeners() {
  const jsonSelect = document.getElementById("json-select");
  const nextBtn = document.getElementById("next-btn");
  const nextHeaderBtn = document.getElementById("next-header-btn");
  const confirmBtn = document.getElementById("confirm-btn");

  if (jsonSelect) jsonSelect.addEventListener("change", loadSelectedJson);
  if (nextBtn) nextBtn.addEventListener("click", nextRound);
  if (nextHeaderBtn) nextHeaderBtn.addEventListener("click", nextRound);
  
  // Přímé navázání na tlačítko Hotovo
  if (confirmBtn) {
    confirmBtn.onclick = (e) => {
      e.preventDefault();
      evaluateAnswer();
    };
  }
}

/**
 * Inicializace Leaflet mapy – oddělené čisté vrstvy
 */
function initMap() {
  // 1. ZÁKLAD: Čistá podkladová mapa (Voyager No Labels - pouze Pevnina/Voda)
  const baseSlepaMapa = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{y}/{x}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: CONFIG.maxZoom,
    minZoom: CONFIG.minZoom
  });

  // 2. VRSTVA: Pouze hranice krajů a státu (CartoDB Boundaries)
  const overlayHranice = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{y}/{x}{r}.png', {
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    maxZoom: CONFIG.maxZoom,
    minZoom: CONFIG.minZoom,
    opacity: 0.6
  });

  // 3. VRSTVA: Pouze popisky a bodové značky
  const overlayPopisky = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: CONFIG.maxZoom,
    minZoom: CONFIG.minZoom,
    opacity: 0.85
  });

  state.map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,
    layers: [baseSlepaMapa]
  }).setView(CONFIG.mapCenter, CONFIG.defaultZoom);

  const overlayMaps = {
    "Hranice krajů": overlayHranice,
    "Popisky a názvy": overlayPopisky
  };

  L.control.layers(null, overlayMaps, { collapsed: true }).addTo(state.map);
  state.map.on('click', handleMapClick);
}

/**
 * Načtení dat podle výběru v rozbalovacím menu
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
      throw new Error("Načtený JSON neobsahuje platná data.");
    }

    state.targets = data;
    state.currentIndex = 0;
    
    nextRound();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error("Chyba při načítání JSON dat:", err);
    
    const targetElem = document.getElementById("target-name");
    if (targetElem) targetElem.textContent = `Nenalezen soubor ${fileName}!`;
  }
}

/**
 * Spuštění nového kola (postupně v pořadí JSONu)
 */
function nextRound() {
  hideModal();
  clearInterval(state.timer);
  clearMapLayers();

  state.userLatLng = null;
  state.isAnswered = false;

  const confirmBtn = document.getElementById("confirm-btn");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.classList.remove("btn-success", "btn-danger");
    confirmBtn.classList.add("btn-warning");
    confirmBtn.textContent = "Hotovo ✓";
  }

  if (!state.targets || state.targets.length === 0) return;

  if (state.currentIndex >= state.targets.length) {
    state.currentIndex = 0;
  }

  state.currentTarget = state.targets[state.currentIndex];
  state.currentIndex++;

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

  if (!state.markers.userMarker) {
    state.markers.userMarker = L.circleMarker(state.userLatLng, {
      radius: 9,
      fillColor: '#ff922b',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(state.map);
  } else {
    state.markers.userMarker.setLatLng(state.userLatLng);
  }

  // Aktivujeme tlačítko Hotovo
  const confirmBtn = document.getElementById("confirm-btn");
  if (confirmBtn) confirmBtn.disabled = false;
}

/**
 * Vyhodnocení správnosti po stisknutí HOTOVO
 */
function evaluateAnswer() {
  if (state.isAnswered || !state.userLatLng || !state.currentTarget) return;

  state.isAnswered = true;
  clearInterval(state.timer);

  const targetLatLng = L.latLng(state.currentTarget.coords[0], state.currentTarget.coords[1]);
  const distanceKm = Math.round(state.userLatLng.distanceTo(targetLatLng) / 1000);
  const isSuccess = distanceKm <= CONFIG.toleranceKm;

  // Změna barvy bodu z oranžové na Zelenou (trefa) nebo Červenou (vedle)
  const finalColor = isSuccess ? '#198754' : '#dc3545';
  state.markers.userMarker.setStyle({ fillColor: finalColor });

  // Správný cíl (Černá tečka)
  state.markers.targetMarker = L.circleMarker(targetLatLng, {
    radius: 7,
    fillColor: '#212529',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1
  }).addTo(state.map);

  // Čárkovaná čára spojující tip se správným místem
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
    `Vedle o <strong>${distanceKm} km</strong>.<br>Tolerance pro získání bodu je ${CONFIG.toleranceKm} km.`
  );
}

/**
 * Vypršení časového limitu
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
 * Časovač
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
 * Pomocné vyčištění a UI funkce
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
