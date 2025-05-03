/**
 * Cyclone Viewer - Wind Distance Inspector Module
 * Copyright (c) 2025 Keith Roberts
 * 
 * This module allows users to click on the map and find the nearest track point,
 * drawing a line between them and displaying the distance in kilometers.
 */

// Fallback notification function if not defined in app.js
if (typeof showNotification !== 'function') {
    window.showNotification = function(message, type = 'info', duration = 3000) {
        console.log(`[${type}] ${message}`);
        
        // Create notification element
        const notification = document.getElementById('notification') || document.createElement('div');
        notification.id = 'notification';
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.display = 'block';
        
        // Add to document if not already there
        if (!document.getElementById('notification')) {
            document.body.appendChild(notification);
        }
        
        // Auto-hide after duration
        setTimeout(() => {
            notification.style.display = 'none';
        }, duration);
    };
}

// Set up the WindInspector as a module
const WindInspector = {
    // Properties
    active: false,
    inspectMarker: null,
    nearestMarker: null,
    distanceLine: null,
    distanceLabel: null,
    map: null,
    
    // Initialize the module
    initialize: function(mapInstance) {
        // Check if we received a valid map instance
        if (!mapInstance || typeof mapInstance.on !== 'function') {
            console.error('WindInspector.initialize: Invalid map instance provided. Map must be a Leaflet map object.');
            return false;
        }
        
        this.map = mapInstance;
        this.setupEventListeners();
        console.log('Wind Inspector initialized with map');
        return true;
    },
    
    // Toggle inspection mode
    toggleActive: function() {
        // Check if map is available
        if (!this.map) {
            console.error('WindInspector.toggleActive: Map not initialized');
            return false;
        }
        
        this.active = !this.active;
        
        // Update cursor to indicate active state
        if (this.active) {
            document.getElementById('map').style.cursor = 'crosshair';
            showNotification('Inspection mode active. Click on the map to measure distance to nearest track point.', 'info', 3000);
            
            // Update button appearance
            const inspectButton = document.getElementById('toggle-wind-inspector');
            if (inspectButton) {
                inspectButton.classList.add('active');
                inspectButton.title = 'Exit inspection mode';
            }
        } else {
            document.getElementById('map').style.cursor = '';
            // Clear any existing inspection
            this.clearInspection();
            
            // Update button appearance
            const inspectButton = document.getElementById('toggle-wind-inspector');
            if (inspectButton) {
                inspectButton.classList.remove('active');
                inspectButton.title = 'Measure distance to nearest track point';
            }
        }
        
        return this.active;
    },
    
    // Set up event listeners
    setupEventListeners: function() {
        // Check if map is available
        if (!this.map || typeof this.map.on !== 'function') {
            console.error('WindInspector.setupEventListeners: Map not initialized or invalid');
            return;
        }
        
        // Add map click handler when in active mode
        this.map.on('click', (e) => {
            if (this.active) {
                this.inspectLocation(e.latlng);
            }
        });
        
        // Add event listener for the inspect button
        const inspectButton = document.getElementById('toggle-wind-inspector');
        if (inspectButton) {
            console.log('Found inspect button, attaching click handler');
            inspectButton.addEventListener('click', () => {
                console.log('Inspect button clicked');
                this.toggleActive();
            });
        } else {
            console.warn('Inspect button not found in DOM. Add a button with id="toggle-wind-inspector"');
        }
    },
       // Inspect a location to find the nearest track point
       inspectLocation: function(latlng) {
        // First clear any existing inspection
        this.clearInspection();
        
        // Get all track points (both CSV and A-DECK)
        const trackPoints = this.getAllTrackPoints();
        
        if (trackPoints.length === 0) {
            showNotification('No track points available to inspect', 'warning');
            return;
        }
        
        // Create marker at click location
        this.inspectMarker = L.circleMarker(latlng, {
            color: '#00FFFF',
            fillColor: '#00FFFF',
            fillOpacity: 0.6,
            radius: 6,
            weight: 2
        }).addTo(this.map);
        
        // Find the nearest track point
        const nearest = this.findNearestPoint(latlng, trackPoints);
        
        if (nearest) {
            // Draw a line to the nearest point - changed to thin semi-transparent black
            this.distanceLine = L.polyline([
                [latlng.lat, latlng.lng],
                [nearest.point.lat, nearest.point.lng]
            ], {
                color: '#000000',  // Black line
                weight: 1,         // Thin line
                opacity: 0.5,      // Semi-transparent
                dashArray: '5,5'   // Keep dashed style
            }).addTo(this.map);
            
            // Calculate the midpoint for label positioning
            const midpoint = {
                lat: (latlng.lat + nearest.point.lat) / 2,
                lng: (latlng.lng + nearest.point.lng) / 2
            };
            
            // Create distance label at midpoint
            this.distanceLabel = L.marker(midpoint, {
                icon: L.divIcon({
                    className: 'distance-label',
                    html: `<div class="distance-bubble">${nearest.distance.toFixed(1)} km</div>`,
                    iconSize: [80, 30],
                    iconAnchor: [40, 15]
                })
            }).addTo(this.map);
            
            // Highlight the nearest marker
            if (nearest.marker) {
                this.highlightNearestMarker(nearest.marker);
            }
            
            // Create detailed information panel about the nearest point
            this.showNearestPointInfo(nearest);
        }
    }, 
    // Get all available track points from both CSV and A-DECK sources
    getAllTrackPoints: function() {
        const points = [];
        
        // Add points from regular CSV tracks
        if (window.markers && window.markers.length > 0) {
            window.markers.forEach((marker, index) => {
                const latLng = marker.getLatLng();
                points.push({
                    lat: latLng.lat,
                    lng: latLng.lng,
                    marker: marker,
                    sourceType: 'csv',
                    index: index,
                    data: window.data ? window.data[index] : null
                });
            });
        }
        
        // Add points from A-DECK tracks if available
        if (window.adeckMarkers && window.adeckMarkers.length > 0) {
            window.adeckMarkers.forEach((marker) => {
                if (marker && marker.getLatLng) {
                    const latLng = marker.getLatLng();
                    points.push({
                        lat: latLng.lat,
                        lng: latLng.lng,
                        marker: marker,
                        sourceType: 'adeck',
                        stormId: marker.stormId,
                        model: marker.model,
                        pointIndex: marker.pointIndex
                    });
                }
            });
        }
        
        return points;
    },
    
    // Find the nearest point to the given location
    findNearestPoint: function(latlng, trackPoints) {
        if (trackPoints.length === 0) return null;
        
        let nearestPoint = null;
        let minDistance = Infinity;
        
        trackPoints.forEach(point => {
            const distance = this.calculateDistance(
                latlng.lat, latlng.lng,
                point.lat, point.lng
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = point;
            }
        });
        
        return {
            point: nearestPoint,
            distance: minDistance,
            marker: nearestPoint.marker
        };
    },
    
    // Calculate distance between two points in kilometers using Haversine formula
    calculateDistance: function(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
            
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in km
        
        return distance;
    },
    
    // Convert degrees to radians
    deg2rad: function(deg) {
        return deg * (Math.PI/180);
    },
    
    // Highlight the nearest marker
    highlightNearestMarker: function(marker) {
        // Store reference to the nearest marker
        this.nearestMarker = marker;
        
        // Create a pulsing effect
        if (marker._icon) {
            marker._icon.classList.add('pulse-marker');
        } else if (marker._path) {
            // For SVG elements like CircleMarker
            marker._path.classList.add('pulse-path');
            
            // Store original style to restore later
            marker._originalStyle = {
                stroke: marker.options.stroke,
                weight: marker.options.weight,
                color: marker.options.color
            };
            
            // Update style to highlight
            marker.setStyle({
                stroke: true,
                weight: 3,
                color: '#FFFF00'  // Yellow highlight
            });
        }
        
        // Open a popup with point data if available
        if (marker.openPopup) {
            marker.openPopup();
        }
    },
    
        // Show detailed information about the nearest point
        showNearestPointInfo: function(nearest) {
            const point = nearest.point;
            
            // Create or update the info container
            let infoContainer = document.getElementById('wind-inspector-info');
            if (!infoContainer) {
                infoContainer = document.createElement('div');
                infoContainer.id = 'wind-inspector-info';
                infoContainer.className = 'wind-inspector-info';
                document.body.appendChild(infoContainer);
            }
            
            // Clear previous content
            infoContainer.innerHTML = '';
            
            // Create header
            const header = document.createElement('div');
            header.className = 'inspector-header';
            header.innerHTML = `<h3>Nearest Track Point</h3>`;
            infoContainer.appendChild(header);
            
            // Create close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'close-btn';
            closeBtn.textContent = '×';
            closeBtn.onclick = () => {
                infoContainer.classList.add('hidden');
            };
            header.appendChild(closeBtn);
            
            // Create content
            const content = document.createElement('div');
            content.className = 'inspector-content';
            
            // Extract datetime information first if available
            let dateTimeStr = "Unknown";
            if (point.sourceType === 'csv' && point.data) {
                const pointData = point.data;
                if (pointData.year_utc && pointData.month_utc && pointData.day_utc) {
                    const date = `${pointData.year_utc}-${String(pointData.month_utc).padStart(2, '0')}-${String(pointData.day_utc).padStart(2, '0')}`;
                    const time = pointData.hour_utc !== undefined ? 
                        `${String(pointData.hour_utc).padStart(2, '0')}:${String(pointData.minute_utc || 0).padStart(2, '0')} UTC` : '';
                    dateTimeStr = `${date} ${time}`;
                }
            } else if (point.sourceType === 'adeck' && point.marker && point.marker.options && point.marker.options.point) {
                const pointData = point.marker.options.point;
                if (pointData.year_utc && pointData.month_utc && pointData.day_utc) {
                    const date = `${pointData.year_utc}-${String(pointData.month_utc).padStart(2, '0')}-${String(pointData.day_utc).padStart(2, '0')}`;
                    const time = pointData.hour_utc !== undefined ? 
                        `${String(pointData.hour_utc).padStart(2, '0')}:${String(pointData.minute_utc || 0).padStart(2, '0')} UTC` : '';
                    dateTimeStr = `${date} ${time}`;
                }
            }
            
            // Add distance and datetime information prominently at the top
            content.innerHTML += `
            <div class="info-row datetime-row">
                <strong>Time:</strong> ${dateTimeStr}
            </div>
            <div class="info-row">
                <strong>Distance:</strong> ${nearest.distance.toFixed(1)} km
            </div>
            <div class="info-row">
                <strong>Coordinates:</strong> ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}
            </div>
            `;
            
            // Add additional information based on the source type
            if (point.sourceType === 'csv' && point.data) {
                const pointData = point.data;
                
                // Add any available data from the CSV point
                if (pointData.wind_speed !== undefined) {
                    content.innerHTML += `
                    <div class="info-row">
                        <strong>Wind Speed:</strong> ${formatWindSpeed ? formatWindSpeed(pointData.wind_speed) : pointData.wind_speed + ' m/s'}
                    </div>`;
                }
                
                if (pointData.mslp !== undefined) {
                    content.innerHTML += `
                    <div class="info-row">
                        <strong>Pressure:</strong> ${pointData.mslp} hPa
                    </div>`;
                }
            } else if (point.sourceType === 'adeck') {
                // Show A-DECK specific information
                if (point.model) {
                    content.innerHTML += `
                    <div class="info-row">
                        <strong>Model:</strong> ${point.model}
                    </div>`;
                }
                
                // Try to get more information from the marker
                if (point.marker && point.marker.options) {
                    const markerOptions = point.marker.options;
                    
                    if (markerOptions.point) {
                        const pointData = markerOptions.point;
                        
                        // Add wind and pressure
                        if (pointData.wind_speed !== undefined) {
                            content.innerHTML += `
                            <div class="info-row">
                                <strong>Wind Speed:</strong> ${formatWindSpeed ? formatWindSpeed(pointData.wind_speed) : pointData.wind_speed + ' m/s'}
                            </div>`;
                        }
                        
                        if (pointData.mslp !== undefined) {
                            content.innerHTML += `
                            <div class="info-row">
                                <strong>Pressure:</strong> ${pointData.mslp} hPa
                            </div>`;
                        }
                    }
                }
            }
            
            infoContainer.appendChild(content);
            
            // Show the container
            infoContainer.classList.remove('hidden');
            
            // Position the container
            infoContainer.style.position = 'absolute';
            infoContainer.style.bottom = '10px';
            infoContainer.style.right = '10px';
            infoContainer.style.zIndex = '1000';
        },
    // Clear all inspection elements
    clearInspection: function() {
        // Remove inspect marker
        if (this.inspectMarker) {
            this.map.removeLayer(this.inspectMarker);
            this.inspectMarker = null;
        }
        
        // Remove distance line
        if (this.distanceLine) {
            this.map.removeLayer(this.distanceLine);
            this.distanceLine = null;
        }
        
        // Remove distance label
        if (this.distanceLabel) {
            this.map.removeLayer(this.distanceLabel);
            this.distanceLabel = null;
        }
        
        // Restore nearest marker styling
        if (this.nearestMarker) {
            if (this.nearestMarker._icon) {
                this.nearestMarker._icon.classList.remove('pulse-marker');
            } else if (this.nearestMarker._path) {
                this.nearestMarker._path.classList.remove('pulse-path');
                
                // Restore original style if it was saved
                if (this.nearestMarker._originalStyle) {
                    this.nearestMarker.setStyle(this.nearestMarker._originalStyle);
                    delete this.nearestMarker._originalStyle;
                }
            }
            
            this.nearestMarker = null;
        }
        
        // Hide info panel
        const infoContainer = document.getElementById('wind-inspector-info');
        if (infoContainer) {
            infoContainer.classList.add('hidden');
        }
    }
};

// Add CSS styles
function addWindInspectorStyles() {
    const style = document.createElement('style');
    style.textContent = `
    /* Wind Inspector Styles */
    .distance-bubble {
        background-color: rgba(255, 255, 255, 0.9);
        color: black;
        font-weight: bold;
        border: 2px solid black;
        border-radius: 15px;
        padding: 2px 10px;
        text-align: center;
        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
        white-space: nowrap;
    }

    .pulse-marker {
        animation: pulse 1.5s infinite;
    }

    .pulse-path {
        animation: pulse-opacity 1.5s infinite;
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.3);
            opacity: 0.8;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }

    @keyframes pulse-opacity {
        0% {
            opacity: 1;
            stroke-width: 3;
        }
        50% {
            opacity: 0.7;
            stroke-width: 5;
        }
        100% {
            opacity: 1;
            stroke-width: 3;
        }
    }

    .wind-inspector-info {
        background-color: rgba(255, 255, 255, 0.95);
        color: black;
        border-radius: 5px;
        width: 300px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        transition: all 0.3s ease;
        max-height: 80vh;
        overflow-y: auto;
    }

    .wind-inspector-info.hidden {
        transform: translateX(310px);
        opacity: 0;
    }

    .inspector-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #00AAFF;
        padding: 8px 12px;
        border-top-left-radius: 5px;
        border-top-right-radius: 5px;
    }

    .inspector-header h3 {
        margin: 0;
        font-size: 16px;
        color: white;
    }
    
    .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0 5px;
    }

    .inspector-content {
        padding: 10px 15px;
    }

    .info-row {
        margin-bottom: 8px;
        font-size: 14px;
        display: flex;
        flex-wrap: wrap;
    }
    
    .datetime-row {
        font-size: 16px;
        font-weight: bold;
        margin: 10px 0;
        color: #333;
    }

    .info-row strong {
        margin-right: 8px;
        min-width: 80px;
    }

    .btn-inspector {
        background-color: #00BFFF;
        color: white;
        border: 1px solid #0099CC;
    }
    
    .btn-inspector:hover {
        background-color: #0099CC;
    }
    
    .btn-inspector.active {
        background-color: #FF4500;
        border-color: #CC3700;
    }
    
    #wind-inspector-info {
        background-color: rgba(20, 20, 20, 0.9);
        color: white;
        padding: 10px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        max-width: 300px;
        font-family: Arial, sans-serif;
        z-index: 1000;
    }
    `;
    document.head.appendChild(style);
}

// Add inspect button if it doesn't exist in HTML
function addInspectButton() {
    // Check if the button already exists
    if (document.getElementById('toggle-wind-inspector')) {
        console.log('Inspect button already exists in DOM');
        return;
    }
    
    console.log('Adding inspect button to DOM');
    
    // Create the button
    const inspectBtn = document.createElement('button');
    inspectBtn.id = 'toggle-wind-inspector';
    inspectBtn.className = 'btn btn-inspector';
    inspectBtn.textContent = 'Inspect';
    inspectBtn.title = 'Measure distance to nearest track point';
    
    // Find where to add the button - after isochrones button
    const isochronesBtn = document.getElementById('toggle-isochrones');
    if (isochronesBtn && isochronesBtn.parentNode) {
        isochronesBtn.parentNode.insertBefore(inspectBtn, isochronesBtn.nextSibling);
        console.log('Added inspect button after isochrones button');
    } else {
        // Fallback to adding to compact-controls
        const compactControls = document.querySelector('.compact-controls');
        if (compactControls) {
            compactControls.appendChild(inspectBtn);
            console.log('Added inspect button to compact controls');
        } else {
            console.error('Could not find a suitable container for the inspect button');
        }
    }
}

// Initialize and export the module
function initializeWindInspector() {
    // Try to get the map object
    let mapInstance = window.map;
    
    // If map is not available, show an error and wait
    if (!mapInstance || typeof mapInstance.on !== 'function') {
        console.warn('Map not available yet, WindInspector initialization delayed');
        // Return a promise that resolves when the map is ready
        return new Promise((resolve) => {
            // Try again after a short delay
            setTimeout(() => {
                tryInitialize(resolve);
            }, 1000);
        });
    } else {
        // Map is available, initialize now
        return tryInitialize();
    }
}

// Helper function to attempt initialization
function tryInitialize(resolveCallback) {
    const mapInstance = window.map;
    
    if (mapInstance && typeof mapInstance.on === 'function') {
        // Initialize the module with the map
        const success = WindInspector.initialize(mapInstance);
        
        if (success) {
            // Add styles 
            addWindInspectorStyles();
            
            // Add button if it doesn't exist in HTML
            addInspectButton();
            
            // Make WindInspector globally available
            window.WindInspector = WindInspector;
            
            console.log('Wind Inspector successfully initialized');
            
            // Resolve the promise if callback provided
            if (resolveCallback) resolveCallback(WindInspector);
            return WindInspector;
        } else {
            console.error('Failed to initialize WindInspector');
            if (resolveCallback) resolveCallback(null);
            return null;
        }
    } else {
        console.error('Map still not available, WindInspector initialization failed');
        if (resolveCallback) resolveCallback(null);
        return null;
    }
}

// Wait for DOM content loaded before attempting initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, waiting for map to initialize before setting up Wind Inspector');
    
    // Wait for the map to be initialized in app.js
    // We'll check periodically until the map is available
    const checkMapInterval = setInterval(() => {
        if (window.map && typeof window.map.on === 'function') {
            clearInterval(checkMapInterval);
            console.log('Map detected, initializing Wind Inspector');
            initializeWindInspector();
        }
    }, 500); // Check every 500ms
    
    // Stop checking after 10 seconds to prevent infinite checking
    setTimeout(() => {
        clearInterval(checkMapInterval);
        console.warn('Timed out waiting for map initialization');
    }, 10000);
});

// Export the WindInspector for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WindInspector;
}