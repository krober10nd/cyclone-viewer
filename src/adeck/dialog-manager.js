/*
 * A-Deck Dialog Manager (scaffolding)
 * Manages the storm selection UI and filtering behaviors.
 */

import { formatDateTime, formatCycloneName } from './parser.js';
import { getModelColor, formatModelName, toggleTrackVisibility, applyStoredVisibility, getModelCategories, ensureDefaultVisibility, showAllTracks, getHiddenTracks } from './model-manager.js';
import { renderTracks, clearAdeckLayers } from './renderer.js';
import { updateTimeSlider } from './time-slider.js';
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
    container.className = 'panel floating-dialog'; // Use standard dialog class
    container.style.bottom = '20px';
    container.style.left = '20px';
    container.style.width = '280px'; // Fixed width for grid
    container.style.zIndex = 1600;
    container.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(container);
  }
  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'dialog-header';
  
  const titleGroup = document.createElement('div');
  titleGroup.style.display = 'flex';
  titleGroup.style.alignItems = 'center';
  titleGroup.style.gap = '8px';

  const title = document.createElement('h3');
  title.textContent = `Models (${storms.length})`;
  
  // Collapse button
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'panel-collapse-btn';
  collapseBtn.textContent = '▼';
  collapseBtn.onclick = () => {
    const grid = container.querySelector('.model-grid');
    const isCollapsed = grid.style.display === 'none';
    grid.style.display = isCollapsed ? 'grid' : 'none';
    collapseBtn.textContent = isCollapsed ? '▼' : '▶';
  };

  titleGroup.appendChild(title);
  titleGroup.appendChild(collapseBtn);

  const controls = document.createElement('div');
  controls.className = 'panel-header-controls';
  
  const showAllBtn = document.createElement('button'); 
  showAllBtn.className = 'btn small secondary';
  showAllBtn.textContent = 'All'; 
  showAllBtn.title = 'Show All';
  
  const hideAllBtn = document.createElement('button'); 
  hideAllBtn.className = 'btn small secondary';
  hideAllBtn.textContent = 'None';
  hideAllBtn.title = 'Hide All';

  showAllBtn.addEventListener('click', () => { try { showAllTracks(); refreshStormListVisibility(); } catch {} });
  hideAllBtn.addEventListener('click', () => {
    try {
      const ids = storms.map(s => s.id);
      ids.forEach(id => toggleTrackVisibility(id, false));
      refreshStormListVisibility();
    } catch {}
  });

  controls.appendChild(showAllBtn); 
  controls.appendChild(hideAllBtn);
  
  header.appendChild(titleGroup); 
  header.appendChild(controls);
  container.appendChild(header);

  // Grid Content
  const grid = document.createElement('div');
  grid.className = 'model-grid';

  if (!storms.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '20px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-secondary)';
    empty.textContent = 'No tracks available';
    grid.style.display = 'block'; // Override grid for empty message
    grid.appendChild(empty);
  } else {
    storms.forEach((s) => {
      const chip = document.createElement('div');
      chip.className = 'model-chip';
      chip.dataset.trackId = s.id;
      
      // Use model ID as label
      let modelId = String(s.model || 'UNK').toUpperCase();
      // Strip basin prefix if present (e.g. AL-CARQ -> CARQ)
      if (modelId.includes('-')) {
        const parts = modelId.split('-');
        if (parts.length > 1) modelId = parts[parts.length - 1];
      }
      chip.textContent = modelId;
      
      // Set color
      const color = getModelColor(s.model);
      chip.style.backgroundColor = color;
      chip.style.borderColor = color; // Border matches bg for solid look

      // Initial visibility state
      const hidden = getHiddenTracks();
      if (hidden[s.id]) {
        chip.classList.add('hidden');
      }

      // Click handler
      chip.addEventListener('click', () => {
        toggleTrackVisibility(s.id);
        // UI update handled by refreshStormListVisibility but we can optimistically toggle class here for snapiness
        chip.classList.toggle('hidden');
      });

      // Tooltip
      chip.title = `${formatModelName(s.model)}\nInit: ${s.init ? formatDateTime(s.init) : 'N/A'}`;

      grid.appendChild(chip);
    });
  }
  
  container.appendChild(grid);
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
  // Prefer filtering by init; if selectedInitTime looks invalid, fallback to model filter or render-all
  let filtered = storms.filter((s) => String(s.init) === String(selectedInitTime));
  if (!filtered.length) {
    const looksLikeModel = typeof selectedInitTime === 'string' && !/^\d{10}$/.test(selectedInitTime);
    if (looksLikeModel) filtered = storms.filter((s) => String(s.model).toUpperCase() === String(selectedInitTime).toUpperCase());
  }
  if (!filtered.length) filtered = storms; // last resort: show all
  // Clear previous layers before rendering new selection
  try { clearAdeckLayers(map); } catch { /* no-op */ }
  if (filtered.length) {
    console.info('[Adeck Dialog] Rendering', filtered.length, 'track(s) for init', selectedInitTime);
    const trackIds = filtered.map(s => s.id);
    try { ensureDefaultVisibility(trackIds); } catch {}
    if (renderCb === renderTracks) {
      // Renderer supports completion callback
      renderCb(filtered, map, () => {
        try { setTimeout(() => { applyStoredVisibility(); refreshStormListVisibility();
          try {
            const visibleCount = typeof window.verifyAdeckLayers === 'function' ? window.verifyAdeckLayers() : -1;
            if (visibleCount === 0) {
              console.warn('[Adeck Dialog] No visible tracks after render; forcing showAllTracks().');
              try { showAllTracks(); refreshStormListVisibility(); } catch {}
              window.showNotification?.('Tracks were hidden by previous preferences. Click "Show All" or use the 👁️ icons to adjust visibility.', 'warning', 5000);
            }
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
  try { updateTimeSlider(filtered); } catch {}
  try {
    window.dispatchEvent(new CustomEvent('adeck-loaded', { detail: { trackCount: filtered.length } }));
    const pref = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('adeckShowStructures')
      : null;
    if (pref !== 'false') window.toggleAdeckStructures?.(true);
  } catch {}
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
  // Initialize a placeholder list container if not present
  updateStormList([]);
  // Expose renderer for legacy hooks if needed
  window.renderAdeckTracks = renderTracks;
  // Expose list visibility refresher for diagnostics and external calls
  window.refreshStormListVisibility = refreshStormListVisibility;
  window.updateStormList = updateStormList;
  // Note: Do not force-show tracks on load. If an 'adeck-loaded' event is used elsewhere,
  // it must provide { detail: { trackIds: string[] } } and be handled by that code path
  // with ensureDefaultVisibility(trackIds) followed by applyStoredVisibility().
}

/** Update visibility icons to reflect actual state */
export function refreshStormListVisibility() {
  try {
    const hidden = getHiddenTracks();
    document.querySelectorAll('#adeck-storm-list .model-chip').forEach((chip) => {
      const id = chip?.dataset?.trackId;
      if (id) {
        if (hidden[id]) chip.classList.add('hidden');
        else chip.classList.remove('hidden');
      }
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
