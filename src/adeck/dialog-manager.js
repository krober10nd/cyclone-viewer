/*
 * A-Deck Dialog Manager (scaffolding)
 * Manages the storm selection UI and filtering behaviors.
 */

import { formatDateTime, formatCycloneName } from './parser.js';
import { getModelColor, formatModelName, toggleTrackVisibility, applyStoredVisibility, getModelCategories, ensureDefaultVisibility, showAllTracks, getHiddenTracks } from './model-manager.js';
import { renderTracks, clearAdeckLayers } from './renderer.js';
import * as State from '../core/state-manager.js';
import * as TrackRenderer from '../visualization/track-renderer.js';

const L = window.L;

/**
 * Create/refresh the storm list UI in a simple container.
 */
export function updateStormList(storms = []) {
  let container = document.getElementById('adeck-storm-list');
  if (!container) {
    container = document.createElement('div');
    container.id = 'adeck-storm-list';
    container.className = 'panel';
    container.style.position = 'absolute';
    container.style.top = '70px';
    container.style.right = '10px';
    container.style.maxHeight = '50vh';
    container.style.overflow = 'auto';
    container.style.zIndex = 1600;
    container.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(container);
  }
  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '6px';
  const title = document.createElement('strong');
  title.textContent = `Models (${storms.length})`;
  const btnRow = document.createElement('div');
  const showAllBtn = document.createElement('button'); showAllBtn.textContent = 'Show All'; showAllBtn.style.marginRight = '6px';
  const hideAllBtn = document.createElement('button'); hideAllBtn.textContent = 'Hide All';
  showAllBtn.addEventListener('click', () => { try { showAllTracks(); refreshStormListVisibility(); } catch {} });
  hideAllBtn.addEventListener('click', () => {
    try {
      const hidden = getHiddenTracks();
      const ids = storms.map(s => s.id);
      ids.forEach(id => hidden[id] = true);
      // Persist via toggle path: hide if currently visible
      ids.forEach(id => toggleTrackVisibility(id, false));
      refreshStormListVisibility();
    } catch {}
  });
  btnRow.appendChild(showAllBtn); btnRow.appendChild(hideAllBtn);
  header.appendChild(title); header.appendChild(btnRow);
  container.appendChild(header);

  if (!storms.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tracks available';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  storms.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'model-row';
    row.style.borderLeft = `4px solid ${getModelColor(s.model)}`;
    row.style.padding = '6px 8px';
    row.style.margin = '4px 0';
    row.dataset.trackId = s.id;

    const name = document.createElement('div');
    name.textContent = `${formatModelName(s.model)} — ${s.init ? formatDateTime(s.init) : ''}`;

    const btn = document.createElement('button');
    btn.className = 'visibility-toggle';
    const hidden = getHiddenTracks();
    btn.textContent = hidden[s.id] ? '🚫' : '👁️';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => toggleTrackVisibility(s.id));

    row.appendChild(name);
    row.appendChild(btn);
    list.appendChild(row);
  });
  container.appendChild(list);
  console.info('[Adeck Dialog] Storm list updated with', storms.length, 'item(s)');
}

/**
 * Create an init time selector (simple default)
 */
export function createInitTimeSelector(storms = [], onChange) {
  const select = document.createElement('select');
  const groups = groupStormsByDateAndModel(storms);
  const keys = Object.keys(groups);
  keys.forEach((k) => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = formatDateTime(k);
    select.appendChild(opt);
  });
  if (onChange) select.addEventListener('change', () => onChange(select.value));
  return select;
}

/**
 * Filter and (re)render by the selected init time
 */
export function displayTracksByInitTime(selectedInitTime, storms = [], map = window.map, renderCb = renderTracks) {
  const filtered = storms.filter((s) => String(s.init) === String(selectedInitTime));
  // Clear previous layers before rendering new selection
  try { clearAdeckLayers(map); } catch { /* no-op */ }
  if (filtered.length) {
    console.info('[Adeck Dialog] Rendering', filtered.length, 'track(s) for init', selectedInitTime);
    try { ensureDefaultVisibility(filtered.map(s => s.id)); } catch {}
    if (renderCb === renderTracks) {
      // Renderer supports completion callback
      renderCb(filtered, map, () => {
        try { setTimeout(() => { applyStoredVisibility(); refreshStormListVisibility();
          try {
            const visibleCount = typeof window.verifyAdeckLayers === 'function' ? window.verifyAdeckLayers() : -1;
            if (visibleCount === 0) window.showNotification?.('Tracks loaded but currently hidden. Use 👁️ to show.', 'warning', 4000);
          } catch {}
        }, 100); } catch {}
      });
    } else {
      // Fallback: render without callback, then defer visibility apply
      try { renderCb(filtered, map); } catch {}
      try { requestAnimationFrame(() => requestAnimationFrame(() => { applyStoredVisibility(); refreshStormListVisibility(); })); } catch { try { applyStoredVisibility(); } catch {} }
    }
  }
  updateStormList(filtered);
  // Note: applyStoredVisibility is now called after render completes via callback

  // Sync single-track view into shared state for keyboard navigation
  try {
    if (filtered.length === 1) {
      syncSelectedAdeckTrackToState(filtered[0]);
    } else {
      // Ambiguous (multi-model) view: clear CSV-like state so navigation shows proper message
      State.setData([]);
      State.clearMarkers();
    }
  } catch {}
}

export function filterModelsByCategory(categoryId = 'all') {
  // Simple placeholder: hide non-matching rows
  const rows = document.querySelectorAll('#adeck-storm-list .model-row');
  rows.forEach((row) => {
    if (categoryId === 'all') {
      row.style.display = '';
    } else {
      // Not wired to specific category memberships in this scaffold
      row.style.display = '';
    }
  });
}

export function groupStormsByDateAndModel(storms = []) {
  const groups = {};
  for (const s of storms) {
    const key = String(s.init || '');
    groups[key] = groups[key] || [];
    groups[key].push(s);
  }
  return groups;
}

export function addFixViewButton(map = window.map) {
  const Ctrl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function () {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const a = L.DomUtil.create('a', '', div);
      a.href = '#';
      a.title = 'Toggle fixed view';
      a.textContent = '🔒';
      L.DomEvent.on(a, 'click', L.DomEvent.stop).on(a, 'click', () => {
        map.dragging._enabled ? map.dragging.disable() : map.dragging.enable();
        if (window.showNotification) window.showNotification(map.dragging._enabled ? 'Map unlocked' : 'Map locked', 'info', 1500);
      });
      return div;
    }
  });
  map.addControl(new Ctrl());
}

export function highlightModelRow(modelId) {
  const rows = document.querySelectorAll('#adeck-storm-list .model-row');
  rows.forEach((row) => {
    const match = (row.textContent || '').toUpperCase().includes(String(modelId || '').toUpperCase());
    row.style.outline = match ? '2px solid #ffd54f' : '';
  });
}

export function initializeAdeckDialog() {
  // On map movements, re-apply visibility to maintain consistency
  const map = window.map;
  if (map && typeof map.on === 'function') {
    map.on('zoomend moveend', () => applyStoredVisibility());
  }
  // Initialize a placeholder list container if not present
  updateStormList([]);
  // Expose renderer for legacy hooks if needed
  window.renderAdeckTracks = renderTracks;

  // Listen for adeck-loaded events to ensure tracks start visible
  try {
    window.addEventListener('adeck-loaded', () => { try { showAllTracks(); refreshStormListVisibility(); } catch {} });
  } catch {}
}

/** Update visibility icons to reflect actual state */
export function refreshStormListVisibility() {
  try {
    const hidden = getHiddenTracks();
    document.querySelectorAll('#adeck-storm-list .model-row').forEach((row) => {
      const id = row?.dataset?.trackId;
      const btn = row.querySelector('.visibility-toggle');
      if (btn && id) btn.textContent = hidden[id] ? '🚫' : '👁️';
    });
  } catch {}
}

/**
 * Normalize a single A-deck track into the shared CSV-like state and build markers
 * to enable keyboard navigation and selection.
 */
function syncSelectedAdeckTrackToState(track) {
  const pts = Array.isArray(track?.points) ? track.points : [];
  if (!pts.length) { State.setData([]); State.clearMarkers(); return; }

  const norm = pts.map((p, i) => {
    const lat = Number(p.lat ?? p.latitude);
    const lon = Number(p.lon ?? p.longitude);
    const wind = p.wind_speed ?? p.wind ?? p.max_wind ?? p.wnd;
    const mslp = p.mslp ?? p.min_slp ?? p.pressure ?? p.min_pressure;
    return {
      id: i,
      lat,
      lon,
      wind_speed: wind != null ? Number(wind) : undefined,
      mslp: mslp != null ? Number(mslp) : undefined,
      rmw: p.rmw != null ? Number(p.rmw) : undefined,
      r34_ne: numOrUndef(p.r34_ne ?? p.r34ne ?? p.radius_of_34_kt_winds_ne_m),
      r34_se: numOrUndef(p.r34_se ?? p.r34se ?? p.radius_of_34_kt_winds_se_m),
      r34_sw: numOrUndef(p.r34_sw ?? p.r34sw ?? p.radius_of_34_kt_winds_sw_m),
      r34_nw: numOrUndef(p.r34_nw ?? p.r34nw ?? p.radius_of_34_kt_winds_nw_m),
      roci: numOrUndef(p.roci ?? p.radius_of_outer_closed_isobar_m),
      // carry through any timestamp if available
      time: p.time instanceof Date ? p.time : (p.utc ? new Date(p.utc) : undefined),
    };
  }).filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lon));

  State.setData(norm);
  // Rebuild per-point markers for navigation/selection; avoid duplicating lines
  State.clearMarkers();
  TrackRenderer.displayMarkers(false);
  TrackRenderer.updateDateLabels();
}

function numOrUndef(v) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
