/**
 * Slepá mapa ČR – Hlavní aplikační logika
 *
 * Mapové vrstvy:
 * 1. Výchozí vrstva – pouze obrys ČR
 * 2. Volitelná vrstva – hranice krajů ČR
 * 3. Volitelná vrstva – popisky Esri
 */


// ============================================================
// KONFIGURACE
// ============================================================

const CONFIG = {
  mapCenter: [49.8175, 15.4730],
  defaultZoom: 8,
  minZoom: 7,
  maxZoom: 10,
  roundTime: 30,
  toleranceKm: 30
};


// ============================================================
// APLIKAČNÍ STAV
// ============================================================

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


// ============================================================
// INICIALIZACE PO NAČTENÍ STRÁNKY
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEventListeners();
  loadSelectedJson();
});


// ============================================================
// EVENT LISTENERS
// ============================================================

function initEventListeners() {

  const jsonSelect =
    document.getElementById("json-select");

  const nextBtn =
    document.getElementById("next-btn");

  const nextHeaderBtn =
    document.getElementById("next-header-btn");

  const confirmBtn =
    document.getElementById("confirm-btn");


  // Výběr JSON souboru
  if (jsonSelect) {
    jsonSelect.addEventListener(
      "change",
      loadSelectedJson
    );
  }


  // Další kolo
  if (nextBtn) {
    nextBtn.addEventListener(
      "click",
      nextRound
    );
  }


  // Další kolo – tlačítko v hlavičce
  if (nextHeaderBtn) {
    nextHeaderBtn.addEventListener(
      "click",
      nextRound
    );
  }


  // Hotovo
  if (confirmBtn) {

    confirmBtn.onclick = (e) => {

      e.preventDefault();

      evaluateAnswer();
    };
  }
}


// ============================================================
// INICIALIZACE MAPY
// ============================================================

function initMap() {


  // ==========================================================
  // 1. VÝCHOZÍ VRSTVA – POUZE OBVOD ČR
  // ==========================================================
  //
  // Veřejná Esri ArcGIS FeatureServer vrstva.
  //
  // Pomocí "where" vybereme pouze Českou republiku.
  //
  // Výplň polygonu je vypnutá – zůstane pouze hranice.
  //

  const hraniceCR = L.esri.featureLayer({

    url:
      'https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/World_Countries/FeatureServer/0',

    where:
      "ISO_CC = 'CZE'",

    style: {

      color: '#333333',

      weight: 2.5,

      opacity: 1,

      fill: false,

      fillOpacity: 0
    }
  });


  // ==========================================================
  // 2. VOLITELNÁ VRSTVA – HRANICE KRAJŮ
  // ==========================================================
  //
  // Česká ArcGIS Feature Layer.
  //
  // Obsahuje hranice jednotlivých krajů ČR.
  //

  const hraniceKraju = L.esri.featureLayer({

    url:
      'https://services-eu1.arcgis.com/M6GrekYaMaiKldQY/arcgis/rest/services/hranice_kraj%C5%AF_%C4%8CR/FeatureServer/0',

    style: {

      color: '#666666',

      weight: 1.5,

      opacity: 1,

      fill: false,

      fillOpacity: 0
    }
  });


  // ==========================================================
  // 3. VOLITELNÁ VRSTVA – POPISKY
  // ==========================================================
  //
  // Tvoje původní funkční Esri vrstva.
  //
  // Neměníme ji.
  //

  const overlayPopisky = L.tileLayer(

    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',

    {

      attribution:
        'Tiles &copy; Esri',

      maxZoom:
        CONFIG.maxZoom,

      minZoom:
        CONFIG.minZoom,

      opacity:
        0.85
    }
  );


  // ==========================================================
  // VYTVOŘENÍ MAPY
  // ==========================================================

  state.map = L.map(

    'map',

    {

      zoomControl:
        true,

      doubleClickZoom:
        false,

      minZoom:
        CONFIG.minZoom,

      maxZoom:
        CONFIG.maxZoom,

      // Výchozí vrstva
      // = pouze obrys ČR

      layers: [
        hraniceCR
      ]
    }

  ).setView(

    CONFIG.mapCenter,

    CONFIG.defaultZoom
  );


  // ==========================================================
  // PŘEPÍNAČ VRSTEV
  // ==========================================================

  const overlayMaps = {

    "Hranice krajů":
      hraniceKraju,

    "Popisky":
      overlayPopisky
  };


  L.control.layers(

    null,

    overlayMaps,

    {
      collapsed: true
    }

  ).addTo(state.map);


  // ==========================================================
  // KLIKNUTÍ DO MAPY
  // ==========================================================

  state.map.on(
    'click',
    handleMapClick
  );
}


// ============================================================
// NAČTENÍ DAT Z JSON
// ============================================================

async function loadSelectedJson() {

  const selectElem =
    document.getElementById(
      "json-select"
    );


  const fileName =
    selectElem
      ? selectElem.value
      : "zajimavosti.json";


  // Zrušení předchozího požadavku
  if (state.abortController) {

    state.abortController.abort();
  }


  state.abortController =
    new AbortController();


  try {

    const response =
      await fetch(

        `${fileName}?v=${Date.now()}`,

        {
          signal:
            state.abortController.signal
        }
      );


    if (!response.ok) {

      throw new Error(

        `HTTP chyba ${response.status} při načítání ${fileName}`
      );
    }


    const data =
      await response.json();


    if (
      !Array.isArray(data) ||
      data.length === 0
    ) {

      throw new Error(
        "Načtený JSON neobsahuje platná data."
      );
    }


    state.targets =
      data;

    state.currentIndex =
      0;


    nextRound();


  } catch (err) {

    // Zrušený request ignorujeme
    if (err.name === 'AbortError') {
      return;
    }


    console.error(
      "Chyba při načítání JSON dat:",
      err
    );


    const targetElem =
      document.getElementById(
        "target-name"
      );


    if (targetElem) {

      targetElem.textContent =
        `Nenalezen soubor ${fileName}!`;
    }
  }
}


// ============================================================
// NOVÉ KOLO
// ============================================================

function nextRound() {

  hideModal();

  clearInterval(
    state.timer
  );

  clearMapLayers();


  state.userLatLng =
    null;

  state.isAnswered =
    false;


  const confirmBtn =
    document.getElementById(
      "confirm-btn"
    );


  if (confirmBtn) {

    confirmBtn.disabled =
      true;


    confirmBtn.classList.remove(
      "btn-success",
      "btn-danger"
    );


    confirmBtn.classList.add(
      "btn-warning"
    );


    confirmBtn.textContent =
      "Hotovo ✓";
  }


  // Nejsou žádná data
  if (
    !state.targets ||
    state.targets.length === 0
  ) {
    return;
  }


  // Po dosažení konce
  // začneme znovu od začátku

  if (
    state.currentIndex >=
    state.targets.length
  ) {

    state.currentIndex =
      0;
  }


  // Aktuální cíl
  state.currentTarget =
    state.targets[
      state.currentIndex
    ];


  state.currentIndex++;


  // Název cíle
  const targetElem =
    document.getElementById(
      "target-name"
    );


  if (
    targetElem &&
    state.currentTarget
  ) {

    targetElem.textContent =
      state.currentTarget.name;
  }


  // Spustíme časovač
  resetTimer();
}


// ============================================================
// KLIKNUTÍ DO MAPY
// ============================================================

function handleMapClick(e) {

  // Po
