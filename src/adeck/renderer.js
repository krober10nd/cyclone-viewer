/*
 * A-Deck Renderer Module (scaffolding)
 * Renders tracks and markers into Leaflet layers, maintaining global references.
 */

import { getModelColor, setMarkerVisibility } from './model-manager.js';

const L = window.L;

function ensureGlobals() {
  window.trackLayers = window.trackLayers || {};
  window.adeckMarkers = window.adeckMarkers || [];
  window.adeckLines = window.adeckLines || [];
}

/**
 * Render multiple tracks
 * @param {Array} tracks
 * @param {L.Map} map
 * @param {{trackOpacity?:number, markerRadius?:number, showLabels?:boolean, fitBounds?:boolean}} options
 */
export function renderTracks(tracks = [], map = window.map, options = {}, onComplete) {
  // Back-compat: if options is a function, it's the callback
  if (typeof options === 'function' && onComplete === undefined) {
    onComplete = options; // eslint-disable-line no-param-reassign
    options = {}; // eslint-disable-line no-param-reassign
  }
  ensureGlobals();
  const opts = { trackOpacity: 0.8, markerRadius: 5, showLabels: false, fitBounds: true, ...options };

  const bounds = [];
  console.info('[Adeck Renderer] Rendering', (tracks || []).length, 'track(s)');
  (tracks || []).forEach((t, idx) => {
    const id = t.id || `${t.model || 'MODEL'}-${t.init || idx}`;
    const group = L.layerGroup();
    if (map && map.addLayer) map.addLayer(group);
    window.trackLayers[id] = group;
    try {
      console.debug('[Adeck Renderer] → Track', id, 'model:', t.model, 'points:', (t.points || []).length);
      renderSingleTrack(t, map, group, opts);
      // Verify group has content
      const hasLayers = !!(group && group.getLayers && group.getLayers().length);
      if (!hasLayers) console.warn('[Adeck Renderer] Group has no layers after render for', id);
    } catch (e) {
      console.warn('[Adeck Renderer] Error rendering track', id, e);
    }
    const pts = (t.points || []).map(p => [p.lat ?? p.latitude, p.lon ?? p.longitude]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    bounds.push(...pts);
  });

  if (opts.fitBounds && bounds.length) {
    try { map.fitBounds(bounds); } catch { /* no-op */ }
  }
  // Defer completion until after the layer groups are registered with Leaflet
  try {
    if (typeof onComplete === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          const layers = window.trackLayers || {};
          const layerIds = Object.keys(layers);
          onComplete({ layers, layerIds, layerCount: layerIds.length });
        } catch {}
      }));
    }
  } catch {}
  return window.trackLayers;
}

/**
 * Render a single track into a layer group
 */
export function renderSingleTrack(track, map = window.map, layerGroup, options = {}) {
  ensureGlobals();
  const color = getModelColor(track.model || 'MODEL');
  const pts = (track.points || [])
    .map((p) => ({ lat: p.lat ?? p.latitude, lon: p.lon ?? p.longitude, raw: p }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (!pts.length) return;

  const latlngs = pts.map(p => [p.lat, p.lon]);
  const line = L.polyline(latlngs, { color, opacity: options.trackOpacity ?? 0.8, weight: 2 });
  if (layerGroup) layerGroup.addLayer(line);
  window.adeckLines.push(line);

  // First forecast marker (if any) with a small circle marker
  const first = pts[0];
  const cm = L.circleMarker([first.lat, first.lon], { radius: options.markerRadius ?? 5, color, fillColor: color, fillOpacity: 0.6, weight: 1 });
  if (layerGroup) layerGroup.addLayer(cm);
  window.adeckMarkers.push(cm);

  // Popup binding via global formatter (if available)
  if (typeof window.formatPopupContent === 'function') {
    cm.bindPopup(() => window.formatPopupContent(first.raw, color), { className: 'category-popup' });
  }

  // Draw a perpendicular line if provided on the first point
  if (first.raw && first.raw.perpLine && Array.isArray(first.raw.perpLine)) {
    const pp = drawPerpendicularLine(first.raw);
    if (pp && layerGroup) layerGroup.addLayer(pp);
  }
}

/**
 * Draw a perpendicular line if a point contains a perpLine array of [lat, lon]
 */
export function drawPerpendicularLine(point) {
  try {
    const coords = (point.perpLine || []).map((p) => [p[0], p[1]]);
    if (!coords.length) return null;
    return L.polyline(coords, { color: '#666', weight: 1, dashArray: '4,3', opacity: 0.7 });
  } catch {
    return null;
  }
}

/**
 * Pre-process tracks for display (mark first points, compute perp lines if available upstream)
 */
export function processTracksForDisplay(storms) {
  return (storms || []).map((s) => ({
    ...s,
    points: (s.points || []).map((p, i) => ({ ...p, isFirstPoint: i === 0 }))
  }));
}

/**
 * Clear all A-deck layers and reset globals
 */
export function clearAdeckLayers(map = window.map) {
  ensureGlobals();
  const layers = window.trackLayers || {};
  const count = Object.keys(layers).length;
  const beforeLayerCount = map && map._layers ? Object.keys(map._layers).length : -1;
  Object.keys(layers).forEach((id) => {
    const grp = layers[id];
    try {
      if (map && map.hasLayer && map.hasLayer(grp)) map.removeLayer(grp);
      if (grp && grp.clearLayers) grp.clearLayers();
      console.debug('[Adeck Renderer] Removed group', id);
    } catch { /* no-op */ }
  });
  window.trackLayers = {};
  window.adeckMarkers = [];
  window.adeckLines = [];
  const afterLayerCount = map && map._layers ? Object.keys(map._layers).length : -1;
  console.info('[Adeck Renderer] Cleared', count, 'track layer(s). Map layers before/after:', beforeLayerCount, '/', afterLayerCount);
}

/**
 * Verify visibility of A-deck layers; returns count of visible track groups.
 */
export function verifyLayersVisible(map = window.map) {
  try {
    const layers = window.trackLayers || {};
    let visible = 0;
    Object.keys(layers).forEach((id) => {
      const grp = layers[id];
      const has = map?.hasLayer?.(grp);
      const anyShown = !!(grp?.getLayers?.().some((ly) => {
        const el = ly._path || ly._icon;
        return el ? (el.style?.display !== 'none' && (Number(ly.options?.opacity ?? 1) > 0 || Number(ly.options?.fillOpacity ?? 0) > 0)) : true;
      }));
      if (has && anyShown) visible++;
    });
    console.info('[Adeck Renderer] Visible track groups:', visible, 'of', Object.keys(layers).length);
    return visible;
  } catch { return -1; }
}

/** Force-show all layers for diagnostics */
export function forceShowAllLayers(map = window.map) {
  try {
    const layers = window.trackLayers || {};
    Object.keys(layers).forEach((id) => {
      const grp = layers[id];
      grp?.eachLayer?.((ly) => {
        try {
          if (typeof ly.setStyle === 'function') ly.setStyle({ opacity: 1, fillOpacity: 0.3 });
          const el = ly._path || ly._icon; if (el && el.style) el.style.display = '';
        } catch {}
      });
    });
    console.info('[Adeck Renderer] Force-shown all track layers');
  } catch {}
}

// Expose diagnostics for console usage
window.verifyAdeckLayers = window.verifyAdeckLayers || verifyLayersVisible;
window.forceShowAdeckLayers = window.forceShowAdeckLayers || forceShowAllLayers;
