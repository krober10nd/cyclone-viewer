// ADECK Compatibility Shim (ES Module)
// Imports refactored modules and exposes backward-compatible API on window.AdeckReader

import * as Parser from './adeck/parser.js';
import * as Renderer from './adeck/renderer.js';
import * as DialogManager from './adeck/dialog-manager.js';
import * as ModelManager from './adeck/model-manager.js';

if (typeof ModelManager.initializeModelManager === 'function') ModelManager.initializeModelManager();

window.AdeckReader = {
    // Parsing
    parseAdeckFile: Parser.parseAdeckFile,
    parseBdeckFile: Parser.parseBdeckFile,
    getDefaultColumnMap: Parser.getDefaultColumnMap,
    parseHeaderRow: Parser.parseHeaderRow,
    extractValuesFromLine: Parser.extractValuesFromLine,
    convertPointFormat: Parser.convertPointFormat,
    formatDateTime: Parser.formatDateTime,
    formatCycloneName: Parser.formatCycloneName,
    formatCycloneId: Parser.formatCycloneId,
    // Rendering
    renderTracks: Renderer.renderTracks,
    renderSingleTrack: Renderer.renderSingleTrack,
    drawPerpendicularLine: Renderer.drawPerpendicularLine,
    // Dialog/UI
    updateStormList: DialogManager.updateStormList,
    createInitTimeSelector: DialogManager.createInitTimeSelector,
    displayTracksByInitTime: DialogManager.displayTracksByInitTime,
    filterModelsByCategory: DialogManager.filterModelsByCategory,
    groupStormsByDateAndModel: DialogManager.groupStormsByDateAndModel,
    addFixViewButton: DialogManager.addFixViewButton,
    highlightModelRow: DialogManager.highlightModelRow,
    // Model management
    getModelColor: ModelManager.getModelColor,
    getModelCategories: ModelManager.getModelCategories,
    formatModelName: ModelManager.formatModelName,
    toggleTrackVisibility: ModelManager.toggleTrackVisibility,
    applyStoredVisibility: ModelManager.applyStoredVisibility,
    setMarkerVisibility: ModelManager.setMarkerVisibility,
};

window.MODEL_COLORS = ModelManager.MODEL_COLORS;
window.getModelColor = ModelManager.getModelColor;

// Expose live getter for hiddenTracks instead of a snapshot
try {
    Object.defineProperty(window.AdeckReader, 'hiddenTracks', {
        get: ModelManager.getHiddenTracks,
        enumerable: true,
    });
} catch (e) { /* no-op */ }

document.addEventListener('DOMContentLoaded', () => {
    try { DialogManager.initializeAdeckDialog(); } catch (e) {}
});

