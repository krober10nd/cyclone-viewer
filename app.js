// Global variables
let map;
let markers = [];
let data = [];
let editMode = false;
let selectedPoint = null;
let trackLine = null;
let stormCircles = {}; // Store visualizations for RMW, R34, ROCI
let floatingDialog = null;

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
        stormCircles[pointIndex].forEach(layer => {
            map.removeLayer(layer);
        });
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
    
    // Handle wind speed changes with unit awareness
    windSlider.oninput = function() {
        const value = parseFloat(this.value);
        // Update formatted display with correct units
        document.getElementById('formatted-wind_speed').textContent = formatWindSpeed(value);
        
        // Update gradient
        this.style.background = `linear-gradient(to right, ${windColor} 0%, ${windColor} ${value}%, #444 ${value}%, #444 100%)`;
        
        // Update data (always store in m/s internally)
        data[pointIndex].wind_speed = value;
    };
    
    windSlider.onchange = function() {
        const value = parseFloat(this.value);
        data[pointIndex].wind_speed = value;
        const newCategory = getHurricaneCategory(value);
        categoryBadge.textContent = newCategory.name;
        categoryBadge.style.backgroundColor = newCategory.color;
        displayMarkers();
    };
    
    // Handle pressure changes
    pressureSlider.oninput = function() {
        const value = parseInt(this.value);
        // Update formatted display
        document.getElementById('formatted-mslp').textContent = value + ' hPa';
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

// Modified marker creation with dynamic popup styling
function displayMarkers() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Clear all storm visualizations
    clearAllStormVisualizations();
    
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
                
                // Clear any existing visualizations
                clearAllStormVisualizations();
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
            marker.on('dragend', function(e) {
                updatePointLocation(index, e.target.getLatLng());
            });
        }
        
        // Add marker to map and to our array
        marker.addTo(map);
        markers.push(marker);
    });

    // Fit map bounds to show all markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds());
    }
    
    // Draw the track line connecting points
    displayTrackLine();
}

// Select a point for editing
function selectPoint(index) {
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
}

// Update point location
function updatePointLocation(index, latlng) {
    data[index].latitude = latlng.lat;
    data[index].longitude = latlng.lng;
    
    // Update data table
    createTable(data, 'table-container');
    
    // Update the track line
    displayTrackLine();
}

// Toggle edit mode - updated with more descriptive mode names
function toggleEditMode() {
    editMode = !editMode;
    
    // Remove floating dialog when toggling modes
    removeFloatingDialog();
    
    // Reset point appearance
    resetPointAppearance();
    
    // Clear all storm visualizations
    clearAllStormVisualizations();
    
    // Update UI
    const modeStatus = document.getElementById('mode-status');
    if (editMode) {
        modeStatus.textContent = 'Move Cyclone Position';  // Changed from 'Edit Cyclone Parameters'
        modeStatus.className = 'edit-mode';
    } else {
        modeStatus.textContent = 'Edit Cyclone Parameters'; // Changed from 'Move Cyclone Position'
        modeStatus.className = 'view-mode';
    }
    
    // Reload markers with new draggable status
    displayMarkers();
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
        
        // Display markers on map
        displayMarkers();
        
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
    
    // Add each category
    scale.forEach(category => {
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
        
        const label = document.createElement('span');
        // Show wind speed for each category except the highest which is infinite
        if (category.maxWind === Infinity) {
            label.textContent = `${category.name}`;
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
    
    // Enable drag and drop for CSV files
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
        
        dropZone.addEventListener('drop', handleDrop, false);
        
        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length > 0 && files[0].type === 'text/csv') {
                document.getElementById('csv-file').files = files;
                loadCSVFile(files[0]);
            } else {
                showNotification('Please drop a valid CSV file.', 'warning');
            }
        }
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