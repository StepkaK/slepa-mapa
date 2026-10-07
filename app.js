// Konfigurace aplikace
const CONFIG = {
  mapCenter: [49.8175, 15.4730],
  defaultZoom: 8,
  roundTime: 30,
  toleranceKm: 30
};

// Stavové proměnné
let map;
let targets = []; // Dynamicky načítaná databáze
let currentTarget = null;
let score = 0;
let timer = null;
let timeLeft = CONFIG.roundTime;
let activeMarker = null;

// Vrstvy mapy
let overlayHranice;
let overlayPopisky;
let overlayReky;

// Inicializace po načtení stránky
document.addEventListener("DOMContentLoaded", () => {
  try {
    initMap();
    loadSelectedJson(); // Načte výchozí zvolený JSON
  } catch (err) {
    console.error("Chyba při inicializaci:", err);
  }
});

// Funkce pro načtení vybraného JSON souboru
async function loadSelectedJson() {
  const selectElem = document.getElementById("json-select");
  const fileName = selectElem ? selectElem.value : "mesta.json";

  try {
    const response = await fetch(fileName);
    if (!response.ok) {
      throw new Error(`Nelze načíst soubor ${fileName}`);
    }
    targets = await response.json();
    
    // Po načtení nových dat spustíme nové kolo
    nextRound();
  } catch (err) {
    console.error("Chyba při načítání JSON dat:", err);
    document.getElementById("target-name").textContent = "Chyba načítání dat";
  }
}

// Inicializace Leaflet mapy
function initMap() {
  const baseSlepaMapa = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{y}/{x}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 16,
    minZoom: 7
  });

  overlayHranice = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.5
  });

  overlayReky = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 16,
    opacity: 0.35
  });

  overlayPopisky = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{y}/{x}{r}.png', {
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 16,
    opacity: 0.85
  });

  map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false,
    layers: [baseSlepaMapa]
  }).setView(CONFIG.mapCenter, CONFIG.defaultZoom);

  const overlayMaps = {
    "Hranice": overlayHranice,
    "Vodní toky a řeky": overlayReky,
    "Popisky a názvy": overlayPopisky
  };

  L.control.layers(null, overlayMaps, { collapsed: true }).addTo(map);
  map.on('click', handleMapClick);
}

// Spuštění nového kola
function nextRound() {
  hideModal();

  if (activeMarker) {
    map.removeLayer(activeMarker);
    activeMarker = null;
  }

  // Kontrola, zda jsou data načtena
  if (!targets || targets.length === 0) {
    document.getElementById("target-name").textContent = "Žádná data k dispozici";
    return;
  }

  // Výběr náhodného cíle z načteného JSONu
  const randomIndex = Math.floor(Math.random() * targets.length);
  currentTarget = targets[randomIndex];
  
  const targetElem = document.getElementById("target-name");
  if (targetElem) {
    targetElem.textContent = currentTarget.name;
  }

  resetTimer();
}

// Reakce na kliknutí do mapy
function handleMapClick(e) {
  if (!currentTarget || timeLeft <= 0) return;

  clearInterval(timer);

  const clickedCoords = [e.latlng.lat, e.latlng.lng];
  const distance = calculateDistance(clickedCoords, currentTarget.coords);

  activeMarker = L.marker(currentTarget.coords).addTo(map);

  let title = "";
  let text = "";

  if (distance <= CONFIG.toleranceKm) {
    score += 1;
    const scoreElem = document.getElementById("score");
    if (scoreElem) scoreElem.textContent = score;
    title = "Výborně!";
    text = `Vedle o ${Math.round(distance)} km. Získáváš 1 bod.`;
  } else {
    title = "Vedle!";
    text = `Cíl byl vzdálený ${Math.round(distance)} km od tvého tipu.`;
  }

  showModal(title, text);
}

// Časovač
function resetTimer() {
  clearInterval(timer);
  timeLeft = CONFIG.roundTime;
  
  const timerElem = document.getElementById("timer");
  if (timerElem) timerElem.textContent = timeLeft;

  timer = setInterval(() => {
    timeLeft--;
    if (timerElem) timerElem.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(timer);
      showModal("Čas vypršel!", `Správné místo bylo: ${currentTarget.name}`);
      activeMarker = L.marker(currentTarget.coords).addTo(map);
    }
  }, 1000);
}

// Výpočet vzdálenosti
function calculateDistance(coords1, coords2) {
  const R = 6371;
  const dLat = (coords2[0] - coords1[0]) * Math.PI / 180;
  const dLon = (coords2[1] - coords1[1]) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1[0] * Math.PI / 180) * Math.cos(coords2[0] * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Modál
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
