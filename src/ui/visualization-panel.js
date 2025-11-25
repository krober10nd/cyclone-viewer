// ui/visualization-panel.js
// Collapsible panel with visualization toggles for storm structures, isochrones, track line, and date/time labels

import * as State from '../core/state-manager.js';
import { toggleStormStructures } from '../visualization/storm-attributes.js';
import { isochronesToggle } from '../visualization/isochrones.js';
import { toggleTrackLine, toggleDateLabels, updateDateLabels } from '../visualization/track-renderer.js';

let panelEl;

export function initializeVisualizationPanel() {
  try {
    const existing = document.getElementById('visualization-panel');
    // Build structure if placeholder is missing or empty
    if (!existing || existing.childElementCount === 0) {
      panelEl = createVisualizationPanel();
    } else {
      panelEl = existing;
    }
    updatePanelState();
    // Respect persisted panel visibility
    const expanded = State.getVisualizationPanelVisible();
    setPanelExpanded(expanded);
  } catch (e) {
    console.warn('[viz-panel] initialization error', e);
  }
  return panelEl;
}

export function createVisualizationPanel() {
  const container = document.getElementById('visualization-panel') || document.createElement('div');
  container.id = 'visualization-panel';
  container.className = 'viz-panel collapsed';
  container.setAttribute('aria-label', 'Visualization Panel');
  container.setAttribute('aria-expanded', 'false');

  // Header
  const header = document.createElement('div');
  header.className = 'viz-panel-header';
  const title = document.createElement('div');
  title.className = 'viz-panel-title';
  title.textContent = 'Visualizations';
  const btn = document.createElement('button');
  btn.className = 'viz-panel-collapse-btn';
  btn.setAttribute('aria-label', 'Toggle visualization panel');
  btn.textContent = '◀';
  header.appendChild(title);
  header.appendChild(btn);
  header.addEventListener('click', () => togglePanelVisibility());

  // Body
  const body = document.createElement('div');
  body.className = 'viz-panel-body';
  body.appendChild(createToggleItem(
    'Storm Structures',
    'toggle-storm-structures',
    () => { toggleStormStructures(); syncAfterToggle(); },
    'Show/hide RMW, R34 radii, and ROCI'
  ));

  body.appendChild(createToggleItem(
    'ADECK Time Slider',
    'toggle-adeck-time-slider',
    (checked) => {
      if (checked) window.AdeckTimeSlider?.showTimeSlider?.();
      else window.AdeckTimeSlider?.hideTimeSlider?.();
    },
    'Show/hide ADECK forecast time slider',
    true
  ));

  body.appendChild(createToggleItem(
    'Isochrones',
    'viz-toggle-isochrones',
    (checked) => { isochronesToggle(!!checked); },
    'Show/hide translation speed contours',
    true // pass checked state
  ));

  body.appendChild(createToggleItem(
    'Track Line',
    'toggle-track-line',
    (checked) => { toggleTrackLine(!!checked); },
    'Show/hide polyline connecting positions',
    true
  ));

  body.appendChild(createToggleItem(
    'Date/Time Labels',
    'toggle-date-labels',
    (checked) => { toggleDateLabels(!!checked); },
    'Show/hide timestamp labels on markers',
    true
  ));

  body.appendChild(createToggleItem(
    'ADECK Structures',
    'toggle-adeck-structures',
    (checked) => {
      window.toggleAdeckStructures?.(checked);
      try { window.localStorage.setItem('adeckShowStructures', checked); } catch {}
    },
    'Show wind radii/RMW/ROCI envelopes',
    true,
    true
  ));

  container.appendChild(header);
  container.appendChild(body);

  // Append to map container
  const mapContainer = document.getElementById('map-container') || document.body;
  mapContainer.appendChild(container);
  return container;
}

function createToggleItem(labelText, inputId, onToggle, description, passChecked = false, adeckOnly = false) {
  const item = document.createElement('div');
  item.className = 'viz-toggle-item';
  if (adeckOnly) item.classList.add('adeck-only');

  const label = document.createElement('label');
  label.className = 'viz-toggle-label';
  label.setAttribute('for', inputId);
  label.textContent = labelText;

  const wrapper = document.createElement('div');
  wrapper.className = 'viz-toggle-wrapper';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = inputId;
  input.className = 'viz-toggle-checkbox';

  const switchEl = document.createElement('span');
  switchEl.className = 'viz-toggle-switch';

  wrapper.appendChild(input);
  wrapper.appendChild(switchEl);

  const desc = document.createElement('span');
  desc.className = 'viz-toggle-description';
  desc.textContent = description || '';

  item.appendChild(label);
  item.appendChild(wrapper);
  if (description) item.appendChild(desc);

  input.addEventListener('change', (e) => {
    try {
      if (passChecked) onToggle(!!e.target.checked); else onToggle();
    } catch (err) { console.warn('[viz-panel] toggle error', err); }
  });

  return item;
}

export function togglePanelVisibility() {
  if (!panelEl) panelEl = document.getElementById('visualization-panel');
  if (!panelEl) return;
  const expanded = !panelEl.classList.contains('collapsed');
  setPanelExpanded(!expanded);
}

function setPanelExpanded(expanded) {
  if (!panelEl) return;
  if (expanded) {
    panelEl.classList.remove('collapsed');
    panelEl.setAttribute('aria-expanded', 'true');
  } else {
    panelEl.classList.add('collapsed');
    panelEl.setAttribute('aria-expanded', 'false');
  }
  try { State.setVisualizationPanelVisible(expanded); } catch {}
}

export function updatePanelState() {
  try {
    const ss = State.getStormStructuresVisible?.() ?? true;
    const iso = !!State.getIsochronesEnabled?.();
    const tl = State.getTrackLineVisible?.() ?? true;
    const dl = State.getDateLabelsVisible?.() ?? true;
    setChecked('toggle-storm-structures', !!ss);
    setChecked('viz-toggle-isochrones', !!iso);
    setChecked('toggle-track-line', !!tl);
    setChecked('toggle-date-labels', !!dl);
    const adeckPref = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('adeckShowStructures')
      : null;
    setChecked('toggle-adeck-structures', adeckPref === null ? true : adeckPref === 'true');
  } catch (e) {
    // best-effort
  }
}

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function syncAfterToggle() {
  try { updateDateLabels(); } catch {}
  try { updatePanelState(); } catch {}
}

// Reveal ADECK-only controls once ADECK data is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('adeck-loaded', () => {
    try {
      document.querySelectorAll('.viz-toggle-item.adeck-only').forEach((el) => {
        el.style.display = '';
      });
    } catch {}
  });
}