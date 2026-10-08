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
    layers: [baseMapLayer]
  }).setView(
    CONFIG.mapCenter,
    CONFIG.defaultZoom
  );

  map.on('click', handleMapClick);

  loadKrajeLayer();
}

// ============================================================
// EVENT LISTENERY
// ============================================================

/**
 * Inicializace všech ovládacích prvků aplikace.
 */
function initEventListeners() {
  const jsonSelect =
    document.getElementById('json-select');

  const nextBtn =
    document.getElementById('next-btn');

  const nextHeaderBtn =
    document.getElementById('next-header-btn');

  const confirmBtn =
    document.getElementById('confirm-btn');

  // ----------------------------------------------------------
  // Výběr JSON kategorie
  // ----------------------------------------------------------

  if (jsonSelect) {
    jsonSelect.addEventListener(
      'change',
      loadSelectedJson
    );
  }

  // ----------------------------------------------------------
  // Další otázka – tlačítko v modalu
  // ----------------------------------------------------------

  if (nextBtn) {
    nextBtn.addEventListener(
      'click',
      nextRound
    );
  }

  // ----------------------------------------------------------
  // Další – tlačítko v horní liště
  // ----------------------------------------------------------

  if (nextHeaderBtn) {
    nextHeaderBtn.addEventListener(
      'click',
      handleHeaderNext
    );
  }

  // ----------------------------------------------------------
  // Hotovo – vyhodnocení tipu
  // ----------------------------------------------------------

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

/**
 * Načte JSON vybraný v selectu.
 *
 * Po změně kategorie se aktuální hra restartuje
 * a použije se nový soubor.
 */
async function loadSelectedJson() {
  const jsonSelect =
    document.getElementById('json-select');

  const selectedJson = jsonSelect
    ? jsonSelect.value
    : CONFIG.defaultLocationsUrl;

  state.selectedJson = selectedJson;

  stopTimer();

  try {
    updateTargetText('Načítám data...');

    const response = await fetch(selectedJson);

    if (!response.ok) {
      throw new Error(
        `Nelze načíst soubor "${selectedJson}": ` +
        `HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      state.locations = [];

      updateTargetText(
        'Vybraný JSON neobsahuje žádné lokace.'
      );

      updateScoreUI();
      updateTimerUI();

      return;
    }

    // Zachováváme přesné pořadí z JSON.
    state.locations = data;

    startGame();
  } catch (error) {
    console.error(
      'Chyba při načítání JSON:',
      error
    );

    state.locations = [];

    updateTargetText(
      'Chyba při načítání dat!'
    );
  }
}

// ============================================================
// VRSTVA KRAJŮ
// ============================================================

/**
 * Načte hranice krajů z ArcGIS FeatureServeru
 * a vytvoří z nich volitelnou Leaflet GeoJSON vrstvu.
 */
async function loadKrajeLayer() {
  try {
    const response = await fetch(CONFIG.krajeUrl);

    if (!response.ok) {
      throw new Error(
        `Chyba při načítání hranic krajů: ` +
        `HTTP ${response.status}`
      );
    }

    const geoJson = await response.json();

    mapLayers.kraje = L.geoJSON(
      geoJson,
      {
        style: {
          color: '#6c757d',
          weight: 1.5,
          opacity: 0.8,
          fillColor: '#ffffff',
          fillOpacity: 0.02
        }
      }
    );

    // Hranice jsou po načtení viditelné.
    mapLayers.kraje.addTo(map);

    // Uživatel je může vypnout/zapnout.
    L.control.layers(
      null,
      {
        Kraje: mapLayers.kraje
      },
      {
        position: 'topright'
      }
    ).addTo(map);
  } catch (error) {
    console.error(
      'Nepodařilo se načíst hranice krajů:',
      error
    );
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

  const currentTarget =
    getCurrentTarget();

  if (!currentTarget) {
    finishGame();
    return;
  }

  updateTargetText(
    currentTarget.name
  );

  startTimer();
}

/**
 * Vrátí aktuální lokaci.
 *
 * @returns {Object|null}
 */
function getCurrentTarget() {
  return (
    state.locations[state.currentIndex] ??
    null
  );
}

// ============================================================
// KLIKNUTÍ DO MAPY
// ============================================================

/**
 * Uloží tip hráče po kliknutí do mapy.
 *
 * Kliknutí samo o sobě odpověď nevyhodnocuje.
 * Hráč musí následně stisknout tlačítko „Hotovo“.
 *
 * @param {Object} event
 */
function handleMapClick(event) {
  if (
    state.isAnswered ||
    state.locations.length === 0
  ) {
    return;
  }

  state.userLatLng = event.latlng;

  // Odstraníme předchozí tip.
  if (mapLayers.userMarker) {
    map.removeLayer(
      mapLayers.userMarker
    );

    mapLayers.userMarker = null;
  }

  // Zobrazíme aktuální tip hráče.
  mapLayers.userMarker =
    L.circleMarker(
      state.userLatLng,
      {
        radius: 9,
        fillColor: '#ffc107',
        color: '#212529',
        weight: 2,
        fillOpacity: 0.95
      }
    ).addTo(map);

  setConfirmButtonState(true);
}

// ============================================================
// VYHODNOCENÍ ODPOVĚDI
// ============================================================

/**
 * Vyhodnotí tip hráče.
 */
function confirmAnswer() {
  if (
    state.isAnswered ||
    !state.userLatLng
  ) {
    return;
  }

  const target =
    getCurrentTarget();

  if (!target) {
    return;
  }

  state.isAnswered = true;

  stopTimer();

  const targetLatLng =
    L.latLng(
      target.lat,
      target.lon
    );

  const distanceKm =
    state.userLatLng.distanceTo(
      targetLatLng
    ) / 1000;

  const roundedDistanceKm =
    Math.round(distanceKm);

  // ----------------------------------------------------------
  // Kontrola správnosti
  // ----------------------------------------------------------

  const isSuccess =
    distanceKm <= CONFIG.toleranceKm;

  if (isSuccess) {
    state.score += 1;
    updateScoreUI();
  }

  // ----------------------------------------------------------
  // Vykreslení výsledku
  // ----------------------------------------------------------

  renderResultOnMap(
    state.userLatLng,
    targetLatLng,
    isSuccess
  );

  setConfirmButtonState(false);

  // ----------------------------------------------------------
  // Výsledkové okno
  // ----------------------------------------------------------

  showModal(
    isSuccess
      ? 'Skvělý tip!'
      : 'Mimo toleranci',
    `Chyba: <strong>${roundedDistanceKm} km</strong>.<br>` +
    `Tolerance pro zisk bodu je ` +
    `${CONFIG.toleranceKm} km.`
  );
}

/**
 * Nastaví stav tlačítka „Hotovo“.
 *
 * @param {boolean} enabled
 */
function setConfirmButtonState(enabled) {
  const confirmBtn =
    document.getElementById(
      'confirm-btn'
    );

  if (!confirmBtn) {
    return;
  }

  confirmBtn.disabled = !enabled;
}

// ============================================================
// VYPRŠENÍ ČASU
// ============================================================

/**
 * Zpracuje vypršení časového limitu.
 */
function handleTimeout() {
  if (state.isAnswered) {
    return;
  }

  state.isAnswered = true;

  stopTimer();

  const target =
    getCurrentTarget();

  if (!target) {
    return;
  }

  const targetLatLng =
    L.latLng(
      target.lat,
      target.lon
    );

  // Správná poloha.
  mapLayers.targetMarker =
    L.circleMarker(
      targetLatLng,
      {
        radius: 9,
        fillColor: '#dc3545',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1
      }
    ).addTo(map);

  setConfirmButtonState(false);

  showModal(
    'Čas vypršel!',
    'Správná poloha byla zobrazena na mapě.'
  );
}

// ============================================================
// DALŠÍ KOLO
// ============================================================

/**
 * Přechod na další otázku.
 *
 * Používá se tlačítkem „Další otázka“
 * ve výsledkovém okně.
 */
function nextRound() {
  hideModal();

  state.currentIndex += 1;

  if (
    state.currentIndex <
    state.locations.length
  ) {
    setupRound();
    return;
  }

  finishGame();
}

/**
 * Zpracování tlačítka „Další“ v horní liště.
 *
 * Pokud je odpověď právě rozpracovaná,
 * otázku jednoduše přeskočí.
 */
function handleHeaderNext() {
  if (
    state.locations.length === 0
  ) {
    return;
  }

  stopTimer();
  hideModal();

  state.currentIndex += 1;

  if (
    state.currentIndex <
    state.locations.length
  ) {
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
    `Konec hry! Tvoje celkové skóre je ` +
    `${state.score} z ` +
    `${state.locations.length} bodů.`
  );

  startGame();
}

// ============================================================
// ČASOVAČ
// ============================================================

/**
 * Spustí odpočítávání.
 */
function startTimer() {
  stopTimer();

  state.timer =
    CONFIG.timeLimit;

  updateTimerUI();

  state.timerInterval =
    setInterval(() => {
      state.timer -= 1;

      updateTimerUI();

      if (state.timer <= 0) {
        stopTimer();
        handleTimeout();
      }
    }, 1000);
}

/**
 * Zastaví odpočítávání.
 */
function stopTimer() {
  if (
    state.timerInterval !== null
  ) {
    clearInterval(
      state.timerInterval
    );

    state.timerInterval = null;
  }
}

// ============================================================
// MAPOVÉ PRVKY
// ============================================================

/**
 * Vykreslí výsledek odpovědi do mapy.
 *
 * @param {L.LatLng} userLatLng
 * @param {L.LatLng} targetLatLng
 * @param {boolean} isSuccess
 */
function renderResultOnMap(
  userLatLng,
  targetLatLng,
  isSuccess
) {
  const markerColor =
    isSuccess
      ? '#198754'
      : '#dc3545';

  // Tip hráče.
  mapLayers.userMarker =
    L.circleMarker(
      userLatLng,
      {
        radius: 9,
        fillColor: markerColor,
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      }
    ).addTo(map);

  // Skutečná poloha.
  mapLayers.targetMarker =
    L.circleMarker(
      targetLatLng,
      {
        radius: 7,
        fillColor: '#212529',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1
      }
    ).addTo(map);

  // Spojnice mezi tipem a skutečnou polohou.
  mapLayers.polyline =
    L.polyline(
      [
        userLatLng,
        targetLatLng
      ],
      {
        color: markerColor,
        weight: 4,
        dashArray: '6, 8'
      }
    ).addTo(map);
}

/**
 * Odstraní mapové prvky aktuálního kola.
 *
 * Hranice krajů se nemažou.
 */
function clearRoundLayers() {
  const roundLayerNames = [
    'userMarker',
    'targetMarker',
    'polyline'
  ];

  roundLayerNames.forEach(
    (layerName) => {
      const layer =
        mapLayers[layerName];

      if (layer) {
        map.removeLayer(layer);
        mapLayers[layerName] = null;
      }
    }
  );
}

// ============================================================
// UI
// ============================================================

/**
 * Aktualizuje skóre.
 */
function updateScoreUI() {
  const scoreElement =
    document.getElementById(
      'score'
    );

  if (scoreElement) {
    scoreElement.textContent =
      state.score;
  }
}

/**
 * Aktualizuje časovač.
 */
function updateTimerUI() {
  const timerElement =
    document.getElementById(
      'timer'
    );

  if (timerElement) {
    timerElement.textContent =
      state.timer;
  }
}

/**
 * Aktualizuje název hledané lokace.
 *
 * @param {string} text
 */
function updateTargetText(text) {
  const targetElement =
    document.getElementById(
      'target-name'
    );

  if (targetElement) {
    targetElement.textContent =
      text;
  }
}

/**
 * Zobrazí vyhodnocovací okno.
 *
 * @param {string} title
 * @param {string} text
 */
function showModal(
  title,
  text
) {
  setTimeout(() => {
    const titleElement =
      document.getElementById(
        'modal-title'
      );

    const textElement =
      document.getElementById(
        'modal-text'
      );

    const overlayElement =
      document.getElementById(
        'overlay'
      );

    if (titleElement) {
      titleElement.textContent =
        title;
    }

    if (textElement) {
      textElement.innerHTML =
        text;
    }

    if (overlayElement) {
      overlayElement.style.display =
        'flex';
    }
  }, 400);
}

/**
 * Skryje vyhodnocovací okno.
 */
function hideModal() {
  const overlayElement =
    document.getElementById(
      'overlay'
    );

  if (overlayElement) {
    overlayElement.style.display =
      'none';
  }
}
