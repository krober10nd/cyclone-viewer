// utils/formatters.js
// Unit conversions, intensity scales, and formatting utilities

export const UNIT_CONVERSIONS = {
  WIND_MS_TO_MPH: 2.23693629,
  KM_TO_MILES: 0.621371192,
  M_TO_FT: 3.2808399,
  NM_TO_KM: 1.852,
  NM_TO_MILES: 1.15077945,
  M_TO_KM: 0.001,
  KM_TO_M: 1000,
  NM_TO_M: 1852,
  M_TO_NM: 1 / 1852,
};

export const NM_TO_KM = UNIT_CONVERSIONS.NM_TO_KM;

// Internal state
let unitSystem = 'metric'; // 'metric' | 'imperial'
let currentScale = 'saffir-simpson'; // 'saffir-simpson' | 'bom'

export const saffirSimpsonScale = [
  { name: 'TD/Tropical', maxWind: 17, color: '#5eb5e0' }, // <34 kt ≈ <17 m/s
  { name: 'TS', maxWind: 32, color: '#00e400' }, // 34-63 kt ≈ 17-32 m/s
  { name: 'Cat 1', maxWind: 42, color: '#ffff00' },
  { name: 'Cat 2', maxWind: 49, color: '#ff7e00' },
  { name: 'Cat 3', maxWind: 58, color: '#ff0000' },
  { name: 'Cat 4', maxWind: 70, color: '#ff8feb' },
  { name: 'Cat 5', maxWind: Infinity, color: '#8a008a' },
];

export const bomScale = [
  { name: 'Cat 1', maxWind: 25, color: '#ffff66' },
  { name: 'Cat 2', maxWind: 33, color: '#ffcc66' },
  { name: 'Cat 3', maxWind: 43, color: '#ff9966' },
  { name: 'Cat 4', maxWind: 55, color: '#ff6666' },
  { name: 'Cat 5', maxWind: Infinity, color: '#ff0000' },
];

export function setUnitSystem(system) {
  if (system === 'metric' || system === 'imperial') unitSystem = system;
}
export function getUnitSystem() { return unitSystem; }

export function setIntensityScale(scale) {
  if (scale === 'saffir-simpson' || scale === 'bom') currentScale = scale;
}
export function getIntensityScale() { return currentScale; }

export function getHurricaneCategory(windSpeedMs) {
  const scale = currentScale === 'bom' ? bomScale : saffirSimpsonScale;
  const s = Number(windSpeedMs) || 0;
  for (let i = 0; i < scale.length; i++) {
    if (s <= scale[i].maxWind) return { ...scale[i], index: i };
  }
  return { name: 'Unknown', color: '#cccccc', index: -1 };
}

export function formatWindSpeed(windSpeedMs) {
  const s = Number(windSpeedMs) || 0;
  if (unitSystem === 'imperial') {
    const mph = s * UNIT_CONVERSIONS.WIND_MS_TO_MPH;
    return `${mph.toFixed(0)} mph`;
    
  }
  return `${s.toFixed(0)} m/s`;
}

export function formatPointTime(date) {
  if (!(date instanceof Date)) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${mi} UTC`;
}

export function metersToDisplayUnits(meters) {
  const m = Number(meters) || 0;
  if (unitSystem === 'imperial') return `${(m * UNIT_CONVERSIONS.M_TO_FT).toFixed(0)} ft`;
  return `${(m * UNIT_CONVERSIONS.M_TO_KM).toFixed(2)} km`;
}

export function displayUnitsToMeters(value) {
  const v = Number(value) || 0;
  if (unitSystem === 'imperial') return v / UNIT_CONVERSIONS.M_TO_FT;
  return v * UNIT_CONVERSIONS.KM_TO_M;
}

export function isSpecified(value) {
  return value !== undefined && value !== null && !Number.isNaN(Number(value));
}

export function hexToRgba(hex, alpha = 1) {
  const c = hex.replace('#', '');
  const bigint = parseInt(c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastingTextColor(hexColor) {
  const c = hexColor.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#ffffff';
}

// Backward compatibility for non-module scripts
if (typeof window !== 'undefined') {
  window.UNIT_CONVERSIONS = UNIT_CONVERSIONS;
  window.NM_TO_KM = NM_TO_KM;
}
