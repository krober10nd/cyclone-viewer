/**
 * Cyclone Viewer Orchestrator (clean)
 * Thin entry-point that wires state, map, UI bindings, and minimal globals.
 */

import * as StateManager from './core/state-manager.js';
import * as MapManager from './core/map-manager.js';
window.MapManager = MapManager;
import * as Isochrones from './visualization/isochrones.js';
import * as TrackRenderer from './visualization/track-renderer.js';
import * as KeyboardHandler from './interaction/keyboard-handler.js';
import * as SelectionHandler from './interaction/selection-handler.js';
import { getModelColor as modelMgrGetModelColor } from './adeck/model-manager.js';
import { showStartScreen } from './ui/start-screen.js';
import { initializeVisualizationPanel } from './ui/visualization-panel.js';
import { updatePanelState } from './ui/visualization-panel.js';
import { initializeViewManager, enterOverviewMode, enterDetailedMode, toggleViewMode } from './core/view-manager.js';
import { initializeDebugPanel } from './ui/debug-panel.js';

// Bridge a few globals used by legacy UI or other scripts
window.updateDateLabels = TrackRenderer.updateDateLabels;
window.isochronesToggle = Isochrones.isochronesToggle;
window.showIsochrones = Isochrones.showIsochrones;
window.clearIsochrones = Isochrones.clearIsochrones;
window.showNotification = showNotification;
// Expose view manager helpers for debugging/automation
window.enterDetailedMode = enterDetailedMode;
window.enterOverviewMode = enterOverviewMode;
window.toggleViewMode = toggleViewMode;

// Optional centralized color helpers
window.MODEL_COLORS = window.MODEL_COLORS || {};
window.DEFAULT_TRACK_COLOR = window.DEFAULT_TRACK_COLOR || '#00AAFF';
// Preserve model-manager's color logic (ensembles, etc.)
window.getModelColor = window.getModelColor || modelMgrGetModelColor;
window.getModelDescription = (modelId) => (window.MODEL_DESCRIPTIONS?.[modelId] || `${modelId} - No description available`);

function initializeApp() {
  console.info('[Main] Initializing application...');
  // Idempotency guard: if a map already exists, assume app is initialized
  try {
    if (window.map) {
      console.info('[Main] Map already exists; skipping re-initialization');
      return;
    }
  } catch {}
  try {
    StateManager.initializeState();
    console.info('[Main] State initialized');
  } catch (e) {
    console.error('[Main] State initialization failed:', e);
    throw e;
  }

  try {
    MapManager.initializeMap();
    console.info('[Main] Map initialized');
    try {
      const map = window.map;
      const hasTile = !!Object.values(map?._layers || {}).some((ly) => ly._url);
      console.info('[Main] Basemap tile layer present:', hasTile);
      if (!hasTile) {
        console.warn('[Main] No basemap tile layer detected immediately after init.');
      }
    } catch {}
  } catch (e) {
    console.error('[Main] Map initialization failed:', e);
    throw e;
  }

  try {
    KeyboardHandler.setupKeyboardHandlers();
  } catch (e) {
    console.error('[Main] Keyboard handler setup failed:', e);
  }

  // Initialize visualization panel after map and state are ready
  try { initializeVisualizationPanel(); } catch (e) { console.warn('[Main] Viz panel init error:', e); }
  // Initialize view manager (badge + initial state)
  try { initializeViewManager(); } catch (e) { console.warn('[Main] View manager init error:', e); }
  try { setupUIEventListeners(); } catch (e) { console.warn('[Main] UI event listener setup error:', e); }
  try { initializeDebugPanel(); } catch (e) { console.warn('[Main] Debug panel init error:', e); }
}

// Expose for start screen to call if needed
window.initializeApp = initializeApp;

document.addEventListener('DOMContentLoaded', () => {
  console.info('[Main] DOMContentLoaded fired');
  // Ensure shortcuts modal is wired even before app init
  setupShortcutsModal();
  // Show a lightweight loading hint so users know the map is initializing
  try {
    const note = document.getElementById('notification');
    if (note && note.classList.contains('hidden')) {
      note.textContent = 'Initializing map and basemap…';
      note.className = 'notification info';
      note.classList.remove('hidden');
      setTimeout(() => note.classList.add('hidden'), 2500);
    }
  } catch {}
  const skip = localStorage.getItem('skipStartScreen') === 'true';
  console.info('[Main] Skip start screen:', skip);

  // Always initialize the app so the basemap is ready behind the start screen.
  // This prevents a "no basemap" perception when the overlay is visible.
  try {
    initializeApp();
    console.info('[Main] App initialized successfully');
    console.info('[Main] Debug helpers available:', {
      debugMap: 'window.debugMap()',
      fixAdeckVisibility: 'window.fixAdeckVisibility()',
      showAllAdeckTracks: 'window.showAllAdeckTracks()',
      verifyAdeckLayers: 'window.verifyAdeckLayers()',
      resetMap: 'window.resetMap()',
    });
    try {
      if (typeof MapManager.verifyBasemapLoaded === 'function') {
        const diag = MapManager.verifyBasemapLoaded();
        console.info('[Main] Basemap diagnostics after init:', diag);
      }
    } catch {}
  } catch (e) {
    console.error('[Main] App initialization failed:', e);
    if (window.showNotification) {
      window.showNotification('Failed to initialize application. Check console for details.', 'error', 10000);
    }
  }

  // Show the start screen overlay if the user hasn't opted to skip it
  if (!skip) {
    console.info('[Main] Showing start screen');
    showStartScreen();
  }
});

// ---------------- Diagnostics ----------------
window.debugMap = function debugMap() {
  try {
    const map = window.map;
    const center = map?.getCenter?.();
    const zoom = map?.getZoom?.();
    const bounds = map?.getBounds?.();
    const layers = map?._layers ? Object.keys(map._layers).length : 0;
    const hasTile = !!Object.values(map?._layers || {}).some((ly) => ly._url);
    const adeck = window.trackLayers ? Object.keys(window.trackLayers).length : 0;
    console.table({ zoom, center: center?.toString?.(), layers, hasTile, adeck, bounds: bounds?.toBBoxString?.() });
  } catch (e) { console.warn('debugMap error', e); }
};

window.fixAdeckVisibility = function fixAdeckVisibility() {
  try {
    localStorage.removeItem('adeckHiddenTracks');
    localStorage.removeItem('adeckHiddenTracksUpdatedAt');
    if (typeof window.showAllAdeckTracks === 'function') window.showAllAdeckTracks();
    if (typeof window.refreshStormListVisibility === 'function') window.refreshStormListVisibility();
    window.showNotification?.('All tracks are now visible', 'success', 2000);
  } catch (e) { console.warn('fixAdeckVisibility error', e); }
};

window.resetMap = function resetMap() {
  try {
    const map = window.map;
    // Remove all layers
    Object.values(map?._layers || {}).forEach((ly) => {
      try { map.removeLayer(ly); } catch {}
    });
    // Re-add default basemap
    MapManager.changeBasemap('osm');
    map.setView([20, -60], 4);
    localStorage.clear();
    window.showNotification?.('Map reset. Local storage cleared.', 'warning', 3000);
  } catch (e) { console.warn('resetMap error', e); }
};

// ---------------- CSV + Vector loading ----------------

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      Papa.parse(e.target.result, {
        header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: (res) => res.errors?.length ? reject(res.errors) : resolve(res.data),
        error: reject,
      });
    };
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

function findColumn(cols, lowerCols, candidates) {
  for (const opt of candidates) {
    const idx = lowerCols.findIndex((c) => c.includes(opt));
    if (idx !== -1) return cols[idx];
  }
  return null;
}

function processData(rawData) {
  if (!rawData?.length) throw new Error('No data found in CSV file.');
  const cols = Object.keys(rawData[0] || {});
  const lower = cols.map(c => c.toLowerCase());
  const latKey = findColumn(cols, lower, ['lat', 'latitude', 'y']);
  const lonKey = findColumn(cols, lower, ['lon', 'long', 'longitude', 'x']);
  if (!latKey || !lonKey) throw new Error('Could not identify latitude/longitude columns.');

  const attrDefs = [
    { key: 'rmw', options: ['rmw', 'radius_maximum_wind', 'radius_of_maximum_winds_m'] },
    { key: 'r34_ne', options: ['r34_ne', 'radius_34kt_ne', 'radius_of_34_kt_winds_ne_m'] },
    { key: 'r34_se', options: ['r34_se', 'radius_34kt_se', 'radius_of_34_kt_winds_se_m'] },
    { key: 'r34_sw', options: ['r34_sw', 'radius_34kt_sw', 'radius_of_34_kt_winds_sw_m'] },
    { key: 'r34_nw', options: ['r34_nw', 'radius_34kt_nw', 'radius_of_34_kt_winds_nw_m'] },
    { key: 'roci', options: ['roci', 'radius_outermost_isobar', 'radius_of_outer_closed_isobar_m'] },
  ];
  const attrMap = {};
  attrDefs.forEach(a => attrMap[a.key] = findColumn(cols, lower, a.options));
  const windKey = findColumn(cols, lower, ['wind', 'max_wind', 'maxwind', 'wind_speed', 'speed']);
  const pressureKey = findColumn(cols, lower, ['mslp', 'min_pressure', 'pressure', 'central_pressure', 'min_slp']);

  // Try to detect time-related columns (preference: datetime > timestamp > date > time)
  const datetimeKey = findColumn(cols, lower, ['datetime']);
  const timestampKey = findColumn(cols, lower, ['timestamp']);
  const dateKey = findColumn(cols, lower, ['date']);
  const timeExactIdx = lower.findIndex(c => c === 'time');
  const timeKey = timeExactIdx !== -1 ? cols[timeExactIdx] : null;

  const processed = rawData.map((row, idx) => {
    const lat = Number(row[latKey]);
    const lon = Number(row[lonKey]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const r = {
      ...row,
      id: idx, lat, lon,
      wind_speed: windKey ? Number(row[windKey]) : undefined,
      mslp: pressureKey ? Number(row[pressureKey]) : undefined,
      rmw: attrMap.rmw ? Number(row[attrMap.rmw]) : undefined,
      r34_ne: attrMap.r34_ne ? Number(row[attrMap.r34_ne]) : undefined,
      r34_se: attrMap.r34_se ? Number(row[attrMap.r34_se]) : undefined,
      r34_sw: attrMap.r34_sw ? Number(row[attrMap.r34_sw]) : undefined,
      r34_nw: attrMap.r34_nw ? Number(row[attrMap.r34_nw]) : undefined,
      roci: attrMap.roci ? Number(row[attrMap.roci]) : undefined,
    };

    // Add timestamp/time when available without aggressive coercion
    try {
      // datetime preferred (string parse)
      if (datetimeKey && typeof row[datetimeKey] === 'string') {
        const d = new Date(row[datetimeKey]);
        if (!isNaN(d.getTime())) r.time = d;
      }
      // timestamp numeric (epoch ms) or string parse fallback
      if (!r.time && timestampKey && row[timestampKey] != null) {
        const v = row[timestampKey];
        if (typeof v === 'number') {
          r.timestamp = v;
        } else if (typeof v === 'string') {
          const d = new Date(v);
          if (!isNaN(d.getTime())) r.time = d;
        }
      }
      // date string parse
      if (!r.time && dateKey && typeof row[dateKey] === 'string') {
        const d = new Date(row[dateKey]);
        if (!isNaN(d.getTime())) r.time = d;
      }
      // time string parse (exact 'time' column only)
      if (!r.time && timeKey && typeof row[timeKey] === 'string') {
        const d = new Date(row[timeKey]);
        if (!isNaN(d.getTime())) r.time = d;
      }
    } catch {}
    if (latKey !== 'lat') delete r[latKey];
    if (lonKey !== 'lon') delete r[lonKey];
    delete r.latitude; delete r.longitude;
    return r;
  }).filter(Boolean);

  if (!processed.length) throw new Error('No valid coordinates found in the file.');
  return processed;
}

async function loadCSVFile(file) {
  const raw = await parseCSV(file);
  const processed = processData(raw);
  StateManager.setData(processed);
  TrackRenderer.displayMarkers(true);
  TrackRenderer.displayTrackLine();
  TrackRenderer.updateDateLabels();
  try { updatePanelState(); } catch {}
  // Ensure we start in overview after loading new data
  try { enterOverviewMode({ notify: false }); } catch {}
}

async function loadShapefiles(files) {
  if (!window.shp) return;
  for (const f of files) {
    try { const geojson = await window.shp(f); TrackRenderer.addShapefilePoints(geojson); }
    catch (e) { console.warn('Error loading shapefile:', e); }
  }
}

// Expose a global CSV handler for the start screen input
window.handleCSVUpload = async (event) => {
  try {
    const file = event?.target?.files?.[0];
    if (!file) return;
    await loadCSVFile(file);
    // start-screen.js will also hide the overlay after successful load
  } catch (err) {
    console.error('CSV load error:', err);
    window.showNotification?.('Error loading CSV', 'error', 3000);
  }
};

// ---------------- UI bindings ----------------

function setupUIEventListeners() {
  const csvInput = document.getElementById('csv-file');
  if (csvInput) csvInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) await loadCSVFile(file);
  });

  const shpInput = document.getElementById('shapefile-input');
  if (shpInput) shpInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) await loadShapefiles(files);
  });

  const editBtn = document.getElementById('toggle-edit-mode');
  if (editBtn) editBtn.addEventListener('click', () => SelectionHandler.toggleEditMode());

  const unitsBtn = document.getElementById('toggle-units');
  if (unitsBtn) unitsBtn.addEventListener('click', () => {
    const next = StateManager.getUnitSystem() === 'metric' ? 'imperial' : 'metric';
    StateManager.setUnitSystem(next);
    TrackRenderer.displayMarkers(false);
    TrackRenderer.updateDateLabels();
    MapManager.refreshLegend();
  });

  const scaleSelect = document.getElementById('scale-select');
  if (scaleSelect) scaleSelect.addEventListener('change', (e) => {
    StateManager.setCurrentScale(e.target.value);
    MapManager.refreshLegend();
    TrackRenderer.displayMarkers(false);
    TrackRenderer.updateDateLabels();
  });

  const basemapSelector = document.getElementById('basemap-selector');
  if (basemapSelector) basemapSelector.addEventListener('change', (e) => MapManager.changeBasemap(e.target.value));

  const deselectBtn = document.getElementById('deselect-all');
  if (deselectBtn) deselectBtn.addEventListener('click', () => SelectionHandler.deselectAll());

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    if (window.exportToCSV) window.exportToCSV(StateManager.getData());
  });
}

function showNotification(message, type = 'info', duration = 5000) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = message;
  el.className = `notification ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), duration);
}

// ---------------- Keyboard Shortcuts Modal ----------------
function setupShortcutsModal() {
  const modal = document.getElementById('keyboard-shortcuts-modal');
  if (!modal) return; // Not present

  const openBtn = document.getElementById('keyboard-shortcuts-btn');
  const closeBtn = document.getElementById('keyboard-shortcuts-close');
  const overlay = modal.querySelector('.modal-overlay');

  const open = () => modal.classList.remove('hidden');
  const close = () => modal.classList.add('hidden');
  const isEditableTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  };

  openBtn?.addEventListener('click', (e) => { e.preventDefault(); open(); });
  closeBtn?.addEventListener('click', (e) => { e.preventDefault(); close(); });
  overlay?.addEventListener('click', (e) => { if (e.target?.dataset?.close === 'true') close(); });

  // Toggle with '?' (Shift + '/')
  document.addEventListener('keydown', (e) => {
    if (isEditableTarget(e.target)) return;
    const key = e.key;
    if (key === '?' || (key === '/' && e.shiftKey)) {
      e.preventDefault();
      if (modal.classList.contains('hidden')) open(); else close();
    } else if (key === 'Escape' && !modal.classList.contains('hidden')) {
      e.preventDefault();
      close();
    }
  }, { passive: false });
}
// End of browser entry module