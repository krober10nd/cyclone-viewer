// utils/calculations.js
// Geospatial and temporal calculation helpers
// NOTE: Pure functions. No external deps.

/** Earth radius in kilometers */
export const EARTH_RADIUS_KM = 6371;

/**
 * Calculate initial bearing from point A to B (degrees from north, 0-360)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  let brng = (toDeg(θ) + 360) % 360;
  if (Number.isNaN(brng)) brng = 0;
  return brng;
}

/**
 * Destination point given start, distance in km, and bearing
 * @param {number} lat
 * @param {number} lon
 * @param {number} distanceKm
 * @param {number} bearingDeg
 * @returns {{lat:number, lon:number}}
 */
export function calculateDestinationFromKm(lat, lon, distanceKm, bearingDeg) {
  const δ = distanceKm / EARTH_RADIUS_KM; // angular distance in radians
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}

/**
 * Backward-compat wrapper using degrees where distance is assumed in degrees of arc (approx).
 * Historically some callers passed degrees; convert to km by great-circle length per degree at equator.
 * Prefer calculateDestinationFromKm in new code.
 */
export function calculateDestination(lat, lon, distanceDeg, bearingDeg) {
  const kmPerDegree = (2 * Math.PI * EARTH_RADIUS_KM) / 360; // ~111.195 km/deg
  return calculateDestinationFromKm(lat, lon, distanceDeg * kmPerDegree, bearingDeg);
}

/**
 * Haversine distance in kilometers between two WGS84 coordinates
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Alias of calculateDistanceKm kept for backward compatibility.
 */
export const calculateHaversineDistance = calculateDistanceKm;

/**
 * Extract a Date from a point with UTC fields (year_utc, month_utc, day_utc, hour_utc, minute_utc)
 * @param {Record<string, any>} point
 * @returns {Date|null}
 */
export function getPointTimestamp(point) {
  if (!point) return null;
  const y = toInt(point.year_utc);
  const mo = toInt(point.month_utc) - 1;
  const d = toInt(point.day_utc);
  const h = toInt(point.hour_utc) || 0;
  const mi = toInt(point.minute_utc) || 0;
  if ([y, mo, d].some((v) => Number.isNaN(v))) return null;
  return new Date(Date.UTC(y, mo, d, h, mi));
}

/**
 * Hours between two points with UTC fields
 */
export function getTimeDeltaHours(point1, point2) {
  const t1 = getPointTimestamp(point1);
  const t2 = getPointTimestamp(point2);
  if (!t1 || !t2) return 0;
  return (t2.getTime() - t1.getTime()) / (1000 * 60 * 60);
}

/**
 * Estimate cyclone speed in km/h using distance between adjacent points and time delta
 * @param {number} pointIndex
 * @param {Array<Record<string, any>>} data
 */
export function estimateSpeed(pointIndex, data) {
  if (!Array.isArray(data) || data.length < 2) return 0;
  const i1 = Math.max(0, Math.min(data.length - 2, pointIndex));
  const i2 = i1 + 1;
  const p1 = data[i1];
  const p2 = data[i2];
  const distKm = calculateDistanceKm(p1.lat, p1.lon, p2.lat, p2.lon);
  const hours = getTimeDeltaHours(p1, p2) || 1e-9;
  const kmh = distKm / hours;
  return Number.isFinite(kmh) ? kmh : 0;
}

/**
 * Translational speed in m/s from two adjacent points
 */
export function getTcspd(index, data) {
  const kmh = estimateSpeed(index, data);
  return (kmh * 1000) / 3600;
}

/**
 * Convert nautical miles to degrees at given latitude (approx)
 */
export function nmToDegrees(nm, latitude) {
  // 1 NM is 1 arc-minute of latitude. 60 NM ≈ 1 degree latitude. Adjust by cos(lat) for longitude component.
  const degLat = nm / 60;
  const deg = degLat / Math.cos(toRad(latitude || 0));
  return Number.isFinite(deg) ? deg : 0;
}

/**
 * Points for an arc wedge centered at (lat,lon) with radius in NM from startAngle to endAngle
 */
export function calculateWedgePoints(lat, lon, radiusNM, startAngle, endAngle) {
  const step = 5; // degrees step for smoothness
  const km = radiusNM * 1.852;
  const pts = [];
  for (let a = startAngle; a <= endAngle; a += step) {
    const p = calculateDestinationFromKm(lat, lon, km, a);
    pts.push([p.lat, p.lon]);
  }
  return pts;
}

/**
 * Outline of unified R34 using four quadrant radii in NM
 */
export function calculateR34OutlinePoints(lat, lon, r34_ne, r34_se, r34_sw, r34_nw) {
  const quads = [
    { r: r34_ne, start: 0, end: 90 },
    { r: r34_se, start: 90, end: 180 },
    { r: r34_sw, start: 180, end: 270 },
    { r: r34_nw, start: 270, end: 360 },
  ];
  let pts = [];
  quads.forEach(({ r, start, end }) => {
    if (!r || r <= 0) return;
    pts = pts.concat(calculateWedgePoints(lat, lon, r, start, end));
  });
  return pts;
}

/**
 * Compute point time from initialization time (Date or ISO) and forecast lead time (tau) in hours
 */
export function calculatePointTimeFromTau(initTime, tau) {
  const base = initTime instanceof Date ? initTime : new Date(initTime);
  if (!base || Number.isNaN(base.getTime())) return null;
  const hours = Number(tau) || 0;
  return new Date(base.getTime() + hours * 3600 * 1000);
}

// Helpers
function toRad(d) { return (d * Math.PI) / 180; }
function toDeg(r) { return (r * 180) / Math.PI; }
function normalizeLon(lon) { let x = ((lon + 540) % 360) - 180; return x; }
function toInt(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : NaN; }
