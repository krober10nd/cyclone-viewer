// visualization/track-renderer.js
// Render main track markers, track line, shapefile points, and date labels

import * as State from '../core/state-manager.js';
import * as SelectionHandler from '../interaction/selection-handler.js';
import { getHurricaneCategory, formatWindSpeed, formatPointTime, hexToRgba, getContrastingTextColor } from '../utils/formatters.js';
import { getPointTimestamp } from '../utils/calculations.js';

const L = typeof window !== 'undefined' ? window.L : undefined;

export function displayTrackLine() {
  const map = State.getMap();
  const data = State.getData();
  if (!map || !data || data.length < 2) return;
  const latlngs = data.map(p => [p.lat, p.lon]);
  const color = (window.getModelColor && window.getModelColor(State.getCurrentModelName?.())) || '#4dabf7';
  const line = L.polyline(latlngs, { color, weight: 2, opacity: 0.9 });
  if (State.getTrackLineVisible()) line.addTo(map);
  State.setTrackLine(line);
}

export function createMarkerIcon(point, index) {
  const cat = getHurricaneCategory(point.wnd || point.wind_ms || point.wind_speed || 0);
  const size = 10 + Math.max(0, cat.index) * 2;
  const bg = cat.color || '#888';
  const style = `background:${bg};width:${size}px;height:${size}px;border-radius:50%;border:1px solid #333;`;
  const html = `<div style="${style}"></div>`;
  return L.divIcon({ className: 'tc-marker', html, iconSize: [size, size] });
}

export function updateMarkerStyle(marker, point) {
  marker.setIcon(createMarkerIcon(point));
}

export function displayMarkers(fitBounds = true) {
  const map = State.getMap();
  const data = State.getData();
  if (!map || !data) return;
  const markers = [];
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    const marker = L.marker([p.lat, p.lon], { icon: createMarkerIcon(p, i), draggable: !!State.getEditMode() });
    marker.addTo(map);
    // Click -> select
    marker.on('click', () => SelectionHandler.selectPoint(i));
    // Drag handlers in edit mode
    if (State.getEditMode()) {
      SelectionHandler.setupMarkerDragHandlers(marker, i);
    }
    markers.push(marker);
  }
  State.clearMarkers();
  markers.forEach(m => State.addMarker(m));
  if (fitBounds && markers.length) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

export function greyOutOtherPoints(selectedIndex) {
  State.getMarkers().forEach((m, idx) => {
    m.setOpacity(idx === selectedIndex ? 1 : 0.4);
  });
}
export function resetPointAppearance() { State.getMarkers().forEach(m => m.setOpacity(1)); }

// Shapefile points and labels can be implemented later as needed based on specific properties
export function addShapefilePoints(geojson) {
  const map = State.getMap();
  if (!geojson || !map) return;
  const group = State.getShapefileLayerGroup() || L.layerGroup().addTo(map);
  State.setShapefileLayerGroup(group);
  const pts = [];
  L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      const marker = L.marker(latlng, { icon: createStarIcon(feature?.properties || {}) });
      marker.bindPopup(createEnhancedPopup(feature?.properties || {}));
      pts.push(marker);
      return marker;
    }
  }).addTo(group);
  State.setShapefilePoints(pts);
}

export function createStarIcon(properties) {
  const html = `<div style="color:#fcc419;font-size:18px;">★</div>`;
  return L.divIcon({ className: 'star-icon', html, iconSize: [18, 18], iconAnchor: [9, 9] });
}

export function createEnhancedPopup(properties) {
  const entries = Object.entries(properties || {});
  const rows = entries.map(([k, v]) => `<div><strong>${k}</strong>: ${v}</div>`).join('');
  return `<div class="shapefile-popup">${rows}</div>`;
}
export function updateDateLabels() {
  const map = State.getMap();
  if (!map) return;
  const zoom = map.getZoom();
  const show = State.getDateLabelsVisible() && zoom >= State.getLabelMinZoom() && zoom <= State.getLabelMaxZoom();
  const markers = State.getMarkers();
  if (!show) {
    // Unbind any existing tooltips when labels are hidden
    markers.forEach((m) => { try { m.unbindTooltip(); } catch {} });
    return;
  }
  // Rebind tooltips fresh each time to avoid accumulation
  markers.forEach((m, i) => {
    try {
      const p = State.getData()[i];
      const t = getPointTimestamp(p);
      if (!t) return;
      const cat = getHurricaneCategory(p.wnd || p.wind_ms || p.wind_speed || 0);
      const bg = cat.color || '#333';
      const color = getContrastingTextColor(bg);
      // Scale font size with zoom for readability (simple zoom-based scaling)
      const fontSize = Math.max(10, Math.min(16, 8 + zoom * 0.6));
      try { m.unbindTooltip(); } catch {}
      m.bindTooltip(`<div style="background:${bg};color:${color};padding:2px 4px;border-radius:3px;font-size:${fontSize}px">${formatPointTime(t)}</div>`, { permanent: false, direction: 'top' });
    } catch {}
  });
}

// Toggle track polyline visibility
export function toggleTrackLine(force) {
  const map = State.getMap();
  const current = State.getTrackLineVisible();
  const next = typeof force === 'boolean' ? !!force : !current;
  State.setTrackLineVisible(next);
  const line = State.getTrackLine();
  if (line) {
    try {
      if (next) {
        if (map) line.addTo(map);
      } else {
        line.remove();
      }
    } catch {}
  }
}

// Toggle date/time labels on markers
export function toggleDateLabels(force) {
  const current = State.getDateLabelsVisible();
  const next = typeof force === 'boolean' ? !!force : !current;
  State.setDateLabelsVisible(next);
  if (next) {
    updateDateLabels();
  } else {
    const markers = State.getMarkers();
    markers.forEach((m) => { try { m.unbindTooltip(); } catch {} });
  }
}
