/**
 * Slepá mapa ČR – Hlavní aplikační logika
 *
 * Mapové vrstvy:
 * 1. Výchozí vrstva – pouze obrys ČR
 * 2. Volitelná vrstva – hranice krajů ČR
 * 3. Volitelná vrstva – popisky Esri

 * Hranice jsou načítány jako GeoJSON přímo
 * z veřejných ArcGIS REST služeb.
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
// URL MAPOVÝCH DAT
// ============================================================

// Veřejná ArcGIS vrstva států
const URL_HRANICE_CR =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/World_Countries/FeatureServer/0/query' +
  '?where=ISO3%3D%27CZE%27' +
  '&outFields=*' +
  '&returnGeometry=true' +
  '&f=geojson';


// Veřejná česká vrstva krajů
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

    popisky: null
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
  // VÝCHOZÍ MAPA
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

  //
  // Vytvoříme prázdnou GeoJSON vrstvu.
  // Ta bude po načtení obsahovat pouze ČR.
  //

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


  // Načteme hranici ČR
  loadBoundaryLayer(
    URL_HRANICE_CR,
    state.mapLayers.hraniceCR,
    "hranice České republiky"
  );


  // ==========================================================
  // 2. HRANICE KRAJŮ
  // ==========================================================

  //
  // Tato vrstva se při spuštění NEZOBRAZÍ.
  // Uživatel ji zapne v přepínači vrstev.
  //

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


  // Načtení hranic krajů
  loadBoundaryLayer(
    URL_HRANICE_KRAJU,
    state.mapLayers.hraniceKraju,
    "hranice krajů"
  );


  // ==========================================================
  // 3. POPISKY
  // ==========================================================

  //
  // Tvoje původní funkční Esri vrstva.
  // Tu neměníme.
  //

  state.mapLayers.popisky =

    L.tileLayer(

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
// NAČTENÍ GEOJSON Z ARCGIS
// ============================================================

async function loadBoundaryLayer(
  url,
  layer,
  layerName
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


    // Kontrola GeoJSON
    if (
      !data ||
      !data.features
    ) {

      throw new Error(
        "ArcGIS nevrátil platný GeoJSON."
      );
    }


    // Přidáme data do existující vrstvy
    layer.addData(data);


    console.log(
      `${layerName} načtena:`,
      data.features.length,
      "prvků"
    );


  } catch (error) {

    console.error(
      `Nepodařilo se načíst ${layerName}:`,
      error
    );
  }
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


  // Zrušení předchozího načítání
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

    if (
      err.name === 'AbortError'
    ) {

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


  if (
    !state.targets ||
    state.targets.length === 0
  ) {

    return;
  }


  if (
    state.currentIndex >=
    state.targets.length
  ) {

    state.currentIndex =
      0;
  }


  state.currentTarget =
    state.targets[
      state.currentIndex
    ];


  state.currentIndex++;


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


  resetTimer();
}


// ============================================================
// KLIKNUTÍ DO MAPY
// ============================================================

function handleMapClick(e) {

  if (
    state.isAnswered ||
    !state.currentTarget
  ) {

    return;
  }


  state.userLatLng =
    L.latLng(

      e.latlng.lat,

      e.latlng.lng
    );


  // ==========================================================
  // ORANŽOVÝ BOD
  // ==========================================================

  if (
    !state.markers.userMarker
  ) {

    state.markers.userMarker =

      L.circleMarker(

        state.userLatLng,

        {

          radius: 9,

          fillColor: '#ff922b',

          color: '#ffffff',

          weight: 2,

          fillOpacity: 1
        }

      ).addTo(
        state.map
      );

  } else {

    state.markers.userMarker
      .setLatLng(
        state.userLatLng
      );
  }


  // Aktivace tlačítka Hotovo
  const confirmBtn =
    document.getElementById(
      "confirm-btn"
    );


  if (confirmBtn) {

    confirmBtn.disabled =
      false;
  }
}


// ============================================================
// VYHODNOCENÍ ODPOVĚDI
// ============================================================

function evaluateAnswer() {

  if (
    state.isAnswered ||
    !state.userLatLng ||
    !state.currentTarget
  ) {

    return;
  }


  state.isAnswered =
    true;


  clearInterval(
    state.timer
  );


  // Správná poloha
  const targetLatLng =
    L.latLng(

      state.currentTarget.coords[0],

      state.currentTarget.coords[1]
    );


  // Vzdálenost
  const distanceKm =

    Math.round(

      state.userLatLng
        .distanceTo(
          targetLatLng
        ) / 1000
    );


  // Vyhodnocení
  const isSuccess =
    distanceKm <=
    CONFIG.toleranceKm;


  // Barva výsledku
  const finalColor =
    isSuccess
      ? '#198754'
      : '#dc3545';


  // Změna barvy uživatelského bodu
  state.markers.userMarker
    .setStyle({

      fillColor:
        finalColor
    });


  // ==========================================================
  // SPRÁVNÝ CÍL
  // ==========================================================

  state.markers.targetMarker =

    L.circleMarker(

      targetLatLng,

      {

        radius: 7,

        fillColor: '#212529',

        color: '#ffffff',

        weight: 2,

        fillOpacity: 1
      }

    ).addTo(
      state.map
    );


  // ==========================================================
  // SPOJOVACÍ ČÁRA
  // ==========================================================

  state.markers.polyline =

    L.polyline(

      [

        state.userLatLng,

        targetLatLng

      ],

      {

        color:
          finalColor,

        weight:
          3,

        dashArray:
          '5, 8'
      }

    ).addTo(
      state.map
    );


  // ==========================================================
  // SKÓRE
  // ==========================================================

  if (isSuccess) {

    state.score += 1;

    updateScoreUI();
  }


  // ==========================================================
  // VÝSLEDEK
  // ==========================================================

  showModal(

    isSuccess
      ? 'Výborně!'
      : 'Mimo toleranci',

    `Vedle o <strong>${distanceKm} km</strong>.<br>
     Tolerance pro získání bodu je
     ${CONFIG.toleranceKm} km.`
  );
}


// ============================================================
// VYPRŠENÍ ČASU
// ============================================================

function handleTimeout() {

  if (state.isAnswered) {

    return;
  }


  state.isAnswered =
    true;


  const targetLatLng =
    L.latLng(

      state.currentTarget.coords[0],

      state.currentTarget.coords[1]
    );


  // Správná poloha
  state.markers.targetMarker =

    L.circleMarker(

      targetLatLng,

      {

        radius: 9,

        fillColor: '#dc3545',

        color: '#ffffff',

        weight: 2,

        fillOpacity: 1
      }

    ).addTo(
      state.map
    );


  showModal(

    'Čas vypršel!',

    `Správná poloha pro
     <strong>${state.currentTarget.name}</strong>
     byla zobrazena na mapě.`
  );
}


// ============================================================
// ČASOVAČ
// ============================================================

function resetTimer() {

  clearInterval(
    state.timer
  );


  state.timeLeft =
    CONFIG.roundTime;


  updateTimerUI();


  state.timer =

    setInterval(

      () => {

        state.timeLeft--;

        updateTimerUI();


        if (
          state.timeLeft <= 0
        ) {

          clearInterval(
            state.timer
          );

          handleTimeout();
        }

      },

      1000
    );
}


// ============================================================
// VYČIŠTĚNÍ HERNÍCH BODŮ
// ============================================================

function clearMapLayers() {

  Object.keys(
    state.markers
  ).forEach(

    key => {

      if (
        state.markers[key]
      ) {

        state.map.removeLayer(
          state.markers[key]
        );


        state.markers[key] =
          null;
      }
    }
  );
}


// ============================================================
// UI – SKÓRE
// ============================================================

function updateScoreUI() {

  const scoreElem =
    document.getElementById(
      "score"
    );


  if (scoreElem) {

    scoreElem.textContent =
      state.score;
  }
}


// ============================================================
// UI – ČAS
// ============================================================

function updateTimerUI() {

  const timerElem =
    document.getElementById(
      "timer"
    );


  if (timerElem) {

    timerElem.textContent =
      state.timeLeft;
  }
}


// ============================================================
// MODÁLNÍ OKNO – ZOBRAZENÍ
// ============================================================

function showModal(
  title,
  text
) {

  const titleElem =
    document.getElementById(
      "modal-title"
    );

  const textElem =
    document.getElementById(
      "modal-text"
    );

  const overlayElem =
    document.getElementById(
      "overlay"
    );


  if (titleElem) {

    titleElem.textContent =
      title;
  }


  if (textElem) {

    textElem.innerHTML =
      text;
  }


  if (overlayElem) {

    overlayElem.style.display =
      "flex";
  }
}


// ============================================================
// MODÁLNÍ OKNO – SKRYTÍ
// ============================================================

function hideModal() {

  const overlayElem =
    document.getElementById(
      "overlay"
    );


  if (overlayElem) {

    overlayElem.style.display =
      "none";
  }
}
