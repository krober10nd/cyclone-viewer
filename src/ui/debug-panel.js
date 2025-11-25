
import * as StateManager from '../core/state-manager.js';
import * as MapManager from '../core/map-manager.js';

let panelElement = null;
let logContainer = null;
let isVisible = false;

export function initializeDebugPanel() {
  if (panelElement) return;

  // Create the panel HTML
  panelElement = document.createElement('div');
  panelElement.id = 'debug-panel';
  panelElement.className = 'debug-panel hidden';
  panelElement.innerHTML = `
    <div class="debug-header">
      <h3>Debug Panel</h3>
      <button id="debug-close" class="close-btn">&times;</button>
    </div>
    <div class="debug-content">
      <div class="debug-section">
        <h4>State Inspector</h4>
        <div id="debug-state-info" class="debug-info">Loading...</div>
        <button id="debug-refresh-state" class="btn secondary small">Refresh State</button>
      </div>
      <div class="debug-section">
        <h4>Actions</h4>
        <div class="debug-actions">
          <button id="debug-reset-map" class="btn danger small">Reset Map</button>
          <button id="debug-fix-adeck" class="btn warning small">Fix A-Deck Vis</button>
          <button id="debug-run-tests" class="btn primary small">Run Self-Test</button>
        </div>
      </div>
      <div class="debug-section">
        <h4>Logs</h4>
        <div id="debug-logs" class="debug-logs"></div>
        <button id="debug-clear-logs" class="btn secondary small">Clear Logs</button>
      </div>
    </div>
  `;

  document.body.appendChild(panelElement);

  // Cache elements
  logContainer = panelElement.querySelector('#debug-logs');

  // Event Listeners
  document.getElementById('debug-close').addEventListener('click', toggleDebugPanel);
  document.getElementById('debug-refresh-state').addEventListener('click', updateStateInfo);
  document.getElementById('debug-reset-map').addEventListener('click', () => {
    if (window.resetMap) window.resetMap();
    log('Map reset triggered.');
  });
  document.getElementById('debug-fix-adeck').addEventListener('click', () => {
    if (window.fixAdeckVisibility) window.fixAdeckVisibility();
    log('A-Deck visibility fix triggered.');
  });
  document.getElementById('debug-run-tests').addEventListener('click', runSelfTest);
  document.getElementById('debug-clear-logs').addEventListener('click', () => {
    logContainer.innerHTML = '';
  });

  // Global Shortcut
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      toggleDebugPanel();
    }
  });

  // Hook into console to capture logs (optional, but useful)
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  console.log = (...args) => {
    originalConsoleLog(...args);
    log('LOG: ' + args.join(' '), 'info');
  };
  console.warn = (...args) => {
    originalConsoleWarn(...args);
    log('WARN: ' + args.join(' '), 'warning');
  };
  console.error = (...args) => {
    originalConsoleError(...args);
    log('ERR: ' + args.join(' '), 'error');
  };

  log('Debug Panel Initialized. Press Ctrl+Shift+D to toggle.');
}

export function toggleDebugPanel() {
  isVisible = !isVisible;
  if (isVisible) {
    panelElement.classList.remove('hidden');
    updateStateInfo();
  } else {
    panelElement.classList.add('hidden');
  }
}

function updateStateInfo() {
  const map = StateManager.getMap();
  const center = map ? map.getCenter() : { lat: 0, lng: 0 };
  const zoom = map ? map.getZoom() : 0;
  const trackCount = StateManager.getData().length;
  const selectedStorm = StateManager.getSelectedStormId();
  const unitSystem = StateManager.getUnitSystem();

  const info = `
    <strong>Map Center:</strong> ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}<br>
    <strong>Zoom:</strong> ${zoom}<br>
    <strong>Track Points:</strong> ${trackCount}<br>
    <strong>Selected Storm:</strong> ${selectedStorm || 'None'}<br>
    <strong>Unit System:</strong> ${unitSystem}<br>
    <strong>View Mode:</strong> ${StateManager.getViewMode()}<br>
  `;
  document.getElementById('debug-state-info').innerHTML = info;
}

function log(message, type = 'info') {
  if (!logContainer) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.prepend(entry);
}

function runSelfTest() {
  log('Starting Self-Test...', 'info');
  let passed = 0;
  let failed = 0;

  function check(name, condition) {
    if (condition) {
      log(`PASS: ${name}`, 'success');
      passed++;
    } else {
      log(`FAIL: ${name}`, 'error');
      failed++;
    }
  }

  // 1. DOM Checks
  check('Map Container Exists', !!document.getElementById('map'));
  check('App Container Exists', !!document.getElementById('app'));

  // 2. State Checks
  check('State Manager Initialized', !!StateManager);
  check('Map Object in State', !!StateManager.getMap());

  // 3. Map Checks
  const map = StateManager.getMap();
  if (map) {
    check('Map has Center', !!map.getCenter());
    check('Map has Zoom', typeof map.getZoom() === 'number');
  }

  // 4. Global Helpers
  check('window.resetMap exists', typeof window.resetMap === 'function');
  check('window.fixAdeckVisibility exists', typeof window.fixAdeckVisibility === 'function');

  log(`Self-Test Complete. Passed: ${passed}, Failed: ${failed}`, failed === 0 ? 'success' : 'error');
}
