/**
 * Slepá mapa ČR – Hlavní aplikační logika
 *
 * MAPOVÉ VRSTVY:
 *
 * 1. Výchozí:
 *    pouze obrys ČR
 *
 * 2. Volitelná:
 *    hranice krajů ČR
 *
 * 3. Volitelná:
 *    popisky Esri pouze na území ČR
 *
 * Vše funguje bez API klíče.
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
// URL ARCGIS SLUŽEB
// ============================================================

// Esri World Countries
// Použijeme pouze Českou republiku.
const URL_HRANICE_CR =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/World_Countries/FeatureServer/0/query' +
  '?where=ISO_3DIGIT%3D%27CZE%27' +
  '&outFields=*' +
  '&returnGeometry=true' +
  '&f=geojson';


// Česká vrstva krajů
const URL_HRANICE_KRAJU =
  'https://services-eu1.arcgis.com/M6GrekYaMaiKldQY/arcgis/rest/services/hranice_kraj%C5%AF_%C4%8CR/FeatureServer/0/query' +
  '?where=1%3D1' +
  '&outFields=*' +
  '&returnGeometry=true' +
  '&f=geojson';


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


  // Herní značky
  markers: {

    userMarker: null,

    targetMarker: null,

    polyline: null
  },


  // Mapové vrstvy
  mapLayers: {

    hraniceCR: null,

    hraniceKraju: null,

    popisky: null,

    maskaPopisku: null
  },


  abortController: null
};


// ============================================================
// INICIALIZACE
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    initMap();

    initEventListeners();

    loadSelectedJson();
  }
);


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


  if (jsonSelect) {

    jsonSelect.addEventListener(
      "change",
      loadSelectedJson
    );
  }


  if (nextBtn) {

    nextBtn.addEventListener(
      "click",
      nextRound
    );
  }


  if (nextHeaderBtn) {

    nextHeaderBtn.addEventListener(
      "click",
      nextRound
    );
  }


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
  // VYTVOŘENÍ MAPY
  // ==========================================================

  state.map = L.map(
    'map',
    {
      zoomControl: true,

      doubleClickZoom: false,

      minZoom: CONFIG.minZoom,

      maxZoom: CONFIG.maxZoom
    }
  ).setView(
    CONFIG.mapCenter,
    CONFIG.defaultZoom
  );


  // ==========================================================
  // 1. HRANICE ČR
  // ==========================================================

  state.mapLayers.hraniceCR =
    L.geoJSON(
      null,
      {

        style: {

          color: '#333333',

          weight: 2.5,

          opacity: 1,

          fill: false,

          fillOpacity: 0
        }
      }
    ).addTo(
      state.map
    );


  // Načtení hranice ČR
  loadBoundaryLayer(
    URL_HRANICE_CR,
    state.mapLayers.hraniceCR,
    "hranice České republiky",
    true
  );


  // ==========================================================
  // 2. HRANICE KRAJŮ
  // ==========================================================

  state.mapLayers.hraniceKraju =
    L.geoJSON(
      null,
      {

        style: {

          color: '#666666',

          weight: 1.5,

          opacity: 1,

          fill: false,

          fillOpacity: 0
        }
      }
    );


  // Načtení krajů
  loadBoundaryLayer(
    URL_HRANICE_KRAJU,
    state.mapLayers.hraniceKraju,
    "hranice krajů",
    false
  );


  // ==========================================================
  // 3. POPISKY ESRI
  // ==========================================================

  state.mapLayers.popisky =

    L.tileLayer(

      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',

      {

        attribution:
          'Tiles &copy; Esri',

        minZoom:
          CONFIG.minZoom,

        maxZoom:
          CONFIG.maxZoom,

        opacity:
          0.85
      }
    );


  // ==========================================================
  // PŘEPÍNAČ VRSTEV
  // ==========================================================

  const overlayMaps = {

    "Hranice krajů":
      state.mapLayers.hraniceKraju,

    "Popisky":
      state.mapLayers.popisky
  };


  L.control.layers(

    null,

    overlayMaps,

    {
      collapsed: true
    }

  ).addTo(
    state.map
  );


  // ==========================================================
  // KLIKNUTÍ DO MAPY
  // ==========================================================

  state.map.on(
    'click',
    handleMapClick
  );
}


// ============================================================
// NAČTENÍ HRANIC Z ARCGIS
// ============================================================

async function loadBoundaryLayer(
  url,
  layer,
  layerName,
  isCountryBoundary
) {

  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      !data ||
      !data.features ||
      data.features.length === 0
    ) {

      throw new Error(
        "ArcGIS nevrátil žádné prvky."
      );
    }


    // Přidáme GeoJSON do Leaflet vrstvy
    layer.addData(data);


    console.log(
      `${layerName} načtena:`,
      data.features.length,
      "prvků"
    );


    // ========================================================
    // MASKA PRO POPISKY
    // ========================================================

    //
    // Jakmile známe přesnou geometrii ČR,
    // vytvoříme bílou masku mimo ČR.
    //
    // Díky tomu může Esri dál poskytovat své popisky,
    // ale popisky Německa, Polska, Rakouska atd.
    // budou zakryté.
    //

    if (isCountryBoundary) {

      createCzechRepublicMask(
        data
      );
    }


  } catch (error) {

    console.error(
      `Nepodařilo se načíst ${layerName}:`,
      error
    );
  }
}


// ============================================================
// MASKA MIMO ČR
// ============================================================

function createCzechRepublicMask(
  geojson
) {

  // Pokud už maska existuje,
  // odstraníme ji.
  if (
    state.mapLayers.maskaPopisku
  ) {

    state.map.removeLayer(
      state.mapLayers.maskaPopisku
    );

    state.mapLayers.maskaPopisku =
      null;
  }


  // ----------------------------------------------------------
  // Vnější hranice mapy
  // ----------------------------------------------------------

  //
  // Velký obdélník
