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
  window.adeckStructures = window.adeckStructures || [];
}

/**
 * Render multiple tracks
 * @param {Array} tracks
 * @param {L.Map} map
 * @param {{trackOpacity?:number, markerRadius?:number, showLabels?:boolean, fitBounds?:boolean, probabilistic?:boolean, showStructures?:boolean, showStructuresForTau?:number|null}} options
 */
export function renderTracks(tracks = [], map = window.map, options = {}, onComplete) {
  // Back-compat: if options is a function, it's the callback
  if (typeof options === 'function' && onComplete === undefined) {
    onComplete = options; // eslint-disable-line no-param-reassign
    options = {}; // eslint-disable-line no-param-reassign
  }
  ensureGlobals();
  const showStructuresPref = (typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage.getItem('adeckShowStructures') !== 'false'
    : true;
  const opts = { trackOpacity: 0.8, markerRadius: 5, showLabels: false, fitBounds: true, probabilistic: true, showStructures: showStructuresPref, showStructuresForTau: null, ...options };

  const bounds = [];
  console.info('[Adeck Renderer] Rendering', (tracks || []).length, 'track(s)');
  (tracks || []).forEach((t, idx) => {
    const id = t.id || `${t.model || 'MODEL'}-${t.init || idx}`;
    const group = L.layerGroup();
    if (map && map.addLayer) {
      map.addLayer(group);
      try {
        const attached = map.hasLayer && map.hasLayer(group);
        console.debug('[Adeck Renderer] Group added to map for', id, 'attached:', attached);
      } catch {}
    }
    window.trackLayers[id] = group;
    try {
      console.debug('[Adeck Renderer] → Track', id, 'model:', t.model, 'points:', (t.points || []).length);
      renderSingleTrack(t, map, group, opts);
      // Verify group has content
      const hasLayers = !!(group && group.getLayers && group.getLayers().length);
      if (!hasLayers) console.warn('[Adeck Renderer] Group has no layers after render for', id);
      else console.debug('[Adeck Renderer] Group layer count for', id, '→', group.getLayers().length);
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

    // Draw segments with varying opacity if probabilistic
  if (options.probabilistic) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const tau = p1.raw.tau || 0;
      // Uncertainty increases with lead time -> opacity decreases.
      // Simple linear decay: 1.0 at 0h -> ~0.1 at 168h.
      const decay = 1.0 - (tau / 168);
      const opacity = Math.max(0.1, decay);
      const segment = L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
        color,
        opacity: opacity * (options.trackOpacity ?? 0.9),
        weight: 3,
      });
      // Tag with source points (including tau) so tau filter can trim/animate
      segment._adeckSourcePoints = [p1.raw, p2.raw];
      if (layerGroup) layerGroup.addLayer(segment);
      window.adeckLines.push(segment);
    }
  } else {
    const latlngs = pts.map((p) => [p.lat, p.lon]);
    const line = L.polyline(latlngs, { color, opacity: options.trackOpacity ?? 0.9, weight: 2 });
    // Tag full track line with ordered source points
    line._adeckSourcePoints = pts.map((p) => p.raw);
    if (layerGroup) layerGroup.addLayer(line);
    window.adeckLines.push(line);
  }

  // Markers and Structure
  pts.forEach((p, i) => {
      const isFirst = i === 0;
      // Only draw structure for first point or if explicitly requested (e.g. on click)
      // For now, we attach structure data to the marker so it can be toggled
      
      const marker = L.circleMarker([p.lat, p.lon], { 
          radius: options.markerRadius ?? (isFirst ? 7 : 5), 
          color, 
          fillColor: color, 
          fillOpacity: isFirst ? 0.9 : 0.5, 
          weight: 1 
      });
      
      if (layerGroup) layerGroup.addLayer(marker);
      window.adeckMarkers.push(marker);

      // Bind popup
      if (typeof window.formatPopupContent === 'function') {
        marker.bindPopup(() => window.formatPopupContent(p.raw, color), { className: 'category-popup' });
      }

      // Store point data on marker for interaction
      marker.pointData = p.raw;
      
      // Interaction: Click to show structure
      marker.on('click', () => {
          renderStructure(p.raw, map, layerGroup, color);

          try {
            const maxR = getMaxStructureRadius(p.raw);
            const center = L.latLng(p.lat, p.lon);
            // Fallback if no structural radii
            if (!Number.isFinite(maxR) || maxR <= 0) {
              map.setView(center, Math.max(map.getZoom(), 8));
              return;
            }
            // Approximate radius in degrees at this latitude
            const earthRadius = 6371000; // m
            const ang = maxR / earthRadius; // radians
            const dLat = ang * 180 / Math.PI;
            const dLon = dLat * Math.cos(center.lat * Math.PI / 180);
            const bounds = L.latLngBounds(
              [center.lat - dLat, center.lng - dLon],
              [center.lat + dLat, center.lng + dLon],
            );
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
          } catch {}
      });

      // Optionally pre-render structures based on options
      if (options.showStructures && (!Number.isFinite(options.showStructuresForTau) || (p.raw && Number(p.raw.tau) === Number(options.showStructuresForTau)))) {
        renderStructure(p.raw, map, layerGroup, color);
      }
  });
}

/**
 * Render spatial structural elements (RMW, ROCI, Wind Radii)
 */
export function renderStructure(point, map, layerGroup, color) {
    if (!point || !map) return;
    
    // Helper to draw sector
    const drawSector = (lat, lon, radiusM, startAngle, endAngle, color, opacity) => {
        if (!radiusM) return;
        // Leaflet doesn't have native sector. We can approximate with polygon.
        // 90 degrees per quadrant.
        // NE: 0-90 (math angle? No, bearing. 0 is N, 90 is E)
        // Bearings: NE (0-90), SE (90-180), SW (180-270), NW (270-360)
        
        const center = L.latLng(lat, lon);
        const points = [center];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const bearing = startAngle + (endAngle - startAngle) * (i / steps);
            // Destination point given distance and bearing
            // We need a geodesic library or simple approximation.
            // Simple approximation: 1 deg lat ~ 111km. 1 deg lon ~ 111km * cos(lat)
            // radius in meters.
            const R = 6371000; // Earth radius
            const d = radiusM;
            const brng = bearing * Math.PI / 180;
            const lat1 = lat * Math.PI / 180;
            const lon1 = lon * Math.PI / 180;
            
            const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d/R) + Math.cos(lat1)*Math.sin(d/R)*Math.cos(brng));
            const lon2 = lon1 + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(lat1), Math.cos(d/R)-Math.sin(lat1)*Math.sin(lat2));
            
            points.push(L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI));
        }
        points.push(center);
        
        const poly = L.polygon(points, { color, weight: 1, fillOpacity: opacity, interactive: false });
        if (layerGroup) layerGroup.addLayer(poly);
        poly._adeckSourcePoint = point;
        window.adeckStructures.push(poly);
        return poly;
    };

    // Draw Wind Radii
    if (point.radii) {
        // 64kt (Hurricane) - Red-ish
        if (point.radii[64]) {
            const r = point.radii[64];
            drawSector(point.lat, point.lon, r.ne, 0, 90, '#ff0000', 0.3);
            drawSector(point.lat, point.lon, r.se, 90, 180, '#ff0000', 0.3);
            drawSector(point.lat, point.lon, r.sw, 180, 270, '#ff0000', 0.3);
            drawSector(point.lat, point.lon, r.nw, 270, 360, '#ff0000', 0.3);
        }
        // 50kt (Storm) - Orange-ish
        if (point.radii[50]) {
            const r = point.radii[50];
            drawSector(point.lat, point.lon, r.ne, 0, 90, '#ffa500', 0.2);
            drawSector(point.lat, point.lon, r.se, 90, 180, '#ffa500', 0.2);
            drawSector(point.lat, point.lon, r.sw, 180, 270, '#ffa500', 0.2);
            drawSector(point.lat, point.lon, r.nw, 270, 360, '#ffa500', 0.2);
        }
        // 34kt (Gale) - Yellow-ish or Model Color
        if (point.radii[34]) {
            const r = point.radii[34];
            drawSector(point.lat, point.lon, r.ne, 0, 90, color, 0.1);
            drawSector(point.lat, point.lon, r.se, 90, 180, color, 0.1);
            drawSector(point.lat, point.lon, r.sw, 180, 270, color, 0.1);
            drawSector(point.lat, point.lon, r.nw, 270, 360, color, 0.1);
        }
    } else {
        // Fallback to legacy flat props if radii object not present
        if (point.r34_ne) {
             drawSector(point.lat, point.lon, point.r34_ne, 0, 90, color, 0.1);
             drawSector(point.lat, point.lon, point.r34_se, 90, 180, color, 0.1);
             drawSector(point.lat, point.lon, point.r34_sw, 180, 270, color, 0.1);
             drawSector(point.lat, point.lon, point.r34_nw, 270, 360, color, 0.1);
        }
    }

    // Draw RMW (Radius of Maximum Wind)
    if (point.rmw) {
        const rmwCircle = L.circle([point.lat, point.lon], {
            radius: point.rmw,
            color: '#ff00ff',
            weight: 2,
      fill: false,
            dashArray: '5, 5'
        });
      if (layerGroup) layerGroup.addLayer(rmwCircle);
      rmwCircle._adeckSourcePoint = point;
      window.adeckStructures.push(rmwCircle);
    }

    // Draw ROCI (Radius of Outer Closed Isobar)
    if (point.roci) {
        const rociCircle = L.circle([point.lat, point.lon], {
            radius: point.roci,
            color: '#888',
            weight: 1,
      fill: false
        });
      if (layerGroup) layerGroup.addLayer(rociCircle);
      rociCircle._adeckSourcePoint = point;
      window.adeckStructures.push(rociCircle);
    }
}

// Compute an approximate max radius (meters) covering all structural elements
function getMaxStructureRadius(point) {
  if (!point) return 0;
  let maxR = 0;
  if (point.radii) {
    [64, 50, 34].forEach((kt) => {
      const r = point.radii[kt];
      if (!r) return;
      ['ne', 'se', 'sw', 'nw'].forEach((q) => {
        const v = Number(r[q]);
        if (Number.isFinite(v) && v > maxR) maxR = v;
      });
    });
  } else {
    ['r34_ne', 'r34_se', 'r34_sw', 'r34_nw'].forEach((k) => {
      const v = Number(point[k]);
      if (Number.isFinite(v) && v > maxR) maxR = v;
    });
  }
  if (Number.isFinite(point.rmw) && point.rmw > maxR) maxR = point.rmw;
  if (Number.isFinite(point.roci) && point.roci > maxR) maxR = point.roci;
  return maxR;
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
  try {
    (window.adeckStructures || []).forEach((ly) => {
      try {
        if (map && map.hasLayer && map.hasLayer(ly)) map.removeLayer(ly);
      } catch {}
    });
  } catch {}
  window.adeckStructures = [];
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

/** Toggle global visibility of ADECK structures */
export function toggleStructureVisibility(visible, map = window.map) {
  ensureGlobals();
  const show = visible !== false;
  (window.adeckStructures || []).forEach((ly) => {
    try {
      const el = ly._path || ly._icon;
      if (el && el.style) el.style.display = show ? '' : 'none';
      if (typeof ly.setStyle === 'function') {
        if (!show) ly.setStyle({ opacity: 0, fillOpacity: 0 });
        else ly.setStyle({ opacity: (ly.options.opacity ?? 0.3) || 0.3, fillOpacity: (ly.options.fillOpacity ?? 0.1) || 0.1 });
      }
    } catch {}
  });
}

/** Filter structures by tau (lead time). Non-matching taus are hidden. */
export function filterStructuresByTau(tau, map = window.map) {
  ensureGlobals();
  const targetTau = Number(tau);
  const hasTau = Number.isFinite(targetTau);
  (window.adeckStructures || []).forEach((ly) => {
    try {
      const src = ly._adeckSourcePoint;
      if (!hasTau) {
        const el = ly._path || ly._icon;
        if (el && el.style) el.style.display = '';
        return;
      }
      const ptTau = src && Number(src.tau);
      const match = Number.isFinite(ptTau) && ptTau === targetTau;
      const el = ly._path || ly._icon;
      if (el && el.style) el.style.display = match ? '' : 'none';
    } catch {}
  });
}

window.toggleAdeckStructures = window.toggleAdeckStructures || toggleStructureVisibility;
window.filterAdeckStructuresByTau = window.filterAdeckStructuresByTau || filterStructuresByTau;

/**
 * Filter ADECK markers, track lines, and structures by forecast hour (tau).
 * Markers/structures are kept in-place and their opacity/display is adjusted
 * to preserve interaction and animation smoothness.
 */
export function filterAdeckVisualizationByTau(tau) {
  ensureGlobals();
  const targetTau = Number(tau);
  const hasTau = Number.isFinite(targetTau);

  const run = () => {
    try {
      // Markers
      (window.adeckMarkers || []).forEach((marker) => {
        try {
          const src = marker.pointData || marker._adeckSourcePoint || {};
          const ptTau = Number(src.tau);
          if (!hasTau || !Number.isFinite(ptTau)) {
            marker.setOpacity(1);
            return;
          }
          const isCurrent = ptTau === targetTau;
          marker.setOpacity(isCurrent ? 1 : 0);
        } catch {}
      });

      // Lines: show progressive track up to tau if available, otherwise full
      (window.adeckLines || []).forEach((line) => {
        try {
          if (!hasTau) {
            if (typeof line.setStyle === 'function') line.setStyle({ opacity: line.options.opacity ?? 0.9 });
            return;
          }
          const src = line._adeckSourcePoints;
          if (!Array.isArray(src) || src.length < 2) {
            // Fallback: dim full line when filtering
            if (typeof line.setStyle === 'function') line.setStyle({ opacity: 0.3 });
            return;
          }
          const pts = src.filter((p) => Number.isFinite(Number(p.tau)) && Number(p.tau) <= targetTau);
          if (pts.length < 2) {
            if (typeof line.setStyle === 'function') line.setStyle({ opacity: 0 });
            return;
          }
          const latlngs = pts.map((p) => [p.lat ?? p.latitude, p.lon ?? p.longitude]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
          if (latlngs.length >= 2 && typeof line.setLatLngs === 'function') {
            line.setLatLngs(latlngs);
            if (typeof line.setStyle === 'function') line.setStyle({ opacity: line.options.opacity ?? 0.9 });
          }
        } catch {}
      });

      // Structures
      filterStructuresByTau(hasTau ? targetTau : undefined);

      try {
        window.dispatchEvent(new CustomEvent('adeck-tau-changed', { detail: { tau: hasTau ? targetTau : null } }));
      } catch {}
    } catch {}
  };

  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
  else run();
}

window.filterAdeckByTau = window.filterAdeckByTau || filterAdeckVisualizationByTau;
