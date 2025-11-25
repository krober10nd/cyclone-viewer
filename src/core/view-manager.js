// core/view-manager.js
// Orchestrates view modes (overview/detailed), zoom transitions, and visualization coordination

import * as State from './state-manager.js';
import { displayStormAttributes, clearAllStormVisualizations } from '../visualization/storm-attributes.js';
import { showIsochrones, clearIsochrones } from '../visualization/isochrones.js';
import { updateDateLabels } from '../visualization/track-renderer.js';

const L = typeof window !== 'undefined' ? window.L : undefined;

const TRANSITION_DURATION = 0.8; // seconds

function getDetailedZoom() { return State.getDetailedZoomLevel?.() ?? 10; }
function getOverviewZoom() { return State.getOverviewZoomLevel?.() ?? 5; }

export function enterDetailedMode(pointIndex, options = {}) {
  try {
    const map = State.getMap();
    const data = State.getData();
    if (!map || !data || pointIndex == null || !data[pointIndex]) return;

    // Save current bounds as overview baseline if coming from overview
    if ((State.getViewMode?.() || 'overview') === 'overview') {
      try {
        const b = map.getBounds();
        const boundsObj = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
        State.setOverviewBounds(boundsObj);
      } catch {}
    }

    State.setViewMode('detailed');

    const p = data[pointIndex];
    const zoom = getDetailedZoom();
    if (map.flyTo) {
      map.flyTo([p.lat, p.lon], zoom, { duration: TRANSITION_DURATION });
    } else if (map.setView) {
      map.setView([p.lat, p.lon], zoom);
    }

    if (State.getStormStructuresVisible?.()) displayStormAttributes(pointIndex);
    if (State.getIsochronesEnabled?.() && State.getEditMode?.()) showIsochrones(pointIndex);

    try { updateDateLabels(); } catch {}
    updateViewModeIndicator('detailed');

    if (options.notify && window.showNotification) window.showNotification('Detailed view', 'info', 1000);
  } catch (e) { console.warn('[view-manager] enterDetailedMode error', e); }
}

export function enterOverviewMode(options = {}) {
  try {
    const map = State.getMap();
    State.setViewMode('overview');

    // Clear overlays
    try { clearAllStormVisualizations(); } catch {}
    try { clearIsochrones(); } catch {}

    const saved = State.getOverviewBounds?.();
    const markers = State.getMarkers?.() || [];

    if (map) {
      if (saved && L && L.latLngBounds) {
        const llb = L.latLngBounds([[saved.south, saved.west], [saved.north, saved.east]]);
        try { map.flyToBounds(llb, { duration: TRANSITION_DURATION, padding: [50, 50] }); }
        catch { map.fitBounds(llb, { padding: [50, 50] }); }
      } else if (markers.length) {
        const group = L && L.featureGroup ? L.featureGroup(markers) : null;
        if (group) {
          const b = group.getBounds().pad(0.2);
          try { map.flyToBounds(b, { duration: TRANSITION_DURATION }); }
          catch { map.fitBounds(b); }
        } else {
          const z = getOverviewZoom();
          try { map.setZoom(z); } catch {}
        }
      } else {
        // Fallback to a generic world view
        const z = getOverviewZoom();
        try { map.setZoom(z); } catch {}
      }
    }

    try { updateDateLabels(); } catch {}
    updateViewModeIndicator('overview');

    if (options.notify && window.showNotification) window.showNotification('Overview', 'info', 1000);
  } catch (e) { console.warn('[view-manager] enterOverviewMode error', e); }
}

export function toggleViewMode() {
  const mode = State.getViewMode?.() || 'overview';
  const sel = State.getSelectedPoint?.();
  if (mode === 'overview' && sel != null) enterDetailedMode(sel);
  else enterOverviewMode();
}

export function updateViewModeIndicator(mode) {
  try {
    const mapContainer = document.getElementById('map-container') || document.body;
    let el = document.getElementById('view-mode-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'view-mode-indicator';
      el.className = 'view-mode-badge overview';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-label', 'Current view mode');
      el.textContent = '🗺️ Overview';
      mapContainer.appendChild(el);
    }
    el.classList.remove('overview', 'detailed', 'fade-in');
    if (mode === 'detailed') {
      el.classList.add('detailed');
      el.textContent = '🔍 Detailed';
    } else {
      el.classList.add('overview');
      el.textContent = '🗺️ Overview';
    }
    // trigger fade-in
    void el.offsetWidth; // reflow
    el.classList.add('fade-in');
  } catch {}
}

export function initializeViewManager() {
  try {
    updateViewModeIndicator(State.getViewMode?.() || 'overview');
    const mode = State.getViewMode?.() || 'overview';
    const sel = State.getSelectedPoint?.();
    if (mode === 'detailed' && sel != null) {
      enterDetailedMode(sel);
    } else {
      enterOverviewMode();
    }
  } catch (e) { console.warn('[view-manager] init error', e); }
}

export const getViewMode = () => (State.getViewMode?.() || 'overview');
export const isDetailedMode = () => getViewMode() === 'detailed';
export const isOverviewMode = () => getViewMode() === 'overview';
