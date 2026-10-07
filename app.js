// Konfigurace aplikace
const CONFIG = {
  mapCenter: [49.8175, 15.4730], // Střed ČR
  defaultZoom: 8,
  roundTime: 30, // Čas na jedno kolo v sekundách
  toleranceKm: 30 // Tolerance vzdálenosti pro úspěšný zásah v km
};

// Stavové proměnné
let map;
let currentTarget = null;
let score = 0;
let timer = null;
let timeLeft = CONFIG.roundTime;
let activeMarker = null;

// Vrstvy mapy
let overlayKraje;
let overlayReky;

// Databáze cílů
const targets = [
  { name: "Praha", coords: [50.0755, 14.4378] },
  { name: "Brno", coords: [49.1951, 16.6068] },
  { name: "Ostrava", coords: [49.8209, 18.2625] },
  { name: "Plzeň", coords: [49.7384, 13.3736] },
  { name: "Sněžka", coords: [50.7360, 15.7396] },
  { name: "Ještěd", coords: [50.7326, 15.0084] },
  { name: "Machačovo jezero", coords: [50.5806, 14.6542] },
  { name: "České Budějovice", coords: [48.9745, 14.4743] }
];

// Inicializace po načtení stránky
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  nextRound();
});

// Inicializace Leaflet mapy
function initMap() {
  // Podkladová slepá mapa (Světlá šedá base mapa)
  const baseSlepaMapa = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    minZoom: 7
  });

  // Doplňkové vrstvy
  overlayReky = L.tileLayer('https://{s}.tile.openstreetmap.fr/openriverindex/{z}/{x}/{y}.png', {
    maxZoom: 19,
    opacity: 0.7
  });

  overlayKraje = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.8
  });

  // Vytvoření mapy
  map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false,
    layers: [baseSlepaMapa]
  }).setView(CONFIG.mapCenter, CONFIG.defaultZoom);

  // Objekt pro ovládání vrstev pod ikonkou
  const overlayMaps = {
    "Hranice a popisky": overlayKraje,
    "Vodní toky": overlayReky
  };

  // Přidání ovládacího prvku vrstev v rohu mapy
  L.control.layers(null, overlayMaps, { collapsed: true }).addTo(map);

  // Posluchač kliknutí na mapu
  map.on('click', handleMapClick);
}

// Spuštění nového kola
function nextRound() {
  hideModal();

  // Odstranění předchozího markeru
  if (activeMarker) {
    map.removeLayer(activeMarker);
    activeMarker = null;
  }

  // Výběr náhodného cíle
  const randomIndex = Math.floor(Math.random() * targets.length);
  currentTarget = targets[randomIndex];
  document.getElementById("target-name").textContent = currentTarget.name;

  // Reset a spuštění časovače
  resetTimer();
}

// Reakce na kliknutí do mapy
function handleMapClick(e) {
  if (!currentTarget || timeLeft <= 0) return;

  clearInterval(timer);

  const clickedCoords = [e.latlng.lat, e.latlng.lng];
  const distance = calculateDistance(clickedCoords, currentTarget.coords);

  // Zobrazení správného místa na mapě
  activeMarker = L.marker(currentTarget.coords).addTo(map);

  let title = "";
  let text = "";

  if (distance <= CONFIG.toleranceKm) {
    score += 10;
    document.getElementById("score").textContent = score;
    title = "Výborně!";
    text = `Vedle o ${Math.round(distance)} km. Získáváš 10 bodů.`;
  } else {
    title = "Vedle!";
    text = `Cíl bol vzdálený ${Math.round(distance)} km od tvého tipu.`;
  }

  showModal(title, text);
}

// Časovač
function resetTimer() {
  clearInterval(timer);
  timeLeft = CONFIG.roundTime;
  document.getElementById("timer").textContent = timeLeft;

  timer = setInterval(() => {
    timeLeft--;
    document.getElementById("timer").textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(timer);
      showModal("Čas vypršel!", `Správné místo bylo: ${currentTarget.name}`);
      activeMarker = L.marker(currentTarget.coords).addTo(map);
    }
  }, 1000);
}

// Výpočet vzdálenosti v km (Haversine formule)
function calculateDistance(coords1, coords2) {
  const R = 6371; // Poloměr Země v km
  const dLat = (coords2[0] - coords1[0]) * Math.PI / 180;
  const dLon = (coords2[1] - coords1[1]) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1[0] * Math.PI / 180) * Math.cos(coords2[0] * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Zobrazení a skrytí modálu
function showModal(title, text) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-text").textContent = text;
  document.getElementById("overlay").style.display = "flex";
