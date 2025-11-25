// core/state-manager.js
// Centralized application state and API. Wraps and enhances globalState.

import { getUnitSystem as fmtGetUnit, setUnitSystem as fmtSetUnit, setIntensityScale as fmtSetScale } from '../utils/formatters.js';
import { globalState as legacyGlobal } from '../globalState.js';

// Start with a simple internal state. We'll mirror important parts to window for compatibility.
const state = {
  map: null,
  markers: [],
  data: [],
  editMode: false,
  selectedPoint: null,
  trackLine: null,
  stormCircles: {},
  floatingDialog: null,
  ghostMarkers: {},
  isochroneUpdateTimeout: null,
  lastEscPressTime: 0,
  currentIsochrones: [],
  shapefilePoints: [],
  shapefileLayerGroup: null,
  shapefileCount: 0,
  currentForecastTau: 0,
  forecastLines: [],
  currentForecastMarkers: [],
  displayedStorms: [],
  isochronesEnabled: true,
  adeckStorms: null,
  adeckStormSelectionDialog: null,
  selectedStormId: null,
  currentModelName: null,
  stormStructuresVisible: true,
  adeckDialogWasShown: false,
  unitSystem: 'metric',
  currentScale: 'saffir-simpson',
  activeBasemapId: 'osm',
  activeBasemapLayer: null,
  labelMinZoom: 8,
  labelMaxZoom: 14,
  // Visualization panel & toggles
  visualizationPanelVisible: true,
  trackLineVisible: true,
  dateLabelsVisible: true,
  // View mode state
  viewMode: 'overview', // 'overview' | 'detailed'
  overviewBounds: null, // { north, south, east, west }
  detailedZoomLevel: 10,
  overviewZoomLevel: 5,
  // A-deck visibility state (centralized, mirrored to localStorage for compatibility)
  adeckHiddenTracks: {},
};

export function initializeState() {
  // Seed from legacy globalState once for backward compatibility
  try {
    if (legacyGlobal) {
      Object.keys(state).forEach(k => {
        if (k in legacyGlobal && legacyGlobal[k] !== undefined) state[k] = legacyGlobal[k];
      });
    }
  } catch {}
  // Load visualization preferences from localStorage (defaults to true)
  try {
    const vp = localStorage.getItem('vizPanelVisible');
    const tl = localStorage.getItem('trackLineVisible');
    const dl = localStorage.getItem('dateLabelsVisible');
    const ie = localStorage.getItem('isochronesEnabled');
    const ssv = localStorage.getItem('stormStructuresVisible');
    const vm = localStorage.getItem('viewMode');
    const ob = localStorage.getItem('overviewBounds');
    const dz = localStorage.getItem('detailedZoomLevel');
    const oz = localStorage.getItem('overviewZoomLevel');
  const aht = localStorage.getItem('adeckHiddenTracks');
    if (vp !== null) state.visualizationPanelVisible = vp === 'true';
    if (tl !== null) state.trackLineVisible = tl === 'true';
    if (dl !== null) state.dateLabelsVisible = dl === 'true';
    if (ie !== null) state.isochronesEnabled = ie === 'true';
    if (ssv !== null) state.stormStructuresVisible = ssv === 'true';
    if (vm) state.viewMode = vm === 'detailed' ? 'detailed' : 'overview';
    if (ob) {
      try {
        const parsed = JSON.parse(ob);
        if (parsed && typeof parsed === 'object' &&
            ['north','south','east','west'].every(k => k in parsed)) {
          state.overviewBounds = parsed;
        }
      } catch {}
    }
    if (dz !== null && !isNaN(Number(dz))) state.detailedZoomLevel = Number(dz);
    if (oz !== null && !isNaN(Number(oz))) state.overviewZoomLevel = Number(oz);
    if (aht) {
      try { state.adeckHiddenTracks = JSON.parse(aht) || {}; } catch { state.adeckHiddenTracks = {}; }
    }
  } catch {}
  // Mirror key state to window
  mirrorToWindow();
}

export function resetState() {
  // Clean up map layers first
  try { clearMarkers(); } catch {}
  try { clearStormCircles(); } catch {}
  try { const tl = state.trackLine; if (tl && tl.remove) tl.remove(); state.trackLine = null; } catch {}
  try {
    const map = state.map;
    (state.currentIsochrones || []).forEach(l => { try { l.removeFrom(map); } catch {} });
    state.currentIsochrones = [];
  } catch {}
  try {
    const grp = state.shapefileLayerGroup;
    if (grp && grp.clearLayers) grp.clearLayers(); else if (grp && grp.remove) grp.remove();
    state.shapefileLayerGroup = null;
    state.shapefilePoints = [];
  } catch {}

  Object.assign(state, {
    markers: [], data: [], editMode: false, selectedPoint: null,
    trackLine: null, stormCircles: {}, floatingDialog: null, ghostMarkers: {},
    isochroneUpdateTimeout: null, lastEscPressTime: 0, currentIsochrones: [],
    shapefilePoints: [], shapefileLayerGroup: null, shapefileCount: 0,
    currentForecastTau: 0, forecastLines: [], currentForecastMarkers: [],
    displayedStorms: [], isochronesEnabled: false, adeckStorms: null,
    adeckStormSelectionDialog: null, selectedStormId: null, currentModelName: null,
    stormStructuresVisible: true,
  });
  mirrorToWindow();
}

// Generic accessors
export const getMap = () => state.map;
export function setMap(m) { state.map = m; window.map = m; }

export const getMarkers = () => state.markers;
export function addMarker(marker) { state.markers.push(marker); }
export function clearMarkers() { state.markers.forEach(m => { try { m.remove(); } catch {} }); state.markers = []; }

export const getData = () => state.data;
export function setData(arr) { state.data = Array.isArray(arr) ? arr : []; window.data = state.data; }

export const getEditMode = () => state.editMode;
export function setEditMode(v) { state.editMode = !!v; window.editMode = state.editMode; }

export const getSelectedPoint = () => state.selectedPoint;
export function setSelectedPoint(i) { state.selectedPoint = Number.isInteger(i) ? i : null; }

export const getTrackLine = () => state.trackLine;
export function setTrackLine(line) { state.trackLine = line; }

export const getStormCircles = () => state.stormCircles;
export function addStormCircle(index, layer) {
  if (!state.stormCircles[index]) state.stormCircles[index] = [];
  state.stormCircles[index].push(layer);
}
export function clearStormCircles(index) {
  if (index === undefined || index === null) {
    Object.values(state.stormCircles).forEach(arr => arr.forEach(l => { try { l.remove(); } catch {} }));
    state.stormCircles = {};
  } else if (state.stormCircles[index]) {
    state.stormCircles[index].forEach(l => { try { l.remove(); } catch {} });
    delete state.stormCircles[index];
  }
}

export const getFloatingDialog = () => state.floatingDialog;
export function setFloatingDialog(el) { state.floatingDialog = el; }

export const getGhostMarkers = () => state.ghostMarkers;
export function setGhostMarker(index, layer) { state.ghostMarkers[index] = layer; }
export function clearGhostMarker(index) { const m = state.ghostMarkers[index]; if (m) { try { m.remove(); } catch {} } delete state.ghostMarkers[index]; }
export function clearAllGhostMarkers() { Object.keys(state.ghostMarkers).forEach(k => clearGhostMarker(k)); }

export const getIsochroneUpdateTimeout = () => state.isochroneUpdateTimeout;
export function setIsochroneUpdateTimeout(id) { state.isochroneUpdateTimeout = id; }

export const getLastEscPressTime = () => state.lastEscPressTime;
export function setLastEscPressTime(t) { state.lastEscPressTime = Number(t) || 0; }

export const getCurrentIsochrones = () => state.currentIsochrones;
export function setCurrentIsochrones(arr) { state.currentIsochrones = Array.isArray(arr) ? arr : []; }

export const getShapefilePoints = () => state.shapefilePoints;
export function setShapefilePoints(arr) { state.shapefilePoints = Array.isArray(arr) ? arr : []; }

export const getShapefileLayerGroup = () => state.shapefileLayerGroup;
export function setShapefileLayerGroup(l) { state.shapefileLayerGroup = l; }

export const getShapefileCount = () => state.shapefileCount;
export function setShapefileCount(n) { state.shapefileCount = Number(n) || 0; }

export const getCurrentForecastTau = () => state.currentForecastTau;
export function setCurrentForecastTau(n) { state.currentForecastTau = Number(n) || 0; }

export const getForecastLines = () => state.forecastLines;
export function setForecastLines(arr) { state.forecastLines = Array.isArray(arr) ? arr : []; }

export const getCurrentForecastMarkers = () => state.currentForecastMarkers;
export function setCurrentForecastMarkers(arr) { state.currentForecastMarkers = Array.isArray(arr) ? arr : []; }

export const getDisplayedStorms = () => state.displayedStorms;
export function setDisplayedStorms(arr) { state.displayedStorms = Array.isArray(arr) ? arr : []; }

export const getIsochronesEnabled = () => state.isochronesEnabled;
export function setIsochronesEnabled(v) { state.isochronesEnabled = !!v; window.isochronesVisible = state.isochronesEnabled; saveVisualizationPreferences(); }

export const getAdeckStorms = () => state.adeckStorms;
export function setAdeckStorms(v) { state.adeckStorms = v; }

export const getAdeckStormSelectionDialog = () => state.adeckStormSelectionDialog;
export function setAdeckStormSelectionDialog(v) { state.adeckStormSelectionDialog = v; }

export const getSelectedStormId = () => state.selectedStormId;
export function setSelectedStormId(v) { state.selectedStormId = v; }

export const getCurrentModelName = () => state.currentModelName;
export function setCurrentModelName(v) { state.currentModelName = v; }

export const getStormStructuresVisible = () => state.stormStructuresVisible;
export function setStormStructuresVisible(v) { state.stormStructuresVisible = !!v; saveVisualizationPreferences(); }

export const getUnitSystem = () => state.unitSystem;
export function setUnitSystem(v) { if (v === 'metric' || v === 'imperial') { state.unitSystem = v; fmtSetUnit(v); window.unitSystem = v; } }

export const getCurrentScale = () => state.currentScale;
export function setCurrentScale(v) { if (v === 'saffir-simpson' || v === 'bom') { state.currentScale = v; fmtSetScale(v); window.currentScale = v; } }

export const getActiveBasemapId = () => state.activeBasemapId;
export function setActiveBasemapId(id) { state.activeBasemapId = id; }

export const getActiveBasemapLayer = () => state.activeBasemapLayer;
export function setActiveBasemapLayer(layer) { state.activeBasemapLayer = layer; }

export const getLabelMinZoom = () => state.labelMinZoom;
export const getLabelMaxZoom = () => state.labelMaxZoom;

// Visualization panel & toggles with persistence
export const getVisualizationPanelVisible = () => state.visualizationPanelVisible;
export function setVisualizationPanelVisible(v) {
  state.visualizationPanelVisible = !!v;
  saveVisualizationPreferences();
}

export const getTrackLineVisible = () => state.trackLineVisible;
export function setTrackLineVisible(v) {
  state.trackLineVisible = !!v;
  saveVisualizationPreferences();
}

export const getDateLabelsVisible = () => state.dateLabelsVisible;
export function setDateLabelsVisible(v) {
  state.dateLabelsVisible = !!v;
  saveVisualizationPreferences();
}

function saveVisualizationPreferences() {
  try {
    localStorage.setItem('vizPanelVisible', String(state.visualizationPanelVisible));
    localStorage.setItem('trackLineVisible', String(state.trackLineVisible));
    localStorage.setItem('dateLabelsVisible', String(state.dateLabelsVisible));
    localStorage.setItem('isochronesEnabled', String(state.isochronesEnabled));
    localStorage.setItem('stormStructuresVisible', String(state.stormStructuresVisible));
    localStorage.setItem('viewMode', state.viewMode);
    localStorage.setItem('overviewBounds', JSON.stringify(state.overviewBounds));
    // Keep A-deck visibility mirrored for legacy readers
    localStorage.setItem('adeckHiddenTracks', JSON.stringify(state.adeckHiddenTracks || {}));
  } catch {}
}

function mirrorToWindow() {
  if (typeof window === 'undefined') return;
  window.map = state.map;
  window.data = state.data;
  window.editMode = state.editMode;
  window.unitSystem = state.unitSystem;
  window.visualizationPanelVisible = state.visualizationPanelVisible;
  window.viewMode = state.viewMode;
}

// View mode accessors
export const getViewMode = () => state.viewMode;
export function setViewMode(mode) {
  state.viewMode = mode === 'detailed' ? 'detailed' : 'overview';
  saveVisualizationPreferences();
}

export const getOverviewBounds = () => state.overviewBounds;
export function setOverviewBounds(bounds) {
  // Expecting { north, south, east, west }
  if (bounds && typeof bounds === 'object') {
    state.overviewBounds = {
      north: Number(bounds.north), south: Number(bounds.south),
      east: Number(bounds.east), west: Number(bounds.west)
    };
    saveVisualizationPreferences();
  }
}

export const getDetailedZoomLevel = () => state.detailedZoomLevel;
export function setDetailedZoomLevel(level) {
  const n = Number(level);
  if (!isNaN(n)) {
    state.detailedZoomLevel = n;
    try { localStorage.setItem('detailedZoomLevel', String(n)); } catch {}
  }
}

export const getOverviewZoomLevel = () => state.overviewZoomLevel;
export function setOverviewZoomLevel(level) {
  const n = Number(level);
  if (!isNaN(n)) {
    state.overviewZoomLevel = n;
    try { localStorage.setItem('overviewZoomLevel', String(n)); } catch {}
  }
}

// A-deck visibility (centralized)
export const getAdeckHiddenTracks = () => ({ ...(state.adeckHiddenTracks || {}) });
export function setAdeckHiddenTracks(map) {
  if (!map || typeof map !== 'object') return;
  state.adeckHiddenTracks = { ...map };
  try { localStorage.setItem('adeckHiddenTracks', JSON.stringify(state.adeckHiddenTracks)); } catch {}
}

// Per-track helpers for A-deck visibility
export function setAdeckTrackHidden(trackId, hidden) {
  const id = typeof trackId === 'string' ? trackId.trim() : '';
  if (!id) return;
  const val = !!hidden;
  state.adeckHiddenTracks = { ...(state.adeckHiddenTracks || {}), [id]: val };
  try { localStorage.setItem('adeckHiddenTracks', JSON.stringify(state.adeckHiddenTracks)); } catch {}
}

export const isAdeckTrackHidden = (trackId) => {
  const id = typeof trackId === 'string' ? trackId.trim() : '';
  if (!id) return false;
  const map = state.adeckHiddenTracks || {};
  return !!map[id];
};

export default {
  initializeState,
  resetState,
  // getters/setters (expose selectively if needed)
};
