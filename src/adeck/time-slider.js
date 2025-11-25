// ADECK Time Slider
// Controls forecast hour (tau) filtering and simple playback.

const L = window.L;

let sliderState = {
  container: null,
  rangeInput: null,
  labelEl: null,
  playBtn: null,
  speedSelect: null,
  minTau: 0,
  maxTau: 0,
  currentTau: 0,
  availableTaus: [],
  playing: false,
  timerId: null,
};

function ensureContainer() {
  if (sliderState.container) return sliderState.container;
  const mapContainer = document.getElementById('map-container') || document.body;
  const panel = document.createElement('div');
  panel.id = 'adeck-time-slider';
  panel.className = 'time-slider-panel hidden';

  const controls = document.createElement('div');
  controls.className = 'time-slider-controls';

  const playBtn = document.createElement('button');
  playBtn.className = 'btn small secondary time-slider-play';
  playBtn.type = 'button';
  playBtn.textContent = '▶';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '0';
  range.step = '1';
  range.value = '0';
  range.className = 'time-slider-range';

  const label = document.createElement('span');
  label.className = 'time-slider-label';
  label.textContent = 'Tau: 0 h';

  const speed = document.createElement('select');
  speed.className = 'time-slider-speed';
  [0.5, 1, 2, 4].forEach((mult) => {
    const opt = document.createElement('option');
    opt.value = String(mult);
    opt.textContent = `${mult}x`;
    if (mult === 1) opt.selected = true;
    speed.appendChild(opt);
  });

  controls.appendChild(playBtn);
  controls.appendChild(range);
  controls.appendChild(label);
  controls.appendChild(speed);
  panel.appendChild(controls);
  mapContainer.appendChild(panel);

  sliderState.container = panel;
  sliderState.rangeInput = range;
  sliderState.labelEl = label;
  sliderState.playBtn = playBtn;
  sliderState.speedSelect = speed;

  // Wire events
  range.addEventListener('input', () => {
    const idx = Number(range.value) || 0;
    const tau = sliderState.availableTaus[idx] ?? sliderState.minTau;
    setCurrentTau(tau, true);
  });

  playBtn.addEventListener('click', () => {
    if (sliderState.playing) stopPlayback(); else startPlayback();
  });

  return panel;
}

function updateLabel() {
  if (!sliderState.labelEl) return;
  const tau = sliderState.currentTau || 0;
  sliderState.labelEl.textContent = `Tau: ${tau} h`;
}

function setCurrentTau(tau, notify) {
  sliderState.currentTau = tau;
  updateLabel();
  if (sliderState.rangeInput) {
    const idx = sliderState.availableTaus.indexOf(tau);
    if (idx >= 0) sliderState.rangeInput.value = String(idx);
  }
  if (notify && typeof window.filterAdeckByTau === 'function') {
    try { window.filterAdeckByTau?.(tau); } catch {}
  }
}

function startPlayback() {
  if (!sliderState.availableTaus.length) return;
  sliderState.playing = true;
  if (sliderState.playBtn) sliderState.playBtn.textContent = '⏸';

  const baseDelay = 600; // ms
  const getDelay = () => {
    const mult = Number(sliderState.speedSelect?.value || '1');
    return baseDelay / (mult > 0 ? mult : 1);
  };

  const step = () => {
    if (!sliderState.playing) return;
    const taus = sliderState.availableTaus;
    if (!taus.length) { stopPlayback(); return; }
    const idx = Math.max(0, taus.indexOf(sliderState.currentTau));
    const nextIdx = (idx + 1) % taus.length;
    const nextTau = taus[nextIdx];
    setCurrentTau(nextTau, true);
    sliderState.timerId = window.setTimeout(step, getDelay());
  };

  step();
}

function stopPlayback() {
  sliderState.playing = false;
  if (sliderState.playBtn) sliderState.playBtn.textContent = '▶';
  if (sliderState.timerId != null) {
    window.clearTimeout(sliderState.timerId);
    sliderState.timerId = null;
  }
}

export function initializeTimeSlider() {
  try { ensureContainer(); } catch {}
  return sliderState.container;
}

export function updateTimeSlider(tracks = []) {
  ensureContainer();
  const allPoints = [];
  (tracks || []).forEach((t) => {
    (t.points || []).forEach((p) => {
      const tau = Number(p.tau ?? p.leadTime ?? p.lead_time_hours ?? p.lead_time);
      if (Number.isFinite(tau)) allPoints.push(tau);
    });
  });

  const uniqueSorted = Array.from(new Set(allPoints)).sort((a, b) => a - b);
  sliderState.availableTaus = uniqueSorted;
  sliderState.minTau = uniqueSorted[0] ?? 0;
  sliderState.maxTau = uniqueSorted[uniqueSorted.length - 1] ?? 0;

  if (sliderState.rangeInput) {
    sliderState.rangeInput.min = '0';
    sliderState.rangeInput.max = String(Math.max(uniqueSorted.length - 1, 0));
    sliderState.rangeInput.disabled = uniqueSorted.length <= 1;
  }
  if (!uniqueSorted.length) {
    setCurrentTau(0, false);
    hideTimeSlider();
    return;
  }

  setCurrentTau(uniqueSorted[0], true);
  showTimeSlider();
}

export function showTimeSlider() {
  ensureContainer();
  if (sliderState.container) sliderState.container.classList.remove('hidden');
}

export function hideTimeSlider() {
  ensureContainer();
  stopPlayback();
  if (sliderState.container) sliderState.container.classList.add('hidden');
}

export function getCurrentTau() {
  return sliderState.currentTau || 0;
}

// Expose simple API on window for ad-hoc use
window.AdeckTimeSlider = window.AdeckTimeSlider || {
  initializeTimeSlider,
  updateTimeSlider,
  showTimeSlider,
  hideTimeSlider,
  getCurrentTau,
};
