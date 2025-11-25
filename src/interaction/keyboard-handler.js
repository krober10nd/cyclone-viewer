// interaction/keyboard-handler.js
// Keyboard shortcuts: Escape, double-Escape, 'c', 's'/'S', navigation keys

import * as State from '../core/state-manager.js';
import { deselectAll, selectPoint } from './selection-handler.js';
import { togglePanelVisibility } from '../ui/visualization-panel.js';
import { formatWindSpeed } from '../utils/formatters.js';
import { toggleStormStructures } from '../visualization/storm-attributes.js';

const DOUBLE_ESC_MS = 500;

const keyMap = {
  Escape: handleEscapeKey,
  c: handleDeselectKey,
  s: handleStormStructureToggle,
  S: handleStormStructureToggle,
  ArrowRight: handleNavigateNext,
  ArrowLeft: handleNavigatePrevious,
  Home: handleNavigateFirst,
  End: handleNavigateLast,
  m: handleNavigateMaxIntensity,
  M: handleNavigateMaxIntensity,
  v: handleToggleVisualizationPanel,
  V: handleToggleVisualizationPanel,
};

export function setupKeyboardHandlers() {
  document.addEventListener('keydown', (e) => {
    if (isEditableTarget(e.target)) return; // ignore typing in inputs/textareas/contenteditable
    const fn = keyMap[e.key];
    if (fn) fn(e);
  });
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || !!el.isContentEditable;
}

function handleEscapeKey(e) {
  e.preventDefault();
  const now = Date.now();
  const last = State.getLastEscPressTime();
  if (now - last <= DOUBLE_ESC_MS) {
    // Double press -> confirm reset
    const ok = typeof window !== 'undefined' && window.confirm ? window.confirm('Reset the app?') : true;
    if (ok) State.resetState();
  } else {
    deselectAll();
    State.setLastEscPressTime(now);
  }
}

function handleDeselectKey(e) { e.preventDefault(); deselectAll(); }
function handleStormStructureToggle(e) { e.preventDefault(); toggleStormStructures(); }

export function registerKeyHandler(key, handler) { keyMap[key] = handler; }
export function unregisterKeyHandler(key) { delete keyMap[key]; }

function handleToggleVisualizationPanel(e) { e.preventDefault(); togglePanelVisibility(); }

/**
 * Navigate to next storm position (wrap-around)
 * Works primarily with CSV tracks stored in State.data
 */
function handleNavigateNext(e) {
  e.preventDefault();
  const data = getActiveDataOrNotify();
  if (!data) return;
  const cur = State.getSelectedPoint();
  const next = (cur == null) ? 0 : (cur + 1) % data.length;
  selectPoint(next, { notify: true });
}

/**
 * Navigate to previous storm position (wrap-around)
 */
function handleNavigatePrevious(e) {
  e.preventDefault();
  const data = getActiveDataOrNotify();
  if (!data) return;
  const cur = State.getSelectedPoint();
  const prev = (cur == null) ? (data.length - 1) : (cur - 1 + data.length) % data.length;
  selectPoint(prev, { notify: true });
}

/** Jump to first storm position */
function handleNavigateFirst(e) {
  e.preventDefault();
  const data = getActiveDataOrNotify();
  if (!data) return;
  selectPoint(0, { notify: true, message: 'Jumped to first position' });
}

/** Jump to last storm position */
function handleNavigateLast(e) {
  e.preventDefault();
  const data = getActiveDataOrNotify();
  if (!data) return;
  selectPoint(data.length - 1, { notify: true, message: 'Jumped to last position' });
}

/** Jump to maximum intensity point (highest wind_speed) */
function handleNavigateMaxIntensity(e) {
  e.preventDefault();
  const data = getActiveDataOrNotify();
  if (!data) return;
  let maxIdx = -1; let maxWind = -Infinity;
  data.forEach((p, i) => {
    const w = Number(p.wind_speed);
    if (Number.isFinite(w) && w > maxWind) { maxWind = w; maxIdx = i; }
  });
  if (maxIdx === -1) return notify('No wind speed data available');
  selectPoint(maxIdx, { notify: true, message: `Jumped to maximum intensity (${formatWindSpeed(maxWind)})` });
}

function notify(msg, type = 'info', dur = 1200) {
  if (typeof window !== 'undefined' && typeof window.showNotification === 'function') window.showNotification(msg, type, dur);
}

function getActiveDataOrNotify() {
  const data = State.getData();
  if (data && data.length) return data;
  // If multiple A-deck tracks are rendered, navigation is ambiguous
  const tl = typeof window !== 'undefined' ? (window.trackLayers || {}) : {};
  const count = Object.keys(tl).length;
  if (count > 1) {
    notify('Navigation not available in multi-model view');
    return null;
  }
  notify('No track data loaded');
  return null;
}
