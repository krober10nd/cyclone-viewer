// core/map-manager.js
// Map initialization and basemap management

import * as State from './state-manager.js';
import { getUnitSystem, getIntensityScale, saffirSimpsonScale, bomScale } from '../utils/formatters.js';

const L = typeof window !== 'undefined' ? window.L : undefined;

const MAX_BASEMAP_TILE_ERRORS = 2;
// Use Vite dev proxy for Esri tiles in development to avoid CORS; direct URL in production/legacy servers
const SAT_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
  ? '/arcgis-tiles/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const basemapErrorCounters = {};
const basemapTileErrorHandlers = {};
let legendControl = null;

export const basemaps = {
  osm: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    crossOrigin: true,
  }),
  carto: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; CARTO',
    crossOrigin: true,
  }),
  topo: () => L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap contributors',
    crossOrigin: true,
  }),
  satellite: () => L.tileLayer(SAT_URL, {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
    crossOrigin: true,
  }),
  terrain: () => L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg', {
    maxZoom: 17,
    attribution: 'Map tiles by Stamen Design',
    crossOrigin: true,
  }),
};

export const basemapDisplayNames = {
  osm: 'OpenStreetMap',
  carto: 'CARTO Voyager',
  topo: 'OpenTopoMap',
  satellite: 'Satellite (Esri World Imagery)',
  terrain: 'Stamen Terrain',
};

export function getBasemapDisplayName(id) { return basemapDisplayNames[id] || id; }

export function initializeMap() {
  console.info('[Map Manager] Initializing map...');
  if (!L) {
    console.error('[Map Manager] Leaflet (L) not available on window');
    throw new Error('Leaflet not available on window');
  }
  const mapEl = document.getElementById('map');
  if (!mapEl) {
    console.error('[Map Manager] Map container element not found');
    throw new Error('Map container #map not found in DOM');
  }
  console.info('[Map Manager] Creating Leaflet map instance');
  const map = L.map('map', { center: [20, -60], zoom: 4 });
  if (!map) {
    console.error('[Map Manager] Failed to create Leaflet map instance');
    throw new Error('Failed to create Leaflet map');
  }
  console.info('[Map Manager] Map instance created, storing in state');
  State.setMap(map);
  window.map = map; // compatibility

  // Default to OSM for reliability (reduced CORS/network issues); users can switch to Satellite
  const defaultBasemap = State.getActiveBasemapId() || 'osm';
  console.info('[Map Manager] Changing to basemap:', defaultBasemap);
  changeBasemap(defaultBasemap);

  // Emit readiness event for adeck-reader.js or others
  setTimeout(() => {
    const ev = new CustomEvent('leaflet-map-ready', { detail: { map } });
    window.dispatchEvent(ev);
  }, 0);

  setupFullscreenHandler();
  addCategoryLegend();
  addModelVisibilityControl();
  addScreenshotControl();
  // Adjust map size on window resize if needed
  try { window.addEventListener('resize', adjustMapSize); } catch {}

  map.on('zoomend moveend', () => {
    try { if (window.updateDateLabels) window.updateDateLabels(); } catch {}
  });

  console.info('[Map Manager] Map initialization complete');
  return map;
}

export function changeBasemap(basemapId, options = {}) {
  console.info('[Map Manager] Changing basemap to:', basemapId);
  const map = State.getMap();
  if (!map) {
    console.error('[Map Manager] No map instance available for basemap change');
    return;
  }
  const prev = State.getActiveBasemapLayer();
  if (prev) {
    try { prev.off('tileerror', basemapTileErrorHandlers[State.getActiveBasemapId()]); } catch {}
    try { prev.remove(); } catch {}
  }
  const create = basemaps[basemapId] || basemaps.osm;
  const layer = create();
  basemapErrorCounters[basemapId] = 0;
  let firstTileLoaded = false;
  const onErr = (e) => {
    try {
      const src = e?.tile?.src || '(n/a)';
      const coords = e?.coords ? `${e.coords.z}/${e.coords.x}/${e.coords.y}` : '(no coords)';
      console.warn('[Map Manager] Tile error on', basemapId, 'tile:', coords, 'src:', src);
    } catch {}
    handleBasemapTileError(basemapId);
  };
  basemapTileErrorHandlers[basemapId] = onErr;
  layer.on('loading', () => console.info('[Map Manager] Basemap loading start:', basemapId));
  layer.on('load', () => console.info('[Map Manager] Basemap fully loaded:', basemapId));
  layer.on('tileload', (e) => {
    if (!firstTileLoaded) {
      firstTileLoaded = true;
      try { console.info('[Map Manager] First tile loaded for', basemapId, '→', e?.tile?.src || '(n/a)'); } catch {}
    }
  });
  layer.on('tileerror', onErr);
  layer.addTo(map);
  State.setActiveBasemapId(basemapId);
  State.setActiveBasemapLayer(layer);
  console.info('[Map Manager] Basemap changed successfully to:', basemapId);

  // If satellite selected and tiles don't start loading quickly, fallback
  if (basemapId === 'satellite') {
    setTimeout(() => {
      if (!firstTileLoaded && State.getActiveBasemapId() === 'satellite') {
        console.warn('[Map Manager] Satellite tiles not loaded within timeout. Falling back to OSM.');
        try { changeBasemap('osm'); if (window.showNotification) window.showNotification('Satellite tiles delayed. Falling back to OSM.', 'warning', 4000); } catch {}
      }
    }, 5000);
  }
}

export function handleBasemapTileError(basemapId) {
  basemapErrorCounters[basemapId] = (basemapErrorCounters[basemapId] || 0) + 1;
  if (basemapErrorCounters[basemapId] >= MAX_BASEMAP_TILE_ERRORS && basemapId !== 'osm') {
    // Fallback to OSM
    try { changeBasemap('osm'); if (window.showNotification) window.showNotification('Satellite tiles failed. Falling back to OSM.', 'warning', 4000); } catch {}
  }
}

export function addFullscreenControl() {
  const map = State.getMap();
  if (!map) return;
  const btn = L.control({ position: 'topleft' });
  btn.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const a = L.DomUtil.create('a', '', div);
    a.href = '#';
    a.title = 'Toggle Fullscreen';
    a.innerHTML = '&#x26F6;';
    a.onclick = (e) => { e.preventDefault(); toggleFullscreen(); };
    return div;
  };
  btn.addTo(map);
}

export function toggleFullscreen() {
  const el = document.documentElement;
  const isFs = !!document.fullscreenElement;
  if (!isFs) el.requestFullscreen?.(); else document.exitFullscreen?.();
  repositionDialogForFullscreen(!isFs, null, State.getFloatingDialog());
}

export function repositionDialogForFullscreen(isFullscreen, oldPosition, dialog) {
  if (!dialog) return;
  // Simple approach: keep dialog within viewport
  const rect = dialog.getBoundingClientRect();
  const pad = 10;
  dialog.style.left = Math.max(pad, Math.min(window.innerWidth - rect.width - pad, rect.left)) + 'px';
  dialog.style.top = Math.max(pad, Math.min(window.innerHeight - rect.height - pad, rect.top)) + 'px';
}

export function setupFullscreenHandler() {
  document.addEventListener('fullscreenchange', () => {
    repositionDialogForFullscreen(!!document.fullscreenElement, null, State.getFloatingDialog());
  });
}

export function addModelVisibilityControl() {
  // Placeholder: depends on adeck models; keep UI simple
  const map = State.getMap();
  if (!map) return;
  const ctrl = L.control({ position: 'topright' });
  ctrl.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const a = L.DomUtil.create('a', '', div);
    a.href = '#'; a.title = 'Toggle All Models'; a.innerHTML = 'M';
    a.onclick = (e) => { e.preventDefault();
      if (window.toggleAllModelsVisibility) window.toggleAllModelsVisibility();
    };
    return div;
  };
  ctrl.addTo(map);
}

export function addCategoryLegend() {
  const map = State.getMap();
  if (!map) return;
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');
    const scaleName = getIntensityScale();
    const scale = scaleName === 'bom' ? bomScale : saffirSimpsonScale;
    const html = ['<strong>Intensity</strong>'];
    scale.forEach(cat => {
      const color = cat.color || '#ccc';
      const name = cat.name;
      html.push(`<div><span style="display:inline-block;width:12px;height:12px;background:${color};margin-right:6px;border:1px solid #333"></span>${name}</div>`);
    });
    div.innerHTML = html.join('');
    return div;
  };
  legend.addTo(map);
  // keep a reference for refresh
  legendControl = legend;
}

export function addScreenshotControl() {
  if (!L) return;
  const map = State.getMap();
  try {
    if (L.easyPrint) {
      L.easyPrint({ position: 'topleft', title: 'Screenshot', exportOnly: true, hideControlContainer: false }).addTo(map);
      return;
    }
  } catch {}
  // Fallback to html2canvas
  const ctrl = L.control({ position: 'topleft' });
  ctrl.onAdd = () => {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const a = L.DomUtil.create('a', '', div);
    a.href = '#'; a.title = 'Screenshot'; a.innerHTML = '&#128247;';
    a.onclick = (e) => { e.preventDefault(); if (window.html2canvas) { window.html2canvas(document.body).then(() => {}); } };
    return div;
  };
  ctrl.addTo(map);
}

export function refreshLegend() {
  const map = State.getMap();
  const ctrl = legendControl;
  if (map && ctrl) { try { ctrl.remove(); } catch {} }
  addCategoryLegend();
}

// Optional: Adjust map after container size changes
export function adjustMapSize() {
  const map = State.getMap();
  if (!map) return;
  try { map.invalidateSize(); } catch {}
}
