/*
 * Model Manager Module
 * Handles model colors, categories, and visibility state with localStorage persistence.
 */

const L = window.L;
import * as State from '../core/state-manager.js';

export const MODEL_COLORS = {
  // Official / reference
  OFCL: '#ff006e',
  OFCI: '#ff5d8f',
  BEST: '#8e2de2',
  CARQ: '#6a4c93',
  // Dynamical / globals
  AVNO: '#1f77b4',
  AVNI: '#4fa3d1',
  GFS: '#1f77b4',
  ECMWF: '#ff7f0e',
  EMXI: '#f39c12',
  UKM: '#2ca02c',
  UKMI: '#58d68d',
  CMC: '#9467bd',
  HWRF: '#e377c2',
  HMON: '#e74c3c',
  CTCX: '#17becf',
  NVGM: '#2e86c1',
  // Statistical
  DSHP: '#00b894',
  SHIP: '#55efc4',
  LGEM: '#00cec9',
  // Trajectory / simple models
  BAMD: '#7f8c8d',
  BAMM: '#95a5a6',
  BAMS: '#bdc3c7',
  LBAR: '#636e72',
  XTRP: '#8395a7',
  // Consensus
  TVCN: '#d62728',
  TVCE: '#ff8a65',
  TVCX: '#c0392b',
  GUNA: '#8e44ad',
  GUNS: '#9b59b6',
  CONU: '#c0392b',
  HCCA: '#f1c40f',
};

let hiddenTracks = {};
const HIDDEN_STORAGE_KEY = 'adeckHiddenTracks';
const HIDDEN_UPDATED_AT_KEY = 'adeckHiddenTracksUpdatedAt';
const HIDDEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getHiddenTracks() {
  return { ...hiddenTracks };
}

function sanitizeHidden(obj) {
  const out = {};
  try {
    Object.keys(obj || {}).forEach((k) => { out[k] = !!obj[k]; });
  } catch {}
  return out;
}

function loadHidden() {
  // Prefer centralized state only when non-empty; else fallback to localStorage, then merge
  let fromState = {};
  try {
    if (typeof State.getAdeckHiddenTracks === 'function') {
      const got = State.getAdeckHiddenTracks();
      if (got && typeof got === 'object') fromState = { ...got };
    }
  } catch { /* no-op */ }

  const hasState = fromState && typeof fromState === 'object' && Object.keys(fromState).length > 0;
  if (hasState) {
    hiddenTracks = sanitizeHidden(fromState);
    return;
  }

  let fromLocal = {};
  try {
    const tsRaw = localStorage.getItem(HIDDEN_UPDATED_AT_KEY);
    const ts = tsRaw ? Number(tsRaw) : 0;
    if (ts && Date.now() - ts > HIDDEN_TTL_MS) {
      // Expired cache
      localStorage.removeItem(HIDDEN_STORAGE_KEY);
      localStorage.removeItem(HIDDEN_UPDATED_AT_KEY);
      fromLocal = {};
    } else {
      const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
      fromLocal = raw ? JSON.parse(raw) || {} : {};
    }
  } catch { fromLocal = {}; }

  // Merge: local first, then centralized (centralized wins if keys exist later)
  hiddenTracks = sanitizeHidden({ ...fromLocal, ...fromState });
  try { console.info('[Adeck ModelManager] Loaded hidden tracks:', Object.keys(hiddenTracks).length, Object.keys(hiddenTracks)); } catch {}
}

function saveHidden() {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(hiddenTracks));
    localStorage.setItem(HIDDEN_UPDATED_AT_KEY, String(Date.now()));
  } catch {}
  try { if (typeof State.setAdeckHiddenTracks === 'function') State.setAdeckHiddenTracks(hiddenTracks); } catch {}
}

export function initializeModelManager() {
  loadHidden();
  // Expose for legacy consumers
  window.MODEL_COLORS = window.MODEL_COLORS || MODEL_COLORS;
  window.getModelColor = getModelColor;
  console.info('[Adeck ModelManager] Initialized; hidden tracks:', Object.keys(hiddenTracks).length);
  // Expose helpers for debugging
  window.showAllAdeckTracks = showAllTracks;
  window.clearAdeckVisibilityCache = clearVisibilityCache;
}

/**
 * Return a display color for a given model id (supports PHxx ensembles)
 */
export function getModelColor(modelId) {
  if (!modelId) return '#00AAFF';
  const id = String(modelId).toUpperCase();
  if (MODEL_COLORS[id]) return MODEL_COLORS[id];
  // Ensemble pattern PHxx
  const m = id.match(/^PH(\d{2})$/);
  if (m) {
    const n = Number(m[1]);
    const hue = (n * 13) % 360; // vary hue by member number
    return `hsl(${hue}, 75%, 55%)`;
    }
  return window.DEFAULT_TRACK_COLOR || '#00AAFF';
}

/**
 * Basic category groupings for UI filtering
 */
export function getModelCategories() {
  return [
    { id: 'all', name: 'All Models', models: Object.keys(MODEL_COLORS) },
    { id: 'track_intensity', name: 'Track & Intensity Models', models: ['HWRF', 'HMON', 'CTCX', 'NVGM'] },
    { id: 'track_only', name: 'Track-Only Models', models: ['AVNO', 'GFS', 'ECMWF', 'UKM', 'CMC'] },
    { id: 'ensembles', name: 'Ensemble Members', models: [] },
  ];
}

export function formatModelName(modelId) {
  const id = String(modelId || '').toUpperCase();
  const m = id.match(/^PH(\d{2})$/);
  if (m) return `Ensemble No. ${m[1]}`;
  return id;
}

export function isKnownModel(modelId) {
  const id = String(modelId || '').toUpperCase();
  return Boolean(MODEL_COLORS[id]);
}

export function isDefaultModel(modelId) {
  // Default show: official + major globals/consensus
  return ['OFCL', 'GFS', 'ECMWF', 'UKM', 'CMC', 'TVCN', 'HCCA', 'HWRF', 'HMON'].includes(String(modelId || '').toUpperCase());
}

/**
 * Ensure newly loaded tracks are visible by default unless explicitly hidden.
 * @param {string[]} trackIds
 */
export function ensureDefaultVisibility(trackIds = []) {
  if (!Array.isArray(trackIds)) return;
  loadHidden();
  let changed = false;
  for (const id of trackIds) {
    // Be aggressive: new tracks default to visible
    if (hiddenTracks[id] !== false) { hiddenTracks[id] = false; changed = true; }
  }
  if (changed) saveHidden();
}

/**
 * Safely toggle a track layer visibility and persist preference
 */
export function toggleTrackVisibility(trackId, visible) {
  if (!trackId) return;
  const layers = window.trackLayers || {};
  const group = layers[trackId];
  const makeVisible = visible !== undefined ? !!visible : !!hiddenTracks[trackId];
  hiddenTracks[trackId] = !makeVisible;
  saveHidden();

  if (group && group.eachLayer) {
    group.eachLayer((layer) => setLayerVisibility(layer, !hiddenTracks[trackId]));
  }
  refreshVisibilityUI(trackId);
  const nowVisible = !hiddenTracks[trackId];
  console.debug('[Adeck ModelManager] Toggled visibility', trackId, '=>', nowVisible);
  try { window.showNotification && window.showNotification(`${trackId} ${nowVisible ? 'shown' : 'hidden'}`, 'info', 1200); } catch {}
}

export function applyStoredVisibility() {
  loadHidden();
  const layers = window.trackLayers || {};
  let showCount = 0;
  let hideCount = 0;
  const ids = Object.keys(layers);
  if (!ids.length) { console.info('[Adeck ModelManager] No layers to apply visibility to'); return; }
  ids.forEach((id) => {
    const group = layers[id];
    const shouldShow = !(id in hiddenTracks) || hiddenTracks[id] === false;
    if (group && group.eachLayer) group.eachLayer((layer) => setLayerVisibility(layer, shouldShow));
    shouldShow ? showCount++ : hideCount++;
    refreshVisibilityUI(id);
  });
  console.info('[Adeck ModelManager] Applied visibility → show:', showCount, 'hide:', hideCount, 'total:', ids.length);
  if (hideCount && hideCount === ids.length) {
    console.warn('[Adeck ModelManager] All tracks would be hidden by stored preferences; resetting to show all.');
    try { showAllTracks(); } catch {}
  }
}

/** Show all tracks and persist */
export function showAllTracks() {
  hiddenTracks = {};
  saveHidden();
  applyStoredVisibility();
}

/** Clear visibility cache in localStorage */
export function clearVisibilityCache() {
  try { localStorage.removeItem(HIDDEN_STORAGE_KEY); localStorage.removeItem(HIDDEN_UPDATED_AT_KEY); } catch {}
  hiddenTracks = {};
}

// Reset visibility preferences and show all tracks
export function resetToDefaults() {
  clearVisibilityCache();
  try { showAllTracks(); } catch {}
  console.info('[Adeck ModelManager] Visibility reset to defaults (all tracks shown)');
}

function refreshVisibilityUI(trackId) {
  // Placeholder: If you have per-row buttons, toggle their state here.
  const btn = document.querySelector(`[data-track-id="${trackId}"] .visibility-toggle`);
  if (btn) btn.textContent = hiddenTracks[trackId] ? '🚫' : '👁️';
}

function setLayerVisibility(layer, visible) {
  try {
    if (typeof layer.setStyle === 'function') {
      layer.setStyle({ opacity: visible ? 1 : 0, fillOpacity: visible ? 0.2 : 0 });
    }
    const el = layer._path || layer._icon;
    if (el && el.style) el.style.display = visible ? '' : 'none';
  } catch (e) { /* no-op */ }
}

/**
 * Public helper for external callers (markers/HTML icon or circle markers)
 */
export function setMarkerVisibility(marker, visible) {
  try {
    setLayerVisibility(marker, visible);
  } catch { /* no-op */ }
}
