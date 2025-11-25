// visualization/storm-attributes.js
// Render storm structures: RMW, R34, ROCI and editing helpers

import * as State from '../core/state-manager.js';
import { calculateWedgePoints, calculateR34OutlinePoints, calculateDestinationFromKm } from '../utils/calculations.js';
import { UNIT_CONVERSIONS, NM_TO_KM, getHurricaneCategory, metersToDisplayUnits } from '../utils/formatters.js';

const L = typeof window !== 'undefined' ? window.L : undefined;

export function clearStormVisualizations(pointIndex) {
  if (pointIndex == null) return;
  const map = State.getMap();
  const groups = State.getStormCircles();
  const arr = groups[pointIndex] || [];
  arr.forEach(layer => { try { layer.removeFrom(map); } catch {} });
  State.clearStormCircles(pointIndex);
}

export function clearAllStormVisualizations() {
  State.clearStormCircles();
}

export function displayStormAttributes(pointIndex) {
  const map = State.getMap();
  const data = State.getData();
  const visible = State.getStormStructuresVisible();
  clearStormVisualizations(pointIndex);
  if (!visible) return;
  const p = data[pointIndex];
  if (!p) return;

  // RMW (m)
  if (p.rmw && Number(p.rmw) > 0) {
    const circle = L.circle([p.lat, p.lon], { radius: Number(p.rmw), color: '#ff5f5f', weight: 1, fillOpacity: 0.15 });
    circle.addTo(map);
    State.addStormCircle(pointIndex, circle);
    if (State.getEditMode()) makeCircleEditable(circle, pointIndex);
  }

  // ROCI (m)
  if (p.roci && Number(p.roci) > 0) {
    const circle = L.circle([p.lat, p.lon], { radius: Number(p.roci), color: '#ced4da', weight: 1, fillOpacity: 0.1, dashArray: '4,4' });
    circle.addTo(map);
    State.addStormCircle(pointIndex, circle);
    if (State.getEditMode()) makeCircleEditable(circle, pointIndex);
  }

  // R34 wedges or unified outline using four quadrant radii
  const rads = ['r34_ne', 'r34_se', 'r34_sw', 'r34_nw'];
  const hasR34 = rads.some(k => Number(p[k]) > 0);
  if (hasR34) {
    if (State.getEditMode()) {
      // Draw four editable wedges in edit mode
      const quads = [
        { key: 'r34_ne', start: 0, end: 90 },
        { key: 'r34_se', start: 90, end: 180 },
        { key: 'r34_sw', start: 180, end: 270 },
        { key: 'r34_nw', start: 270, end: 360 },
      ];
      quads.forEach(({ key, start, end }) => {
        const meters = Number(p[key]) || 0;
        if (meters <= 0) return;
        const radiusNM = meters * UNIT_CONVERSIONS.M_TO_NM; // convert meters -> NM for geometry helper
        const pts = calculateWedgePoints(p.lat, p.lon, radiusNM, start, end);
        const wedge = L.polygon(pts, { color: '#4dabf7', weight: 1, fillOpacity: 0.15 }).addTo(map);
        State.addStormCircle(pointIndex, wedge);
        makeWedgeEditable(wedge, pointIndex, key, start, end);
      });
      // Optional: also show unified outline for context
  const neNM = (Number(p.r34_ne) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const seNM = (Number(p.r34_se) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const swNM = (Number(p.r34_sw) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const nwNM = (Number(p.r34_nw) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const outlinePts = calculateR34OutlinePoints(p.lat, p.lon, neNM, seNM, swNM, nwNM);
      if (outlinePts.length) {
        const poly = L.polygon(outlinePts, { color: '#4dabf7', weight: 1, fillOpacity: 0.1, dashArray: '3,5' }).addTo(map);
        State.addStormCircle(pointIndex, poly);
      }
    } else {
      // Unified outline in view mode
  const neNM = (Number(p.r34_ne) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const seNM = (Number(p.r34_se) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const swNM = (Number(p.r34_sw) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const nwNM = (Number(p.r34_nw) || 0) * UNIT_CONVERSIONS.M_TO_NM;
  const outlinePts = calculateR34OutlinePoints(p.lat, p.lon, neNM, seNM, swNM, nwNM);
      if (outlinePts.length) {
        const poly = L.polygon(outlinePts, { color: '#4dabf7', weight: 1, fillOpacity: 0.15 }).addTo(map);
        State.addStormCircle(pointIndex, poly);
      }
    }
  }
}

export function toggleStormStructures() {
  const newVal = !State.getStormStructuresVisible();
  State.setStormStructuresVisible(newVal);
  const i = State.getSelectedPoint();
  if (i != null) displayStormAttributes(i);
}

// Ghost markers for drag feedback
export function createGhostMarker(index, originalPosition) {
  const map = State.getMap();
  const m = L.circleMarker([originalPosition.lat, originalPosition.lon], { radius: 6, color: '#999', opacity: 0.5 });
  m.addTo(map);
  State.setGhostMarker(index, m);
}
export function removeGhostMarker(index) { State.clearGhostMarker(index); }
export function clearAllGhostMarkers() { State.clearAllGhostMarkers(); }

// Editing helpers
export function makeCircleEditable(circle, pointIndex) {
  const center = circle.getLatLng();
  const radius = circle.getRadius();
  const edge = L.latLng(center.lat, center.lng + (radius / (111320 * Math.cos(center.lat * Math.PI / 180))));
  const handle = L.marker(edge, { icon: L.divIcon({ className: 'drag-handle', iconSize: [12,12], iconAnchor: [6,6] }), draggable: true }).addTo(State.getMap());
  State.addStormCircle(pointIndex, handle);
  handle.on('drag', (e) => {
    const ll = e.target.getLatLng();
    const dist = center.distanceTo(ll);
    circle.setRadius(dist);
    const d = State.getData();
    if (circle.options.color === '#ff3333') d[pointIndex].rmw = dist; else d[pointIndex].roci = dist;
    if (window.updateFloatingDialog) window.updateFloatingDialog(pointIndex);
  });
}

export function makeWedgeEditable(wedge, pointIndex, attribute, startAngle, endAngle) {
  const data = State.getData();
  const p = data[pointIndex];
  const mid = (startAngle + endAngle) / 2;
  const km = (Number(p[attribute]) || 0) / 1000;
  const center = { lat: p.lat, lon: p.lon };
  const dest = calculateDestinationFromKm(center.lat, center.lon, km, mid);
  const handle = L.marker([dest.lat, dest.lon], { icon: L.divIcon({ className: 'drag-handle', iconSize: [12,12], iconAnchor: [6,6] }), draggable: true }).addTo(State.getMap());
  State.addStormCircle(pointIndex, handle);
  let debounce;
  handle.on('drag', (e) => {
    const ll = e.target.getLatLng();
    const c = L.latLng(center.lat, center.lon);
    const dist = c.distanceTo(ll);
    data[pointIndex][attribute] = dist;
    clearTimeout(debounce);
    debounce = setTimeout(() => { clearStormVisualizations(pointIndex); displayStormAttributes(pointIndex); }, 16);
    if (window.updateFloatingDialog) window.updateFloatingDialog(pointIndex);
  });
}

// Removed local destinationFrom in favor of shared calculateDestinationFromKm
