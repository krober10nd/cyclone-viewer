// interaction/selection-handler.js
// Selection, deselection, marker drag/edit mode, and floating dialog management

import * as State from '../core/state-manager.js';
import { formatWindSpeed, formatPointTime } from '../utils/formatters.js';
import { showIsochrones, clearIsochrones } from '../visualization/isochrones.js';
import { displayStormAttributes, clearAllStormVisualizations, createGhostMarker, removeGhostMarker } from '../visualization/storm-attributes.js';
import { getPointTimestamp } from '../utils/calculations.js';
import { enterDetailedMode, enterOverviewMode } from '../core/view-manager.js';

const L = typeof window !== 'undefined' ? window.L : undefined;

/**
 * Select a point by index with optional feedback.
 * Ensures index validity, pans map to marker, updates visualizations.
 * @param {number} index
 * @param {{notify?: boolean, message?: string}} [options]
 */
export function selectPoint(index, options = {}) {
  const data = State.getData();
  if (!data || !Number.isInteger(index) || index < 0 || index >= data.length) {
    console.warn('[selectPoint] Invalid index', index);
    return;
  }
  State.setSelectedPoint(index);
  greyOutOthers(index);
  // Visualization updates and camera transitions are handled by enterDetailedMode()

  // Optional notification
  if (options.notify && typeof window !== 'undefined' && typeof window.showNotification === 'function') {
    const p = data[index];
    const ts = deriveSelectionTime(p);
    const timeStr = ts ? formatPointTime(ts) : '';
    const windStr = p.wind_speed != null ? formatWindSpeed(p.wind_speed) : 'N/A';
    const base = options.message || `Position ${index + 1} of ${data.length}`;
    const msg = `${base}${timeStr ? ` — ${timeStr}` : ''} — Wind: ${windStr}`;
    window.showNotification(msg, 'info', 1200);
  }

  // Enter detailed mode for focused analysis
  try { enterDetailedMode(index, { notify: false }); } catch {}
}

export function deselectAll() {
  State.setSelectedPoint(null);
  resetAppearance();
  removeFloatingDialog();
  // Return to overview mode
  try { enterOverviewMode({ notify: false }); } catch {}
}

export function toggleEditMode() {
  const newVal = !State.getEditMode();
  State.setEditMode(newVal);
  removeFloatingDialog();
  resetAppearance();
  clearAllStormVisualizations();
  if (newVal && State.getSelectedPoint() != null) showIsochrones(State.getSelectedPoint());
}

export function createFloatingDialog(pointIndex) {
  const data = State.getData();
  const p = data[pointIndex];
  if (!p) return;
  const div = document.createElement('div');
  div.className = 'floating-dialog';
  div.innerHTML = `<div class="header">Point ${pointIndex}</div><div class="body">Lat: ${p.lat.toFixed(3)}, Lon: ${p.lon.toFixed(3)}</div>`;
  document.body.appendChild(div);
  State.setFloatingDialog(div);
  return div;
}

export function updateFloatingDialog(pointIndex) {
  const div = State.getFloatingDialog();
  const p = State.getData()[pointIndex];
  if (!div || !p) return;
  div.querySelector('.body').textContent = `Lat: ${p.lat.toFixed(3)}, Lon: ${p.lon.toFixed(3)}`;
}

export function removeFloatingDialog() {
  const div = State.getFloatingDialog();
  if (div && div.parentNode) div.parentNode.removeChild(div);
  State.setFloatingDialog(null);
}

export function setupMarkerDragHandlers(marker, index) {
  marker.on('dragstart', () => {
    createGhostMarker(index, { lat: marker.getLatLng().lat, lon: marker.getLatLng().lng });
  });
  marker.on('drag', () => {
    const ll = marker.getLatLng();
    const d = State.getData();
    d[index].lat = ll.lat; d[index].lon = ll.lng;
    updateFloatingDialog(index);
  });
  marker.on('dragend', () => {
    removeGhostMarker(index);
    displayStormAttributes(index);
  });
}

export function filterShapefilePointsByTime(pointIndex) {
  const points = State.getShapefilePoints();
  if (!points || !points.length) return;
  const data = State.getData();
  const p = data[pointIndex];
  const ts = getPointTimestamp(p);
  if (!ts) return;
  const hourMs = 3600 * 1000;
  const t0 = ts.getTime();
  points.forEach((m) => {
    const props = m.feature?.properties || {};
    const tShp = extractTimeFromShapefilePoint(props);
    if (!tShp) { m.setOpacity(0.2); return; }
    const dt = Math.abs(tShp.getTime() - t0);
    m.setOpacity(dt <= hourMs ? 1 : 0.2);
  });
}

export function positionPopupToRight(marker, popup) {
  // Place popup to the right by offsetting lat/lon
  const ll = marker.getLatLng();
  popup.setLatLng([ll.lat, ll.lng + 1]);
}

function greyOutOthers(selectedIndex) { State.getMarkers().forEach((m, i) => m.setOpacity(i === selectedIndex ? 1 : 0.4)); }
function resetAppearance() { State.getMarkers().forEach(m => m.setOpacity(1)); }

// Very simple timestamp extraction from shapefile properties; expand as needed
export function extractTimeFromShapefilePoint(properties) {
  // Common patterns: ISO datetime in a field named 'time' or 'timestamp'
  const key = ['time', 'timestamp', 'datetime', 'date'].find(k => properties && properties[k]);
  if (!key) return null;
  const val = properties[key];
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Derive a Date for notifications with robust fallbacks suitable for CSV and A-deck points
function deriveSelectionTime(p) {
  try {
    // 1) Prefer canonical util that handles UTC components
    const viaUtil = getPointTimestamp(p);
    if (viaUtil instanceof Date && !isNaN(viaUtil.getTime())) return viaUtil;

    // 2) If time is already a Date
    if (p.time instanceof Date && !isNaN(p.time.getTime())) return p.time;

    // 3) If numeric epoch milliseconds
    if (typeof p.timestamp === 'number') {
      const d = new Date(p.timestamp);
      if (!isNaN(d.getTime())) return d;
    }

    // 4) Common string fields
    const strFields = [];
    if (typeof p.datetime === 'string') strFields.push(p.datetime);
    if (typeof p.date === 'string') strFields.push(p.date);
    if (typeof p.time === 'string') strFields.push(p.time);
    for (const val of strFields) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {}
  return null;
}
