/*
 * A-Deck/B-Deck Parser Module (lightweight scaffolding)
 * Extracted from adeck-reader. Provides named exports with minimal, safe parsing.
 * Note: This is a focused parsing module with no external dependencies.
 */

/**
 * Format YYYYMMDDHH into "YYYY-MM-DD HH:00 UTC"
 * @param {string|number} yyyymmddhh
 * @returns {string}
 */
export function formatDateTime(yyyymmddhh) {
  const s = String(yyyymmddhh || "").trim();
  if (s.length < 10) return s;
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  const h = s.slice(8, 10);
  return `${y}-${m}-${d} ${h}:00 UTC`;
}

/**
 * Build a human readable cyclone name like "AL16 (2004)"
 * @param {string} basin
 * @param {string|number} number
 * @param {string|number} year
 * @returns {string}
 */
export function formatCycloneName(basin, number, year) {
  const b = String(basin || "").toUpperCase();
  const n = String(number || "").padStart(2, "0");
  const y = String(year || "").padStart(4, "0");
  return `${b}${n} (${y})`;
}

/**
 * Build a lowercase cyclone id like "aal162004"
 * @param {string} basin
 * @param {string|number} number
 * @param {string|number} year
 * @returns {string}
 */
export function formatCycloneId(basin, number, year) {
  const b = String(basin || "").toLowerCase();
  const n = String(number || "").padStart(2, "0");
  const y = String(year || "").padStart(4, "0");
  return `${b}${n}${y}`;
}

/**
 * Default A-deck column map (indices) used when headers are absent.
 * @returns {Record<string, number>}
 */
export function getDefaultColumnMap() {
  // Standard ATCF format defaults (no header)
  // BASIN, CY, YYYYMMDDHH, TECH, TAU, LAT, LON, VMAX, MSLP
  return {
    basin: 0,
    number: 1,
    init: 2, // YYYYMMDDHH
    model: 3, // TECH
    tau: 4,
    lat: 6,
    lon: 7,
    vmax: 8,
    mslp: 9,
    // Year is usually not a separate column in standard ATCF, derived from init
  };
}

/**
 * Parse a header row into a column map, falling back to defaults.
 * @param {string} headerLine
 * @returns {Record<string, number>}
 */
export function parseHeaderRow(headerLine) {
  if (!headerLine || typeof headerLine !== "string")
    return getDefaultColumnMap();
  const parts = headerLine.split(',').map((s) => s.trim().toLowerCase());
  const map = { ...getDefaultColumnMap() };
  const tryMap = (keys, name) => {
    for (const k of keys) {
      const idx = parts.indexOf(k);
      if (idx !== -1) return (map[name] = idx);
    }
  };
  // A-deck/B-deck common synonyms
  tryMap(["model", "aid", "tech", "techname", "technique", "name"], "model");
  tryMap(["basin"], "basin");
  tryMap(["number", "num", "stormnum", "cycnum", "stnum"], "number");
  tryMap(["year", "yyyy", "yr"], "year");
  tryMap(["init", "ymdh", "yyyymmddhh", "adate", "time", "validtime"], "init");
  tryMap(["tau", "fhr", "lead", "ftime", "leadtime"], "tau");
  tryMap(["lat", "latitude", "nlat", "slat"], "lat");
  tryMap(["lon", "long", "longitude", "elon", "wlon"], "lon");
  tryMap(["vmax", "wind", "max_wind", "vmaxkt", "vmax_kt"], "vmax");
  tryMap(
    ["mslp", "pmin", "pressure", "min_slp", "min_pressure", "slp"],
    "mslp"
  );
  // B-deck radii and sizes
  tryMap(
    ["r34_ne", "radius_34kt_ne", "radius34_ne", "rad34ne", "ne34"],
    "r34_ne"
  );
  tryMap(
    ["r34_se", "radius_34kt_se", "radius34_se", "rad34se", "se34"],
    "r34_se"
  );
  tryMap(
    ["r34_sw", "radius_34kt_sw", "radius34_sw", "rad34sw", "sw34"],
    "r34_sw"
  );
  tryMap(
    ["r34_nw", "radius_34kt_nw", "radius34_nw", "rad34nw", "nw34"],
    "r34_nw"
  );
  tryMap(["rmw", "rmax", "radius_maximum_wind", "rmw_nm"], "rmw");
  tryMap(
    ["roci", "radius_outermost_isobar", "roci_nm", "outer_isobar"],
    "roci"
  );
  return map;
}

/**
 * Dynamically detect column indices based on data patterns.
 * @param {string} line
 * @returns {Record<string, number>}
 */
function detectColumns(line) {
  if (!line) return getDefaultColumnMap();
  const parts = line.split(',').map(s => s.trim());
  const map = {};
  
  // Helper to check patterns
  const isDate = s => /^\d{10}$/.test(s); // YYYYMMDDHH
  const isBasin = s => /^[A-Z]{2}$/.test(s) && !/^\d/.test(s); // AL, EP, etc.
  const isTech = s => /^[A-Z0-9]{4}$/.test(s) && !/^\d{4}$/.test(s); // CARQ, GFS, etc. (4 chars, not year)
  const isTau = s => /^\d{1,3}$/.test(s); // 0, 12, 120
  const isLat = s => /^\d{2,4}[NS]$/i.test(s); // 120N, 12N
  const isLon = s => /^\d{3,5}[EW]$/i.test(s); // 080W, 1200E

  // Scan parts
  parts.forEach((p, i) => {
    if (map.init === undefined && isDate(p)) map.init = i;
    else if (map.basin === undefined && isBasin(p)) map.basin = i;
    else if (map.model === undefined && isTech(p)) map.model = i;
    else if (map.lat === undefined && isLat(p)) map.lat = i;
    else if (map.lon === undefined && isLon(p)) map.lon = i;
  });

  // If we found init, try to find tau relative to it (usually init + 2)
  if (map.init !== undefined) {
    // Look for tau after init
    for (let i = map.init + 1; i < parts.length; i++) {
      if (isTau(parts[i]) && map.tau === undefined) {
        // Verify it's not lat/lon
        if (!isLat(parts[i]) && !isLon(parts[i])) {
           map.tau = i;
           break;
        }
      }
    }
  }

  // Fallbacks if not found, use standard offsets relative to known anchors
  if (map.model === undefined && map.init !== undefined) {
    // Standard ATCF: init is 2, model is 3.
    // If init is found at I, model might be I+1
    if (parts.length > map.init + 1) map.model = map.init + 1;
  }
  
  // Fill missing with defaults or best guess
  const defaults = getDefaultColumnMap();
  return { ...defaults, ...map };
}

// --- helpers ---

function parseATCFNumericTenths(value) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return undefined;
  const num = parseInt(s, 10);
  if (!Number.isFinite(num)) return undefined;
  // ATCF numeric-only coords are still in tenths of a degree
  return num / 10;
}

function parseATCFHemispheric(value, type) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const mDec = s.match(/^(\d+(?:\.\d+)?)([NSEW])$/i);
  const mInt = s.match(/^(\d+)([NSEW])$/i);
  let deg;
  if (mDec) {
    // e.g. 20.6N
    deg = parseFloat(mDec[1]);
    const hemi = mDec[2].toUpperCase();
    if (hemi === "S" || hemi === "W") deg = -deg;
    return deg/10; // ATCF tenths
  }
  if (mInt) {
    // ATCF tenths: 285N => 28.5, 0775W => 77.5
    const num = parseInt(mInt[1], 10);
    const hemi = mInt[2].toUpperCase();
    deg = num / 10; // both lat and lon are in tenths
    if (hemi === "S" || hemi === "W") deg = -deg;
    return deg;
  }
  // Numeric-only fallback: treat as tenths if it looks like an integer token
  const tenths = parseATCFNumericTenths(s);
  if (tenths !== undefined) return tenths;
  // Plain numeric fallback
  const v = Number(s);
  if (Number.isFinite(v)) return v;
  return undefined;
}

function toInt(val) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * Extract values from a parsed line using a column map.
 * Handles hemispheric and ATCF tenths lat/lon; skips invalid (0,0) points.
 * @param {string[]} parts
 * @param {Record<string, number>} columnMap
 * @returns {null|Record<string, any>}
 */
export function extractValuesFromLine(parts, columnMap) {
  const get = (key) => {
    const i = columnMap[key];
    return Number.isInteger(i) ? parts[i] : undefined;
  };
  // Prefer explicit mapped columns
  let lat = parseATCFHemispheric(get("lat"), "lat");
  let lon = parseATCFHemispheric(get("lon"), "lon");

  // If no map, attempt heuristic scan for hemispheric tokens
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    for (let i = 0; i < parts.length; i++) {
      const a = parseATCFHemispheric(parts[i], "lat");
      const b = parseATCFHemispheric(parts[i + 1], "lon");
      if (Number.isFinite(a) && Number.isFinite(b)) {
        lat = a;
        lon = b;
        break;
      }
    }
  }
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    (lat === 0 && lon === 0)
  )
    return null;
  const model = get("model") ?? "UNKNOWN";
  const basin = get("basin") ?? "";
  const number = get("number") ?? "";
  let year = get("year") ?? "";
  const init = get("init") ?? "";
  
  // Derive year from init if missing (YYYYMMDDHH)
  if (!year && init && init.length >= 4) {
    year = init.substring(0, 4);
  }

  const tau = Number(get("tau")) || 0;
  const vmax = Number(get("vmax")) || undefined;
  const mslp = Number(get("mslp")) || undefined;
  return { model, basin, number, year, init, tau, lat, lon, vmax, mslp };
}

/**
 * Convert an extracted A-deck record into a standardized point format.
 * @param {Record<string, any>} record
 * @returns {Record<string, any>}
 */
export function convertPointFormat(record) {
  // Basic conversion; downstream code can enrich further.
  return {
    model: record.model,
    basin: record.basin,
    number: record.number,
    year: record.year,
    init: record.init,
    tau: record.tau,
    lat: record.lat,
    lon: record.lon,
    wind_speed: record.vmax,
    mslp: record.mslp,
    isFirstPoint: false,
  };
}

function deriveUTCFromInitTau(init, tau) {
  const s = String(init || "").trim();
  if (s.length < 10) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10) - 1;
  const d = parseInt(s.slice(6, 8), 10);
  const h = parseInt(s.slice(8, 10), 10);
  const ms = Date.UTC(y, m, d, h, 0, 0) + (Number(tau) || 0) * 3600_000;
  const dt = new Date(ms);
  return {
    timestamp: ms,
    year_utc: dt.getUTCFullYear(),
    month_utc: dt.getUTCMonth() + 1,
    day_utc: dt.getUTCDate(),
    hour_utc: dt.getUTCHours(),
    minute_utc: dt.getUTCMinutes() || 0,
  };
}

/**
 * Parse A-deck file content into a storms array grouped by model/init.
 * @param {string} content
 * @returns {{ storms: any[], count: number }}
 */
export function parseAdeckFile(content) {
  if (!content || typeof content !== "string") {
    console.warn("[Adeck Parser] Empty content");
    return { storms: [], count: 0 };
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  console.info("[Adeck Parser] Read", lines.length, "line(s)");
  if (!lines.length) return { storms: [], count: 0 };

  // Try to detect header in the first non-comment line
  let headerMap = null;
  const first = lines[0];
  if (/model|aid|ymdh|init|yyyymmddhh/i.test(first)) {
    headerMap = parseHeaderRow(first);
  } else {
    // Dynamic column detection for headerless files
    headerMap = detectColumns(first);
    console.info("[Adeck Parser] Detected columns:", headerMap);
  }

  if (!headerMap) headerMap = getDefaultColumnMap();

  // Intermediate storage: Map<"model|basin|number|year|init|tau", PointObject>
  const pointMap = new Map();
  const nmToM = 1852;

  for (const line of lines) {
    if (!line.trim() || /^#|^\s*\*/.test(line)) continue;
    const parts = line.split(',').map((s) => s.trim());

    // Basic extraction
    const rec = extractValuesFromLine(parts, headerMap);
    if (!rec) continue;

    const key = `${rec.model}|${rec.basin}|${rec.number}|${rec.year}|${rec.init}|${rec.tau}`;

    let p = pointMap.get(key);
    if (!p) {
      p = convertPointFormat(rec);
      const utc = deriveUTCFromInitTau(rec.init, rec.tau);
      if (utc) Object.assign(p, utc);
      // Initialize radii structure
      p.radii = {};
      pointMap.set(key, p);
    }

    // Merge/Update data
    if (rec.vmax && (!p.wind_speed || rec.vmax > p.wind_speed))
      p.wind_speed = rec.vmax;
    if (rec.mslp && (!p.mslp || rec.mslp < p.mslp)) p.mslp = rec.mslp;

    // Extract Wind Radii if present in this line
    // Heuristic: Look for a column that is 34, 50, or 64 (WIND threshold)
    // and subsequent 4 columns that are integers (RAD1-4).
    let windThresh = null;
    let r1, r2, r3, r4;

    for (let i = 8; i < parts.length - 4; i++) {
      const val = parseInt(parts[i], 10);
      if ([34, 50, 64].includes(val)) {
        // Check if next 4 are numbers
        const next4 = parts.slice(i + 1, i + 5).map((x) => parseInt(x, 10));
        if (next4.every((n) => !isNaN(n))) {
          windThresh = val;
          [r1, r2, r3, r4] = next4;
          break;
        }
      }
    }

    if (windThresh) {
      p.radii[windThresh] = {
        ne: r1 * nmToM,
        se: r2 * nmToM,
        sw: r3 * nmToM,
        nw: r4 * nmToM,
      };
      // Back-compat for 34kt
      if (windThresh === 34) {
        p.r34_ne = r1 * nmToM;
        p.r34_se = r2 * nmToM;
        p.r34_sw = r3 * nmToM;
        p.r34_nw = r4 * nmToM;
      }
    }

    // Extract RMW / ROCI if present (often near end)
    // Standard ATCF: 18:RMW, 19:GUSTS, ... 16:P (pressure), 17:RRP (radius of last closed isobar?)
    // This is tricky without headers. We'll look for RMW/ROCI if mapped, or try to find them if we can.
    // For now, rely on headerMap if available, or maybe simple index if standard.
    // If headerMap is default, it doesn't have RMW/ROCI indices.
    // Let's assume if it's standard ATCF (35 cols?), RMW is at 18.
    if (parts.length >= 19 && !headerMap.rmw) {
      const rmwVal = parseInt(parts[18], 10);
      if (!isNaN(rmwVal) && rmwVal > 0 && rmwVal < 500) p.rmw = rmwVal * nmToM;
    }
  }

  console.debug("[Adeck Parser] Aggregated", pointMap.size, "unique points");
  try {
    const samplePoints = Array.from(pointMap.values()).slice(0, 3).map(p => ({ lat: p.lat, lon: p.lon }));
    console.debug('[Parser] Sample coords:', samplePoints);
  } catch {}

  // Group by model (across all cycles) so multi-cycle files like aal142024.dat
  // produce a single long trajectory per model with many taus. This gives the
  // ADECK time slider a rich tau range per model instead of many 1-point tracks.
  const grouped = new Map();
  for (const p of pointMap.values()) {
    const key = `${p.model}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p);
  }

  const storms = Array.from(grouped.entries()).map(([key, pts]) => {
    const model = key;
    // Choose the earliest init among points as the representative cycle label
    const init = pts.reduce((acc, cur) => (
      !acc || String(cur.init || "") < String(acc) ? cur.init : acc
    ), "");
    // Sort points by tau
    pts.sort((a, b) => (a.tau || 0) - (b.tau || 0));
    return {
      id: init ? `${model}-${init}` : String(model || "MODEL"),
      model,
      init,
      points: pts,
    };
  });

  console.info(`[Adeck Parser] Parsed ${storms.length} tracks`);
  return { storms, count: storms.length };
}

/**
 * Parse B-deck content into best track entries (minimal scaffolding).
 * @param {string} content
 * @returns {{ storms: any[], isBdeck: boolean, count: number }}
 */
export function parseBdeckFile(content) {
  if (!content || typeof content !== "string") {
    console.warn("[Bdeck Parser] Empty content");
    return { storms: [], isBdeck: true, count: 0 };
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { storms: [], isBdeck: true, count: 0 };

  // Optional header detection
  let headerMap = null;
  if (/lat|lon|r34|rmw|roci/i.test(lines[0]))
    headerMap = parseHeaderRow(lines[0]);

  const nmToM = 1852;
  const points = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^#|^\s*\*/.test(line)) continue;
    const parts = line.split(',').map((s) => s.trim());

    let lat, lon, wind, mslp, r34_ne, r34_se, r34_sw, r34_nw, rmw, roci, init;
    if (headerMap) {
      lat = parseATCFHemispheric(parts[headerMap.lat], "lat");
      lon = parseATCFHemispheric(parts[headerMap.lon], "lon");
      wind = toInt(parts[headerMap.vmax]);
      mslp = toInt(parts[headerMap.mslp]);
      r34_ne = toInt(parts[headerMap.r34_ne]);
      r34_se = toInt(parts[headerMap.r34_se]);
      r34_sw = toInt(parts[headerMap.r34_sw]);
      r34_nw = toInt(parts[headerMap.r34_nw]);
      rmw = toInt(parts[headerMap.rmw]);
      roci = toInt(parts[headerMap.roci]);
      init = parts[headerMap.init];
    } else {
      // Heuristic ATCF format: find consecutive lat/lon hemispheric tokens
      for (let i = 0; i < parts.length - 1; i++) {
        const a = parseATCFHemispheric(parts[i], "lat");
        const b = parseATCFHemispheric(parts[i + 1], "lon");
        if (Number.isFinite(a) && Number.isFinite(b)) {
          lat = a;
          lon = b;
          break;
        }
      }
      // Try to extract YYYYMMDDHH from tokens
      const timeTok = parts.find((p) => /^\d{10}$/.test(p));
      if (timeTok) init = timeTok;
      // Quadrant radii: take last group of 4 plausible ints (0..999)
      const nums = parts.map((x) => (/^\d+$/.test(x) ? parseInt(x, 10) : NaN));
      for (let i = nums.length - 4; i >= 0; i--) {
        const seq = nums.slice(i, i + 4);
        if (seq.every((n) => Number.isFinite(n) && n >= 0 && n <= 999)) {
          [r34_ne, r34_se, r34_sw, r34_nw] = seq;
          // RMW and ROCI as next values if present
          rmw = Number.isFinite(nums[i + 4]) ? nums[i + 4] : undefined;
          roci = Number.isFinite(nums[i + 5]) ? nums[i + 5] : undefined;
          break;
        }
      }
      // Wind/pressure heuristics (optional): prefer two-digit/three-digit near middle
      // Leave undefined if ambiguous
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      (lat === 0 && lon === 0)
    )
      continue;
    const p = {
      lat,
      lon,
      wind_speed: Number.isFinite(wind) ? wind : undefined,
      mslp: Number.isFinite(mslp) ? mslp : undefined,
      // store meters for radii
      r34_ne: Number.isFinite(r34_ne) ? r34_ne * nmToM : undefined,
      r34_se: Number.isFinite(r34_se) ? r34_se * nmToM : undefined,
      r34_sw: Number.isFinite(r34_sw) ? r34_sw * nmToM : undefined,
      r34_nw: Number.isFinite(r34_nw) ? r34_nw * nmToM : undefined,
      rmw: Number.isFinite(rmw) ? rmw * nmToM : undefined,
      roci: Number.isFinite(roci) ? roci * nmToM : undefined,
      // compatibility aliases used elsewhere
      radius_of_34_kt_winds_ne_m: Number.isFinite(r34_ne)
        ? r34_ne * nmToM
        : undefined,
      radius_of_34_kt_winds_se_m: Number.isFinite(r34_se)
        ? r34_se * nmToM
        : undefined,
      radius_of_34_kt_winds_sw_m: Number.isFinite(r34_sw)
        ? r34_sw * nmToM
        : undefined,
      radius_of_34_kt_winds_nw_m: Number.isFinite(r34_nw)
        ? r34_nw * nmToM
        : undefined,
      isBestTrack: true,
    };
    if (init) Object.assign(p, deriveUTCFromInitTau(init, 0) || {});
    points.push(p);
  }
  const storms = points.length
    ? [
        {
          id: "BEST",
          model: "BEST",
          init: points[0]?.timestamp ? formatDateTime(points[0].timestamp) : "",
          points,
        },
      ]
    : [];
  console.info(`[Bdeck Parser] Parsed ${storms.length} best track(s)`);
  return { storms, isBdeck: true, count: storms.length };
}

// Debug helper: inspect how a single A-deck line is parsed to lat/lon
if (typeof window !== 'undefined') {
  window.debugParseAdeckLine = function debugParseAdeckLine(line) {
    if (!line || typeof line !== 'string') {
      console.warn('[debugParseAdeckLine] Provide a raw A-deck line string');
      return null;
    }
    const parts = line.split(',').map(s => s.trim());
    // Reuse the same detection logic as parseAdeckFile for headerless lines
    const columnMap = (function () {
      try {
        return (function detectColumnsInline(l) {
          const p = l.split(',').map(s => s.trim());
          const base = getDefaultColumnMap();
          const latIdx = p.findIndex(v => /^\d{2,4}[NS]$/i.test(v));
          const lonIdx = p.findIndex(v => /^\d{3,5}[EW]$/i.test(v));
          return {
            ...base,
            ...(latIdx !== -1 ? { lat: latIdx } : {}),
            ...(lonIdx !== -1 ? { lon: lonIdx } : {}),
          };
        })(line);
      } catch (e) {
        console.warn('[debugParseAdeckLine] Fallback to default column map due to error:', e);
        return getDefaultColumnMap();
      }
    })();

    const rec = extractValuesFromLine(parts, columnMap);
    console.log('[debugParseAdeckLine] raw parts:', parts);
    console.log('[debugParseAdeckLine] columnMap:', columnMap);
    console.log('[debugParseAdeckLine] parsed record:', rec);
    return rec;
  };
}
