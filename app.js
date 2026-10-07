/**
 * Inicializace Leaflet mapy (Čistě na ArcGIS Esri dlaždicích)
 */
function initMap() {
  // 1. ZÁKLAD: Čistá slepá mapa od Esri (World Light Gray Base)
  const baseSlepaMapa = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
    minZoom: 7
  });

  // 2. VRSTVA: Pouze hranice od Esri (World Boundaries and Places)
  const overlayHranice = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.65
  });

  // 3. VRSTVA: Pouze popisky a názvy od Esri (World Light Gray Reference)
  const overlayPopisky = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 16,
    opacity: 0.85
  });

  state.map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false,
    layers: [baseSlepaMapa]
  }).setView(CONFIG.mapCenter, CONFIG.defaultZoom);

  const overlayMaps = {
    "Hranice": overlayHranice,
    "Popisky a názvy": overlayPopisky
  };

  L.control.layers(null, overlayMaps, { collapsed: true }).addTo(state.map);
  state.map.on('click', handleMapClick);
}
