# Developer Guide

## 1. Introduction

Cyclone Viewer is an ES Modules + Leaflet.js application that runs in a browser or Electron. It loads CSV, A-deck, and B-deck files, visualizes tracks and structures, and supports editing and export.

Stack: JavaScript (ES modules), Leaflet (CDN), Electron, PapaParse (CDN), shpjs (CDN), html2canvas (CDN).

## 2. Development Environment Setup

Prerequisites: Node.js 18+ and npm 9+ (recommended).

Setup:
- Clone repo, then `npm install`.
- Browser mode (legacy): `npm run serve` → open http://localhost:5173
- Electron workflows:
	- Development: `npm run dev` (Vite) + in another terminal `npm run dev:electron`
	- Production-style: `npm run build` then `npm start`
- Debug mode (attach): `npm run debug` or `npm run debug:brk`

VS Code:
- Use `.vscode/launch.json` for “Launch Chrome (Browser)” and “Launch Electron”.
- Recommended extensions in `.vscode/extensions.json` (ESLint, Prettier, Chrome Debugger).

## 3. Debugging Guide

Browser:
- F5 → Launch Chrome (Browser). Set breakpoints anywhere in `src/*.js`.
- Source maps enabled; DevTools opens with VS Code debugging.

Electron:
- F5 → Launch Electron for main process debugging.
- Renderer debugging with Chrome DevTools (Ctrl/Cmd+Shift+I) in the Electron window.
- Alternative: run `npm run debug` then attach to port 5858.

Scenarios:
- Data flow: file upload → parser → normalization → render → Leaflet layers.
- ADECK parsing: inspect `src/adeck/parser.js`, `src/adeck/dialog-manager.js#displayTracksByInitTime`, and `src/adeck/renderer.js`.
- Map state: check layer groups and visibility toggles via `src/adeck/model-manager.js` and `src/adeck/renderer.js`.

## 4. Project Architecture

Entry & Shell:
- `index.html`: entry document, loads libraries and app scripts
- `styles.css`: global styles
- `src/main.js`: renderer/browser entry (ES modules) for the UI and map.
- `electron-main.js`: Electron main process (CommonJS); loads Vite in development and `dist/index.html` in production.

Core Modules:
- `src/core/state-manager.js`: app state (data, units, selection)
- `src/core/map-manager.js`: Leaflet map setup/basemaps; legend refresh
- `src/core/view-manager.js`: view mode orchestration (overview/detailed), zoom transitions, indicator

Visualization:
- `src/visualization/track-renderer.js`: markers, track lines, date labels
- `src/visualization/storm-attributes.js`: RMW/ROCI/quadrants rendering
- `src/visualization/isochrones.js`: isochrone overlays

Interaction:
- `src/interaction/keyboard-handler.js`: global key bindings
- `src/interaction/selection-handler.js`: point selection, pan-to-marker, notifications

ADECK Engine:
- `src/adeck/parser.js`: A/B-deck parsing with header synonyms, hemispheric coords, UTC derivation, meters conversion
- `src/adeck/renderer.js`: group-based rendering, clearAdeckLayers
- `src/adeck/dialog-manager.js`: storm list and init-time filtering
- `src/adeck/model-manager.js`: model colors, hiddenTracks persistence, layer visibility
- `src/adeck-reader.js`: compatibility shim exposing ADECK APIs and live hiddenTracks getter

UI:
- `src/ui/start-screen.js`: start overlay, handlers to load CSV/A-/B-deck and apply visibility
- `src/ui/visualization-panel.js`: visualization toggle panel UI component and event handlers

Notes:
- Legacy `src/app.js` has been retired; avoid reintroducing it to prevent duplication.

## Debugging Initialization Failures

### Symptom: Blank Screen / No Map

Root Cause Analysis:

1. Check main.js Parsing
	- Open browser console before page loads
	- Look for syntax errors in main.js
	- Common issue: Mixed ES module and CommonJS code
	- Verify `src/main.js` ends after the browser code (no Electron/require blocks)
	- Any appended CommonJS should be removed or moved to an Electron entry file

2. Check Module Loading
	- Console should show: "[Main] DOMContentLoaded fired"
	- If missing: main.js failed to load or parse
	- Check Network tab: main.js should return 200 status
	- Check for CORS errors (must use http-server, not file://)

3. Check Initialization Sequence
	- Expected console log sequence:
	  [Main] DOMContentLoaded fired →
	  [Main] Skip start screen: false (or true) →
	  [Main] Showing start screen (or Initializing app directly) →
	  [Main] Initializing application... →
	  [Main] State initialized →
	  [Map Manager] Initializing map... →
	  [Map Manager] Creating Leaflet map instance →
	  [Map Manager] Map instance created, storing in state →
	  [Map Manager] Changing to basemap: satellite →
	  [Map Manager] Basemap changed successfully to: satellite →
	  [Map Manager] Map initialization complete →
	  [Main] Map initialized →
	  [Main] App initialized successfully
	- If sequence breaks, note where it stops

4. Check Leaflet Library
	- Console: `typeof L` should return "object"
	- If "undefined": Leaflet script failed to load
	- Check index.html for Leaflet script tag
	- Check Network tab: Leaflet should load from CDN

5. Check DOM Elements
	- Console: `document.getElementById('map')` should return element
	- If null: HTML structure issue
	- Check index.html for #map div

### Symptom: Start Screen Stuck

Root Cause:
- `window.initializeApp` is undefined (main.js failed to load or parse)

Debug Steps:
1. Open console
2. Type: `typeof window.initializeApp`
3. Should return "function"
4. If "undefined": main.js parsing failed
5. Check for syntax errors in main.js

### Symptom: No Basemap Tiles

Root Cause Analysis:

1. Check Tile Requests
	- Open Network tab
	- Filter by "tile" or "png"
	- Should see tile requests to tile servers (200 status)

2. Check Basemap Configuration
	- Console: `window.map` should be defined
	- Console: `window.map.getZoom()` should return a number (default 4)
	- Console: `window.map.getCenter()` should return LatLng

3. Check Tile Layer
	- Console: `window.map._layers` should contain the tile layer
	- Look for object with `_url` property
	- URL should match basemap tile server

4. Common Issues
	- CORS errors: Tile server blocking requests
	- Network firewall: Blocking tile servers
	- Invalid tile URL: Check `basemaps` in `map-manager.js`
	- Zoom level out of range: Some basemaps have maxZoom limits

### Symptom: Tracks Not Rendering

Debug Steps:

1. Check Data Loading
	- Console should show: "[Adeck Parser] Read N line(s)" or CSV parsing logs
	- If missing: File not loaded or parser not called

2. Check Data Array
	- Console: `window.map` should exist
	- For CSV: Confirm state-manager has data
	- For A-deck: Check `window.trackLayers` object has track IDs

3. Check Rendering
	- Console: if a callback is used, log payload of `{ layers, layerIds, layerCount }`
	- If counts are zero: Data parsing failed or invalid

4. Check Map Bounds
	- Tracks may be outside current view
	- Console: `window.map.getBounds()` shows current view
	- Try: `window.map.setView([20, -60], 4)` to reset

### Common File Corruption Issues

main.js Corruption:
- Symptom: "Cannot use import statement outside a module"
- Cause: CommonJS code in ES module file
- Fix: Remove appended Electron code from `src/main.js`
- Prevention: Keep Electron main process code in a separate file

styles.css Corruption:
- Symptom: Styles not applying, layout broken
- Cause: Syntax errors in CSS
- Fix: Validate CSS with linter, check console

### Debugging Tools

Browser Console Commands:
```
// Check if app initialized
typeof window.initializeApp
typeof window.map

// Check Leaflet
typeof L
L.version

// Check map state
window.map?.getZoom()
window.map?.getCenter()
window.map?.getBounds()

// A-deck layers
Object.keys(window.trackLayers || {})
```

Network Tab Filters:
- Filter by "tile" to see basemap requests
- Filter by data file names to see loads

Console Log Filtering:
- Filter by "[Main]" to see app initialization
- Filter by "[Map Manager]" to see map setup
- Filter by "[Adeck" to see A-deck operations
- Filter by "error" to see all errors

## 5. Key Components and Functions

- Map initialization & basemaps: `src/core/map-manager.js`
- CSV ingestion path: `src/main.js#parseCSV/processData/loadCSVFile`
- Track rendering & storm structures: `src/visualization/track-renderer.js`, `src/visualization/storm-attributes.js`
- Isochrones: `src/visualization/isochrones.js`
- Selection system: `src/interaction/selection-handler.js`
- Keyboard navigation: `src/interaction/keyboard-handler.js` (Arrow/Home/End/M, clear, etc.)
- Visualization Toggle Panel: `src/ui/visualization-panel.js`
	- `initializeVisualizationPanel()`: Main initialization function, creates panel DOM, sets up event listeners, loads saved state from localStorage
	- `createVisualizationPanel()`: Builds panel HTML structure with header, body, and toggle switches for Storm Structures, Isochrones, Track Line, Date/Time Labels
	- `togglePanelVisibility()`: Shows/hides panel with slide animation, updates collapse button icon, persists state to localStorage
	- `updatePanelState()`: Syncs checkbox states with current visualization states from state-manager, called after programmatic state changes
	- Event handlers for each toggle: call corresponding visualization functions (toggleStormStructures, isochronesToggle, toggleTrackLine, toggleDateLabels)
- ADECK engine: `src/adeck/parser.js`, `src/adeck/renderer.js`, `src/adeck/dialog-manager.js`, `src/adeck/model-manager.js`

View Manager: `src/core/view-manager.js`
- `initializeViewManager()`: Initialize view system, create/update indicator badge, restore saved mode and bounds
- `enterDetailedMode(pointIndex, options)`: Save current bounds, set view to detailed, fly to point at detailed zoom, render storm structures and (optionally) isochrones, refresh labels, update indicator
- `enterOverviewMode(options)`: Clear storm visualizations and isochrones, fly to saved bounds or fit markers, refresh labels, update indicator
- `toggleViewMode()`: Convenience toggle using current mode and selected point
- Helpers: `getViewMode()`, `isDetailedMode()`, `isOverviewMode()`, `updateViewModeIndicator(mode)`

## 6. Data Flow

Upload → parse (PapaParse/AdeckReader/shpjs) → normalize → update state → render Leaflet layers.

Editing: select point → show dialog → apply changes → update arrays → redraw shapes.

Model toggles: click toggle → update hidden map → store in localStorage → sync UI and layers.

View Mode Transition Flow:
- Select point (click or keyboard) → `selection-handler.selectPoint()` → `view-manager.enterDetailedMode(index)`
- View manager saves bounds (if coming from overview) → sets mode → flyTo(point, detailedZoom) → show storm attributes (+ isochrones if enabled and in edit mode) → update labels → update indicator
- Deselect (Escape/c/Clear) → `selection-handler.deselectAll()` → `view-manager.enterOverviewMode()` → clear visualizations → flyToBounds(saved) or fit markers → update labels → update indicator

## 7. State Management

Central state via `src/core/state-manager.js`: data array, unit system, current selection, edit mode.

ADECK visibility: `src/adeck/model-manager.js` persists `hiddenTracks` to localStorage; exposed as a live getter via `src/adeck-reader.js`.

Visualization preferences (state-manager.js):
- visualizationPanelVisible, trackLineVisible, dateLabelsVisible
- Getters/setters with localStorage keys: 'vizPanelVisible', 'trackLineVisible', 'dateLabelsVisible'
- Loaded on initializeState(); mirrored to `window.visualizationPanelVisible`

View mode state (state-manager.js):
- `viewMode`: 'overview' | 'detailed' (persisted as 'viewMode')
- `overviewBounds`: { north, south, east, west } (persisted as 'overviewBounds')
- `detailedZoomLevel` (default 10) and `overviewZoomLevel` (default 5); loaded from localStorage if present

## 8. Adding New Features

Example: New visualization element
1) Add UI toggle in `index.html`
2) Implement renderer in `src/visualization/*.js`
3) Wire events/state in `src/main.js` and/or `src/core/state-manager.js`
4) Test in browser

Example: New keyboard shortcut
1) Extend `keyMap` and handlers in `src/interaction/keyboard-handler.js`
2) Use exported helpers (e.g., `selectPoint`) rather than touching map directly
3) Document in `docs/USER_GUIDE.md`. Optional: add/update help in the in-app Shortcuts modal (`index.html`). Toggle with `?`.

Example: Add a New Visualization Toggle
1) Add state property in `src/core/state-manager.js` with localStorage persistence
2) Create a toggle function in the relevant visualization module (e.g., `toggleMyVisualization(force)`) that manipulates map layers and updates state
3) Add a checkbox to the visualization panel (`src/ui/visualization-panel.js`) and wire its event to your toggle function
4) Ensure `updatePanelState()` maintains checkbox synchronicity
5) Update docs in README and USER_GUIDE

Example: New file format
1) Add input in HTML (or route via start screen)
2) Write parser utility and normalize fields
3) Reuse renderers

## 9. Testing

Manual: use `data/` samples (e.g., A/B-deck files) and custom CSVs. Verify loading, editing, export, model toggles, keyboard shortcuts.

Regression: re-check key flows after changes. Consider automated tests (unit/integration/E2E) in future.

## 10. Style & Conventions

ES6+, const/let, arrow functions, template strings. camelCase for functions/vars, UPPER_CASE for constants. Prefer JSDoc comments. Format with Prettier, lint with ESLint.

## 11. Refactoring Notes

The app has been modularized. Avoid reintroducing the legacy monolith `src/app.js`.

Guidelines: keep modules cohesive; prefer state mutations via `state-manager`; renderer modules should add layers to groups only; model visibility must not add/remove layers from the map directly (use style/opacity/display toggles).

## 12. Building & Packaging

`npm run package` builds macOS/Linux executables into `release-builds/` (electron-packager). Adjust platforms/arch in scripts as needed.

## 13. Contributing

Fork → feature branch → changes → tests → PR. Use conventional commits. See roadmap in this guide.

## 14. Known Issues & Limitations

Performance with large A-deck files, fragile header detection, incomplete quadrant rendering in some B-deck cases, reliance on globals, label overlap without collision detection, unit ambiguity in CSVs.
View system: zoom levels are fixed by default; rapid toggling during animations may cause minor visual jitter; per-model detailed mode for multi-model A-deck is not implemented.

## 15. Roadmap

Keyboard shortcuts modal (complete), visualization toggle panel (complete), two-view system (overview/detailed), model toggle persistence improvements, Vite bundler integration, automated testing, animations, wind-field visualization, comparisons, collaboration, cloud storage.

## 16. References

- Leaflet: https://leafletjs.com/reference.html
- Electron: https://www.electronjs.org/docs/latest/
- PapaParse: https://www.papaparse.com/docs
- ATCF formats (A/B-deck): NHC documentation
- Intensity scales: Saffir-Simpson, Australian BoM

## 17. Vite Integration

### Overview

The project uses Vite as a modern build tool for development and production. Vite provides:
- Hot Module Replacement (HMR)
- Fast cold start via dependency pre-bundling
- Optimized Rollup-based builds
- Source maps and ES module-first workflow

### Architecture

Development Mode:
- Vite dev server on http://localhost:5173
- HMR via WebSocket
- Modules served on-demand

Production Mode:
- Bundled output in `dist/`
- Minification (terser), tree-shaking, code-splitting
- Source maps for debugging

### Configuration

- `vite.config.js` at repo root
	- `base: './'` for Electron and static hosting
	- `publicDir: 'data'` to serve data assets
	- `server.port = 5173`, `strictPort = true`
	- `build.outDir = 'dist'`, `sourcemap = true`
	- `@vitejs/plugin-legacy` for broader browser support (optional)

### CDN Dependencies

Current approach keeps Leaflet, PapaParse, shpjs, and html2canvas as CDN scripts in `index.html`. They are not bundled by Vite initially to minimize migration.

Pros: smaller bundles, faster builds. Cons: requires internet and no tree-shaking for CDN libs. Migration to npm packages is possible later.

### Electron Integration

Two-file architecture:
- `electron-main.js`: Electron main (CommonJS). Loads Vite dev server in development and `dist/index.html` in production.
- `src/main.js`: Renderer/browser entry (ES modules).

Development workflow:
```
npm run dev          # start Vite
npm run dev:electron # start Electron in dev mode
```

Production workflow:
```
npm run build
npm start
```

### Troubleshooting (Vite)

1) Port 5173 in use: stop the other process or change `server.port` in `vite.config.js`.
2) HMR not working: check WebSocket connection in DevTools; try hard refresh.
3) Build fails: verify imports and review `vite.config.js`.
4) Electron blank screen: in dev ensure Vite is running; in prod ensure `dist/` exists.
