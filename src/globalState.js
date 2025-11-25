/**
 * Cyclone Viewer
 * Copyright (c) 2025 Keith Roberts
 *
 * NOTE: This global state object is maintained for backward compatibility.
 * New code should prefer the API in core/state-manager.js for accessing and
 * mutating state. The state-manager wraps and mirrors critical values from
 * this object and exposes them to window.* as needed.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const globalState = {
    map: null,
    markers: [],
    data: [],
    editMode: false,
    selectedPoint: null,
    trackLine: null,
    stormCircles: {},
    floatingDialog: null,
    ghostMarkers: {},
    isochroneUpdateTimeout: null,
    lastEscPressTime: 0,
    currentIsochrones: [],
    selectedPointIndex: null,
    shapefilePoints: [],
    shapefileLayerGroup: null,
    shapefileCount: 0,
    currentForecastTau: 0,
    forecastLines: [],
    currentForecastMarkers: [],
    displayedStorms: [],
    isochronesEnabled: true,
    adeckStorms: null,
    adeckStormSelectionDialog: null,
    selectedStormId: null,
    currentModelName: null,
    stormStructuresVisible: true,
    adeckDialogWasShown: false
};