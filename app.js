// Use global shp object loaded from CDN instead of import
// The shpjs library is already included via <script src="https://unpkg.com/shpjs@latest/dist/shp.js"></script>

// Global variables
let map;
let markers = [];
let data = [];
let editMode = false;
let selectedPoint = null;
let trackLine = null;
let stormCircles = {}; // Store visualizations for RMW, R34, ROCI
let floatingDialog = null;
let ghostMarkers = {}; // Store ghost markers for original positions
let isochroneUpdateTimeout = null; // Timeout for updating isochrones

// Add these variables to your global scope
let currentIsochrones = [];
let selectedPointIndex = null;

// Add global variables for shapefile handling
let shapefilePoints = [];
let shapefileLayerGroup = null;
let shapefileCount = 0;

// Function to display isochrones (+1h, +2h, +3h) when a point is clicked
function showIsochrones(pointIndex) {
    // Clear any existing isochrones
    clearIsochrones();
    
    console.log(`Showing isochrones for point ${pointIndex}`);
    
    // Store selected point index
    selectedPointIndex = pointIndex;
    
    // Get current position
    const currentPoint = data[pointIndex];
    
    // Calculate trajectory (direction)
    let trajectory = 0; // Default direction (north)
    
    // If not the last point, calculate direction to next point
    if (pointIndex < data.length - 1) {
        const nextPoint = data[pointIndex + 1];
        trajectory = calculateBearing(
            currentPoint.latitude, 
            currentPoint.longitude, 
            nextPoint.latitude, 
            nextPoint.longitude
        );
    } 
    // If not the first point, calculate direction from previous point
    else if (pointIndex > 0) {
        const prevPoint = data[pointIndex - 1];
        trajectory = calculateBearing(
            prevPoint.latitude, 
            prevPoint.longitude, 
            currentPoint.latitude, 
            currentPoint.longitude
        );
    }
    
    // Get cyclone speed in km/hour
    const speedKmPerHour = estimateSpeed(pointIndex);
    console.log(`Calculated trajectory: ${trajectory.toFixed(1)}° with speed ${speedKmPerHour.toFixed(2)} km/h`);
    
    // Define colors for each hour isochrone - using more distinguishable colors
    const isochroneColors = [
        'rgba(100, 220, 255, 0.8)',  // +1h - Light blue
        'rgba(255, 200, 0, 0.8)',    // +2h - Orange/gold
        'rgba(255, 50, 50, 0.8)'     // +3h - Red
    ];
    
    // For debugging, show where the next point would be if the data follows the expected pattern
    if (pointIndex < data.length - 1) {
        const nextPoint = data[pointIndex + 1];
        const distanceToNext = calculateDistanceKm(
            currentPoint.latitude, currentPoint.longitude,
            nextPoint.latitude, nextPoint.longitude
        );
        console.log(`Distance to next point: ${distanceToNext.toFixed(2)} km`);
        console.log(`Next point should be approximately at +${(distanceToNext/speedKmPerHour).toFixed(1)} hours`);
    }
    
    // Draw isochrones for +1h, +2h, +3h with more spacing between them
    [1, 2, 3].forEach((hours, index) => {
        const isochronePoints = [];
        
        // Create a fan of points at ±90 degrees from trajectory
        for (let angle = trajectory - 90; angle <= trajectory + 90; angle += 15) {
            // Calculate distance in km for this hour
            const distanceKm = speedKmPerHour * hours;
            
            // Calculate destination point
            const point = calculateDestinationFromKm(
                currentPoint.latitude,
                currentPoint.longitude,
                distanceKm,
                angle
            );
            isochronePoints.push(point);
        }
        
        // Create a polyline for this isochrone with different color and width
        const polyline = L.polyline(isochronePoints, {
            color: isochroneColors[index],
            weight: 1.5 + (hours * 0.5), // Thicker lines for later hours
            dashArray: '5, 5',
            opacity: 0.9,
            smoothFactor: 2,
            className: 'isochrone-line'
        }).addTo(map);
        
        // Add a label showing the hour - positioned at a point just above the midpoint
        const midPointIndex = Math.floor(isochronePoints.length / 2);
        const midPoint = isochronePoints[midPointIndex];
        
        // Calculate a position for the label that's slightly offset from the line
        const labelAngle = trajectory; // Use the trajectory angle for offset
        const labelOffsetKm = 5; // Small offset in km
        const labelPoint = calculateDestinationFromKm(
            midPoint[0], midPoint[1], 
            labelOffsetKm, 
            (labelAngle + 90) % 360 // Perpendicular to trajectory
        );
        
        const label = L.marker(labelPoint, {
            icon: L.divIcon({
                className: 'isochrone-label',
                html: `+${hours}h`,
                iconSize: [36, 20],
                iconAnchor: [18, 10]
            }),
            interactive: false
        }).addTo(map);
        
        currentIsochrones.push(polyline);
        currentIsochrones.push(label);
    });
}

// Function to clear isochrones
function clearIsochrones() {
    if (currentIsochrones.length > 0) {
        console.log("Clearing isochrones");
        currentIsochrones.forEach(layer => map.removeLayer(layer));
        currentIsochrones = [];
        selectedPointIndex = null;
    }
}

// Helper function to calculate bearing between two points
function calculateBearing(lat1, lon1, lat2, lon2) {
    const rlat1 = lat1 * Math.PI / 180;
    const rlat2 = lat2 * Math.PI / 180;
    const rlon1 = lon1 * Math.PI / 180;
    const rlon2 = lon2 * Math.PI / 180;
    
    const y = Math.sin(rlon2 - rlon1) * Math.cos(rlat2);
    const x = Math.cos(rlat1) * Math.sin(rlat2) -
              Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(rlon2 - rlon1);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    
    return (bearing + 360) % 360; // Normalize to 0-360
}

// New function that calculates destination using km directly
function calculateDestinationFromKm(lat, lon, distanceKm, bearing) {
    // Earth radius in km
    const R = 6371;
    
    // Convert to radians
    const rlat = lat * Math.PI / 180;
    const rlon = lon * Math.PI / 180;
    const rbearing = bearing * Math.PI / 180;
    
    // Calculate angular distance in radians
    const angDist = distanceKm / R;
    
    // Calculate destination point
    const newLat = Math.asin(
        Math.sin(rlat) * Math.cos(angDist) +
        Math.cos(rlat) * Math.sin(angDist) * Math.cos(rbearing)
    );
    
    const newLon = rlon + Math.atan2(
        Math.sin(rbearing) * Math.sin(angDist) * Math.cos(rlat),
        Math.cos(angDist) - Math.sin(rlat) * Math.sin(newLat)
    );
    
    // Convert back to degrees
    return [newLat * 180 / Math.PI, ((newLon * 180 / Math.PI) + 540) % 360 - 180];
}

// Keep the original function for backward compatibility with other code
function calculateDestination(lat, lon, distance, bearing) {
    // This function now delegates to the new km-based function
    // Convert the "distance" (which is in degrees) to approximate km
    // 1 degree is roughly 111.32 km at the equator
    const distanceKm = distance * 111.32;
    return calculateDestinationFromKm(lat, lon, distanceKm, bearing);
}

// Fixed helper function to estimate cyclone speed in km/hour
function estimateSpeed(pointIndex) {
    // Default value if we can't calculate
    let speedKmPerHour = 15; // Typical tropical cyclone speed is 5-15 km/h
    
    // If we have adjacent points, calculate actual speed
    if (pointIndex > 0) {
        const currentPoint = data[pointIndex];
        const prevPoint = data[pointIndex - 1];
        
        // Calculate distance between points
        const lat1 = prevPoint.latitude;
        const lon1 = prevPoint.longitude;
        const lat2 = currentPoint.latitude;
        const lon2 = currentPoint.longitude;
        
        // Haversine formula for distance
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
            
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in km
        
        // Use 3-hour intervals instead of 6-hour 
        const hours = 3; // Changed from 6 to 3 for more accurate calculations
        
        // Calculate speed in km/hour directly
        speedKmPerHour = distance / hours;
        
        // Ensure a minimum speed for visualization purposes
        if (speedKmPerHour < 5) {
            speedKmPerHour = 5;
        }
        
        console.log(`Distance between points: ${distance.toFixed(2)} km, time: ${hours} hours`);
    }
    
    console.log(`Estimated speed: ${speedKmPerHour.toFixed(2)} km/h`);
    return speedKmPerHour;
}

// Helper function to calculate distance between two points in km
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    // Haversine formula for distance
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    
    return distance;
}

// Unit system: 'metric' or 'imperial'
let unitSystem = 'metric';

// Conversion factors - ADD METER CONVERSIONS
const UNIT_CONVERSIONS = {
    WIND_MS_TO_MPH: 2.23694, // m/s to mph
    KM_TO_MILES: 0.621371,   // kilometers to miles
    M_TO_FT: 3.28084,        // meters to feet
    NM_TO_KM: 1.852,         // nautical miles to kilometers
    NM_TO_MILES: 1.15078,    // nautical miles to miles
    M_TO_KM: 0.001,          // meters to kilometers
    KM_TO_M: 1000,           // kilometers to meters
    NM_TO_M: 1852            // nautical miles to meters
};

// NM to km conversion factor (for visualization)
const NM_TO_KM = 1.852;

// Intensity scale selection
let currentScale = 'saffir-simpson'; // Default to Saffir-Simpson scale

// Updated Saffir-Simpson hurricane scale (wind speeds in m/s)
const saffirSimpsonScale = [
    { name: "Tropical Depression", maxWind: 17.5, color: "#5BA4FF", radius: 6 },
    { name: "Tropical Storm", maxWind: 32.5, color: "#00FAF4", radius: 7 },
    { name: "Category 1", maxWind: 42.5, color: "#FFE135", radius: 8 },  // Changed from #FFFFB2 to #FFE135 (more saturated yellow)
    { name: "Category 2", maxWind: 49, color: "#FFD37F", radius: 9 },
    { name: "Category 3", maxWind: 58, color: "#FFA600", radius: 10 },
    { name: "Category 4", maxWind: 70, color: "#FF6C00", radius: 11 },
    { name: "Category 5", maxWind: Infinity, color: "#FF0000", radius: 12 }
];

// Updated Australian Bureau of Meteorology (BoM) scale (wind speeds in m/s)
const bomScale = [
    { name: "Low", maxWind: 17, color: "#80B1D3", radius: 6 },
    { name: "Category 1", maxWind: 24.5, color: "#72CCFF", radius: 7 },
    { name: "Category 2", maxWind: 33, color: "#FFE135", radius: 8 },  // Changed from #FFFFB2 to #FFE135 (more saturated yellow)
    { name: "Category 3", maxWind: 44, color: "#FFD37F", radius: 9 },
    { name: "Category 4", maxWind: 55, color: "#FFA600", radius: 10 },
    { name: "Category 5", maxWind: Infinity, color: "#FF0000", radius: 11 }
];

// Replace the hurricaneCategories with a function to get the correct scale
function getIntensityScale() {
    return currentScale === 'saffir-simpson' ? saffirSimpsonScale : bomScale;
}

// Get hurricane category based on wind speed
function getHurricaneCategory(windSpeed) {
    const scale = getIntensityScale();
    
    if (!windSpeed || isNaN(windSpeed)) return scale[0]; // Default to lowest category
    
    for (const category of scale) {
        if (windSpeed <= category.maxWind) {
            return category;
        }
    }
    return scale[scale.length - 1]; // Default to highest category
}

// Add a wind-pressure relationship function
function calculatePressureFromWind(windSpeed) {
    // Wind speed should be in m/s
    
    // Default environmental pressure (hPa)
    const environmentalPressure = 1010;
    
    // Different coefficients for different basins/regions
    // Using a general Atlantic basin coefficient
    const coefficient = 120;
    
    // Quadratic wind-pressure relationship (simplified)
    // P = Env_P - (wind_speed^2 / C)
    // This is a simplified version of common wind-pressure relationships
    const pressureDrop = Math.pow(windSpeed, 2) / coefficient;
    
    // Calculate minimum central pressure (limited to realistic values)
    const minPressure = Math.max(880, Math.min(1010, Math.round(environmentalPressure - pressureDrop)));
    
    return minPressure;
}

// Basemap layers
const basemaps = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }),
    carto: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19
    }),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://opentopomap.org/">OpenTopoMap</a>',
        maxZoom: 17
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 19
    }),
    terrain: L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png', {
        attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    })
};

// Initialize the map with improved basemap options
function initializeMap() {
    // Create map with default satellite layer instead of OSM
    map = L.map('map').setView([20, 0], 2);
    basemaps.satellite.addTo(map); // Changed from basemaps.osm
    
    // Add fullscreen control
    addFullscreenControl();
    
    // Set up basemap selector handler
    const basemapSelector = document.getElementById('basemap-selector');
    if (basemapSelector) {
        basemapSelector.value = 'satellite'; // Set the dropdown to match
        basemapSelector.addEventListener('change', function() {
            changeBasemap(this.value);
        });
    }
    
    // Wait for map to be ready before adding legend
    map.whenReady(function() {
        // Add hurricane category legend after map is ready
        setTimeout(addCategoryLegend, 100);
    });
}

// Change the basemap layer
function changeBasemap(basemapId) {
    // Remove all existing baselayers
    Object.values(basemaps).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    
    // Add the selected basemap layer
    if (basemaps[basemapId]) {
        basemaps[basemapId].addTo(map);
    } else {
        // Fallback to OSM if the selection is invalid
        basemaps.osm.addTo(map);
    }
}

// Add fullscreen control to map
function addFullscreenControl() {
    // Create custom fullscreen control
    const fullscreenControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', 'fullscreen-button', container);
            
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>';
            button.href = '#';
            button.title = 'Toggle fullscreen';
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', 'Toggle fullscreen');
            
            L.DomEvent.on(button, 'click', L.DomEvent.stop)
                .on(button, 'click', function() {
                    toggleFullscreen();
                });
            
            return container;
        }
    });
    
    map.addControl(new fullscreenControl());
}

// Toggle fullscreen mode
function toggleFullscreen() {
    const mapContainer = document.getElementById('map-container');
    
    // Store dialog position if it exists, relative to window
    let dialogPosition = null;
    if (floatingDialog) {
        const dialogEl = floatingDialog.element;
        dialogPosition = {
            left: dialogEl.offsetLeft,
            top: dialogEl.offsetTop,
            width: dialogEl.offsetWidth
        };
    }
    
    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (mapContainer.requestFullscreen) {
            mapContainer.requestFullscreen();
        } else if (mapContainer.webkitRequestFullscreen) { /* Safari */
            mapContainer.webkitRequestFullscreen();
        } else if (mapContainer.msRequestFullscreen) { /* IE11 */
            mapContainer.msRequestFullscreen();
        }
        
        mapContainer.classList.add('fullscreen-mode');
        
        // Reposition floating dialog for fullscreen mode
        if (floatingDialog) {
            setTimeout(() => repositionDialogForFullscreen(true, dialogPosition), 100);
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
        
        // Reposition floating dialog for normal mode
        if (floatingDialog) {
            setTimeout(() => repositionDialogForFullscreen(false, dialogPosition), 100);
        }
    }
}

// Reposition dialog when entering/exiting fullscreen
function repositionDialogForFullscreen(isFullscreen, oldPosition) {
    if (!floatingDialog || !floatingDialog.element) return;
    
    const mapContainer = document.getElementById('map-container');
    const mapRect = mapContainer.getBoundingClientRect();
    
    if (isFullscreen) {
        // When entering fullscreen, position relative to viewport on the left side
        floatingDialog.element.style.position = 'fixed';
        floatingDialog.element.style.left = '20px'; // Position on left side
        floatingDialog.element.style.top = '20px';
    } else {
        // When exiting, restore previous position or calculate new one on the left
        floatingDialog.element.style.position = 'absolute';
        if (oldPosition) {
            floatingDialog.element.style.left = oldPosition.left + 'px';
            floatingDialog.element.style.top = oldPosition.top + 'px';
        } else {
            floatingDialog.element.style.left = (mapRect.left + 20) + 'px'; // Position on left
            floatingDialog.element.style.top = (mapRect.top + 20) + 'px';
        }
    }
}

// Handle fullscreen change events
function setupFullscreenHandler() {
    const mapContainer = document.getElementById('map-container');
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    function handleFullscreenChange() {
        if (!document.fullscreenElement && 
            !document.webkitFullscreenElement && 
            !document.mozFullScreenElement && 
            !document.msFullscreenElement) {
            // Exited fullscreen
            mapContainer.classList.remove('fullscreen-mode');
            // Resize the map to ensure it renders correctly
            map.invalidateSize();
            
            // Reposition dialog if it exists
            if (floatingDialog) {
                repositionDialogForFullscreen(false);
            }
        } else {
            // Entered fullscreen
            // Resize the map to ensure it renders correctly
            map.invalidateSize();
            
            // Reposition dialog if it exists
            if (floatingDialog) {
                repositionDialogForFullscreen(true);
            }
        }
    }
}

// Parse CSV file
function parseCSV(file) {
    return new Promise((resolve, reject) => {
        // Add file reader to handle the file properly
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const content = e.target.result;
            
            Papa.parse(content, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.errors && results.errors.length) {
                        console.error("CSV parsing errors:", results.errors);
                        reject(results.errors);
                    } else {
                        console.log("CSV parsed successfully:", results.data);
                        resolve(results.data);
                    }
                },
                error: function(error) {
                    console.error("CSV parsing error:", error);
                    reject(error);
                }
            });
        };
        
        reader.onerror = function() {
            reject(new Error("Could not read the file"));
        };
        
        // Read the file as text
        reader.readAsText(file);
    });
}

// Process and validate data
function processData(rawData) {
    console.log("Processing data:", rawData);
    
    // Check if data exists and has at least one row
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
        throw new Error("No data found in CSV file.");
    }
    
    // Try to find latitude and longitude columns
    const columnNames = Object.keys(rawData[0] || {}).map(col => col.toLowerCase());
    console.log("Available columns:", columnNames);
    
    let latColumn, lonColumn;
    
    // Find latitude column
    const latOptions = ['latitude', 'lat', 'y'];
    for (const option of latOptions) {
        const match = columnNames.find(col => col.includes(option));
        if (match) {
            latColumn = Object.keys(rawData[0]).find(col => col.toLowerCase() === match);
            break;
        }
    }
    
    // Find longitude column
    const lonOptions = ['longitude', 'lon', 'long', 'x'];
    for (const option of lonOptions) {
        const match = columnNames.find(col => col.includes(option));
        if (match) {
            lonColumn = Object.keys(rawData[0]).find(col => col.toLowerCase() === match);
            break;
        }
    }
    
    console.log("Found columns:", { latColumn, lonColumn });
    
    if (!latColumn || !lonColumn) {
        throw new Error("Could not identify latitude and longitude columns in the CSV file.");
    }
    
    // Try to find storm attribute columns - UPDATED with exact CSV column names
    const stormAttributes = [
        { key: 'rmw', options: ['rmw', 'radius_maximum_wind', 'radius_of_maximum_winds_m'] },
        { key: 'r34_ne', options: ['r34_ne', 'radius_34kt_ne', 'radius34_ne', 'radius_of_34_kt_winds_ne_m'] },
        { key: 'r34_se', options: ['r34_se', 'radius_34kt_se', 'radius34_se', 'radius_of_34_kt_winds_se_m'] }, 
        { key: 'r34_sw', options: ['r34_sw', 'radius_34kt_sw', 'radius34_sw', 'radius_of_34_kt_winds_sw_m'] },
        { key: 'r34_nw', options: ['r34_nw', 'radius_34kt_nw', 'radius34_nw', 'radius_of_34_kt_winds_nw_m'] },
        { key: 'roci', options: ['roci', 'radius_outermost_isobar', 'radius_of_outer_closed_isobar_m'] }
    ];
    
    const attributeColumnMap = {};
    
    stormAttributes.forEach(attr => {
        for (const option of attr.options) {
            const match = columnNames.find(col => col.includes(option));
            if (match) {
                attributeColumnMap[attr.key] = Object.keys(rawData[0]).find(col => col.toLowerCase() === match);
                break;
            }
        }
    });
    
    console.log("Found attribute columns:", attributeColumnMap);
    
    // Try to find wind speed column
    const windOptions = ['wind', 'max_wind', 'maxwind', 'wind_speed', 'speed'];
    let windColumn = null;
    
    for (const option of windOptions) {
        const match = columnNames.find(col => col.includes(option));
        if (match) {
            windColumn = Object.keys(rawData[0]).find(col => col.toLowerCase() === match);
            break;
        }
    }
    
    console.log("Found wind column:", windColumn);
    
    // Try to find minimum pressure column
    const pressureOptions = ['mslp', 'min_pressure', 'pressure', 'central_pressure', 'min_slp'];
    let pressureColumn = null;
    
    for (const option of pressureOptions) {
        const match = columnNames.find(col => col.includes(option));
        if (match) {
            pressureColumn = Object.keys(rawData[0]).find(col => col.toLowerCase() === match);
            break;
        }
    }
    
    console.log("Found pressure column:", pressureColumn);
    
    // Filter valid coordinates and standardize column names - UPDATED to preserve CSV values
    const processedData = rawData.map((row, index) => {
        const lat = parseFloat(row[latColumn]);
        const lon = parseFloat(row[lonColumn]);
        const windSpeed = windColumn ? parseFloat(row[windColumn]) : undefined;
        const pressure = pressureColumn ? parseFloat(row[pressureColumn]) : undefined;
        
        // Create a new object with standardized column names - using direct values from CSV without defaults
        const newRow = { 
            ...row, 
            latitude: lat, 
            longitude: lon, 
            id: index,
            wind_speed: windSpeed,
            mslp: pressure, // Add minimum pressure without default
            
            // Add storm attributes directly from CSV without defaults
            rmw: attributeColumnMap.rmw ? parseFloat(row[attributeColumnMap.rmw]) : undefined,
            r34_ne: attributeColumnMap.r34_ne ? parseFloat(row[attributeColumnMap.r34_ne]) : undefined,
            r34_se: attributeColumnMap.r34_se ? parseFloat(row[attributeColumnMap.r34_se]) : undefined,
            r34_sw: attributeColumnMap.r34_sw ? parseFloat(row[attributeColumnMap.r34_sw]) : undefined,
            r34_nw: attributeColumnMap.r34_nw ? parseFloat(row[attributeColumnMap.r34_nw]) : undefined,
            roci: attributeColumnMap.roci ? parseFloat(row[attributeColumnMap.roci]) : undefined
        };
        
        // Delete original lat/lon columns if they're different from our standard names
        if (latColumn !== 'latitude') delete newRow[latColumn];
        if (lonColumn !== 'longitude') delete newRow[lonColumn];
        
        return newRow;
    }).filter(row => {
        return !isNaN(row.latitude) && 
               !isNaN(row.longitude) && 
               row.latitude >= -90 && 
               row.latitude <= 90 && 
               row.longitude >= -180 && 
               row.longitude <= 180;
    });
    
    console.log("Processed data:", processedData);
    
    if (processedData.length === 0) {
        throw new Error("No valid coordinates found in the file.");
    }
    
    return processedData;
}

// Create table from data
function createTable(tableData, containerId, limit = null) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (!tableData || tableData.length === 0) {
        container.innerHTML = '<p class="empty-state">No data available</p>';
        return;
    }
    
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    // Create header row
    const headerRow = document.createElement('tr');
    Object.keys(tableData[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    // Create data rows
    const dataToShow = limit ? tableData.slice(0, limit) : tableData;
    dataToShow.forEach(row => {
        const tr = document.createElement('tr');
        Object.values(row).forEach(value => {
            const td = document.createElement('td');
            td.textContent = value;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    
    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
}

// Display cyclone track line
function displayTrackLine() {
    // Remove existing track line if it exists
    if (trackLine) {
        map.removeLayer(trackLine);
    }
    
    // Create an array of latlng points
    const points = data.map(point => [point.latitude, point.longitude]);
    
    // Create a polyline
    trackLine = L.polyline(points, {
        color: '#0066cc',
        weight: 3,
        opacity: 0.7,
        lineJoin: 'round',
        className: 'cyclone-track'
    }).addTo(map);
}

// Convert nautical miles at a lat/lon point to approximate degrees
function nmToDegrees(nm, latitude) {
    // At the equator, 1 degree is approximately 60 nautical miles
    // As we move toward the poles, longitude degrees become smaller
    const latCorrection = Math.cos(Math.abs(latitude) * Math.PI / 180);
    const degLat = nm / 60; // Approximate for latitude
    const degLon = nm / (60 * latCorrection); // Approximate for longitude with correction
    
    return { lat: degLat, lon: degLon };
}

// Calculate points for a wedge shape (for R34 visualization)
// This function expects radius in nautical miles (NM)
function calculateWedgePoints(lat, lon, radius, startAngle, endAngle, steps = 32) {
    const points = [];
    points.push([lat, lon]); // Center point
    
    // Convert nautical miles to approximate degrees
    const conversion = nmToDegrees(radius, lat);
    
    // Calculate points along the arc
    for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / steps);
        const radian = angle * Math.PI / 180;
        
        // Calculate offset (different for lat/lon due to earth's shape)
        const latOffset = conversion.lat * Math.sin(radian);
        const lonOffset = conversion.lon * Math.cos(radian);
        
        points.push([lat + latOffset, lon + lonOffset]);
    }
    
    // Close the polygon
    points.push([lat, lon]);
    
    return points;
}

// Display storm attributes visualization - Fix meter to km conversion
function displayStormAttributes(pointIndex) {
    const point = data[pointIndex];
    
    // Clear existing visualizations
    clearStormVisualizations(pointIndex);
    
    // Create container for this point's visualizations
    stormCircles[pointIndex] = [];
    
    // Calculate conversion ratio based on latitude
    const center = [point.latitude, point.longitude];
    
    // 1. RMW - Radius of Maximum Winds (red circle) - Only if data exists
    if (point.rmw !== undefined && !isNaN(point.rmw)) {
        const rmwCircle = L.circle(center, {
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.1,
            weight: 1,
            radius: point.rmw, // Already in meters, correct usage
            className: 'storm-attribute rmw-circle'
        }).addTo(map);
        
        rmwCircle.stormAttribute = 'rmw';
        rmwCircle.pointIndex = pointIndex;
        stormCircles[pointIndex].push(rmwCircle);
        
        // Make RMW editable with dragging in edit mode
        if (editMode) {
            makeCircleEditable(rmwCircle, pointIndex);
        }
    }
    
    // 2. ROCI - Radius of Outermost Closed Isobar (grey circle) - Only if data exists
    if (point.roci !== undefined && !isNaN(point.roci)) {
        const rociCircle = L.circle(center, {
            color: 'grey',
            fillColor: '#aaaaaa',
            fillOpacity: 0.1,
            weight: 1,
            radius: point.roci, // Already in meters, correct usage
            className: 'storm-attribute roci-circle'
        }).addTo(map);
        
        rociCircle.stormAttribute = 'roci';
        rociCircle.pointIndex = pointIndex;
        stormCircles[pointIndex].push(rociCircle);
        
        // Make ROCI editable with dragging in edit mode
        if (editMode) {
            makeCircleEditable(rociCircle, pointIndex);
        }
    }
    
    // 3. R34 wedges - for each quadrant - Only if data exists
    const wedgeColors = {
        r34_ne: '#00aaff',  // NE - Light blue
        r34_se: '#00ccaa',  // SE - Teal
        r34_sw: '#ffaa00',  // SW - Orange
        r34_nw: '#ff00aa'   // NW - Pink
    };
    
    const wedges = [
        { attr: 'r34_ne', start: 0, end: 90 },
        { attr: 'r34_se', start: 90, end: 180 },
        { attr: 'r34_sw', start: 180, end: 270 },
        { attr: 'r34_nw', start: 270, end: 360 }
    ];
    
    wedges.forEach(wedge => {
        const radius = point[wedge.attr];
        // Skip if radius is undefined or NaN
        if (radius === undefined || isNaN(radius)) return;
        
        // Convert meters to NM for the wedge calculation
        const radiusNM = radius / UNIT_CONVERSIONS.NM_TO_M;
        
        const wedgePoints = calculateWedgePoints(
            point.latitude, 
            point.longitude, 
            radiusNM, // Pass value in NM since calculateWedgePoints expects NM
            wedge.start, 
            wedge.end
        );
        
        const wedgePolygon = L.polygon(wedgePoints, {
            color: wedgeColors[wedge.attr],
            fillColor: wedgeColors[wedge.attr],
            fillOpacity: 0.2,
            weight: 1,
            className: `storm-attribute r34-wedge ${wedge.attr}`
        }).addTo(map);
        
        wedgePolygon.stormAttribute = wedge.attr;
        wedgePolygon.pointIndex = pointIndex;
        stormCircles[pointIndex].push(wedgePolygon);
        
        // Make wedges editable in edit mode
        if (editMode) {
            makeWedgeEditable(wedgePolygon, pointIndex, wedge.attr, wedge.start, wedge.end);
        }
    });
}

// Make circle editable with dragging - UPDATE to store meters
function makeCircleEditable(circle, pointIndex) {
    // Add a drag handle on circle edge
    const center = circle.getLatLng();
    const radiusMeters = circle.getRadius();
    
    // Create a marker at the edge of the circle (east side)
    const edgePoint = L.latLng(
        center.lat,
        center.lng + (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180)))
    );
    
    const dragHandle = L.marker(edgePoint, {
        icon: L.divIcon({
            className: 'drag-handle',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        }),
        draggable: true
    }).addTo(map);
    
    dragHandle.stormAttribute = circle.stormAttribute;
    dragHandle.pointIndex = pointIndex;
    
    stormCircles[pointIndex].push(dragHandle);
    
    // Update circle radius when handle is dragged
    dragHandle.on('drag', function(e) {
        // Calculate new radius based on distance from center to drag handle
        const newDistanceMeters = center.distanceTo(e.target.getLatLng());
        
        // Update circle with new radius
        circle.setRadius(newDistanceMeters);
        
        // Update data - store in meters directly
        data[pointIndex][circle.stormAttribute] = newDistanceMeters;
        
        // Update floating dialog if visible
        if (floatingDialog && floatingDialog.pointIndex === pointIndex) {
            updateFloatingDialog(pointIndex);
        }
    });
}

// Make wedge editable with dragging - improved for smoother interaction
function makeWedgeEditable(wedge, pointIndex, attribute, startAngle, endAngle) {
    const centerPoint = [data[pointIndex].latitude, data[pointIndex].longitude];
    // Convert meters to NM for degree calculations
    const radiusNM = data[pointIndex][attribute] / UNIT_CONVERSIONS.NM_TO_M;
    
    // Get middle angle of the wedge
    const midAngle = (startAngle + endAngle) / 2;
    const midRadian = midAngle * Math.PI / 180;
    
    // Convert nautical miles to approximate degrees
    const conversion = nmToDegrees(radiusNM, centerPoint[0]);
    
    // Calculate handle position at the edge of wedge
    const latOffset = conversion.lat * Math.sin(midRadian);
    const lonOffset = conversion.lon * Math.cos(midRadian);
    
    // Create drag handle
    const dragHandle = L.marker([centerPoint[0] + latOffset, centerPoint[1] + lonOffset], {
        icon: L.divIcon({
            className: 'drag-handle',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        }),
        draggable: true
    }).addTo(map);
    
    dragHandle.stormAttribute = attribute;
    dragHandle.pointIndex = pointIndex;
    
    stormCircles[pointIndex].push(dragHandle);
    
    // Efficient update during drag with debounce for performance
    let updateTimeout;
    
    // Update wedge when handle is dragged
    dragHandle.on('drag', function(e) {
        // Calculate distance from center to drag handle in meters
        const center = L.latLng(centerPoint[0], centerPoint[1]);
        const distanceMeters = center.distanceTo(e.target.getLatLng());
        const newRadiusNM = distanceMeters / (NM_TO_KM * 1000);
        
        // Just update the wedge visually during drag for smoother experience
        if (updateTimeout) clearTimeout(updateTimeout);
        
        // Update the data with precise value (not rounded)
        data[pointIndex][attribute] = distanceMeters;
        
        // Update displayed value if the floating dialog is visible
        if (floatingDialog && floatingDialog.pointIndex === pointIndex) {
            const formattedEl = document.getElementById(`formatted-${attribute}`);
            if (formattedEl) {
                formattedEl.textContent = metersToDisplayUnits(distanceMeters);
            }
        }
        
        // Debounce the visual update for smoother performance
        updateTimeout = setTimeout(() => {
            clearStormVisualizations(pointIndex);
            displayStormAttributes(pointIndex);
        }, 16); // ~60fps update rate
    });
    
    // End of drag - finalize changes
    dragHandle.on('dragend', function(e) {
        clearTimeout(updateTimeout);
        
        // Calculate final distance
        const center = L.latLng(centerPoint[0], centerPoint[1]);
        const distanceMeters = center.distanceTo(e.target.getLatLng());
        
        // Store the precise value in meters
        data[pointIndex][attribute] = distanceMeters;
        
        // Redraw final visualization
        clearStormVisualizations(pointIndex);
        displayStormAttributes(pointIndex);
    });
}

// Clear storm visualizations for a point
function clearStormVisualizations(pointIndex) {
    if (stormCircles[pointIndex]) {
        stormCircles[pointIndex].forEach(layer => map.removeLayer(layer));
        stormCircles[pointIndex] = [];
    }
}

// Clear all storm visualizations
function clearAllStormVisualizations() {
    Object.keys(stormCircles).forEach(index => {
        clearStormVisualizations(parseInt(index));
    });
    stormCircles = {};
}

// Create enhanced floating dialog for editing storm attributes
function createFloatingDialog(pointIndex) {
    // Close any existing dialog first
    removeFloatingDialog();
    
    console.log(`Creating dialog for point ${pointIndex}`);
    
    // Get the current point data (ensures we're using up-to-date values)
    const point = data[pointIndex];
    
    // Create dialog container
    const dialogContainer = document.createElement('div');
    dialogContainer.id = 'floating-dialog';
    dialogContainer.classList.remove('hidden');
    dialogContainer.classList.add('enhanced-dialog');
    dialogContainer.style.zIndex = '1500'; // Ensure high z-index
    
    // Add semi-transparent slider thumb styles
    const sliderStyles = document.createElement('style');
    sliderStyles.textContent = `
        /* Make slider thumbs semi-transparent to show initial value indicators */
        #floating-dialog input[type=range]::-webkit-slider-thumb {
            opacity: 0.8;
            background-color: rgba(255, 255, 255, 0.8);
        }
        #floating-dialog input[type=range]::-moz-range-thumb {
            opacity: 0.8;
            background-color: rgba(255, 255, 255, 0.8);
        }
        #floating-dialog input[type=range]::-ms-thumb {
            opacity: 0.8;
            background-color: rgba(255, 255, 255, 0.8);
        }
        /* Make initial value indicators more visible */
        #floating-dialog .initial-value-indicator {
            background-color: rgba(255, 200, 50, 0.9);
            width: 3px;
        }
    `;
    dialogContainer.appendChild(sliderStyles);
    
    // Get hurricane category based on current wind speed
    const category = getHurricaneCategory(point.wind_speed);
    
    // Header with close button - UPDATED with more compact styling
    const header = document.createElement('div');
    header.className = 'dialog-header';
    header.style.backgroundColor = `${category.color}40`;
    header.style.borderColor = category.color;
    header.style.borderBottomWidth = '2px';
    header.style.borderBottomStyle = 'solid';
    header.style.padding = '6px 10px'; // Reduced padding
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    
    // Update category badge with more compact styling
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'popup-category';
    categoryBadge.style.backgroundColor = category.color;
    categoryBadge.style.color = '#000000';
    categoryBadge.style.textShadow = 'none';
    categoryBadge.style.padding = '2px 6px'; // Reduced padding
    categoryBadge.style.borderRadius = '10px';
    categoryBadge.style.fontSize = '10px'; // Smaller font
    categoryBadge.style.fontWeight = '600';
    categoryBadge.textContent = category.name;
    categoryBadge.style.marginRight = 'auto';
    header.appendChild(categoryBadge);
    
    // Update close button to be more compact but still match cyclone's intensity color
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = removeFloatingDialog;
    
    // Style the close button with more compact dimensions
    closeBtn.style.backgroundColor = category.color;
    closeBtn.style.color = '#000000';
    closeBtn.style.width = '18px'; // Reduced size
    closeBtn.style.height = '18px'; // Reduced size
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '14px'; // Smaller font
    closeBtn.style.lineHeight = '1';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.2)';
    closeBtn.style.marginLeft = '8px'; // Add margin to separate from badge
    
    header.appendChild(closeBtn);
    
    dialogContainer.appendChild(header);
    
    // Storm attribute editor form
    const form = document.createElement('div');
    form.className = 'dialog-form';
    
    // Add Wind Speed and Pressure sections with special formatting
    const meteoSection = document.createElement('div');
    meteoSection.className = 'dialog-section';
    
    const meteoTitle = document.createElement('div');
    meteoTitle.className = 'dialog-section-title';
    meteoTitle.textContent = 'Meteorological Parameters';
    meteoSection.appendChild(meteoTitle);
    
    // Wind speed field
    const windFieldGroup = document.createElement('div');
    windFieldGroup.className = 'field-group';
    
    // Use the appropriate wind speed unit
    const windSpeedUnit = unitSystem === 'metric' ? 'm/s' : 'mph';
    
    const windLabel = document.createElement('label');
    windLabel.textContent = `Wind Speed (${windSpeedUnit})`;
    windLabel.htmlFor = 'slider-wind_speed';
    windFieldGroup.appendChild(windLabel);
    
    const windInputWrapper = document.createElement('div');
    windInputWrapper.className = 'input-wrapper';
    
    // Create container for the wind slider to allow positioning the indicator
    const windSliderContainer = document.createElement('div');
    windSliderContainer.className = 'slider-container';
    
    // Calculate initial value percentage for positioning the indicator
    const windInitialValuePercent = ((point.wind_speed || 0) / 100) * 100;
    
    // Create the initial value indicator
    const windInitialValueIndicator = document.createElement('div');
    windInitialValueIndicator.className = 'initial-value-indicator';
    windInitialValueIndicator.style.left = `${windInitialValuePercent}%`;
    windSliderContainer.appendChild(windInitialValueIndicator);
    
    const windColor = category.color;
    const windSlider = document.createElement('input');
    windSlider.type = 'range';
    windSlider.min = 0;
    windSlider.max = 100;
    windSlider.step = 1;
    windSlider.value = point.wind_speed || 0;
    windSlider.className = 'slider';
    windSlider.id = 'slider-wind_speed';
    windSlider.style.background = `linear-gradient(to right, ${windColor} 0%, ${windColor} ${point.wind_speed}%, #444 ${point.wind_speed}%, #444 100%)`;
    
    // Add slider to the container
    windSliderContainer.appendChild(windSlider);
    
    // Add the slider container to the input wrapper
    windInputWrapper.appendChild(windSliderContainer);
    
    const windFormattedValue = document.createElement('span');
    windFormattedValue.textContent = formatWindSpeed(point.wind_speed || 0);
    windFormattedValue.style.fontSize = '12px';
    windFormattedValue.style.color = 'var(--text-primary)';
    windFormattedValue.style.fontWeight = '500';
    windFormattedValue.id = 'formatted-wind_speed';
    
    windInputWrapper.appendChild(windFormattedValue);
    
    windFieldGroup.appendChild(windInputWrapper);
    meteoSection.appendChild(windFieldGroup);
    
    // Pressure field
    const pressureFieldGroup = document.createElement('div');
    pressureFieldGroup.className = 'field-group';
    
    const pressureLabel = document.createElement('label');
    pressureLabel.textContent = 'Min Pressure (hPa)';
    pressureLabel.htmlFor = 'slider-mslp';
    pressureFieldGroup.appendChild(pressureLabel);
    
    const pressureInputWrapper = document.createElement('div');
    pressureInputWrapper.className = 'input-wrapper';
    
    // Calculate pressure percentage for gradient (1050-880 range)
    const pressureRange = 170; // 1050 - 880
    const pressurePercent = Math.max(0, Math.min(100, ((1050 - (point.mslp || 1010)) / pressureRange) * 100));
    const pressureColor = '#ff5f5f'; // Red color for pressure
    
    // Create container for pressure slider to allow positioning the indicator
    const pressureSliderContainer = document.createElement('div');
    pressureSliderContainer.className = 'slider-container';
    
    // Calculate initial value percentage for positioning the indicator (reversed scale)
    const pressureInitialValue = point.mslp || defaultStormAttributes.mslp;
    const pressureInitialValuePercent = ((pressureInitialValue - 880) / 170) * 100;
    
    // Create the initial value indicator
    const pressureInitialValueIndicator = document.createElement('div');
    pressureInitialValueIndicator.className = 'initial-value-indicator';
    pressureInitialValueIndicator.style.left = `${pressureInitialValuePercent}%`;
    pressureSliderContainer.appendChild(pressureInitialValueIndicator);
    
    const pressureSlider = document.createElement('input');
    pressureSlider.type = 'range';
    pressureSlider.min = 880;
    pressureSlider.max = 1050;
    pressureSlider.step = 1;
    pressureSlider.value = point.mslp || defaultStormAttributes.mslp;
    pressureSlider.className = 'slider';
    pressureSlider.id = 'slider-mslp';
    pressureSlider.style.background = `linear-gradient(to right, ${pressureColor} 0%, ${pressureColor} ${pressurePercent}%, #444 ${pressurePercent}%, #444 100%)`;
    
    // Add slider to the container
    pressureSliderContainer.appendChild(pressureSlider);
    
    // Add the slider container to the input wrapper
    pressureInputWrapper.appendChild(pressureSliderContainer);
    
    const pressureFormattedValue = document.createElement('span');
    pressureFormattedValue.textContent = (point.mslp || defaultStormAttributes.mslp) + ' hPa';
    pressureFormattedValue.style.fontSize = '12px';
    pressureFormattedValue.style.color = 'var(--text-primary)';
    pressureFormattedValue.style.fontWeight = '500';
    pressureFormattedValue.id = 'formatted-mslp';
    
    pressureInputWrapper.appendChild(pressureFormattedValue);
    
    pressureFieldGroup.appendChild(pressureInputWrapper);
    meteoSection.appendChild(pressureFieldGroup);
    
    form.appendChild(meteoSection);
    
    // Handle wind speed changes with unit awareness and pressure relation
    windSlider.oninput = function() {
        const value = parseFloat(this.value);
        // Update formatted display with correct units
        document.getElementById('formatted-wind_speed').textContent = formatWindSpeed(value);
        
        // Update gradient
        this.style.background = `linear-gradient(to right, ${windColor} 0%, ${windColor} ${value}%, #444 ${value}%, #444 100%)`;
        
        // Update data (always store in m/s internally)
        data[pointIndex].wind_speed = value;
        
        // Calculate and update pressure based on wind-pressure relationship
        const newPressure = calculatePressureFromWind(value);
        data[pointIndex].mslp = newPressure;
        
        // Update pressure slider and display
        const pressureSlider = document.getElementById('slider-mslp');
        if (pressureSlider) {
            pressureSlider.value = newPressure;
            
            // Calculate percentage for gradient (1050-880 range)
            const pressureRange = 170; // 1050 - 880
            const pressurePercent = Math.max(0, Math.min(100, ((1050 - newPressure) / pressureRange) * 100));
            pressureSlider.style.background = `linear-gradient(to right, ${pressureColor} 0%, ${pressureColor} ${pressurePercent}%, #444 ${pressurePercent}%, #444 100%)`;
            
            // Update formatted pressure display
            const pressureDisplay = document.getElementById('formatted-mslp');
            if (pressureDisplay) {
                pressureDisplay.textContent = newPressure + ' hPa';
                pressureDisplay.innerHTML = newPressure + ' hPa <small style="color:#aaa;font-size:9px;">(auto)</small>';
            }
        }
    };

    windSlider.onchange = function() {
        const value = parseFloat(this.value);
        data[pointIndex].wind_speed = value;
        const newCategory = getHurricaneCategory(value);
        categoryBadge.textContent = newCategory.name;
        categoryBadge.style.backgroundColor = newCategory.color;
        displayMarkers();
    };
    
    // Update the pressure slider handler to disconnect the auto-relationship when manually adjusted
    pressureSlider.oninput = function() {
        const value = parseInt(this.value);
        // Update formatted display
        const pressureDisplay = document.getElementById('formatted-mslp');
        if (pressureDisplay) {
            pressureDisplay.textContent = value + ' hPa';
            // Remove the "auto" indicator to show it's manually set
            pressureDisplay.innerHTML = value + ' hPa';
        }
        
        // Update gradient (1050-880 range)
        const pressurePercent = ((1050 - value) / 170) * 100;
        this.style.background = `linear-gradient(to right, ${pressureColor} 0%, ${pressureColor} ${pressurePercent}%, #444 ${pressurePercent}%, #444 100%)`;
        
        // Update data
        data[pointIndex].mslp = value;
    };

    // Add Storm Size section header
    const sizeSection = document.createElement('div');
    sizeSection.className = 'dialog-section';
    sizeSection.textContent = 'Storm Size Parameters';
    sizeSection.style.fontSize = '12px';
    sizeSection.style.fontWeight = '600';
    sizeSection.style.textTransform = 'uppercase';
    sizeSection.style.color = '#ccc'; // Updated for dark mode
    form.appendChild(sizeSection);
    
    // Storm attribute fields - with formatted numbers in appropriate units
    const attributeFields = [
        { id: 'rmw', label: `RMW (${unitSystem === 'metric' ? 'km' : 'mi'})`, color: 'var(--rmw-color)', value: point.rmw, min: 0, max: 100000 },
        { id: 'r34_ne', label: `R34 NE`, color: 'var(--r34-ne-color)', value: point.r34_ne, min: 0, max: 500000 },
        { id: 'r34_se', label: `R34 SE`, color: 'var(--r34-se-color)', value: point.r34_se, min: 0, max: 500000 },
        { id: 'r34_sw', label: `R34 SW`, color: 'var(--r34-sw-color)', value: point.r34_sw, min: 0, max: 500000 },
        { id: 'r34_nw', label: `R34 NW`, color: 'var(--r34-nw-color)', value: point.r34_nw, min: 0, max: 500000 },
        { id: 'roci', label: `ROCI`, color: 'var(--roci-color)', value: point.roci, min: 0, max: 1000000 }
    ];
    
    attributeFields.forEach(field => {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'field-group';
        
        const label = document.createElement('label');
        const colorBox = document.createElement('span');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = field.color;
        label.appendChild(colorBox);
        label.appendChild(document.createTextNode(' ' + field.label));
        label.htmlFor = `slider-${field.id}`;
        fieldGroup.appendChild(label);
        
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'input-wrapper';
        
        // Create container for the slider to allow positioning the indicator
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';
        
        // Calculate initial value percentage for positioning the indicator
        const initialValuePercent = ((field.value - field.min) / (field.max - field.min)) * 100;
        
        // Create the initial value indicator
        const initialValueIndicator = document.createElement('div');
        initialValueIndicator.className = 'initial-value-indicator';
        initialValueIndicator.style.left = `${initialValuePercent}%`;
        sliderContainer.appendChild(initialValueIndicator);
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = field.min;
        slider.max = field.max;
        slider.step = 0.1; // Higher resolution for smoother sliding
        slider.value = field.value;
        slider.className = 'slider';
        slider.id = `slider-${field.id}`;
        sliderContainer.appendChild(slider);
        
        // Add the slider container to the input wrapper
        inputWrapper.appendChild(sliderContainer);
        
        const formattedValue = document.createElement('span');
        // Use metersToDisplayUnits instead of nmToKmForDisplay
        formattedValue.textContent = metersToDisplayUnits(field.value);
        formattedValue.style.fontSize = '12px';
        formattedValue.style.color = 'var(--text-primary)';
        formattedValue.style.fontWeight = '500';
        formattedValue.id = `formatted-${field.id}`;
        inputWrapper.appendChild(formattedValue);
        
        let updateTimeout;
        
        // Keep slider and formatted display in sync with smoother updates
        slider.oninput = function() {
            const value = parseFloat(this.value);
            // Update displayed value with correct units - using meters
            document.getElementById(`formatted-${field.id}`).textContent = 
                metersToDisplayUnits(value);
            
            // Update data immediately (always stored in NM internally)
            data[pointIndex][field.id] = value;
            
            // Debounce visualization updates for better performance
            if (updateTimeout) clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                updateStormVisualizations(pointIndex);
            }, 60); // Less frequent updates during sliding
        };
        
        // Final update when sliding ends
        slider.onchange = function() {
            if (updateTimeout) clearTimeout(updateTimeout);
            const value = parseFloat(this.value);
            data[pointIndex][field.id] = value;
            updateStormVisualizations(pointIndex);
        };
        
        fieldGroup.appendChild(inputWrapper);
        form.appendChild(fieldGroup);
    });
    
    dialogContainer.appendChild(form);
    
    // Add dialog to document
    document.body.appendChild(dialogContainer);
    
    // Position dialog - floating near the LEFT side of the map instead of right
    const mapContainer = document.getElementById('map');
    const mapRect = mapContainer.getBoundingClientRect();
    
    // Check if we're in fullscreen mode
    const isFullscreen = !!document.fullscreenElement;
    
    if (isFullscreen) {
        // In fullscreen, position relative to viewport on the left side
        dialogContainer.style.position = 'fixed';
        dialogContainer.style.left = '20px'; // Position on left side
        dialogContainer.style.top = '20px';
    } else {
        // Normal mode, position relative to map on the left side
        dialogContainer.style.position = 'absolute';
        dialogContainer.style.left = (mapRect.left + 20) + 'px'; // Position on left
        dialogContainer.style.top = (mapRect.top + 20) + 'px';
    }
    
    // Add drag functionality to dialog
    makeDraggable(dialogContainer);
    
    // Store dialog reference
    floatingDialog = {
        element: dialogContainer,
        pointIndex: pointIndex
    };
    
    console.log("Dialog created successfully");
}

// Update storm visualizations after changes
function updateStormVisualizations(pointIndex) {
    clearStormVisualizations(pointIndex);
    displayStormAttributes(pointIndex);
}

// Make dialog draggable
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    // Find header to use as drag handle
    const header = element.querySelector('.dialog-header');
    if (header) {
        header.onmousedown = dragMouseDown;
    } else {
        element.onmousedown = dragMouseDown;
    }
    
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // Get the mouse cursor position at startup
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // Call a function whenever the cursor moves
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // Calculate the new cursor position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // Set the element's new position
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        // Stop moving when mouse button is released
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Update floating dialog values - Enhanced to handle unit changes without recreating dialog
function updateFloatingDialog(pointIndex) {
    if (!floatingDialog || floatingDialog.pointIndex !== pointIndex) return;
    
    const point = data[pointIndex];
    
    // Update each input field with current data
    const attributes = ['wind_speed', 'mslp', 'rmw', 'r34_ne', 'r34_se', 'r34_sw', 'r34_nw', 'roci'];
    
    attributes.forEach(attr => {
        const input = document.getElementById(`floating-${attr}`);
        if (input) {
            input.value = point[attr];
        }
    });
}

// New function to update just the displayed units in the floating dialog
function updateFloatingDialogUnits() {
    if (!floatingDialog) return;
    
    const pointIndex = floatingDialog.pointIndex;
    const point = data[pointIndex];
    
    // Update wind speed display
    const windSpeedEl = document.getElementById('formatted-wind_speed');
    if (windSpeedEl) {
        windSpeedEl.textContent = formatWindSpeed(point.wind_speed || 0);
    }
    
    // Update size attribute displays - convert from meters to display units
    const sizeAttributes = ['rmw', 'r34_ne', 'r34_se', 'r34_sw', 'r34_nw', 'roci'];
    sizeAttributes.forEach(attr => {
        const formattedEl = document.getElementById(`formatted-${attr}`);
        if (formattedEl && point[attr] !== undefined) {
            // Use the meters-to-display converter
            formattedEl.textContent = metersToDisplayUnits(point[attr]);
        }
    });
    
    // Update any labels that contain unit text
    const windSpeedLabel = document.querySelector('label[for="slider-wind_speed"]');
    if (windSpeedLabel) {
        const windSpeedUnit = unitSystem === 'metric' ? 'm/s' : 'mph';
        windSpeedLabel.textContent = `Wind Speed (${windSpeedUnit})`;
    }
    
    // Update labels for radius attributes
    const distanceUnit = unitSystem === 'metric' ? 'km' : 'mi';
    sizeAttributes.forEach(attr => {
        const labelEl = document.querySelector(`label[for="slider-${attr}"]`);
        if (labelEl) {
            // Extract the base label without the unit
            const baseLabel = labelEl.textContent.split('(')[0].trim();
            labelEl.textContent = `${baseLabel} (${distanceUnit})`;
        }
    });
}

// Remove floating dialog
function removeFloatingDialog() {
    const dialog = document.getElementById('floating-dialog');
    if (dialog) {
        dialog.parentNode.removeChild(dialog);
        floatingDialog = null;
    }
}

// Grey out all points except the selected one
function greyOutOtherPoints(selectedIndex) {
    markers.forEach((marker, index) => {
        if (index !== selectedIndex) {
            marker.setOpacity(0.3);
            marker.getElement().classList.add('greyed-out');
        } else {
            marker.setOpacity(1.0);
            marker.getElement().classList.remove('greyed-out');
        }
    });
    
    // Grey out track line
    if (trackLine) {
        trackLine.setStyle({ opacity: 0.3 });
    }
}

// Reset all points to normal
function resetPointAppearance() {
    markers.forEach(marker => {
        marker.setOpacity(1.0);
        marker.getElement().classList.remove('greyed-out');
    });
    
    // Reset track line
    if (trackLine) {
        trackLine.setStyle({ opacity: 0.7 });
    }
}

// Format number with commas and decimal places
function formatNumber(number, decimals = 2) {
    if (number === undefined || number === null || isNaN(number)) {
        return "N/A";
    }
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number);
}

// Convert nm to km for display (keeping internal data in nm)
function nmToKmForDisplay(valueNM, decimals = 0) {
    if (unitSystem === 'metric') {
        return formatNumber(valueNM * NM_TO_KM, decimals) + ' km';
    } else {
        return formatNumber(valueNM * UNIT_CONVERSIONS.NM_TO_MILES, decimals) + ' mi';
    }
}

// Updated function to convert meters to display units (km or miles)
function metersToDisplayUnits(valueMeters, decimals = 0) {
    if (valueMeters === undefined || valueMeters === null || isNaN(valueMeters)) {
        return "N/A";
    }
    
    if (unitSystem === 'metric') {
        // Convert meters to kilometers
        return formatNumber(valueMeters * UNIT_CONVERSIONS.M_TO_KM, decimals) + ' km';
    } else {
        // Convert meters to miles
        return formatNumber(valueMeters * UNIT_CONVERSIONS.M_TO_KM * UNIT_CONVERSIONS.KM_TO_MILES, decimals) + ' mi';
    }
}

// Updated function to convert display value (km or miles) to meters
function displayUnitsToMeters(value, isMetric = true) {
    if (isMetric) {
        // Convert km to meters
        return value * UNIT_CONVERSIONS.KM_TO_M;
    } else {
        // Convert miles to meters
        return value / UNIT_CONVERSIONS.KM_TO_MILES * UNIT_CONVERSIONS.KM_TO_M;
    }
}

// New wrapper function that formats meters for display in appropriate units
function formatMetersForDisplay(valueMeters, decimals = 0) {
    return metersToDisplayUnits(valueMeters, decimals);
}

// Modified marker creation with dynamic popup styling - now with fitBounds parameter
function displayMarkers(fitBounds = true) {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Clear all storm visualizations
    clearAllStormVisualizations();
    
    // Clear any isochrones when redisplaying markers
    clearIsochrones();
    
    // Add new markers
    data.forEach((point, index) => {
        // Determine hurricane category based on wind speed
        const category = getHurricaneCategory(point.wind_speed);
        
        // Create custom icon based on hurricane category
        const icon = L.divIcon({
            className: 'hurricane-marker category-' + category.name.toLowerCase().replace(/\s+/g, '-'),
            iconSize: [category.radius * 2, category.radius * 2],
            html: `<div style="background-color: ${category.color}; width: 100%; height: 100%; border-radius: 50%;"></div>`,
            iconAnchor: [category.radius, category.radius]
        });
        
        const marker = L.marker([point.latitude, point.longitude], {
            draggable: editMode,
            title: `Point ${index} - ${category.name}`,
            id: point.id,
            icon: icon
        });
        
        // Store the point index directly on the marker for reference
        marker.pointIndex = index;
        
        // Create a popup with right-side positioning
        const popup = L.popup({
            maxWidth: 320, // Increased from 280
            minWidth: 300, // Add minimum width
            offset: L.point(30, 0),
            autoPan: true,
            autoPanPadding: [50, 50],
            className: `category-popup category-${category.name.toLowerCase().replace(/\s+/g, '-')}`,
            closeButton: true
        });
        
        // When popup opens, reposition it to the right side of the marker
        marker.on('click', function(e) {
            if (this._popup) {
                // Position popup correctly before opening it
                const content = window.formatPopupContent ? 
                    window.formatPopupContent(data[this.pointIndex], this.pointIndex) :
                    `<div class="popup-content">Point ${this.pointIndex}</div>`;
                
                this._popup.setContent(content);
                
                // Use the map's event system to force repositioning after popup is shown
                map.once('popupopen', function(e) {
                    if (window.positionPopupToRight) {
                        window.positionPopupToRight(marker, e.popup);
                    }
                });
            }
        });
        
        // Bind popup with content function
        marker.bindPopup(function() {
            return window.formatPopupContent ? 
                window.formatPopupContent(data[marker.pointIndex], marker.pointIndex) :
                `<div class="popup-content">Point ${marker.pointIndex}</div>`;
        });
        
        // Ensure click events work by using a direct event function without closures
        marker.on('click', function(e) {
            console.log(`Marker ${index} clicked`);
            
            if (!editMode) {
                // View mode: show dialog and popup
                map.setView(e.latlng, map.getZoom());
                
                // Clear any existing visualizations and isochrones
                clearAllStormVisualizations();
                clearIsochrones();
                greyOutOtherPoints(index);
                displayStormAttributes(index);
                
                // Create a fresh dialog with current data
                setTimeout(() => createFloatingDialog(index), 10);
                
                // Show popup regardless
                this.openPopup();
                
                // Update selected point
                selectedPoint = index;
            } else {
                // Edit mode: Select point for editing but don't show dialog
                selectPoint(index);
                
                // Display storm attributes without dialog
                clearAllStormVisualizations();
                displayStormAttributes(index);
                
                // Clear any existing isochrones and show for this point
                clearIsochrones();
                showIsochrones(index);
                
                // Update selected point
                selectedPoint = index;
                
                // Show the popup in edit mode too
                this.openPopup();
                
                // Show a small notification
                showNotification(`Selected Point ${index} for editing`, 'info', 1500);
            }
        });
        
        // Add drag event handling
        if (editMode) {
            // Add dragstart handler to create ghost marker of original position
            marker.on('dragstart', function(e) {
                // Store original position and create ghost marker
                createGhostMarker(index, e.target.getLatLng());
            });
            
            // Update track line during dragging (not just at the end)
            marker.on('drag', function(e) {
                // Update data coordinates in real-time
                data[index].latitude = e.latlng.lat;
                data[index].longitude = e.latlng.lng;
                
                // Redraw track line during drag for continuous feedback
                displayTrackLine();
                
                // Update isochrones if this is the selected point - but with debouncing for performance
                if (selectedPointIndex === index) {
                    if (isochroneUpdateTimeout) clearTimeout(isochroneUpdateTimeout);
                    isochroneUpdateTimeout = setTimeout(() => {
                        clearIsochrones();
                        showIsochrones(index);
                    }, 50); // Short debounce time for smoother feedback
                }
            });
            
            marker.on('dragend', function(e) {
                // Cancel any pending debounced updates
                if (isochroneUpdateTimeout) {
                    clearTimeout(isochroneUpdateTimeout);
                    isochroneUpdateTimeout = null;
                }
                
                updatePointLocation(index, e.target.getLatLng());
                
                // Check if marker is back at original position (within small threshold)
                const ghostMarker = ghostMarkers[index];
                if (ghostMarker) {
                    const originalPos = ghostMarker.getLatLng();
                    const currentPos = e.target.getLatLng();
                    const distance = originalPos.distanceTo(currentPos);
                    
                    // If very close to original position, snap back
                    if (distance < 5) { // 5 meters threshold
                        e.target.setLatLng(originalPos);
                        data[index].latitude = originalPos.lat;
                        data[index].longitude = originalPos.lng;
                        displayTrackLine();
                        
                        // Make sure to update isochrones for the snapped position
                        if (selectedPointIndex === index) {
                            clearIsochrones();
                            showIsochrones(index);
                        }
                    }
                }
                
                // Remove ghost marker regardless
                removeGhostMarker(index);
            });
        }
        
        // Add marker to map and to our array
        marker.addTo(map);
        markers.push(marker);
    });

    // Only fit bounds if explicitly requested
    if (fitBounds && markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds());
    }
    
    // Draw the track line connecting points
    displayTrackLine();
    
    // Add a global map click handler to clear isochrones when clicking away from markers
    // Remove any existing click handler first to avoid duplicates
    map.off('click');
    map.on('click', function(e) {
        // Only process if we're in edit mode
        if (!editMode) return;
        
        // Check if the click was on a marker
        let clickedOnMarker = false;
        
        // Get the pixel point of the click
        const clickPoint = map.latLngToContainerPoint(e.latlng);
        
        // Check if we clicked near any marker
        for (const marker of markers) {
            const markerLatLng = marker.getLatLng();
            const markerPoint = map.latLngToContainerPoint(markerLatLng);
            
            // Calculate pixel distance between click and marker
            const dx = clickPoint.x - markerPoint.x;
            const dy = clickPoint.y - markerPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If click is close to a marker (within 20 pixels), consider it a marker click
            if (distance < 20) {
                clickedOnMarker = true;
                break;
            }
        }
        
        // If we didn't click on a marker, clear the isochrones
        if (!clickedOnMarker) {
            console.log("Clicked away from markers, clearing isochrones");
            clearIsochrones();
        }
    });
}

// Create a ghost marker at the original position
function createGhostMarker(index, originalPosition) {
    // Remove any existing ghost marker for this index
    removeGhostMarker(index);
    
    // Get the category for styling
    const point = data[index];
    const category = getHurricaneCategory(point.wind_speed);
    
    // Create ghost icon (greyed out version of the regular icon)
    const ghostIcon = L.divIcon({
        className: 'hurricane-marker ghost-marker category-' + category.name.toLowerCase().replace(/\s+/g, '-'),
        iconSize: [category.radius * 2, category.radius * 2],
        html: `<div style="background-color: ${category.color}; opacity: 0.3; width: 100%; height: 100%; border-radius: 50%;"></div>`,
        iconAnchor: [category.radius, category.radius]
    });
    
    // Create and add the ghost marker
    const ghostMarker = L.marker(originalPosition, {
        icon: ghostIcon,
        interactive: false, // Cannot be clicked
        keyboard: false,    // No keyboard interaction
        zIndexOffset: -1000 // Ensure it's below the actual marker
    }).addTo(map);
    
    // Store the ghost marker
    ghostMarkers[index] = ghostMarker;
}

// Remove a ghost marker
function removeGhostMarker(index) {
    if (ghostMarkers[index]) {
        map.removeLayer(ghostMarkers[index]);
        delete ghostMarkers[index];
    }
}

// Clear all ghost markers
function clearAllGhostMarkers() {
    Object.keys(ghostMarkers).forEach(index => {
        removeGhostMarker(parseInt(index));
    });
}

// Select a point for editing - Updated to handle isochrones
function selectPoint(index) {
    // If we're selecting a different point, clear isochrones from previous point
    if (selectedPoint !== index) {
        clearIsochrones();
    }
    
    selectedPoint = index;
    
    // Highlight selected marker
    markers.forEach(marker => {
        const markerElement = marker.getElement();
        if (marker.options.id === data[index].id) {
            markerElement.classList.add('selected-marker');
        } else {
            markerElement.classList.remove('selected-marker');
        }
    });
    
    // Grey out other points
    greyOutOtherPoints(index);
    
    // If in edit mode, show isochrones for selected point
    if (editMode) {
        showIsochrones(index);
    }
}

// Update point location
function updatePointLocation(index, latlng) {
    data[index].latitude = latlng.lat;
    data[index].longitude = latlng.lng;
    
    // Update data table if it exists
    const tableContainer = document.getElementById('table-container');
    if (tableContainer) {
        createTable(data, 'table-container');
    }
    
    // Update the track line
    displayTrackLine();
    
    // If we're in edit mode, update any visualizations for this point
    if (editMode && stormCircles[index]) {
        clearStormVisualizations(index);
        displayStormAttributes(index);
    }
    
    // Update isochrones if this is the selected point
    if (selectedPointIndex === index) {
        clearIsochrones();
        showIsochrones(index);
    }
}

// Toggle edit mode - updated to preserve map view and clear isochrones
function toggleEditMode() {
    editMode = !editMode;
    
    // Remove floating dialog when toggling modes
    removeFloatingDialog();
    
    // Reset point appearance
    resetPointAppearance();
    
    // Clear all storm visualizations
    clearAllStormVisualizations();
    
    // Clear all ghost markers when toggling edit mode
    clearAllGhostMarkers();
    
    // Clear any isochrones when toggling modes
    clearIsochrones();
    
    // Update UI
    const modeStatus = document.getElementById('mode-status');
    if (editMode) {
        modeStatus.textContent = 'Move Cyclone Position';  // Changed from 'Edit Cyclone Parameters'
        modeStatus.className = 'edit-mode';
    } else {
        modeStatus.textContent = 'Edit Cyclone Parameters'; // Changed from 'Move Cyclone Position'
        modeStatus.className = 'view-mode';
    }
    
    // Reload markers with new draggable status but preserve current view
    displayMarkers(false); // Pass false to prevent fitting bounds
}

// Populate point selector
function populatePointSelector() {
    const select = document.getElementById('point-select');
    select.innerHTML = '';
    
    data.forEach((point, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `Point ${index}`;
        select.appendChild(option);
    });
    
    // Add change event
    select.addEventListener('change', function() {
        selectPoint(parseInt(this.value));
    });
}

// Export data to CSV - allow user to choose filename
function exportData() {
    if (!data || data.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    try {
        console.log("Exporting data...");
        
        // Prompt user for filename
        let defaultFilename = `cyclone-track-${new Date().toISOString().substring(0, 10)}`;
        let filename = window.prompt('Enter a filename for the CSV export:', defaultFilename);
        
        // If user cancels, abort export
        if (filename === null) {
            console.log("Export cancelled by user");
            return;
        }
        
        // Add .csv extension if not present
        if (!filename.toLowerCase().endsWith('.csv')) {
            filename += '.csv';
        }
        
        // Generate CSV content
        const csv = Papa.unparse(data);
        
        // Create blob and download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        // Create and trigger download
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification('Data exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Failed to export data: ' + error.message, 'error');
    }
}

// Load CSV file - updated to remove table references
async function loadCSVFile(file) {
    try {
        // Show loading indicator
        document.getElementById('loading-indicator').classList.remove('hidden');
        
        console.log("Loading CSV file:", file.name);
        
        // Parse CSV
        const rawData = await parseCSV(file);
        
        // Process and validate data
        data = processData(rawData);
        
        if (data.length === 0) {
            throw new Error("No valid coordinates found in the file.");
        }
        
        // Display markers on map - in this case we DO want to fit bounds
        displayMarkers(true);
        
        // Show export button
        document.getElementById('export-btn').classList.remove('hidden');
        
        // Hide CSV format info - Modified to check if element exists first
        const csvFormatInfo = document.getElementById('csv-format-info');
        if (csvFormatInfo) {
            csvFormatInfo.style.display = 'none';
        }
        
        // Show success message
        showNotification('Data loaded successfully', 'success', 2000);
        
    } catch (error) {
        console.error("Error loading CSV:", error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Hide loading indicator
        document.getElementById('loading-indicator').classList.add('hidden');
    }
}

// Modified notification function with duration parameter
function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    
    // Auto hide after specified duration
    setTimeout(() => {
        notification.classList.add('hidden');
    }, duration);
}

// Add hurricane category legend to the map - updated with unit system
function addCategoryLegend() {
    // Create legend div if it doesn't exist
    let legendDiv = document.getElementById('hurricane-legend');
    if (!legendDiv) {
        legendDiv = document.createElement('div');
        legendDiv.id = 'hurricane-legend';
        legendDiv.className = 'leaflet-control';
        document.querySelector('.leaflet-bottom.leaflet-right').appendChild(legendDiv);
    }
    
    // Clear existing content
    legendDiv.innerHTML = '';
    
    const scale = getIntensityScale();
    const scaleName = currentScale === 'saffir-simpson' ? 'Saffir-Simpson' : 'Australian BoM';
    
    // Add unit to the title based on current unit system
    const windUnit = unitSystem === 'metric' ? 'm/s' : 'mph';
    legendDiv.innerHTML = `<h4>${scaleName} Scale (${windUnit})</h4>`;
    
    // Find the threshold for the highest category
    let cat5Threshold = 0;
    for (let i = 0; i < scale.length; i++) {
        if (scale[i].maxWind === Infinity && i > 0) {
            cat5Threshold = scale[i-1].maxWind;
            break;
        }
    }
    
    // Add each category
    scale.forEach((category, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        
        const colorBox = document.createElement('span');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = category.color;
        item.appendChild(colorBox);
        
        // Show wind speeds in the appropriate units
        let displayMaxWind = category.maxWind;
        if (unitSystem === 'imperial') {
            displayMaxWind = displayMaxWind * UNIT_CONVERSIONS.WIND_MS_TO_MPH;
        }
        
        // Get threshold value for highest category
        let thresholdValue = cat5Threshold;
        if (unitSystem === 'imperial') {
            thresholdValue = thresholdValue * UNIT_CONVERSIONS.WIND_MS_TO_MPH;
        }
        
        const label = document.createElement('span');
        // Show wind speed for each category - now with >= for Category 5
        if (category.maxWind === Infinity) {
            label.textContent = `${category.name} (≥${Math.round(thresholdValue)})`;
        } else {
            label.textContent = `${category.name} (≤${Math.round(displayMaxWind)})`;
        }
        item.appendChild(label);
        
        legendDiv.appendChild(item);
    });
}

// Ensure document layout is optimal after loading
document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    initializeMap();
    
    // Setup fullscreen handler
    setupFullscreenHandler();
    
    // Add hurricane category legend
    addCategoryLegend();
    
    // Ensure map fills available space
    adjustMapSize();
    
    // Set initial mode status text based on editMode value
    const modeStatus = document.getElementById('mode-status');
    if (modeStatus) {
        modeStatus.textContent = editMode ? 'Edit Cyclone Parameters' : 'Move Cyclone Position';
        modeStatus.className = editMode ? 'edit-mode' : 'view-mode';
    }
    
    // Make unit system and conversion factors available globally for popup templates
    window.unitSystem = unitSystem;
    window.UNIT_CONVERSIONS = UNIT_CONVERSIONS;
    window.NM_TO_KM = NM_TO_KM;
    
    // Add resize handler
    window.addEventListener('resize', adjustMapSize);
    
    // File input direct handling
    const csvFileInput = document.getElementById('csv-file');
    if (csvFileInput) {
        csvFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                loadCSVFile(this.files[0]);
            }
        });
    } else {
        console.error("Element 'csv-file' not found in the DOM");
    }
    
    // File upload button (as backup)
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            const fileInput = document.getElementById('csv-file');
            if (fileInput && fileInput.files.length > 0) {
                loadCSVFile(fileInput.files[0]);
            } else {
                showNotification('Please select a CSV file first.', 'warning');
            }
        });
    }
    
    // Toggle edit mode button
    const toggleEditModeBtn = document.getElementById('toggle-edit-mode');
    if (toggleEditModeBtn) {
        toggleEditModeBtn.addEventListener('click', toggleEditMode);
    }
    
    // Update point button
    const updatePointBtn = document.getElementById('update-point-btn');
    if (updatePointBtn) {
        updatePointBtn.addEventListener('click', function() {
            if (selectedPoint !== null) {
                const editLat = document.getElementById('edit-lat');
                const editLng = document.getElementById('edit-lng');
                
                if (!editLat || !editLng) {
                    console.error("Edit coordinate inputs not found");
                    return;
                }
                
                const lat = parseFloat(editLat.value);
                const lng = parseFloat(editLng.value);
                
                if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
                    showNotification('Please enter valid coordinates.', 'warning');
                    return;
                }
                
                // Update data
                data[selectedPoint].latitude = lat;
                data[selectedPoint].longitude = lng;
                
                // Update marker position
                markers[selectedPoint].setLatLng([lat, lng]);
                
                // Update table if table-container exists
                const tableContainer = document.getElementById('table-container');
                if (tableContainer) {
                    createTable(data, 'table-container');
                }
                
                showNotification('Point updated successfully.', 'success');
            }
        });
    }
    
    // Export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }
    
    // Point selector change
    const pointSelect = document.getElementById('point-select');
    if (pointSelect) {
        pointSelect.addEventListener('change', function() {
            selectPoint(parseInt(this.value));
        });
    } else {
        console.warn("Element 'point-select' not found - this might be expected if the selector is created dynamically later");
    }
    
    // Enable drag and drop for CSV files and shapefiles
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            dropZone.classList.add('highlight');
        }
        
        function unhighlight() {
            dropZone.classList.remove('highlight');
        }
        
        // Enhanced unified drop handler for both CSV and shapefile types
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length === 0) return;
            
            // Check for shapefile types first
            let hasShapefileTypes = false;
            for (let i = 0; i < files.length; i++) {
                const fileName = files[i].name.toLowerCase();
                if (fileName.endsWith('.shp') || fileName.endsWith('.dbf') || 
                    fileName.endsWith('.prj') || fileName.endsWith('.zip')) {
                    hasShapefileTypes = true;
                    break;
                }
            }
            
            // Handle file type accordingly
            if (hasShapefileTypes) {
                // Update loading count
                shapefileCount = files.length;
                updateLoadingCount(shapefileCount);
                
                // Process shapefile
                loadShapefile(files);
            } else if (files[0].type === 'text/csv' || files[0].name.toLowerCase().endsWith('.csv')) {
                // Handle CSV file
                document.getElementById('csv-file').files = dt.files;
                loadCSVFile(files[0]);
            } else {
                showNotification('Please drop a valid CSV or shapefile', 'warning');
            }
            
            // Remove highlight regardless of file type
            dropZone.classList.remove('highlight');
        });
    }
    
    // Add event handler for update-storm-btn if it exists
    const updateStormBtn = document.getElementById('update-storm-btn');
    if (updateStormBtn) {
        updateStormBtn.addEventListener('click', function() {
            if (selectedPoint !== null) {
                const stormAttrs = ['rmw', 'r34_ne', 'r34_se', 'r34_sw', 'r34_nw', 'roci'];
                
                // Update data from form inputs
                stormAttrs.forEach(attr => {
                    const input = document.getElementById(`edit-${attr}`);
                    if (input) {
                        data[selectedPoint][attr] = parseInt(input.value) || 0;
                    }
                });
                
                // Redraw the visualization
                clearStormVisualizations(selectedPoint);
                displayStormAttributes(selectedPoint);
                
                showNotification('Storm attributes updated successfully.', 'success');
            }
        });
    }
    
    // Handle document clicks to close floating dialog when clicking outside
    document.addEventListener('click', function(e) {
        if (floatingDialog) {
            // Check if click is outside the dialog
            if (!floatingDialog.element.contains(e.target) && !e.target.closest('.leaflet-marker-icon')) {
                removeFloatingDialog();
                resetPointAppearance();
            }
        }
    });
    
    // Add debug message to confirm initialization completed
    console.log("DOM fully loaded and all event listeners attached");

    // Add event listener for units toggle button - with debugging
    const toggleUnitsBtn = document.getElementById('toggle-units');
    if (toggleUnitsBtn) {
        console.log("Found toggle units button:", toggleUnitsBtn);
        toggleUnitsBtn.addEventListener('click', function() {
            console.log("Units button clicked");
            toggleUnits();
        });
    } else {
        console.error("Could not find toggle-units button!");
    }

    // Set up scale selector
    const scaleSelect = document.getElementById('scale-select');
    if (scaleSelect) {
        // Set initial selected value based on current scale
        scaleSelect.value = currentScale;
        
        // Add event listener
        scaleSelect.addEventListener('change', function() {
            currentScale = this.value;
            
            // Update all markers to reflect new scale
            displayMarkers();
            
            // Update hurricane legend
            addCategoryLegend();
            
            // Show feedback to user
            const scaleName = currentScale === 'saffir-simpson' ? 'Saffir-Simpson' : 'Australian BoM';
            showNotification(`Switched to ${scaleName} scale`, 'info', 1500);
        });
    }

    // Set up shapefile input handling
    const shapefileInput = document.getElementById('shapefile-input');
    if (shapefileInput) {
        shapefileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                // Update loading count
                shapefileCount = this.files.length;
                updateLoadingCount(shapefileCount);
                
                // Process files
                loadShapefile(this.files);
            }
        });
    }
    
    // Shapefile upload button
    const shapefileBtn = document.getElementById('shapefile-btn');
    if (shapefileBtn) {
        shapefileBtn.addEventListener('click', function() {
            const input = document.getElementById('shapefile-input');
            if (input) {
                input.click(); // Trigger file input dialog
            }
        });
    }
});

// Make sure the map fills the available space - updated without bottom panel
function adjustMapSize() {
    const mapContainer = document.getElementById('map-container');
    const header = document.querySelector('header');
    
    if (!mapContainer || !header) return;
    
    const availableHeight = window.innerHeight - header.offsetHeight - 24; // Account for margins/padding
    mapContainer.style.height = `${availableHeight}px`;
    
    // Resize map to ensure it renders correctly
    if (map) {
        map.invalidateSize();
    }
}

// Function to toggle between metric and imperial units
function toggleUnits() {
    console.log("Toggle units called");
    unitSystem = unitSystem === 'metric' ? 'imperial' : 'metric';
    console.log(`Switched to ${unitSystem} units`);
    
    // Immediately update window.unitSystem so popup template can access it
    window.unitSystem = unitSystem;
    
    // Update UI elements to reflect new unit system
    updateAllDisplayedUnits();
    
    // Show feedback to user
    const unitName = unitSystem === 'metric' ? 'Metric' : 'Imperial';
    showNotification(`Switched to ${unitName} units`, 'info', 1500);
}

// Update all displayed units across the application
function updateAllDisplayedUnits() {
    // Update the map legend title
    updateMapLegendUnits();
    
    // Update hurricane legend to show correct wind speed units
    addCategoryLegend();
    
    // Update marker popups if any are open
    updateOpenPopups();
    
    // Update floating dialog if it exists
    if (floatingDialog) {
        // Re-create the dialog with updated units
        const currentPointIndex = floatingDialog.pointIndex;
        removeFloatingDialog();
        createFloatingDialog(currentPointIndex);
    }
    
    // Update any other displayed values
    updateDisplayedValues();
}

// Update the map legend title with the current units
function updateMapLegendUnits() {
    const legendTitle = document.querySelector('.map-legend .legend-title');
    if (legendTitle) {
        const unitLabel = unitSystem === 'metric' ? 'km' : 'mi';
        legendTitle.textContent = `Storm Size (${unitLabel})`;
    }
}

// Update any open popups with new unit system
function updateOpenPopups() {
    console.log("Updating open popups to use", unitSystem, "units");
    
    // Force update window.unitSystem to ensure popup template has access
    window.unitSystem = unitSystem;
    
    // Update any visible popups by completely regenerating their content
    markers.forEach(marker => {
        if (marker._popup && marker._popup.isOpen()) {
            const pointIndex = marker.pointIndex;
            
            // Generate completely fresh popup content with current unit system
            const content = window.formatPopupContent ? 
                window.formatPopupContent(data[pointIndex], pointIndex) :
                `<div class="popup-content">Point ${pointIndex}</div>`;
            
            // Update popup content
            marker._popup.setContent(content);
            
            console.log(`Updated popup content for point ${pointIndex} with ${unitSystem} units`);
        }
    });
}

// Update any other displayed values - now checks for specific UI elements
function updateDisplayedValues() {
    // Update storm size legend title with correct units
    const mapLegend = document.querySelector('.map-legend');
    if (mapLegend) {
        const legendTitle = mapLegend.querySelector('.legend-title');
        if (legendTitle) {
            const unitLabel = unitSystem === 'metric' ? 'km' : 'mi';
            legendTitle.textContent = `Storm Size (${unitLabel})`;
        }
    }
    
    // Check for other UI elements that might need updating...
    // (Future UI elements can be updated here)
}

// Updated function to convert and format distance for display
function formatDistance(valueInMeters, decimals = 0) {
    if (unitSystem === 'metric') {
        // Convert meters to kilometers
        return formatNumber(valueInMeters / 1000, decimals) + ' km';
    } else {
        // Convert meters to miles
        return formatNumber((valueInMeters / 1000) * UNIT_CONVERSIONS.KM_TO_MILES, decimals) + ' mi';
    }
}

// Updated function to convert and format wind speed for display
function formatWindSpeed(speedInMS, decimals = 1) {
    if (unitSystem === 'metric') {
        return formatNumber(speedInMS, decimals) + ' m/s';
    } else {
        // Convert m/s to mph
        return formatNumber(speedInMS * UNIT_CONVERSIONS.WIND_MS_TO_MPH, decimals) + ' mph';
    }
}

// Convert nautical miles to display units (km or miles)
function nmToDisplayUnits(valueNM, decimals = 0) {
    if (unitSystem === 'metric') {
        // Convert NM to km
        return formatNumber(valueNM * NM_TO_KM, decimals);
    } else {
        // Convert NM to miles
        return formatNumber(valueNM * UNIT_CONVERSIONS.NM_TO_MILES, decimals);
    }
}

// Updated nmToKmForDisplay function to respect unit system
function nmToKmForDisplay(valueNM, decimals = 0) {
    if (unitSystem === 'metric') {
        return formatNumber(valueNM * NM_TO_KM, decimals) + ' km';
    } else {
        return formatNumber(valueNM * UNIT_CONVERSIONS.NM_TO_MILES, decimals) + ' mi';
    }
}

// Create star icon for shapefile points
function createStarIcon() {
    return L.divIcon({
        className: 'star-marker',
        html: '★',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// Load and process shapefile - Updated with improved format handling
async function loadShapefile(files) {
    try {
        // Show loading indicator
        const uploadElement = document.querySelector('.shapefile-upload');
        uploadElement.classList.add('loading');
        
        // Reset counter if no count indicator exists
        if (!document.querySelector('.loading-count')) {
            shapefileCount = 0;
        }
        
        // Show loading notification
        showNotification('Processing spatial data...', 'info');
        
        // Find files by extension
        let shpFile = null;
        let dbfFile = null;
        let prjFile = null;
        let zipFile = null;
        let geoJsonFile = null;
        let kmlFile = null;
        
        // Check for various file types
        for (const file of files) {
            const fileName = file.name.toLowerCase();
            console.log("Processing file:", fileName);
            
            if (fileName.endsWith('.shp')) {
                shpFile = file;
            } else if (fileName.endsWith('.dbf')) {
                dbfFile = file;
            } else if (fileName.endsWith('.prj')) {
                prjFile = file;
            } else if (fileName.endsWith('.zip')) {
                zipFile = file;
            } else if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
                geoJsonFile = file;
            } else if (fileName.endsWith('.kml')) {
                kmlFile = file;
            }
        }
        
        let geojson = null;
        
        // Process based on available file types
        if (geoJsonFile) {
            // Handle GeoJSON directly
            console.log("Processing GeoJSON file:", geoJsonFile.name);
            const jsonText = await readFileAsText(geoJsonFile);
            try {
                geojson = JSON.parse(jsonText);
                console.log("Successfully parsed GeoJSON");
            } catch (e) {
                console.error("Error parsing GeoJSON:", e);
                throw new Error("Invalid GeoJSON file format");
            }
        } 
        else if (kmlFile) {
            // For KML files - convert to GeoJSON using a simple approach
            // Note: This is a simplified KML parser that works for basic point data
            // For complex KML, a proper library would be better
            console.log("Processing KML file:", kmlFile.name);
            const kmlText = await readFileAsText(kmlFile);
            geojson = kmlToGeoJSON(kmlText);
        }
        else if (zipFile) {
            // Handle zip file containing shapefile
            console.log("Processing ZIP file:", zipFile.name);
            const zipBuffer = await readFileAsArrayBuffer(zipFile);
            geojson = await shp.parseZip(zipBuffer);
        } 
        else if (shpFile) {
            // Handle individual shp file, optionally with dbf
            console.log("Processing SHP file:", shpFile.name);
            const shpBuffer = await readFileAsArrayBuffer(shpFile);
            geojson = await shp.parseShp(shpBuffer);
            
            // If we have a DBF file, add attributes to the features
            if (dbfFile) {
                console.log("Processing DBF file:", dbfFile.name);
                const dbfBuffer = await readFileAsArrayBuffer(dbfFile);
                const dbfData = await shp.parseDbf(dbfBuffer);
                
                console.log("DBF data structure:", 
                    dbfData && typeof dbfData === 'object' ? Object.keys(dbfData) : 'unexpected format');
                
                // Attempt to merge DBF attributes with SHP geometry
                if (geojson.features && dbfData.features) {
                    // Standard case
                    geojson.features.forEach((feature, i) => {
                        if (i < dbfData.features.length) {
                            feature.properties = dbfData.features[i].properties;
                        }
                    });
                } else if (dbfData && Array.isArray(geojson)) {
                    // Special case: SHP is array but DBF has different structure
                    console.log("Special case: SHP is array but DBF has different structure");
                    
                    // If DBF has records directly
                    if (dbfData.records && Array.isArray(dbfData.records)) {
                        geojson.forEach((feature, i) => {
                            if (i < dbfData.records.length) {
                                if (!feature.properties) feature.properties = {};
                                Object.assign(feature.properties, dbfData.records[i]);
                            }
                        });
                    }
                }
            }
            
            // If we have a PRJ file, we could use it for reprojection
            if (prjFile) {
                // Just read and log for now - projection is usually handled by Leaflet
                const prjText = await readFileAsText(prjFile);
                console.log("Projection information detected");
            }
        } else {
            throw new Error("No compatible spatial files found. Please upload a shapefile (.shp, .zip), GeoJSON (.geojson, .json), or KML (.kml) file.");
        }
        
        // Debug the output structure
        if (geojson) {
            console.log("GeoJSON structure type:", typeof geojson);
            if (Array.isArray(geojson)) {
                console.log("GeoJSON is an array with", geojson.length, "items");
            } else if (typeof geojson === 'object') {
                console.log("GeoJSON object keys:", Object.keys(geojson));
            }
        } else {
            throw new Error("Failed to parse spatial data - no valid GeoJSON structure created");
        }
        
        // Process and display the GeoJSON
        displayShapefilePoints(geojson);
        
    } catch (error) {
        console.error("Error processing spatial data:", error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Hide loading indicator
        document.querySelector('.shapefile-upload').classList.remove('loading');
        
        // Remove loading count if it exists
        const countElement = document.querySelector('.loading-count');
        if (countElement) {
            countElement.remove();
        }
    }
}

// Simple KML to GeoJSON converter for point data
function kmlToGeoJSON(kmlString) {
    try {
        // Create a DOM parser to process the KML
        const parser = new DOMParser();
        const kml = parser.parseFromString(kmlString, 'text/xml');
        
        // Check if it's a valid KML file
        if (kml.documentElement.nodeName === "parsererror") {
            throw new Error("Invalid KML file");
        }
        
        // Create a GeoJSON FeatureCollection
        const geojson = {
            type: "FeatureCollection",
            features: []
        };
        
        // Process placemarks (points in KML)
        const placemarks = kml.getElementsByTagName('Placemark');
        console.log(`Found ${placemarks.length} placemarks in KML`);
        
        for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            
            // Get name and description
            const name = placemark.querySelector('name')?.textContent || `Point ${i+1}`;
            const description = placemark.querySelector('description')?.textContent || '';
            
            // Get coordinates from Point geometry
            const point = placemark.querySelector('Point');
            if (point) {
                const coordinatesText = point.querySelector('coordinates')?.textContent;
                if (coordinatesText) {
                    // KML format is lon,lat,alt - we need to parse and convert to [lon,lat]
                    const parts = coordinatesText.trim().split(',');
                    if (parts.length >= 2) {
                        const lon = parseFloat(parts[0]);
                        const lat = parseFloat(parts[1]);
                        
                        // Create a GeoJSON feature for this point
                        const feature = {
                            type: "Feature",
                            geometry: {
                                type: "Point",
                                coordinates: [lon, lat]
                            },
                            properties: {
                                name: name,
                                description: description
                            }
                        };
                        
                        // Add any extended data as properties
                        const extendedData = placemark.querySelector('ExtendedData');
                        if (extendedData) {
                            const dataElements = extendedData.querySelectorAll('Data');
                            dataElements.forEach(data => {
                                const key = data.getAttribute('name');
                                const value = data.querySelector('value')?.textContent;
                                if (key && value) {
                                    feature.properties[key] = value;
                                }
                            });
                        }
                        
                        geojson.features.push(feature);
                    }
                }
            }
        }
        
        console.log(`Converted ${geojson.features.length} KML points to GeoJSON`);
        return geojson;
    } catch (error) {
        console.error("Error converting KML to GeoJSON:", error);
        throw new Error("Failed to parse KML file: " + error.message);
    }
}

// Read file as array buffer (for binary files)
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
    });
}

// Read file as text (for projection files)
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
}

// Display shapefile points on the map - improved version
function displayShapefilePoints(geojson) {
    // Clear existing shapefile points first
    clearShapefilePoints();
    
    // Create layer group if it doesn't exist already
    if (!shapefileLayerGroup) {
        shapefileLayerGroup = L.layerGroup().addTo(map);
    }
    
    // Create star icon once to reuse
    const starIcon = createStarIcon();
    
    // Count of points added
    let pointCount = 0;
    
    // Enhanced function to process a feature collection or array of features
    function processFeatureCollection(features) {
        console.log("Processing", features.length, "features");
        
        features.forEach((feature, index) => {
            // Skip if no geometry at all
            if (!feature || !feature.geometry) {
                console.log(`Feature ${index} has no geometry`);
                
                // Special case: if feature has coordinates directly but no geometry
                if (feature.coordinates && Array.isArray(feature.coordinates)) {
                    console.log(`Feature ${index} has direct coordinates`);
                    addPointToMap(feature.coordinates, feature.properties || {});
                    pointCount++;
                    return;
                }
                
                return;
            }
            
            // Get type, handling both standard GeoJSON and direct properties
            const geomType = feature.geometry.type || 
                            (feature.type === 'Feature' ? null : feature.type);
            
            console.log(`Feature ${index} type:`, geomType);
            
            // Process based on geometry type
            if (geomType === 'Point') {
                // Get coordinates, handling both standard GeoJSON and direct properties
                const coords = feature.geometry.coordinates || feature.coordinates;
                if (coords && Array.isArray(coords)) {
                    addPointToMap(coords, feature.properties || {});
                    pointCount++;
                } else {
                    console.log(`Feature ${index} has invalid coordinates:`, coords);
                }
            } 
            else if (geomType === 'MultiPoint') {
                const coords = feature.geometry.coordinates || feature.coordinates;
                if (coords && Array.isArray(coords)) {
                    coords.forEach(coord => {
                        if (coord && Array.isArray(coord)) {
                            addPointToMap(coord, feature.properties || {});
                            pointCount++;
                        }
                    });
                }
            }
            // For non-point geometries, check if they have a centroid property that can be displayed
            else if (feature.properties && (feature.properties.centroid_x || feature.properties.x_cent)) {
                const x = feature.properties.centroid_x || feature.properties.x_cent;
                const y = feature.properties.centroid_y || feature.properties.y_cent;
                if (x !== undefined && y !== undefined) {
                    addPointToMap([x, y], feature.properties);
                    pointCount++;
                }
            }
        });
    }
    
    // Helper function to add a point to the map with coordinate validation
    function addPointToMap(coords, properties) {
        // Sanity check the coordinates
        if (!coords || !Array.isArray(coords) || coords.length < 2) {
            console.log("Invalid coordinates:", coords);
            return;
        }
        
        // Check which coordinate is likely latitude vs longitude
        let lat, lon;
        
        // Standard GeoJSON is [longitude, latitude], but some files might be [latitude, longitude]
        if (coords[0] >= -180 && coords[0] <= 180 && coords[1] >= -90 && coords[1] <= 90) {
            // Likely [longitude, latitude] format (GeoJSON standard)
            lon = coords[0];
            lat = coords[1];
        } else if (coords[1] >= -180 && coords[1] <= 180 && coords[0] >= -90 && coords[0] <= 90) {
            // Likely [latitude, longitude] format (non-standard)
            lat = coords[0];
            lon = coords[1];
        } else {
            // If still not clear, assume GeoJSON standard [longitude, latitude]
            lon = coords[0];
            lat = coords[1];
            
            // Log this case to help debug
            console.log("Unusual coordinates:", coords, "- assuming [lon, lat]");
        }
        
        // Extra check for valid latitude/longitude (reject extreme values)
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            console.log("Coordinates out of range - skipping:", coords);
            return;
        }
        
        try {
            // Create marker with star icon
            const marker = L.marker([lat, lon], {
                icon: starIcon,
                title: getPointTitle(properties)
            });
            
            // Add popup with properties
            if (properties) {
                marker.bindPopup(createShapefilePopup(properties), {
                    className: 'shapefile-popup',
                    maxWidth: 300
                });
            }
            
            // Add to layer group
            marker.addTo(shapefileLayerGroup);
            
            // Store reference
            shapefilePoints.push(marker);
        } catch (e) {
            console.error("Error adding marker at", [lat, lon], ":", e.message);
        }
    }
    
    // Get a title for the point from properties
    function getPointTitle(properties) {
        if (!properties) return "Shapefile Point";
        
        // Expanded list of common name fields
        const nameFields = [
            'name', 'NAME', 'Name', 'title', 'TITLE', 'Title', 'id', 'ID', 
            'label', 'LABEL', 'station', 'STATION', 'site', 'SITE', 
            'description', 'DESC', 'identifier', 'loc', 'location'
        ];
        
        for (const field of nameFields) {
            if (properties[field]) return properties[field];
        }
        
        // Fallback to first property
        const firstKey = Object.keys(properties)[0];
        if (firstKey) return `${firstKey}: ${properties[firstKey]}`;
        
        return "Shapefile Point";
    }
    
    // Process various GeoJSON structure possibilities
    console.log("Starting to process GeoJSON structure");
    
    // Case 1: Standard GeoJSON FeatureCollection
    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        console.log("Processing standard FeatureCollection with", geojson.features.length, "features");
        processFeatureCollection(geojson.features);
    } 
    // Case 2: Array of GeoJSON Feature objects
    else if (Array.isArray(geojson) && geojson.length > 0) {
        console.log("Processing array of", geojson.length, "items");
        
        // Check if the items are feature collections
        if (geojson[0].type === 'FeatureCollection' && Array.isArray(geojson[0].features)) {
            geojson.forEach((collection, i) => {
                console.log(`Processing collection ${i} with`, 
                    collection.features ? collection.features.length : 0, "features");
                if (collection.features) {
                    processFeatureCollection(collection.features);
                }
            });
        }
        // Check if the items are direct features with geometries
        else if (geojson[0].geometry || geojson[0].type === 'Feature') {
            console.log("Processing array of Feature objects");
            processFeatureCollection(geojson);
        }
        // Check if array contains direct geometry objects
        else if (geojson[0].type === 'Point' || geojson[0].type === 'MultiPoint') {
            console.log("Processing array of direct geometry objects");
            processFeatureCollection(geojson);
        }
        // Last resort - try to add any array items that have coordinates
        else {
            console.log("Treating array items as potential points");
            geojson.forEach((item, i) => {
                if (item.coordinates && Array.isArray(item.coordinates)) {
                    addPointToMap(item.coordinates, item.properties || {});
                    pointCount++;
                } else if (Array.isArray(item) && item.length >= 2) {
                    // The item itself might be a coordinate pair
                    addPointToMap(item, {});
                    pointCount++;
                }
            });
        }
    }
    // Case 3: Single GeoJSON Feature 
    else if (geojson.type === 'Feature' && geojson.geometry) {
        console.log("Processing single Feature");
        processFeatureCollection([geojson]);
    }
    // Case 4: Direct geometry object
    else if (geojson.type === 'Point' || geojson.type === 'MultiPoint') {
        console.log("Processing direct geometry object");
        processFeatureCollection([geojson]);
    }
    // Case 5: Unknown structure but possibly with coordinates
    else if (geojson.coordinates && Array.isArray(geojson.coordinates)) {
        console.log("Processing object with direct coordinates");
        addPointToMap(geojson.coordinates, geojson.properties || {});
        pointCount++;
    }
    else {
        console.log("Unknown GeoJSON structure:", Object.keys(geojson));
    }
    
    console.log("Finished processing - found", pointCount, "points");
    
    // If points were added, fit the map to include them
    if (pointCount > 0) {
        // Create a group with both cyclone markers and shapefile points for bounds
        const allVisibleLayers = [];
        
        // Add shapefile points first so they're not hidden behind cyclone markers
        if (shapefilePoints.length > 0) {
            allVisibleLayers.push(...shapefilePoints);
        }
        
        // Add marker layers if they exist
        if (markers.length > 0) {
            allVisibleLayers.push(...markers);
        }
        
        // If we have visible layers, fit bounds
        if (allVisibleLayers.length > 0) {
            const group = L.featureGroup(allVisibleLayers);
            map.fitBounds(group.getBounds(), {
                padding: [50, 50] // Add padding around bounds
            });
        }
        
        // Show success notification
        showNotification(`Successfully loaded ${pointCount} shapefile points`, 'success', 3000);
    } else {
        showNotification('No point features found in shapefile - check console for details', 'warning');
    }
}

// Create popup content for shapefile points
function createShapefilePopup(properties) {
    let content = `<div class="popup-content">
        <div class="popup-header" style="background-color:rgba(255, 221, 0, 0.2); border-color:#ffdd00">
            <strong>Shapefile Point</strong>
        </div>
        <div class="popup-metrics">`;
    
    // Display all properties in a nicely formatted way
    for (const [key, value] of Object.entries(properties)) {
        if (value !== null && value !== undefined) {
            // Format different types of values appropriately
            let displayValue = value;
            if (typeof value === 'number') {
                // Format numbers with appropriate precision
                displayValue = formatNumber(value, 
                    Number.isInteger(value) ? 0 : 2);
            } else if (typeof value === 'string' && value.length > 50) {
                // Truncate long strings
                displayValue = value.substring(0, 47) + '...';
            }
            
            content += `
            <div class="metric">
                <strong class="var-name">${key}:</strong> 
                <span class="var-value">${displayValue}</span>
            </div>`;
        }
    }
    
    content += `</div></div>`;
    return content;
}

// Clear shapefile points from the map
function clearShapefilePoints() {
    // Remove all points from the map
    if (shapefileLayerGroup) {
        shapefileLayerGroup.clearLayers();
    }
    
    // Clear array of references
    shapefilePoints = [];
}

// Update loading count indicator
function updateLoadingCount(count) {
    // Remove existing count element
    const existingCount = document.querySelector('.loading-count');
    if (existingCount) {
        existingCount.remove();
    }
    
    if (count > 0) {
        // Create new count element
        const countElement = document.createElement('div');
        countElement.className = 'loading-count';
        countElement.textContent = count;
        document.querySelector('.shapefile-upload').appendChild(countElement);
    }
}