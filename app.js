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

  // Hranice státního území ČR.
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

  isAnswered: false,
  userLatLng: null,

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

function init() {
  initMap();
  initEventListeners();
  loadSelectedJson();
}

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

    // Omezení posunu mapy přibližně na území ČR.
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

  loadCountryMask();
  loadKrajeLayer();
}

// ============================================================
// EVENT LISTENERY
// ============================================================

function initEventListeners() {
  const jsonSelect =
    document.getElementById('json-select');

  const nextBtn =
    document.getElementById('next-btn');

  const nextHeaderBtn =
    document.getElementById('next-header-btn');

  const confirmBtn =
    document.getElementById('confirm-btn');

  // Výběr JSON kategorie.
  if (jsonSelect) {
    jsonSelect.addEventListener(
      'change',
      loadSelectedJson
    );
  }

  // Další otázka ve výsledkovém okně.
  if (nextBtn) {
    nextBtn.addEventListener(
      'click',
      nextRound
    );
  }

  // Další v horní liště.
  if (nextHeaderBtn) {
    nextHeaderBtn.addEventListener(
      'click',
      handleHeaderNext
    );
  }

  // Hotovo – vyhodnocení tipu.
  if (confirmBtn) {
    confirmBtn.addEventListener(
      'click',
      confirmAnswer
    );
  }
}

// ============================================================
// NAČÍTÁNÍ VYBRANÉHO JSON
// ============================================================

function loadSelectedJson() {
  const jsonSelect =
    document.getElementById('json-select');

  const selectedJson = jsonSelect
    ? jsonSelect.value
    : CONFIG.defaultLocationsUrl;

  state.selectedJson = selectedJson;

  stopTimer();

  // Vyčištění předchozího kola.
  state.userLatLng = null;
  state.isAnswered = false;

  clearRoundLayers();
  setConfirmButtonState(false);

  updateTargetText('Načítám data...');

  fetch(selectedJson)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Nelze načíst soubor "${selectedJson}". HTTP ${response.status}`
        );
      }

      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data)) {
        throw new Error(
          `Soubor "${selectedJson}" neobsahuje seznam lokací.`
        );
      }

      if (data.length === 0) {
        state.locations = [];

        updateTargetText(
          'Vybraný JSON neobsahuje žádné lokace.'
        );

        updateScoreUI();
        updateTimerUI();

        return;
      }

      /*
       * DŮLEŽITÉ:
       * Položky se nijak nemíchají.
       * Hra postupuje přesně v pořadí JSON souboru.
       */
      state.locations = data;

      startGame();
    })
    .catch((error) => {
      console.error(
        `Chyba při načítání "${selectedJson}":`,
        error
      );

      state.locations = [];

      updateTargetText(
        'Chyba při načítání dat!'
      );

      updateScoreUI();
      updateTimerUI();
      setConfirmButtonState(false);
    });
}

// ============================================================
// MASKA ČR
// ============================================================

async function loadCountryMask() {
  try {
    const response =
      await fetch(
        CONFIG.countryBoundaryUrl
      );

    if (!response.ok) {
      throw new Error(
        `Chyba při načítání hranice ČR: HTTP ${response.status}`
      );
    }

    const geoJson =
      await response.json();

    create
