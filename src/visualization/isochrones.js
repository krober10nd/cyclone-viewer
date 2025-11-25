// visualization/isochrones.js
// Isochrone rendering and toggling

import * as State from '../core/state-manager.js';
import { calculateBearing, calculateDestinationFromKm, estimateSpeed, calculateDistanceKm } from '../utils/calculations.js';

const L = typeof window !== 'undefined' ? window.L : undefined;

const isochroneColors = ['#5bc0de', '#66cc66', '#ffcc66', '#ff9966', '#ff6666', '#ff0000'];

export function clearIsochrones() {
  const map = State.getMap();
  const layers = State.getCurrentIsochrones();
  layers.forEach(l => { try { l.removeFrom(map); } catch {} });
  State.setCurrentIsochrones([]);
}

export function showIsochrones(pointIndex) {
  const map = State.getMap();
  if (!map || pointIndex == null) return;
  clearIsochrones();
  const data = State.getData();
  const idx = Math.max(0, Math.min(data.length - 1, pointIndex));
  const p = data[idx];
  const next = data[Math.min(idx + 1, data.length - 1)];
  const brng = calculateBearing(p.lat, p.lon, next.lat, next.lon);
  const speedKmh = estimateSpeed(idx, data) || 20; // default fallback

  const layers = [];
  for (let h = 1; h <= 6; h++) {
    const dKm = speedKmh * h;
    const fwd = calculateDestinationFromKm(p.lat, p.lon, dKm, brng);
    const left = calculateDestinationFromKm(p.lat, p.lon, dKm, brng - 90);
    const right = calculateDestinationFromKm(p.lat, p.lon, dKm, brng + 90);
    const poly = L.polyline([[p.lat, p.lon], [left.lat, left.lon], [fwd.lat, fwd.lon], [right.lat, right.lon]], {
      color: isochroneColors[h - 1], weight: 2, opacity: 0.85, smoothFactor: 1,
    }).addTo(map);
    const label = L.marker([fwd.lat, fwd.lon], { icon: L.divIcon({ className: 'isochrone-label', html: `+${h}h` }) }).addTo(map);
    layers.push(poly, label);
  }
  State.setCurrentIsochrones(layers);
}

export function isochronesToggle(force) {
  const enabled = force != null ? !!force : !State.getIsochronesEnabled();
  State.setIsochronesEnabled(enabled);
  if (enabled && State.getSelectedPoint() != null) {
    showIsochrones(State.getSelectedPoint());
  } else {
    clearIsochrones();
  }
  // Update button state in UI if present
  try {
    const btn = document.getElementById('toggle-isochrones');
    if (btn) {
      btn.classList.toggle('active', enabled);
      if (enabled) {
        btn.classList.remove('disabled');
        btn.title = 'Hide isochrones';
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || '';
        // If the button has text, update it
        if (btn.textContent) btn.textContent = 'Hide Isochrones';
      } else {
        btn.classList.add('disabled');
        btn.title = 'Show isochrones';
        if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
        else if (btn.textContent) btn.textContent = 'Show Isochrones';
      }
    }
  } catch {}
}
