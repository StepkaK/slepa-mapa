/**
 * Slepa Mapa ČR - Herní Logika
 */

// === CONFIG & STAV ===
const CONFIG = {
  maxDistanceKm: 30,
  timeLimit: 30,
  mapCenter: [49.8175, 15.4730],
  defaultZoom: 8
};

const state = {
  locations: [],
  currentIndex: 0,
  score: 0,
  timer: CONFIG.timeLimit,
  timerInterval: null,
  isAnswered: false
};

// Mapové objekty
let map = null;
const mapLayers = { userMarker: null, targetMarker: null, polyline: null };

// === INICIALIZACE ===
window.onload = () => {
  initMap();
  loadLocations();
};

function initMap() {
  const baseSlepaMapa = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom: 10, minZoom: 7
  });

 
  const overlayKraje = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom: 10, opacity: 0.8
  });

  map = L.map('map', { zoomControl: true, doubleClickZoom: false, layers: [baseSlepaMapa] })
    .setView(CONFIG.mapCenter, CONFIG.defaultZoom);

  L.control.layers(null, {
    "Kraje": overlayKraje,
  }, { position: 'topright' }).addTo(map);

  map.on('click', handleMapClick);
}

// === NAČÍTÁNÍ DAT ===
function loadLocations() {
  fetch('zajimavosti.json')
    .then(res => {
      if (!res.ok) throw new Error('Nelze načíst soubor JSON');
      return res.json();
    })
    .then(data => {
      state.locations = data.sort(() => 0.5 - Math.random());
      state.locations.length > 0 ? startGame() : updateTargetText('Soubor JSON je prázdný!');
    })
    .catch(err => {
      console.error(err);
      updateTargetText('Chyba při načítání dat!');
    });
}

// === HERNÍ SMYČKA ===
function startGame() {
  state.currentIndex = 0;
  state.score = 0;
  updateScoreUI();
  setupRound();
}

function setupRound() {
  state.isAnswered = false;
  clearMapLayers();
  
  const currentTarget = state.locations[state.currentIndex];
  updateTargetText(currentTarget.name);

  startTimer();
}

function handleMapClick(e) {
  if (state.isAnswered || state.locations.length === 0) return;
  
  state.isAnswered = true;
  stopTimer();

  const target = state.locations[state.currentIndex];
  const userLatLng = L.latLng(e.latlng.lat, e.latlng.lng);
  const targetLatLng = L.latLng(target.lat, target.lon);
  
  const distanceKm = Math.round(userLatLng.distanceTo(targetLatLng) / 1000);
  const isSuccess = distanceKm <= CONFIG.maxDistanceKm;

  renderResultOnMap(userLatLng, targetLatLng, isSuccess);

  if (isSuccess) {
    state.score++;
    updateScoreUI();
  }

  showModal(
    isSuccess ? 'Skvělý tip!' : 'Mimo toleranci',
    `Chyba: <strong>${distanceKm} km</strong>.<br>Tolerance pro zisk bodu je ${CONFIG.maxDistanceKm} km.`
  );
}

function handleTimeout() {
  if (state.isAnswered) return;
  state.isAnswered = true;

  const target = state.locations[state.currentIndex];
  
  mapLayers.targetMarker = L.circleMarker([target.lat, target.lon], {
    radius: 9, fillColor: '#dc3545', color: '#ffffff', weight: 2, fillOpacity: 1
  }).addTo(map);

  showModal('Čas vypršel!', `Správná poloha byla zobrazena na mapě.`);
}

function nextRound() {
  hideModal();
  state.currentIndex++;

  if (state.currentIndex < state.locations.length) {
    setupRound();
  } else {
    alert(`Konec hry! Tvoje celkové skóre je ${state.score} z ${state.locations.length} bodů.`);
    startGame();
  }
}

// === ČASOVAČ ===
function startTimer() {
  state.timer = CONFIG.timeLimit;
  updateTimerUI();
  stopTimer();
  
  state.timerInterval = setInterval(() => {
    state.timer--;
    updateTimerUI();
    if (state.timer <= 0) {
      stopTimer();
      handleTimeout();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
}

// === PRÁCE S MAPOVÝMI PRVKY ===
function renderResultOnMap(userLatLng, targetLatLng, isSuccess) {
  const markerColor = isSuccess ? '#198754' : '#dc3545';

  mapLayers.userMarker = L.circleMarker(userLatLng, {
    radius: 9, fillColor: markerColor, color: '#ffffff', weight: 2, fillOpacity: 0.9
  }).addTo(map);

  mapLayers.targetMarker = L.circleMarker(targetLatLng, {
    radius: 7, fillColor: '#212529', color: '#ffffff', weight: 2, fillOpacity: 1
  }).addTo(map);

  mapLayers.polyline = L.polyline([userLatLng, targetLatLng], {
    color: markerColor, weight: 4, dashArray: '6, 8'
  }).addTo(map);
}

function clearMapLayers() {
  Object.keys(mapLayers).forEach(key => {
    if (mapLayers[key]) {
      map.removeLayer(mapLayers[key]);
      mapLayers[key] = null;
    }
  });
}

// === POMOCNÉ UI FUNKCE ===
function updateScoreUI() { document.getElementById('score').innerText = state.score; }
function updateTimerUI() { document.getElementById('timer').innerText = state.timer; }
function updateTargetText(text) { document.getElementById('target-name').innerText = text; }

function showModal(title, text) {
  setTimeout(() => {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerHTML = text;
    document.getElementById('overlay').style.display = 'flex';
  }, 400);
}

function hideModal() {
  document.getElementById('overlay').style.display = 'none';
}
