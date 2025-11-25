/*
 * Start Screen UI
 * Creates a welcoming overlay that lets users pick A-deck, B-deck, or CSV.
 */

import { parseAdeckFile, parseBdeckFile } from '../adeck/parser.js';
import { renderTracks } from '../adeck/renderer.js';
import { initializeAdeckDialog, updateStormList, displayTracksByInitTime } from '../adeck/dialog-manager.js';
import { applyStoredVisibility } from '../adeck/model-manager.js';

let overlayEl = null;

export function createStartScreen() {
  if (overlayEl) return overlayEl;
  const overlay = document.createElement('div');
  overlay.id = 'start-screen-overlay';
  overlay.className = 'start-screen-overlay';
  overlay.innerHTML = `
    <div class="start-screen-modal">
      <div class="start-screen-header">
        <div class="app-logo">🌀</div>
        <h1>Cyclone Track Editor</h1>
        <p class="subtitle">Visualize, Edit, and Export Tropical Cyclone Tracks</p>
      </div>
      <div class="start-screen-content">
        <h2>Get Started</h2>
        <p class="description">Choose a file type to load cyclone track data:</p>
        <div class="file-options">
          <button class="file-option-card" id="load-adeck-btn">
            <div class="file-icon">📊</div>
            <h3>A-Deck File</h3>
            <p>Load forecast tracks from multiple models</p>
            <span class="file-formats">.dat, .txt, .adeck</span>
          </button>
          <button class="file-option-card" id="load-bdeck-btn">
            <div class="file-icon">🎯</div>
            <h3>B-Deck File</h3>
            <p>Load best track data with wind radii</p>
            <span class="file-formats">.dat, .txt</span>
          </button>
          <button class="file-option-card" id="load-csv-btn">
            <div class="file-icon">📄</div>
            <h3>Custom CSV Track</h3>
            <p>Load custom track data in CSV format</p>
            <span class="file-formats">.csv</span>
          </button>
        </div>
        <div class="recent-files" id="recent-files-section" style="display:none;">
          <h3>Recent Files</h3>
          <ul id="recent-files-list"></ul>
        </div>
        <div class="start-screen-loading" id="start-screen-loading">
          <div class="spinner small"></div>
          <span class="loading-text">Map initializing in background…</span>
        </div>
        <div class="start-screen-footer">
          <button class="btn-secondary" id="skip-to-map-btn">Skip to Map</button>
          <label class="checkbox-label">
            <input type="checkbox" id="dont-show-again-checkbox"> Don't show this again
          </label>
        </div>
      </div>
    </div>
    <input type="file" id="start-screen-adeck-input" accept=".dat,.txt,.adeck" style="display:none;">
    <input type="file" id="start-screen-bdeck-input" accept=".dat,.txt" style="display:none;">
    <input type="file" id="start-screen-csv-input" accept=".csv" style="display:none;">
  `;
  overlayEl = overlay;
  return overlay;
}

export function showStartScreen() {
  const skip = localStorage.getItem('skipStartScreen') === 'true';
  if (skip) return;
  const overlay = createStartScreen();
  document.body.appendChild(overlay);
  bindHandlers();
  updateLoadingIndicator('loading');
}

export function hideStartScreen() {
  if (!overlayEl) return;
  overlayEl.classList.add('fade-out');
  setTimeout(() => {
    try { overlayEl.remove(); } catch {}
    // Force map to re-calculate size now that overlay is gone
    try {
      setTimeout(() => {
        try {
          const map = window.map || (window.State && window.State.getMap && window.State.getMap());
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
        } catch (e) {
          console.warn('[Start Screen] map.invalidateSize failed after hide:', e);
        }
      }, 100);
    } catch {}
    overlayEl = null;
  }, 200);
}

function bindHandlers() {
  const adeckBtn = document.getElementById('load-adeck-btn');
  const bdeckBtn = document.getElementById('load-bdeck-btn');
  const csvBtn = document.getElementById('load-csv-btn');
  const skipBtn = document.getElementById('skip-to-map-btn');
  const dontShow = document.getElementById('dont-show-again-checkbox');

  const adeckInput = document.getElementById('start-screen-adeck-input');
  const bdeckInput = document.getElementById('start-screen-bdeck-input');
  const csvInput = document.getElementById('start-screen-csv-input');

  adeckBtn?.addEventListener('click', () => adeckInput?.click());
  bdeckBtn?.addEventListener('click', () => bdeckInput?.click());
  csvBtn?.addEventListener('click', () => csvInput?.click());

  skipBtn?.addEventListener('click', () => {
    ensureMapInitialized();
    hideStartScreen();
  });

  dontShow?.addEventListener('change', (e) => {
    localStorage.setItem('skipStartScreen', e.target.checked ? 'true' : 'false');
    if (e.target.checked && window.showNotification) window.showNotification('Start screen will be skipped next time', 'info', 2000);
  });

  adeckInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
  const { storms } = parseAdeckFile(content);
  ensureMapInitialized();
  if (!window.map) { console.error('[Start Screen] Map still not initialized after ensureMapInitialized()'); return; }
      initializeAdeckDialog();
      if (storms?.length) {
        // Choose most recent valid init (YYYYMMDDHH). If none, render all tracks.
        const allInits = Array.from(new Set(storms.map(s => String(s.init || '')))).filter(Boolean);
        const validInits = allInits.filter(v => /^\d{10}$/.test(v));
        const selectedInit = validInits.sort().slice(-1)[0] || validInits[0];
        if (selectedInit) {
          displayTracksByInitTime(selectedInit, storms, window.map, renderTracks);
        } else {
          // Fallback: show all tracks when init values are invalid/missing
          renderTracks(storms, window.map, { fitBounds: true }, () => applyStoredVisibility());
          updateStormList(storms);
        }
      }
      hideStartScreen();
      addToRecentFiles(file.name, 'adeck');
      window.showNotification?.('A-deck file loaded', 'success', 2000);
    } catch (err) {
      window.showNotification?.('Error loading A-deck file', 'error', 3000);
      console.error(err);
    }
  });

  bdeckInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const { storms } = parseBdeckFile(content);
      ensureMapInitialized();
      if (!window.map) { console.error('[Start Screen] Map still not initialized after ensureMapInitialized()'); return; }
      if (storms?.length) {
        renderTracks(storms, window.map, { fitBounds: true }, () => applyStoredVisibility());
      }
      hideStartScreen();
      addToRecentFiles(file.name, 'bdeck');
      window.showNotification?.('B-deck file loaded', 'success', 2000);
    } catch (err) {
      window.showNotification?.('Error loading B-deck file', 'error', 3000);
      console.error(err);
    }
  });

  csvInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Delegate to existing app handler if available
      if (typeof window.handleCSVUpload === 'function') {
        const fakeEvent = { target: { files: [file] } };
        ensureMapInitialized();
        if (!window.map) { console.error('[Start Screen] Map still not initialized after ensureMapInitialized()'); return; }
        await window.handleCSVUpload(fakeEvent);
        hideStartScreen();
        addToRecentFiles(file.name, 'csv');
        return;
      }
      // Fallback: just notify
      window.showNotification?.('CSV handler not available', 'warning', 2500);
    } catch (err) {
      window.showNotification?.('Error loading CSV', 'error', 3000);
      console.error(err);
    }
  });

  populateRecentFiles();
}

function updateLoadingIndicator(status) {
  try {
    const el = document.getElementById('start-screen-loading');
    if (!el) return;
    if (status === 'ready') {
      el.classList.add('hidden');
    } else {
      el.classList.remove('hidden');
    }
  } catch {}
}

function ensureMapInitialized() {
  console.info('[Start Screen] Ensuring map is initialized...');
  if (window.map) { console.info('[Start Screen] Map already exists'); updateLoadingIndicator('ready'); return; }
  if (typeof window.initializeApp === 'function') {
    console.info('[Start Screen] Calling window.initializeApp()');
    try {
      window.initializeApp();
      console.info('[Start Screen] App initialized successfully');
      updateLoadingIndicator('ready');
    } catch (e) {
      console.error('[Start Screen] App initialization failed:', e);
      window.showNotification?.('Failed to initialize map. Please refresh the page.', 'error', 5000);
    }
    return;
  }
  console.warn('[Start Screen] window.initializeApp not found, trying event dispatch');
  document.dispatchEvent(new Event('initialize-app'));
}

function getRecentFiles() {
  try {
    const raw = localStorage.getItem('recentFiles');
    const list = raw ? JSON.parse(raw) : [];
    return list.slice(0, 5);
  } catch { return []; }
}

function addToRecentFiles(name, type) {
  try {
    const list = getRecentFiles();
    const entry = { name, type, ts: Date.now() };
    const filtered = [entry, ...list.filter((x) => x.name !== name)];
    localStorage.setItem('recentFiles', JSON.stringify(filtered.slice(0, 5)));
  } catch { /* no-op */ }
}

function populateRecentFiles() {
  const list = getRecentFiles();
  const section = document.getElementById('recent-files-section');
  const ul = document.getElementById('recent-files-list');
  if (!section || !ul) return;
  if (!list.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  ul.innerHTML = '';
  list.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'recent-file-item';
    li.innerHTML = `<span class="recent-file-name">${f.name}</span> <span class="recent-file-meta">(${f.type})</span>`;
    li.addEventListener('click', () => {
      // We cannot auto-load from disk; trigger the relevant picker instead.
      if (f.type === 'adeck') document.getElementById('start-screen-adeck-input')?.click();
      else if (f.type === 'bdeck') document.getElementById('start-screen-bdeck-input')?.click();
      else document.getElementById('start-screen-csv-input')?.click();
    });
    ul.appendChild(li);
  });
}
