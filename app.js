/**
 * Slepá mapa ČR – herní logika
 */

// ============================================================
// KONFIGURACE
// ============================================================

const CONFIG = {
  // Maximální vzdálenost od správné lokace pro získání bodu.
  toleranceKm: 30,

  // Čas na jedno kolo v sekundách.
  timeLimit: 30,

  // Výchozí nastavení mapy.
  mapCenter: [49.8175, 15.473],
  defaultZoom: 8,
  minZoom: 7,
  maxZoom: 10,

  // Výchozí JSON.
  defaultLocationsUrl: 'zajimavosti.json',

  // GeoJSON hranic krajů.
  krajeUrl:
    'https://services-eu1.arcgis.com/M6GrekYaMaiKldQY/arcgis/rest/services/hranice_kraj%C5%AF_%C4%8CR/FeatureServer/0/query' +
    '?where=1%3D1' +
    '&outFields=*' +
    '&returnGeometry=true' +
    '&f=geojson',

  // Hranice státního území ČR (ČÚZK – DATA250) pro masku.
  countryBoundaryUrl:
    'https://ags.cuzk.gov.cz/arcgis/rest/services/DATA250/MapServer/0/query' +
    '?where=1%3D1' +
    '&outFields=*' +
    '&returnGeometry=true' +
    '&outSR=4326' +
    '&f=geojson'
};

// ============================================================
// STAV HRY
// ============================================================

const state = {
  locations: [],
  currentIndex: 0,
  score: 0,

  timer: CONFIG.timeLimit,
  timerInterval: null,

  // Byla již odpověď vyhodnocena?
  isAnswered: false,

  // Pozice, kam hráč kliknul.
  userLatLng: null,

  // Aktuálně vybraný JSON.
  selectedJson: CONFIG.defaultLocationsUrl
};

// ============================================================
// MAPA
// ============================================================

let map = null;

const mapLayers = {
  mask: null,
  countryBorder: null,
  kraje: null,
  userMarker: null,
  targetMarker: null,
  polyline: null
};

// ============================================================
// INICIALIZACE
// ============================================================

window.addEventListener('load', init);

/**
 * Inicializace aplikace.
 */
function init() {
  initMap();
  initEventListeners();
  loadSelectedJson();
}

/**
 * Inicializace Leaflet mapy.
 */
function initMap() {
  const baseMapLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      minZoom: CONFIG.minZoom,
      maxZoom: CONFIG.maxZoom
    }
  );

  map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,

    // Omezení posunu – uživatel nemůže odjet mimo ČR
    maxBounds: [
      [48.45, 12.05],
      [51.10, 18.90]
    ],
    maxBoundsViscosity: 1.0,

    layers: [baseMapLayer]
  }).setView(
    CONFIG.mapCenter,
    CONFIG.defaultZoom
  );

  map.on('click', handleMapClick);

  // Načteme geografické vrstvy (Maska ČR + Kraje)
  loadCountryMask();
  loadKrajeLayer();
}

// ============================================================
// EVENT LISTENERY
// ============================================================

/**
 * Inicializace všech ovládacích prvků aplikace.
 */
function initEventListeners() {
  const jsonSelect = document.getElementById('json-select');
  const nextBtn = document.getElementById('next-btn');
  const nextHeaderBtn = document.getElementById('next-header-btn');
  const confirmBtn = document.getElementById('confirm-btn');

  if (jsonSelect) {
    jsonSelect.addEventListener('change', loadSelectedJson);
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', nextRound);
  }

  if (nextHeaderBtn) {
    nextHeaderBtn.addEventListener('click', handleHeaderNext);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmAnswer);
  }
}

// ============================================================
// MASKA OKOLNÍCH STÁTŮ (ČR ZŮSTÁVÁ PRŮHLEDNÁ)
// ============================================================

/**
 * Načte hranice ČR a vytvoří masku zakrývající okolní státy.
 */
async function loadCountryMask() {
  try {
    const response = await fetch(CONFIG.countryBoundaryUrl);

    if (!response.ok) {
      throw new Error(`Chyba při načítání hranice ČR: HTTP ${response.status}`);
    }

    const geoJson = await response.json();
    createCountryMask(geoJson);
  } catch (error) {
    console.error('Nepodařilo se načíst hranici ČR:', error);
  }
}

/**
 * Vytvoří vizuální masku kolem ČR.
 *
 * @param {Object} geoJson
 */
function createCountryMask(geoJson) {
  if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
    console.error('GeoJSON hranice ČR neobsahuje žádný prvek.');
    return;
  }

  const countryGeometry = geoJson.features[0].geometry;
  if (!countryGeometry) {
    console.error('GeoJSON hranice ČR nemá geometrii.');
    return;
  }

  // Velký obdélník pokrývající celé široké okolí
  const outerRing = [
    [55, 5],
    [55, 25],
    [45, 25],
    [45, 5],
    [55, 5]
  ];

  const maskCoordinates = [outerRing];

  // Přidání hranic ČR jako "díry" v masce
  if (countryGeometry.type === 'Polygon') {
    countryGeometry.coordinates.forEach((ring) => {
      maskCoordinates.push(ring.map(([lon, lat]) => [lat, lon]));
    });
  } else if (countryGeometry.type === 'MultiPolygon') {
    countryGeometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => {
        maskCoordinates.push(ring.map(([lon, lat]) => [lat, lon]));
      });
    });
  }

  // Krycí maska zakrývající okolní státy
  mapLayers.mask = L.polygon(maskCoordinates, {
    stroke: false,
    fillColor: '#f8f9fa',
    fillOpacity: 0.9,
    interactive: false
  }).addTo(map);

  // Výrazná státní hranice ČR
  mapLayers.countryBorder = L.geoJSON(geoJson, {
    style: {
      color: '#495057',
      weight: 2,
      opacity: 0.9,
      fill: false,
      interactive: false
    }
  }).addTo(map);

  mapLayers.mask.bringToBack();
}

// ============================================================
// VRSTVA KRAJŮ
// ============================================================

/**
 * Načte hranice krajů z ArcGIS FeatureServeru.
 */
async function loadKrajeLayer() {
  try {
    const response = await fetch(CONFIG.krajeUrl);

    if (!response.ok) {
      throw new Error(`Chyba při načítání hranic krajů: HTTP ${response.status}`);
    }

    const geoJson = await response.json();

    mapLayers.kraje = L.geoJSON(geoJson, {
      style: {
        color: '#6c757d',
        weight: 1.5,
        opacity: 0.8,
        fillColor: '#ffffff',
        fillOpacity: 0.02
      }
    });

    mapLayers.kraje.addTo(map);

    L.control.layers(
      null,
      { 'Hranice krajů': mapLayers.kraje },
      { position: 'topright' }
    ).addTo(map);
  } catch (error) {
    console.error('Nepodařilo se načíst hranice krajů:', error);
  }
}

// ============================================================
// NAČÍTÁNÍ VYBRANÉHO JSON
// ============================================================

/**
 * Načte JSON vybraný v selectu.
 */
async function loadSelectedJson() {
  const jsonSelect = document.getElementById('json-select');
  const selectedJson = jsonSelect ? jsonSelect.value : CONFIG.defaultLocationsUrl;

  state.selectedJson = selectedJson;
  stopTimer();

  try {
    updateTargetText('Načítám data...');

    const response = await fetch(`${selectedJson}?v=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Nelze načíst soubor "${selectedJson}": HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      state.locations = [];
      updateTargetText('Vybraný JSON neobsahuje žádné lokace.');
      updateScoreUI();
      updateTimerUI();
      setConfirmButtonState(false);
      return;
    }

    // Zachováváme přesné pořadí z JSONu
    state.locations = data;
    startGame();
  } catch (error) {
    console.error('Chyba při načítání JSON:', error);
    state.locations = [];
    updateTargetText('Chyba při načítání dat!');
    setConfirmButtonState(false);
  }
}

// ============================================================
// HERNÍ SMYČKA
// ============================================================

/**
 * Spustí novou hru.
 */
function startGame() {
  stopTimer();

  state.currentIndex = 0;
  state.score = 0;
  state.timer = CONFIG.timeLimit;
  state.isAnswered = false;
  state.userLatLng = null;

  updateScoreUI();
  updateTimerUI();

  setupRound();
}

/**
 * Připraví nové kolo.
 */
function setupRound() {
  state.isAnswered = false;
  state.userLatLng = null;

  clearRoundLayers();
  setConfirmButtonState(false);

  const currentTarget = getCurrentTarget();

  if (!currentTarget) {
    finishGame();
    return;
  }

  updateTargetText(currentTarget.name);
  startTimer();
}

/**
 * Vrátí aktuální lokaci.
 * @returns {Object|null}
 */
function getCurrentTarget() {
  return state.locations[state.currentIndex] ?? null;
}

// ============================================================
// KLIKNUTÍ DO MAPY
// ============================================================

/**
 * Uloží tip hráče po kliknutí do mapy.
 * @param {Object} event
 */
function handleMapClick(event) {
  if (state.isAnswered || state.locations.length === 0) {
    return;
  }

  state.userLatLng = event.latlng;

  if (mapLayers.userMarker) {
    map.removeLayer(mapLayers.userMarker);
    mapLayers.userMarker = null;
  }

  mapLayers.userMarker = L.circleMarker(state.userLatLng, {
    radius: 9,
    fillColor: '#ffc107',
    color: '#212529',
    weight: 2,
    fillOpacity: 0.95
  }).addTo(map);

  setConfirmButtonState(true);
}

// ============================================================
// VYHODNOCENÍ ODPOVĚDI
// ============================================================

/**
 * Vyhodnotí tip hráče po stisku tlačítka Hotovo.
 */
function confirmAnswer() {
  if (state.isAnswered || !state.userLatLng) {
    return;
  }

  const target = getCurrentTarget();
  if (!target) return;

  state.isAnswered = true;
  stopTimer();

  // Podpora souřadnic jak pro [lat, lon], tak pro objekt {lat, lon}
  const targetLat = target.lat ?? target.coords?.[0];
  const targetLon = target.lon ?? target.coords?.[1];
  const targetLatLng = L.latLng(targetLat, targetLon);

  const distanceKm = state.userLatLng.distanceTo(targetLatLng) / 1000;
  const roundedDistanceKm = Math.round(distanceKm);
  const isSuccess = distanceKm <= CONFIG.toleranceKm;

  if (isSuccess) {
    state.score += 1;
    updateScoreUI();
  }

  renderResultOnMap(state.userLatLng, targetLatLng, isSuccess);
  setConfirmButtonState(false);

  showModal(
    isSuccess ? 'Skvělý tip!' : 'Mimo toleranci',
    `Chyba: <strong>${roundedDistanceKm} km</strong>.<br>` +
    `Tolerance pro zisk bodu je ${CONFIG.toleranceKm} km.`
  );
}

/**
 * Nastaví stav tlačítka „Hotovo“.
 * @param {boolean} enabled
 */
function setConfirmButtonState(enabled) {
  const confirmBtn = document.getElementById('confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = !enabled;
  }
}

// ============================================================
// VYPRŠENÍ ČASU
// ============================================================

/**
 * Zpracuje vypršení časového limitu.
 */
function handleTimeout() {
  if (state.isAnswered) return;

  state.isAnswered = true;
  stopTimer();

  const target = getCurrentTarget();
  if (!target) return;

  const targetLat = target.lat ?? target.coords?.[0];
  const targetLon = target.lon ?? target.coords?.[1];
  const targetLatLng = L.latLng(targetLat, targetLon);

  mapLayers.targetMarker = L.circleMarker(targetLatLng, {
    radius: 9,
    fillColor: '#dc3545',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1
  }).addTo(map);

  setConfirmButtonState(false);

  showModal(
    'Čas vypršel!',
    `Správná poloha pro <strong>${target.name}</strong> byla zobrazena na mapě.`
  );
}

// ============================================================
// DALŠÍ KOLO
// ============================================================

/**
 * Přechod na další otázku z modalu.
 */
function nextRound() {
  hideModal();
  state.currentIndex += 1;

  if (state.currentIndex < state.locations.length) {
    setupRound();
    return;
  }

  finishGame();
}

/**
 * Přeskočení otázky z lišty.
 */
function handleHeaderNext() {
  if (state.locations.length === 0) return;

  stopTimer();
  hideModal();

  state.currentIndex += 1;

  if (state.currentIndex < state.locations.length) {
    setupRound();
    return;
  }

  finishGame();
}

/**
 * Ukončí aktuální hru.
 */
function finishGame() {
  stopTimer();
  hideModal();

  alert(
    `Konec hry! Tvoje celkové skóre je ${state.score} z ${state.locations.length} bodů.`
  );

  startGame();
}

// ============================================================
// ČASOVAČ
// ============================================================

function startTimer() {
  stopTimer();
  state.timer = CONFIG.timeLimit;
  updateTimerUI();

  state.timerInterval = setInterval(() => {
    state.timer -= 1;
    updateTimerUI();

    if (state.timer <= 0) {
      stopTimer();
      handleTimeout();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval !== null) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// ============================================================
// MAPOVÉ PRVKY
// ============================================================

/**
 * Vykreslí výsledek do mapy.
 */
function renderResultOnMap(userLatLng, targetLatLng, isSuccess) {
  const markerColor = isSuccess ? '#198754' : '#dc3545';

  mapLayers.userMarker = L.circleMarker(userLatLng, {
    radius: 9,
    fillColor: markerColor,
    color: '#ffffff',
    weight: 2,
    fillOpacity: 0.9
  }).addTo(map);

  mapLayers.targetMarker = L.circleMarker(targetLatLng, {
    radius: 7,
    fillColor: '#212529',
    color: '#ffffff',
    weight: 2,
    fillOpacity: 1
  }).addTo(map);

  mapLayers.polyline = L.polyline([userLatLng, targetLatLng], {
    color: markerColor,
    weight: 4,
    dashArray: '6, 8'
  }).addTo(map);
}

/**
 * Odstraní herní prkvy z kola (maska a kraje zůstávají).
 */
function clearRoundLayers() {
  ['userMarker', 'targetMarker', 'polyline'].forEach((layerName) => {
    if (mapLayers[layerName]) {
      map.removeLayer(mapLayers[layerName]);
      mapLayers[layerName] = null;
    }
  });
}

// ============================================================
// UI AKTUALIZACE
// ============================================================

function updateScoreUI() {
  const scoreElement = document.getElementById('score');
  if (scoreElement) scoreElement.textContent = state.score;
}

function updateTimerUI() {
  const timerElement = document.getElementById('timer');
  if (timerElement) timerElement.textContent = state.timer;
}

function updateTargetText(text) {
  const targetElement = document.getElementById('target-name');
  if (targetElement) targetElement.textContent = text;
}

function showModal(title, text) {
  setTimeout(() => {
    const titleElement = document.getElementById('modal-title');
    const textElement = document.getElementById('modal-text');
    const overlayElement = document.getElementById('overlay');

    if (titleElement) titleElement.textContent = title;
    if (textElement) textElement.innerHTML = text;
    if (overlayElement) overlayElement.style.display = 'flex';
  }, 300);
}

function hideModal() {
  const overlayElement = document.getElementById('overlay');
  if (overlayElement) overlayElement.style.display = 'none';
}
