# User Guide

## 1. Introduction & Overview

Cyclone Track Editor/Visualizer helps you load, visualize, edit, and export tropical cyclone tracks. It supports official and model forecast tracks, along with storm structure visualization.

- Visualize storm tracks and intensity
- Edit positions and parameters (wind, pressure, RMW, R34 radii, ROCI)
- Load A-deck/B-deck forecast files and CSV tracks
- Export edits back to CSV or A/B-deck-compatible formats
- Run in a browser or as a desktop app (Electron)

Target audience: meteorologists, researchers, forecasters, and students.

---

## 2. Getting Started

You can run the app in two ways:

- Electron desktop: `npm start` (opens a native window)
- Browser: `npm run serve` then open http://localhost:5173

Interface highlights:
- Header controls: file loaders (CSV, A/B-Deck, Vector), unit/scale controls, export
- Map area: Leaflet-based map with basemap selector and controls
- Edit panel and floating dialogs for parameter adjustments and model selection

---

## 3. Loading Track Data

### CSV Tracks
- Click the CSV button (“Load Custom Track”).
- File format columns: timestamp, latitude, longitude, wind_speed, mslp, rmw, r34_ne, r34_se, r34_sw, r34_nw, roci.
- Units: wind in m/s (display can be switched), distances typically meters or km.
- If your CSV uses long field names, the app maps them via `src/field-mapper.js`.

### A-deck/B-deck Forecast Files
- Click A/B-Deck → choose an A-deck (`.dat/.txt/.adeck`) or B-deck file.
- A-deck fields (comma-separated): basin, storm number, datetime (YYYYMMDDHH), model, forecast hour (TAU), lat, lon, intensity fields.
- B-deck contains best-track info and sometimes wind radii.
- After loading, a storm/model dialog appears to select initialization and models.

### Vector Data (Shapefiles/GeoJSON/KML)
- Click Vector(s) → select .shp/.dbf/.prj/.zip or .geojson/.json/.kml.
- Useful for reference overlays (coastlines, admin boundaries, etc.).

---

## 4. Navigating and Inspecting Tracks

- Pan: click-drag; Zoom: mouse wheel or map controls.
- Basemaps: OpenStreetMap, Carto Voyager, OpenTopoMap, Satellite, Terrain (selector on map).
- Track lines and markers are colored by model and intensity.
- Click markers to open detailed popups (datetime, position, wind, pressure, category).
- Intensity scale: choose Saffir-Simpson (default) or Australian BoM.
- Units: toggle metric/imperial.

---

## 5. Working with Forecast Data (A-deck/B-deck)

- Storm Selection Dialog: pick the target storm/model set after loading an A-deck file.
- Initialization Time Selector: choose among multiple forecast runs.
- Model Filtering: filter by category (Official, Global, Hurricane, Navy, Statistical, Consensus, Trajectory, Other) and toggle individual models.
- Colors: models use a consistent palette (`MODEL_COLORS` in `src/adeck-reader.js`). Ensembles receive variations.
- Forecast Navigation: `+`/`=` next init, `-` previous init.
- Visibility Persistence: model toggles are retained via localStorage.

---

## 6. Visualizing Storm Structure

- Toggle storm structure (RMW, R34, ROCI) via hotkey `s`/`S`.
- RMW: inner circle (radius of maximum winds).
- R34: 34-kt wind radii (quadrant-aware where applicable).
- ROCI: outermost closed isobar.
- Isochrones: time-distance contours from translation speed; toggled via the isochrones control or shown on selection.
- Zoom-aware visibility prevents clutter (labels and some layers only show at certain zooms).

---

## 7. Controlling Visualizations with the Toggle Panel

The Cyclone Track Editor includes a visualization control panel on the right side of the map that provides centralized management of all visual elements.

Accessing the Panel:
- Keyboard Shortcut: Press V or v to show/hide the panel
- Mouse: Click the panel header to collapse/expand
- Initial State: Panel starts collapsed to maximize map viewing area
- Persistence: Panel state (collapsed/expanded) is saved and restored on next session

Panel Location and Appearance:
- Fixed to the right edge of the map
- Semi-transparent background to allow viewing map features behind it
- Smooth slide animation when collapsing/expanding
- Collapse button (◀/▶) in header indicates current state
- Scrollable if content exceeds screen height

Available Visualization Toggles:

1. Storm Structures Toggle
	- Controls: RMW (Radius of Maximum Winds), R34 radii (34-knot wind radii), ROCI (Radius of Outermost Closed Isobar)
	- Effect: Shows/hides all storm attribute circles and polygons
	- Equivalent to: Pressing S keyboard shortcut
	- Use case: Toggle off to reduce visual clutter when focusing on track position only
	- Note: This is a grouped toggle - all three attributes (RMW, R34, ROCI) are controlled together

2. Isochrones Toggle
	- Controls: Time-distance contours showing storm translation speed
	- Effect: Shows/hides isochrone fan (+1h through +6h) for selected point
	- Requires: A point must be selected for isochrones to display
	- Use case: Analyze storm forward speed and projected path

3. Track Line Toggle
	- Controls: Polyline connecting all track positions
	- Effect: Shows/hides the continuous line through all storm positions
	- Use case: Toggle off to focus on individual positions without connecting line

4. Date/Time Labels Toggle
	- Controls: Timestamp labels displayed near track markers
	- Effect: Shows/hides date/time tooltips on markers
	- Zoom dependency: Labels only appear at zoom levels 8-14 (even when enabled)
	- Use case: Toggle off to reduce label clutter at high zoom levels

Using the Toggles:
1. Immediate Effect: All toggles apply changes instantly to the map
2. Persistent Preferences: Toggle states are saved to browser localStorage
3. Keyboard Navigation: Panel is keyboard accessible (V to open, Tab to move, Space/Enter to toggle, Escape to close)
4. Visual Feedback: Toggle switches provide clear on/off indication

Interaction with Other Features:
- Edit Mode: Toggles work in both view and edit modes
- Keyboard Shortcuts: S toggles Storm Structures; V toggles the panel; navigation keys work regardless of panel state
- A-deck Forecasts: Toggles apply to A-deck tracks as well
- Zoom Level: Some visualizations are zoom-dependent (labels at zoom 8-14)

Troubleshooting:

## 8. Understanding View Modes

The Cyclone Track Editor features an intelligent two-view system that adapts the map to your workflow:

Overview Mode (Default)
- Purpose: bird's-eye view of the entire track
- Zoom: automatically fits all points (~5–6)
- Visibility: track line and markers only; storm structures and isochrones hidden to reduce clutter
- Labels: date/time labels are smaller and less prominent

Detailed Mode (On Selection)
- Purpose: focused analysis of an individual position
- Zoom: smoothly zooms to the selected point (~10)
- Visibility: storm structures (RMW, R34, ROCI) shown; isochrones shown if enabled and in edit mode
- Labels: rendered larger for readability

Automatic Transitions
- Enter Detailed: click a marker or use navigation keys (→, ←, Home, End, M)
- Return to Overview: press Escape or c to deselect, or click "Clear Selections"
- Bounds Restoration: overview returns to the last saved camera bounds

View Mode Indicator
- A small badge in the top-right shows the current mode (🗺️ Overview or 🔍 Detailed)
- Updates automatically and fades in on changes; does not block map interactions

Persistence
- The current view mode and last overview bounds are saved to localStorage and restored on reload

## 9. Editing Track Data


- Enable Edit Mode from the header.
- Select a point (marker) to open edit controls.
- Drag to reposition; ghost markers can indicate original positions.
- Adjust parameters (wind, pressure, RMW, R34, ROCI) using sliders/inputs in the floating dialog.
- Click “Apply Changes” to update the map and dataset.

---

## 10. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Escape / c | Clear all selections |
| Escape×2 | Quick reset |
| → / ← | Navigate forward/backward through positions (CSV tracks) |
| Home / End | Jump to first/last position (CSV tracks) |
| M / m | Jump to maximum intensity point (CSV tracks) |
| + / = | Next forecast initialization (A-deck) |
| - | Previous forecast initialization (A-deck) |
| s / S | Toggle storm structures (RMW/R34/ROCI) |

Tip: Press `?` anytime to open the in-app Keyboard Shortcuts reference.

### Track Navigation (CSV Tracks)

These shortcuts enable efficient navigation through loaded cyclone track positions:

- Arrow Right (→): Navigate to the next storm position in the track
	- Wraps around: pressing Right at the last position jumps to the first position
	- If no position is selected, selects the first position
	- Automatically displays storm attributes and isochrones (if in edit mode)
	- Works with CSV tracks loaded via the "CSV" button

- Arrow Left (←): Navigate to the previous storm position in the track
	- Wraps around: pressing Left at the first position jumps to the last position
	- If no position is selected, selects the last position
	- Useful for reviewing track history in reverse chronological order

- Home: Jump directly to the first position in the track
	- Equivalent to the earliest timestamp in the data
	- Useful for quickly returning to track origin
	- Shows notification confirming jump

- End: Jump directly to the last position in the track
	- Equivalent to the most recent timestamp in the data
	- Useful for viewing current/final storm state
	- Shows notification confirming jump

- M or m: Jump to the point of maximum intensity
	- Finds the position with the highest wind speed in the track
	- Displays notification showing the maximum wind speed value
	- If multiple points have the same maximum wind speed, selects the first occurrence
	- If no wind speed data is available, shows "No wind speed data available" notification
	- Particularly useful for analyzing peak storm intensity and associated parameters (pressure, size, location)

Usage Tips:
- Navigation shortcuts work best with CSV tracks representing a single storm's lifecycle
- Use arrow keys for step-by-step analysis of storm evolution
- Use M key to quickly identify peak intensity for comparison with forecast models
- Combine with edit mode to modify parameters at specific positions
- Navigation automatically updates all visualizations (RMW, R34, ROCI, isochrones)

Limitations:
- Navigation shortcuts primarily work with CSV tracks stored in the main data array
- For A-deck multi-model forecasts, use the model selection UI and initialization time selector instead
- If no track data is loaded, navigation shortcuts will show a notification

---

## 11. Exporting Data

- Use Export to save edited tracks to CSV with compatible columns for re-import.
- A-deck export: create A/B-deck-friendly formats when enabled.
- Suggested naming: include basin, storm number, year, model, init time.

---

## 12. Advanced Features

- Shapefile point display with informative popups.
- Fullscreen mode with dialog repositioning.
- Auto-scaling date/time labels (zoom-dependent thresholds).
- View multiple tracks/models simultaneously.
- “Clear Selections” button quickly resets view state.

---

## 13. Troubleshooting & Tips

- Use `npm run serve` instead of dragging HTML files to avoid CORS.
- Large A-deck files can be slow—hide unneeded models.
- If elements don’t show, check zoom level and visibility toggles.
- Ensure “Apply Changes” was clicked when edits appear missing.
- Prefer Chrome/Edge/Firefox for best compatibility.

---

## 14. Data Format Specifications

### CSV
- Required: timestamp, latitude, longitude
- Optional: wind_speed, mslp, rmw, r34_ne/se/sw/nw, roci
- Supported units documented above; conversions handled in UI

### A-deck
- Fields: basin, cyclone number, datetime (YYYYMMDDHH), model, TAU, lat/lon with N/S/E/W suffixes, intensity fields
- See sample `data/*.dat.txt`

### B-deck
- Best-track data with possible wind radii

---

## 15. References to Source

- Map initialization and basemap switching: `src/core/map-manager.js`
- CSV parsing and data ingestion: `src/main.js` (parseCSV/processData/loadCSVFile)
- Marker/line rendering and storm structure: `src/visualization/track-renderer.js`, `src/visualization/storm-attributes.js`
- Isochrones helpers and math: `src/visualization/isochrones.js`
- Selection/editing, dialogs, drags: `src/interaction/selection-handler.js`
- Keyboard shortcuts: `src/interaction/keyboard-handler.js`
- A-deck parsing/rendering: `src/adeck/parser.js`, `src/adeck/renderer.js`, `src/adeck/dialog-manager.js`

For developer details, see the Developer Guide.
