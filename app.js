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

// Add global variable for isochrones toggle state
let isochronesEnabled = true; // Default to enabled

// Add global variables for ADECK handling
let adeckStorms = null;
let adeckStormSelectionDialog = null;
let selectedStormId = null;
let currentModelName = null; // Track the currently displayed model name

// Add a global variable to track if the A-deck dialog was previously shown
let adeckDialogWasShown = false;

// Add a model description database
const MODEL_DESCRIPTIONS = {
    // Official Forecasts
    'OFCL': 'National Hurricane Center Official Forecast - The official human-produced forecast issued by NHC',
    'OFCI': 'National Hurricane Center Official Forecast (Interpolated) - Interpolated version of the OFCL forecast',
    'CARQ': 'CARQ/Best Track - Cyclone Analysis and Forecast Position data from NHC',
    'BEST': 'Official Best Track - Historical record of a tropical cyclone\'s location, maximum winds, central pressure, and size. Produced post-season after thorough analysis of all available data.',
    
    // Consensus Models
    'TVCN': 'Track Variable Consensus - Consensus of dynamical models (AVNO, ECMWF, UKMET, etc.)',
    'TVCE': 'Track Variable Consensus (Ensemble) - Consensus of ensemble runs from multiple models',
    'TVCX': 'Track Variable Consensus (No ECMWF) - Multi-model consensus excluding ECMWF',
    'GUNA': 'GUNA Consensus - AVNO/GFS, UKMET, and ECMWF model average',
    'GUNS': 'GUNS Consensus - AVNO/GFS, UKMET, and NOGAPS model average',
    'CONU': 'Consensus of U.S. Models - NHC consensus of American dynamical models',
    'HCCA': 'HCCA Consensus - Corrected consensus based on past model performance',
    
    // Major Dynamical Models
    'AVNO': 'GFS (AVN) Model - NCEP Global Forecast System, American global model',
    'AVNI': 'GFS (AVN) Model (Interpolated) - Interpolated version of the GFS',
    'GFS': 'Global Forecast System - NCEPs primary global model',
    'GFDI': 'GFDL Model (Interpolated) - Geophysical Fluid Dynamics Laboratory model',
    'GFDL': 'GFDL Model - High-resolution hurricane model developed by NOAA',
    'UKM': 'UKMET Model - The UK Meteorological Office global model',
    'UKMI': 'UKMET Model (Interpolated) - Interpolated version of the UKMET model',
    'CMC': 'Canadian Meteorological Centre Model - Environment Canadas global model',
    'ECMWF': 'European Centre for Medium-Range Weather Forecasts - European global model',
    'EMXI': 'ECMWF Model (Interpolated) - Interpolated version of the ECMWF model',
    'HWRF': 'Hurricane Weather Research and Forecasting - High-resolution hurricane-specific model',
    'HMON': 'Hurricane Multi-scale Ocean-coupled Non-hydrostatic model - NOAA hurricane model',
    'CTCX': 'COAMPS-TC Model - US Navys regional tropical cyclone model',
    'NVGM': 'Navy Global Model - U.S. Navys global forecast model, successor to NOGAPS',
    
    // Statistical Models
    'DSHP': 'SHIPS with Decay - Statistical hurricane intensity model with inland decay',
    'SHIP': 'SHIPS Model - Statistical Hurricane Intensity Prediction Scheme',
    'LGEM': 'Logistic Growth Equation Model - Statistical intensity model using storm data',
    
    // Trajectory Models
    'BAMD': 'Beta and Advection Model (Deep) - Simple trajectory model using deep-layer steering',
    'BAMM': 'Beta and Advection Model (Medium) - Simple trajectory model using medium-layer steering',
    'BAMS': 'Beta and Advection Model (Shallow) - Simple trajectory model using shallow-layer steering',
    'LBAR': 'Limited Area Barotropic Model - Simple dynamical model using single-level steering',
    'XTRP': 'Extrapolation - Simple linear extrapolation based on recent storm motion'
};

// Function to get model description
function getModelDescription(modelName) {
    return MODEL_DESCRIPTIONS[modelName] || `${modelName} - No description available`;
}

// Function to display isochrones (+1h, +2h, +3h, ..., +6h) when a point is clicked
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
    
    // Define colors for each hour isochrone - extended to 6 hours with a smooth progression
    const isochroneColors = [
        'rgba(100, 220, 255, 0.8)',  // +1h - Light blue
        'rgba(150, 220, 190, 0.8)',  // +2h - Teal blue
        'rgba(200, 220, 100, 0.8)',  // +3h - Yellow green
        'rgba(255, 200, 0, 0.8)',    // +4h - Orange/gold
        'rgba(255, 150, 50, 0.8)',   // +5h - Orange
        'rgba(255, 50, 50, 0.8)'     // +6h - Red
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
    
    // Draw isochrones for +1h through +6h
    [1, 2, 3, 4, 5, 6].forEach((hours, index) => {
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
            weight: 1.5 + (hours * 0.3), // Thicker lines for later hours, more gradual progression
            dashArray: '5, 5',
            opacity: 0.9,
            smoothFactor: 2,
            className: 'isochrone-line'
        }).addTo(map);
        
        // Add a label showing the hour - positioned at a point just above the midpoint
        const midPointIndex = Math.floor(isochronePoints.length / 2);
        const midPoint = isochronePoints[midPointIndex];
        
        // Calculate a position for the label that's slightly offset from the line
        // Use greater offset for later hours to prevent overlap
        const labelAngle = trajectory; // Use the trajectory angle for offset
        const labelOffsetKm = 5 + (hours > 3 ? hours - 3 : 0); // Increase offset for hours 4-6
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

// Function to toggle isochrones visibility
function toggleIsochrones() {
    isochronesEnabled = !isochronesEnabled;
    
    // Update button appearance
    const isochroneToggle = document.getElementById('toggle-isochrones');
    if (isochronesToggle) {
        if (isochronesEnabled) {
            isochroneToggle.classList.remove('disabled');
            isochroneToggle.title = "Hide isochrones";
        } else {
            isochroneToggle.classList.add('disabled');
            isochroneToggle.title = "Show isochrones";
        }
    }
    
    // If we have a selected point, update isochrones
    if (selectedPoint !== null) {
        if (isochronesEnabled) {
            // Use selectedPoint instead of selectedPointIndex
            showIsochrones(selectedPoint);
        } else {
            clearIsochrones();
        }
    }
    
    // Show a notification
    showNotification(
        isochronesEnabled ? "Isochrones enabled" : "Isochrones disabled", 
        "info", 
        1500
    );
}

/**
 * Toggle isochrones display on/off
 * @param {boolean} [force] - Optional boolean to force state (true=on, false=off)
 */
function isochronesToggle(force) {
    const isochromeLayer = window.isochroneLayer;
    const map = window.map;
    
    // If force parameter provided, set to that state
    const newState = force !== undefined ? force : !window.isochronesVisible;
    
    if (newState) {
        // Show isochrones
        if (isochromeLayer) {
            isochromeLayer.addTo(map);
        } else {
            // Create isochrone layer if it doesn't exist
            window.createIsochrones();
        }
        window.isochronesVisible = true;
        
        // Update any UI indicators
        const isoButton = document.querySelector('.isochrones-toggle');
        if (isoButton) {
            isoButton.classList.add('active');
        }
    } else {
        // Hide isochrones
        if (isochromeLayer) {
            map.removeLayer(isochromeLayer);
        }
        window.isochronesVisible = false;
        
        // Update any UI indicators
        const isoButton = document.querySelector('.isochrones-toggle');
        if (isoButton) {
            isoButton.classList.remove('active');
        }
    }
}

/**
 * Event handler for isochrones toggle button
 */
function toggleIsochrones() {
    isochronesToggle(); // This will toggle visibility
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

// Helper function to get timestamp from a track point
function getPointTimestamp(point) {
    // Check if we have the necessary UTC time fields
    if (point.year_utc !== undefined && 
        point.month_utc !== undefined && 
        point.day_utc !== undefined) {
        
        // Get hour and minute (default to 0 if not present)
        const hour = point.hour_utc !== undefined ? point.hour_utc : 0;
        const minute = point.minute_utc !== undefined ? point.minute_utc : 0;
        
        // Create Date object (months are 0-indexed in JavaScript)
        return new Date(Date.UTC(
            point.year_utc,
            point.month_utc - 1,
            point.day_utc,
            hour,
            minute
        ));
    }
    
    return null; // Return null if time data not available
}

// Calculate time difference between two points in hours
function getTimeDeltaHours(point1, point2) {
    const timestamp1 = getPointTimestamp(point1);
    const timestamp2 = getPointTimestamp(point2);
    
    if (timestamp1 && timestamp2) {
        // Calculate time difference in milliseconds and convert to hours
        const diffMs = Math.abs(timestamp2 - timestamp1);
        const diffHours = diffMs / (1000 * 60 * 60);
        
        // For debugging
        console.log(`Time difference: ${diffHours.toFixed(2)} hours`);
        
        // Ensure a minimum time difference to avoid division by zero
        return Math.max(diffHours, 0.5);
    }
    
    // Fall back to default if timestamps not available
    console.log("No timestamp data available, using default 3-hour interval");
    return 3.0; // Default 3-hour interval
}

// Updated helper function to estimate cyclone speed in km/hour using actual time deltas
function estimateSpeed(pointIndex) {
    // Default value if we can't calculate
    let speedKmPerHour = 15; // Typical tropical cyclone speed is 5-15 km/h
    
    // If we have adjacent points, calculate actual speed
    if (pointIndex > 0) {
        const currentPoint = data[pointIndex];
        const prevPoint = data[pointIndex - 1];
        
        // Calculate distance between points
        const distance = calculateDistanceKm(
            prevPoint.latitude, prevPoint.longitude,
            currentPoint.latitude, currentPoint.longitude
        );
        
        // Calculate actual time difference in hours
        const hours = getTimeDeltaHours(prevPoint, currentPoint);
        
        // Calculate speed in km/hour directly
        speedKmPerHour = distance / hours;
        
        // Ensure a minimum speed for visualization purposes
        if (speedKmPerHour < 5) {
            speedKmPerHour = 5;
        }
        
        console.log(`Distance between points: ${distance.toFixed(2)} km, time: ${hours.toFixed(2)} hours`);
    } else if (pointIndex < data.length - 1) {
        // If it's the first point, estimate using the next point instead
        const currentPoint = data[pointIndex];
        const nextPoint = data[pointIndex + 1];
        
        // Calculate distance to next point
        const distance = calculateDistanceKm(
            currentPoint.latitude, currentPoint.longitude,
            nextPoint.latitude, nextPoint.longitude
        );
        
        // Calculate actual time difference in hours
        const hours = getTimeDeltaHours(currentPoint, nextPoint);
        
        // Calculate speed in km/hour
        speedKmPerHour = distance / hours;
        
        // Ensure a minimum speed
        if (speedKmPerHour < 5) {
            speedKmPerHour = 5;
        }
        
        console.log(`First point - using next point. Distance: ${distance.toFixed(2)} km, time: ${hours.toFixed(2)} hours`);
    }
    
    console.log(`Estimated speed: ${speedKmPerHour.toFixed(2)} km/h`);
    return speedKmPerHour;
}

// Updated function to calculate translational speed using actual time deltas
function getTcspd(index) {
    // Default to a reasonable speed if calculation isn't possible
    let tcspd = 0;
    
    try {
        if (index > 0 && index < data.length - 1) {
            // Middle point - average speeds from previous and next
            const prevDistance = calculateDistanceKm(
                data[index-1].latitude, data[index-1].longitude,
                data[index].latitude, data[index].longitude
            );
            
            const nextDistance = calculateDistanceKm(
                data[index].latitude, data[index].longitude,
                data[index+1].latitude, data[index+1].longitude
            );
            
            // Get actual time intervals
            const prevHours = getTimeDeltaHours(data[index-1], data[index]);
            const nextHours = getTimeDeltaHours(data[index], data[index+1]);
            
            // Calculate speeds for each segment
            const prevSpeedKmh = prevDistance / prevHours;
            const nextSpeedKmh = nextDistance / nextHours;
            
            // Average the speeds
            const avgSpeedKmh = (prevSpeedKmh + nextSpeedKmh) / 2;
            
            // Convert to m/s (1 km/h = 1000/3600 m/s)
            tcspd = avgSpeedKmh * (1000 / 3600);
            
            console.log(`Point ${index} (middle): Tcspd = ${tcspd.toFixed(2)} m/s (${avgSpeedKmh.toFixed(2)} km/h)`);
        } 
        else if (index === 0 && data.length > 1) {
            // First point - use speed to next point
            const distance = calculateDistanceKm(
                data[0].latitude, data[0].longitude,
                data[1].latitude, data[1].longitude
            );
            
            // Get actual time interval
            const hours = getTimeDeltaHours(data[0], data[1]);
            
            // Convert to speed in km/h
            const speedKmh = distance / hours;
            
            // Convert to m/s
            tcspd = speedKmh * (1000 / 3600);
            
            console.log(`Point ${index} (first): Tcspd = ${tcspd.toFixed(2)} m/s (${speedKmh.toFixed(2)} km/h)`);
        }
        else if (index === data.length - 1 && data.length > 1) {
            // Last point - use speed from previous point
            const distance = calculateDistanceKm(
                data[index-1].latitude, data[index-1].longitude,
                data[index].latitude, data[index.longitude]
            );
            
            // Get actual time interval
            const hours = getTimeDeltaHours(data[index-1], data[index]);
            
            // Convert to speed in km/h
            const speedKmh = distance / hours;
            
            // Convert to m/s
            tcspd = speedKmh * (1000 / 3600);
            
            console.log(`Point ${index} (last): Tcspd = ${tcspd.toFixed(2)} m/s (${speedKmh.toFixed(2)} km/h)`);
        }
    } catch (error) {
        console.error(`Error calculating Tcspd for point ${index}:`, error);
    }
    
    return tcspd;
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
    
    // update this to return N/A if windSpeed is not a number
    //if (!windSpeed || isNaN(windSpeed)) return { name: "N/A", color: "#000000", radius: 0 }; // Default to N/A
    // make the color black 
    if (!windSpeed || isNaN(windSpeed)) return { name: "TRACK ONLY", color: "#000000", radius: 5 }; // Default to N/A
    //if (!windSpeed || isNaN(windSpeed)) return scale[0]; // Default to lowest category
    
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
    
    // Add zoom event handler to update A-deck symbology
    map.on('zoomend', function() {
        updateAdeckSymbology();
    });
    
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
    
    // Store dialog positions for all visible dialogs
    const dialogPositions = {};
    
    // Track floating dialog position if it exists
    if (floatingDialog) {
        const dialogEl = floatingDialog.element;
        dialogPositions.floatingDialog = {
            left: dialogEl.offsetLeft,
            top: dialogEl.offsetTop,
            width: dialogEl.offsetWidth
        };
    }
    
    // Track ADECK dialog position if it exists
    if (adeckStormSelectionDialog) {
        dialogPositions.adeckDialog = {
            left: adeckStormSelectionDialog.offsetLeft,
            top: adeckStormSelectionDialog.offsetTop,
            width: adeckStormSelectionDialog.offsetWidth
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
        
        // Reposition dialogs for fullscreen mode
        setTimeout(() => {
            if (floatingDialog) {
                repositionDialogForFullscreen(true, dialogPositions.floatingDialog, floatingDialog.element);
            }
            if (adeckStormSelectionDialog) {
                repositionDialogForFullscreen(true, dialogPositions.adeckDialog, adeckStormSelectionDialog);
            }
        }, 100);
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        // Reposition dialogs for normal mode
        setTimeout(() => {
            if (floatingDialog) {
                repositionDialogForFullscreen(false, dialogPositions.floatingDialog, floatingDialog.element);
            }
            if (adeckStormSelectionDialog) {
                repositionDialogForFullscreen(false, dialogPositions.adeckDialog, adeckStormSelectionDialog);
            }
        }, 100);
    }
}

// Reposition dialog when entering/exiting fullscreen
function repositionDialogForFullscreen(isFullscreen, oldPosition, dialogElement) {
    if (!dialogElement) return;
    
    const mapContainer = document.getElementById('map-container');
    const mapRect = mapContainer.getBoundingClientRect();
    
    if (isFullscreen) {
        // When entering fullscreen, position relative to viewport 
        // and ensure proper z-index to be visible in fullscreen mode
        dialogElement.style.position = 'fixed';
        dialogElement.style.zIndex = '10000'; // Very high z-index to be above fullscreen element
        
        // Use similar left/top positioning as before
        if (oldPosition) {
            // Use percentage-based positioning for better scaling in fullscreen
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const leftPercent = (oldPosition.left / viewportWidth) * 100;
            const topPercent = (oldPosition.top / viewportHeight) * 100;
            
            // Keep dialog within viewport bounds
            dialogElement.style.left = `${Math.min(Math.max(leftPercent, 0), 90)}%`;
            dialogElement.style.top = `${Math.min(Math.max(topPercent, 0), 80)}%`;
        } else {
            // Default position in fullscreen if no previous position
            dialogElement.style.left = '20px';
            dialogElement.style.top = '20px';
        }
    } else {
        // When exiting, restore previous position or calculate new one
        dialogElement.style.position = 'absolute';
        dialogElement.style.zIndex = '1000'; // Reset to normal z-index
        
        if (oldPosition) {
            dialogElement.style.left = oldPosition.left + 'px';
            dialogElement.style.top = oldPosition.top + 'px';
        } else {
            dialogElement.style.left = (mapRect.left + 20) + 'px';
            dialogElement.style.top = (mapRect.top + 20) + 'px';
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
            !document.msFullScreenElement) {
            // Exited fullscreen
            mapContainer.classList.remove('fullscreen-mode');
            // Resize the map to ensure it renders correctly
            map.invalidateSize();
            
            // Reposition dialogs if they exist
            if (floatingDialog) {
                repositionDialogForFullscreen(false, null, floatingDialog.element);
            }
            if (adeckStormSelectionDialog) {
                repositionDialogForFullscreen(false, null, adeckStormSelectionDialog);
            }
        } else {
            // Entered fullscreen
            // Resize the map to ensure it renders correctly
            map.invalidateSize();
            
            // Reposition dialogs for fullscreen mode
            if (floatingDialog) {
                repositionDialogForFullscreen(true, null, floatingDialog.element);
            }
            if (adeckStormSelectionDialog) {
                repositionDialogForFullscreen(true, null, adeckStormSelectionDialog);
            }
            
            // Ensure all dialogs have high enough z-index
            document.querySelectorAll('.storm-selection-dialog, #floating-dialog').forEach(dialog => {
                dialog.style.zIndex = '10000'; // High z-index for fullscreen visibility
            });
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

// Toggle dialog between minimized and expanded states
function toggleDialogMinimize(dialog) {
    if (dialog.classList.contains('minimized')) {
        // Expand the dialog
        dialog.classList.remove('minimized');
        dialog.querySelector('.dialog-content').style.display = 'block';
        dialog.querySelector('.minimize-btn').textContent = '_';
        dialog.querySelector('.minimize-btn').title = 'Minimize dialog';
        
        // Position in center when expanded
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.bottom = 'auto';
        dialog.style.right = 'auto';
        dialog.style.transform = 'translate(-50%, -50%)';
    } else {
        // Minimize the dialog
        dialog.classList.add('minimized');
        dialog.querySelector('.dialog-content').style.display = 'none';
        dialog.querySelector('.minimize-btn').textContent = '□';
        dialog.querySelector('.minimize-btn').title = 'Expand dialog';
        
        // Show selected model info if available
        const selectedModelInfo = dialog.querySelector('.selected-model-info');
        if (selectedModelInfo) {
            selectedModelInfo.classList.remove('hidden');
        }
        
        // Position at bottom left corner of map
        const mapContainer = document.getElementById('map-container');
        const mapRect = mapContainer.getBoundingClientRect();
        
        // Position at bottom left with padding
        dialog.style.top = 'auto';
        dialog.style.left = (mapRect.left + 10) + 'px';
        dialog.style.bottom = (window.innerHeight - mapRect.bottom + 10) + 'px';
        dialog.style.right = 'auto';
        dialog.style.transform = 'none';
    }
    
    // No need to change zoom - don't trigger fitBounds when minimizing/maximizing
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
    
    // Set appropriate z-index based on fullscreen state
    dialogContainer.style.zIndex = document.fullscreenElement ? '10000' : '1500';
    
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
    
    // Keep storm visualizations visible in "Edit Cyclone Parameters" mode (not edit mode),
    // but clear them in "Move Cyclone Position" mode (edit mode)
    if (editMode) {
        clearAllStormVisualizations();
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
        return "Not Specified";
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
// Modified marker creation with model-specific styling and fixed alignment
function displayMarkers(fitBounds = true, modelName = null) {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Clear all storm visualizations
    clearAllStormVisualizations();
    
    // Clear any isochrones when redisplaying markers
    clearIsochrones();
    
    // Remove existing track line if it exists
    if (trackLine) {
        map.removeLayer(trackLine);
        trackLine = null;
    }
    
    // Model-specific colors (add more as needed)
    const modelColors = {
        'AVNO': '#FF6B6B',  // GFS - red
        'HWRF': '#4D96FF',  // HWRF - blue
        'HMON': '#6BCB77',  // HMON - green
        'ECMF': '#FFD93D',  // ECMWF - yellow
        'UKMET': '#B983FF', // UKMET - purple
        'CMC': '#FF9F45',   // CMC - orange
        'NVGM': '#FF6B6B',  // NAVGEM - red
        'CTCX': '#4D96FF',  // COAMPS-TC - blue
        'OFCL': '#FFFFFF',  // Official - white
        'CARQ': '#FFFFFF',  // Best Track - white
        'BEST': '#FFFFFF',  // Best Track - white
        'default': '#00AAFF' // Default - light blue
    };
    
    // Get model color or use default
    const trackColor = modelName && modelColors[modelName] ? 
                       modelColors[modelName] : 
                       modelColors.default;
    
    // Create an array of latlng points for the track line
    const points = data.map(point => [point.latitude, point.longitude]);
    
    // Create track line FIRST so it appears below markers
    if (points.length > 0) {
        trackLine = L.polyline(points, {
            color: trackColor,
            weight: 3,
            opacity: 0.8,
            lineJoin: 'round',
            className: 'cyclone-track',
            dashArray: modelName === 'OFCL' || modelName === 'CARQ' || modelName === 'BEST' ? '' : '5, 5'
        }).addTo(map);
    }
    
    // Add new markers
    data.forEach((point, index) => {
        // Determine hurricane category based on wind speed
        const category = getHurricaneCategory(point.wind_speed);
        
        // Use model color if available, otherwise use category color
        const markerColor = modelName ? trackColor : category.color;
        
        // Create custom icon based on hurricane category or model
        const iconSize = index === 0 ? (category.radius * 2) + 2 : category.radius * 2;
        const icon = L.divIcon({
            className: `hurricane-marker category-${category.name.toLowerCase().replace(/\s+/g, '-')} ${index === 0 ? 'first-point' : ''}`,
            iconSize: [iconSize, iconSize],
            html: `<div style="background-color: ${markerColor}; width: 100%; height: 100%; border-radius: 50%; 
                  ${index === 0 ? 'border: 2px solid #FFFFFF;' : ''}" 
                  class="${index === 0 ? 'first-point-marker' : ''}"></div>`,
            iconAnchor: [iconSize/2, iconSize/2] // Ensure centered anchor point
        });
        
        const marker = L.marker([point.latitude, point.longitude], {
            draggable: editMode,
            title: modelName ? `${modelName} - Point ${index}` : `Point ${index} - ${category.name}`,
            id: point.id,
            icon: icon,
            zIndexOffset: index === 0 ? 1000 : 0 // Ensure first point is on top
        });
        
        // Store the point index directly on the marker for reference
        marker.pointIndex = index;
        
        // Apply special styling to the first point in the track
        if (index === 0) {
            // Add event to ensure proper styling after the marker is added to the map
            marker.on('add', function() {
                const markerElement = this.getElement();
                if (markerElement) {
                    markerElement.classList.add('track-first-point');
                    // Set higher z-index to ensure the first point appears on top
                    markerElement.style.zIndex = 1000;
                }
            });
        }
        
        // Add click event to handle selecting points and showing the edit dialog in edit mode
        marker.on('click', function(e) {
            // Call selectPoint to highlight and update display
            selectPoint(index);
            
            // In view mode (NOT edit mode), show floating dialog for editing parameters
            if (!editMode) {
                // Create or update floating dialog for editing storm parameters
                createFloatingDialog(index);
                
                // Don't open standard popup in parameter edit mode
                // This ensures our custom dialog is used instead
                if (e.originalEvent) {
                    L.DomEvent.stopPropagation(e.originalEvent);
                }
                return false;
            } else {
                // In edit mode, we're selecting for position editing, not showing dialog
                console.log(`Selected point ${index} in edit mode`);
            }
        });

        // Create a popup with right-side positioning, but only bind it in position edit mode
        const popup = L.popup({
            maxWidth: 320,
            minWidth: 300,
            offset: L.point(30, 0),
            autoPan: true,
            autoPanPadding: [50, 50],
            className: `category-popup category-${category.name.toLowerCase().replace(/\s+/g, '-')}`,
            closeButton: true
        });
        
        // Only actually bind the popup in position edit mode
        if (editMode) {
            // Bind popup with content function
            marker.bindPopup(function() {
                return window.formatPopupContent ? 
                    window.formatPopupContent(data[marker.pointIndex], marker.pointIndex) :
                    `<div class="popup-content">Point ${marker.pointIndex}</div>`;
            });
            
            // When popup opens, reposition it to the right side of the marker
            marker.on('popupopen', function(e) {
                // Position popup correctly after opening
                window.positionPopupToRight(marker, this._popup);
            });
        }

        // Add drag handler for edit mode
        if (editMode) {
            marker.on('dragstart', function(e) {
                // Store original position for ghost marker
                const originalPosition = [point.latitude, point.longitude];
                createGhostMarker(index, originalPosition);
                
                // Select this point when dragging starts
                selectPoint(index);
            });
            
            marker.on('drag', function(e) {
                const position = e.target.getLatLng();
                
                // Update the trackLine during drag for visual feedback
                if (trackLine) {
                    const points = data.map((p, i) => {
                        return i === index 
                            ? [position.lat, position.lng] 
                            : [p.latitude, p.longitude];
                    });
                    trackLine.setLatLngs(points);
                }
                
                // Update isochrones if this is the selected point and isochrones are enabled
                if (selectedPointIndex === index && isochronesEnabled) {
                    if (isochroneUpdateTimeout) clearTimeout(isochroneUpdateTimeout);
                    
                    // Debounce isochrone updates for performance
                    isochroneUpdateTimeout = setTimeout(() => {
                        // Temporarily update data for isochrone calculation
                        const origLat = data[index].latitude;
                        const origLon = data[index].longitude;
                        
                        data[index].latitude = position.lat;
                        data[index].longitude = position.lng;
                        
                        clearIsochrones();
                        showIsochrones(index);
                        
                        // Restore original data until drag is complete
                        data[index].latitude = origLat;
                        data[index].longitude = origLon;
                        
                        isochroneUpdateTimeout = null;
                    }, 100);
                }
            });
            
            marker.on('dragend', function(e) {
                const position = e.target.getLatLng();
                
                // Update the data
                updatePointLocation(index, position);
                
                // Remove ghost marker
                removeGhostMarker(index);
            });
        }
        
        // Add the marker to the map and to our array
        marker.addTo(map);
        markers.push(marker);
    });

    // Only fit bounds if explicitly requested
    if (fitBounds && markers.length > 0) {
        const group = new L.featureGroup(markers);
        // if fixed view don't alter bounds
        if (!window.isViewFixed){
            // Fit map to the bounds of the markers
            map.fitBounds(group.getBounds());
        }
    }
}

// Function to position popup 100km to the right of the marker
window.positionPopupToRight = function(marker, popup) {
    const markerLatLng = marker.getLatLng();
    
    // Calculate a point 100 km east (to the right) of the marker
    // We'll use the calculateDestinationFromKm function that already exists
    const offsetPoint = calculateDestinationFromKm(
        markerLatLng.lat,
        markerLatLng.lng,
        100, // 100 km offset
        90   // 90 degrees = east direction
    );
    
    // Set the popup position to this offset point
    popup.setLatLng(offsetPoint);
    
    // Ensure the popup is open
    if (!popup.isOpen()) {
        popup.openOn(map);
    }
}

// Select a point for editing - Updated to handle isochrones and hide storm attributes in edit mode
function selectPoint(index) {
    // If we're selecting a different point, clear isochrones from previous point
    if (selectedPoint !== index) {
        clearIsochrones();
    }
    
    selectedPoint = index;
    
    // Also update selectedPointIndex to keep them in sync
    selectedPointIndex = index;
    
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
    
    // If in edit mode and isochrones are enabled, show isochrones for selected point
    if (editMode && isochronesEnabled) {
        showIsochrones(index);
    }
    
    // Display storm attributes, including R34 wedges, for ADECK points
    if (!editMode) {
        clearStormVisualizations(index);
        displayStormAttributes(index); // This will now include R34 wedges

        // Make sure the floating dialog is created or updated when selecting a point
        if (floatingDialog && floatingDialog.pointIndex !== index) {
            removeFloatingDialog();
        }
        if (!floatingDialog) {
            createFloatingDialog(index);
        }
    }
    
    console.log(`Selected point ${index}, editMode=${editMode}`);
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
        modeStatus.textContent = 'Move Cyclone Position';
        modeStatus.className = 'edit-mode';
        
        // Show the isochrone toggle button when in edit mode
        const isochroneToggle = document.getElementById('toggle-isochrones');
        if (isochronesToggle) {
            isochroneToggle.style.display = 'inline-block';
        }
        
        console.log("Switched to position edit mode");
    } else {
        modeStatus.textContent = 'Edit Cyclone Parameters';
        modeStatus.className = 'view-mode';
        
        // Hide the isochrone toggle button when not in edit mode
        const isochroneToggle = document.getElementById('toggle-isochrones');
        if (isochronesToggle) {
            isochroneToggle.style.display = 'none';
        }
        
        // When switching to view mode, show storm attributes for selected point
        if (selectedPoint !== null) {
            displayStormAttributes(selectedPoint);
            
            // Re-create the floating dialog for the selected point
            createFloatingDialog(selectedPoint);
            console.log("Recreating dialog for point", selectedPoint);
        }
        
        console.log("Switched to parameter edit mode");
    }
    
    // If switching to edit mode and we have a selected point, show isochrones if enabled
    if (editMode && selectedPoint !== null && isochronesEnabled) {
        showIsochrones(selectedPoint);
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

// Export data to CSV - updated to handle both regular tracks and A-deck tracks
function exportData() {
    try {
        console.log("Exporting data...");
        
        // Check if we have a selected A-deck track to export
        if (selectedStormId && window.adeckStorms) {
            // Find the selected storm
            const selectedStorm = window.adeckStorms.find(storm => storm.id === selectedStormId);
            
            if (selectedStorm) {
                // Use A-deck track for export
                console.log(`Exporting A-deck track: ${selectedStorm.model}`);
                
                // Format a default filename using storm information
                let defaultFilename = `${selectedStorm.model}-${selectedStorm.cycloneId || 'track'}-${new Date().toISOString().substring(0, 10)}`;
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
                
                // Convert the storm points to CSV-friendly format
                const csvData = selectedStorm.points.map(point => {
                    // Calculate actual time from init time and tau
                    const pointTime = calculatePointTimeFromTau(selectedStorm.initTime, point.tau);
                    
                    // Format the time fields for CSV
                    let timeFields = {};
                    if (pointTime) {
                        timeFields = {
                            year_utc: pointTime.getUTCFullYear(),
                            month_utc: pointTime.getUTCMonth() + 1, // JS months are 0-indexed
                            day_utc: pointTime.getUTCDate(),
                            hour_utc: pointTime.getUTCHours(),
                            minute_utc: pointTime.getUTCMinutes()
                        };
                    }
                    
                    // Return point data with standardized field names
                    return {
                        // Add storm identification
                        storm_id: selectedStorm.cycloneId || '',
                        storm_name: selectedStorm.cycloneName || '',
                        model: selectedStorm.model || '',
                        init_time: selectedStorm.initTime || '',
                        forecast_hour: point.tau || 0,
                        
                        // Position data
                        latitude: point.latitude,
                        longitude: point.longitude,
                        
                        // Time data
                        ...timeFields,
                        
                        // Intensity data
                        wind_speed: point.wind_speed || '',
                        mslp: point.mslp || '',
                        
                        // Storm structure data
                        rmw: point.rmw || '',
                        r34_ne: point.r34_ne || '',
                        r34_se: point.r34_se || '',
                        r34_sw: point.r34_sw || '',
                        r34_nw: point.r34_nw || '',
                        roci: point.roci || ''
                    };
                });
                
                // Generate CSV content
                const csv = Papa.unparse(csvData);
                
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
                
                showNotification(`${selectedStorm.model} track exported successfully`, 'success');
                return;
            }
        }
        
        // Fall back to regular track export if no A-deck track is selected
        if (!data || data.length === 0) {
            showNotification('No data to export', 'warning');
            return;
        }
        
        // Original export code for regular track data
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
    
    // Add event listener for toggle-isochrones button
    const toggleIsochronesBtn = document.getElementById('toggle-isochrones');
    if (toggleIsochronesBtn) {
        toggleIsochronesBtn.addEventListener('click', toggleIsochrones);
        console.log("Attached event listener to isochrones toggle button");
    } else {
        console.warn("Could not find toggle-isochrones button");
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
    
    // Enable drag and drop for all file types (CSV, shapefile, ADECK)
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        // Prevent default behaviors for all drag events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Add highlight class on dragenter/dragover
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
        
        // Remove highlight class on dragleave/drop
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            dropZone.classList.add('highlight');
        }
        
        function unhighlight() {
            dropZone.classList.remove('highlight');
        }
        
        // Unified file drop handler for CSV, shapefiles, and ADECK files
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length === 0) return;
            
            // Get file extension to determine how to process
            const file = files[0];
            const fileName = file.name.toLowerCase();
            const extension = fileName.split('.').pop();
            
            // Check for shapefile types
            if (['shp', 'dbf', 'prj', 'zip', 'json', 'geojson', 'kml'].includes(extension)) {
                // Update loading count
                shapefileCount = files.length;
                updateLoadingCount(shapefileCount);
                
                // Process shapefile
                loadShapefile(files);
            } 
            // Check for ADECK file types
            else if (['dat', 'txt', 'adeck'].includes(extension)) {
                loadAdeckFile(file);
            }
            // Handle CSV file
            else if (extension === 'csv' || file.type === 'text/csv') {
                document.getElementById('csv-file').files = dt.files;
                loadCSVFile(file);
            } 
            else {
                showNotification('Please drop a valid CSV, ADECK, or shapefile', 'warning');
            }
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
            if (!floatingDialog.element.contains(e.target) && 
                !e.target.closest('.leaflet-marker-icon') && 
                !e.target.closest('.hurricane-marker')) {
                removeFloatingDialog();
                
                // Don't reset appearance when in Edit Cyclone Parameters mode (not edit mode)
                // This keeps storm visualizations visible when clicking elsewhere on the map
                if (editMode) {
                    resetPointAppearance();
                }
            }
        }
    });

    // Make sure map container clicks don't remove visualizations in parameter edit mode
    const mapContainer = document.getElementById('map'); 
    if (mapContainer) {
        mapContainer.addEventListener('click', function(e) {
            // If we're in parameter edit mode (not editMode) and not clicking on a marker,
            // prevent clearing storm visualizations
            if (!editMode && selectedPoint !== null && 
                !e.target.closest('.leaflet-marker-icon') && 
                !e.target.closest('.hurricane-marker')) {
                // Stop event propagation to prevent dialog removal
                e.stopPropagation();
                
                // If the floating dialog was open, just close it without resetting appearance
                if (floatingDialog) {
                    removeFloatingDialog();
                }
            }
        });
    }
    
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

    // ADECK file input handler
    const adeckFileInput = document.getElementById('adeck-file');
    if (adeckFileInput) {
        adeckFileInput.addEventListener('change', handleAdeckFileSelect);
    }

    // ADECK upload button handler
    const adeckUploadBtn = document.getElementById('adeck-upload-btn');
    if (adeckUploadBtn) {
        adeckUploadBtn.addEventListener('click', function() {
            const fileInput = document.getElementById('adeck-file');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    // Create a reopen button when closing the dialog
    const reopenButton = document.createElement('button');
    reopenButton.id = 'reopen-adeck-dialog';
    reopenButton.className = 'reopen-adeck-btn';
    reopenButton.innerHTML = '<i class="fas fa-hurricane"></i> Show A/B-Deck Selector';
    reopenButton.title = 'Reopen A/B-Deck Track Selector';
    reopenButton.style.display = 'none'; // Initially hidden
    
    // Position below the zoom/fullscreen controls in the left side
    reopenButton.style.position = 'absolute';
    reopenButton.style.top = '140px'; // Increased from 100px to position further below fullscreen control
    reopenButton.style.left = '10px';
    reopenButton.style.zIndex = '1000';
    
    // Add click handler
    reopenButton.addEventListener('click', reopenAdeckDialog);
    
    // Add to map container
    const mapContainerEl = document.getElementById('map-container'); // Renamed to avoid conflict
    if (mapContainerEl) {
        mapContainerEl.appendChild(reopenButton);
    }
    
    // Create a mutation observer to watch for dialog removal
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                // Check if the storm selection dialog was removed
                for (let i = 0; i < mutation.removedNodes.length; i++) {
                    const node = mutation.removedNodes[i];
                    if (node.id === 'adeck-storm-selection') {
                        // Show the reopen button if we have A-deck data
                        if (window.adeckStorms && window.adeckStorms.length > 0) {
                            reopenButton.style.display = 'block';
                            adeckDialogWasShown = true;
                        }
                    }
                }
            }
        });
    });
    
    // Start observing the document body for removed nodes
    observer.observe(document.body, { childList: true });
    
    // Create a style element for the reopen button
    const style = document.createElement('style');
    style.textContent = `
        .reopen-adeck-btn {
            background-color: rgba(40, 40, 40, 0.8);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background-color 0.2s;
        }
        
        .reopen-adeck-btn:hover {
            background-color: rgba(60, 60, 60, 0.9);
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        .reopen-adeck-btn i {
            font-size: 16px;
        }
    `;
    document.head.appendChild(style);
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

// Update the map legend title with the current units - Modified to check if element exists first
function updateMapLegendUnits() {
    // Since the static legend has been removed, this function is now a no-op
    // Keeping it to avoid breaking any code that calls it
    return;
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
    if (!isSpecified(speedInMS)) {
        return "Not Specified";
    }
    
    if (unitSystem === 'metric') {
        return formatNumber(speedInMS, decimals) + ' m/s';
    } else {
        // Convert m/s to mph
        return formatNumber(speedInMS * UNIT_CONVERSIONS.WIND_MS_TO_MPH, decimals) + ' mph';
    }
}

// Updated function to format pressure with handling for unspecified values
function formatPressure(pressureHPa, defaultText = "Not Specified") {
    if (!isSpecified(pressureHPa)) {
        return defaultText;
    }
    return pressureHPa + ' hPa';
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
            // if fixed bounds, use that
            if (!window.isViewFixed){
                map.fitBounds(group.getBounds(), {
                    padding: [50, 50] // Add padding around bounds
            });
            }
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

// Load ADECK file
async function loadAdeckFile(file) {
    try {
        // Show loading indicator
        document.getElementById('loading-indicator').classList.remove('hidden');
        
        console.log("Loading A/B-DECK file:", file.name);
        
        // Read file content
        const content = await readFileContent(file);
        
        console.log("File content loaded, parsing...");
        
        // Check if content is valid
        if (!content || typeof content !== 'string' || content.trim() === '') {
            throw new Error("File appears to be empty or invalid");
        }
        
        // Simplified check for B-deck file - only look for BEST in the model column
        // B-deck files will have "BEST" as the model (5th column)
        const isBdeck = content.includes(',BEST,') || content.includes(', BEST,');
        
        // Parse ADECK/BDECK content with robust error handling
        let result;
        try {
            if (isBdeck) {
                result = window.AdeckReader.parseBdeckFile(content);
            } else {
                result = window.AdeckReader.parseAdeckFile(content);
            }
            console.log("Parse result:", result);
        } catch (parseError) {
            console.error("Error in parsing file:", parseError);
            throw new Error(`Failed to parse A/B-DECK file: ${parseError.message}`);
        }
        
        // Ensure result is an object with a storms array
        if (!result) {
            console.error("Parser returned", result);
            result = { storms: [], count: 0 };
        } else if (!result.storms) {
            console.error("Parser did not return a valid storms array:", result);
            // Create a valid result object with an empty storms array
            result.storms = [];
            result.count = 0;
        }
        
        if (result.storms.length === 0) {
            throw new Error("No valid storms found in the A/B-DECK file.");
        }
        
        console.log(`Found ${result.storms.length} storms in A/B-DECK file`);
        
        // Store storms data in the global window object
        window.adeckStorms = result.storms;
        
        // Show storm selection dialog
        showStormSelectionDialog(window.adeckStorms);

        // Show success message with appropriate file type
        const fileType = result.isBdeck ? 'B-DECK' : 'A-DECK';
        showNotification(`Found ${result.storms.length} storm track${result.storms.length > 1 ? 's' : ''} in ${fileType} file`, 'success', 2000);
        
    } catch (error) {
        console.error("Error loading A/B-DECK file:", error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        // Hide loading indicator
        document.getElementById('loading-indicator').classList.add('hidden');
    }
}

// Read file content as text
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        
        reader.onerror = function() {
            reject(new Error("Could not read the file"));
        };
        
        reader.readAsText(file);
    });
}

// Get human-readable basin name
function getBasinName(basinCode) {
    const basinNames = {
        'AL': 'North Atlantic',
        'EP': 'Eastern Pacific',
        'CP': 'Central Pacific',
        'WP': 'Western Pacific',
        'IO': 'Indian Ocean',
        'SH': 'Southern Hemisphere',
        'SP': 'South Pacific',
        'SI': 'South Indian',
        'BB': 'Bay of Bengal',
        'AS': 'Arabian Sea',
        'AA': 'Arabian Sea',
        'NA': 'North Atlantic',
        'SA': 'South Atlantic',
        'SL': 'South Atlantic',
        'XX': 'Unknown Basin'
    };
    
    return basinNames[basinCode] || `${basinCode} Basin`;
}

// Function to calculate actual time from init time and tau (forecast hour)
function calculatePointTimeFromTau(initTimeString, tau) {
    if (!initTimeString || tau === undefined) return null;
    
    try {
        // Parse the init time string (format depends on your specific data)
        // Common formats are "YYYYMMDDHH" or ISO string
        let initTime;
        
        if (typeof initTimeString === 'string') {
            // Handle numeric format like "2023091000" (YYYYMMDDHH)
            if (/^\d{10}$/.test(initTimeString)) {
                const year = parseInt(initTimeString.substring(0, 4));
                const month = parseInt(initTimeString.substring(4, 6)) - 1; // JS months are 0-indexed
                const day = parseInt(initTimeString.substring(6, 8));
                const hour = parseInt(initTimeString.substring(8, 10));
                initTime = new Date(Date.UTC(year, month, day, hour, 0, 0));
            } else {
                // Try to parse as a standard date string
                initTime = new Date(initTimeString);
            }
        } else if (initTimeString instanceof Date) {
            initTime = new Date(initTimeString);
        } else {
            return null;
        }
        
        // Check if we have a valid date
        if (isNaN(initTime.getTime())) {
            console.warn("Invalid init time format:", initTimeString);
            return null;
        }
        
        // Calculate forecast time by adding tau hours
        const forecastTime = new Date(initTime);
        forecastTime.setTime(forecastTime.getTime() + (tau * 60 * 60 * 1000)); // tau hours in milliseconds
        
        return forecastTime;
    } catch(e) {
        console.error("Error calculating point time:", e);
        return null;
    }
}

// Format time display for ADECK points with improved clarity
function formatPointTime(pointTime, includeDate = true) {
    if (!pointTime) return "Unknown";
    
    try {
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
            hour12: false
        };
        
        if (includeDate) {
            options.year = 'numeric';
            options.month = 'short';
            options.day = 'numeric';
        }
        
        return new Intl.DateTimeFormat('en-US', options).format(pointTime) + " UTC";
    } catch(e) {
        console.error("Error formatting time:", e);
        return "Unknown";
    }
}

// Helper function to check if a parameter is specified (not null, undefined, or zero)
function isSpecified(value) {
    // For wind speed and some other meteorological parameters,
    // a value of 0.0 often means "not specified" rather than actually zero
    return value !== null && value !== undefined && value !== 0 && value !== 0.0;
}

// Format parameters with appropriate defaults for missing values
function formatParameter(value, formatter, defaultText = "Not Specified") {
    if (isSpecified(value)) {
        return formatter(value);
    }
    return defaultText;
}

// Updated function to format wind speed with handling for unspecified values
function formatWindSpeed(speedInMS, decimals = 1) {
    if (!isSpecified(speedInMS)) {
        return "Not Specified";
    }
    
    if (unitSystem === 'metric') {
        return formatNumber(speedInMS, decimals) + ' m/s';
    } else {
        // Convert m/s to mph
        return formatNumber(speedInMS * UNIT_CONVERSIONS.WIND_MS_TO_MPH, decimals) + ' mph';
    }
}

// Updated function to format pressure with handling for unspecified values
function formatPressure(pressureHPa, defaultText = "Not Specified") {
    if (!isSpecified(pressureHPa)) {
        return defaultText;
    }
    return pressureHPa + ' hPa';
}

// Show storm selection dialog - updated to include init time selector
function showStormSelectionDialog(storms) {
    // Close any existing dialog
    if (adeckStormSelectionDialog) {
        adeckStormSelectionDialog.remove();
    }
    
    // Group storms by date, basin, and model for better organization
    const groupedStorms = window.AdeckReader.groupStormsByDateAndModel(storms);
    
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.id = 'adeck-storm-selection';
    dialog.className = 'storm-selection-dialog';
    
    // Get the first storm to extract cyclone information for the header
    const firstStorm = storms.length > 0 ? storms[0] : null;
    const cycloneName = firstStorm && firstStorm.cycloneName ? 
                        firstStorm.cycloneName : 
                        'Select a Forecast Track';
    
    // Create dialog header with cyclone name and controls
    const header = document.createElement('div');
    header.className = 'dialog-header';
    header.style.cursor = 'move';    
    
    // Add header title and controls with better positioning
    header.innerHTML = `
    <h3>${cycloneName}</h3>
    <div class="dialog-controls">
        <div class="track-toggle-container">
            <button id="toggle-all-tracks" class="toggle-tracks-btn" title="Toggle all tracks visibility">Show All</button>
        </div>
        <div class="window-controls">
            <button class="minimize-btn" title="Minimize dialog">_</button>
            <button class="close-btn" title="Close dialog">&times;</button>
        </div>
    </div>
    `;
    dialog.appendChild(header);




    // Add the "Fix View" button
    const fixViewButton = document.createElement('button');
    fixViewButton.textContent = 'Fix View';
    fixViewButton.className = 'fix-view-button';

    // Add click event listener to toggle the fix view state
    fixViewButton.addEventListener('click', function () {
        window.isViewFixed = !window.isViewFixed;

        if (window.isViewFixed) {
            // Store the current map bounds
            window.fixedBounds = map.getBounds();
            console.log('Fixing view to bounds:', window.fixedBounds);
        } else {
            // Clear the fixed bounds
            window.fixedBounds = null;
            console.log('Unfixing view.');
        }

        // Update button text based on the state
        fixViewButton.textContent = window.isViewFixed ? 'Unfix View' : 'Fix View';

        // Show notification
        showNotification(
            window.isViewFixed ? 'Map view is now fixed' : 'Map view is now unfixed',
            'info',
            1500
        );
    });

    // Append the Fix View button to the dialog
    dialog.appendChild(fixViewButton);





    
    // Show cyclone ID if available
    if (firstStorm && firstStorm.cycloneId) {
        const cycloneIdElement = document.createElement('div');
        cycloneIdElement.className = 'cyclone-id';
        cycloneIdElement.textContent = firstStorm.cycloneId;
        header.insertBefore(cycloneIdElement, header.querySelector('.dialog-controls'));
    }
    
    // Add model description container right after the header
    const modelDescContainer = document.createElement('div');
    modelDescContainer.className = 'model-description-container';
    modelDescContainer.innerHTML = '<div class="model-description">Select a model track to see its description</div>';
    dialog.appendChild(modelDescContainer);
    
    // Add currently selected model info display
    const selectedModelInfo = document.createElement('div');
    selectedModelInfo.className = 'selected-model-info hidden';
    selectedModelInfo.innerHTML = '<span class="selected-model-label">No model selected</span>';
    dialog.appendChild(selectedModelInfo);
    
    // Add Init Time Selector
    const initTimeSelector = window.AdeckReader.createInitTimeSelector(storms, (selectedInitTime) => {
        // When an init time is selected, update the tracks display below
        window.AdeckReader.displayTracksByInitTime(storms, selectedInitTime);
    });
    
    dialog.appendChild(initTimeSelector);
    
    // Add Model Category selector
    const modelCategorySelector = document.createElement('div');
    modelCategorySelector.className = 'model-category-filter';
    
    // Define the model categories - same as in AdeckReader for consistency
    const modelCategories = [
        { id: 'all', name: 'All Models' },
        { 
            id: 'track_intensity', 
            name: 'Track & Intensity Models', 
            models: [
                'OFCL', 'OFCI', 'CARQ',
                'AVNO', 'AVNI', 'GFS',
                'GFDI', 'GFDL', 'GFDT', 'GFDN',
                'UKMI', 'UKM', 'UKX', 'UKXI', 'UKX2', 'UKM2',
                'CMC', 'HWRF', 'HMON',
                'EMXI', 'EMX', 'EMX2', 'ECMWF',
                'NGPS', 'NGPI', 'NGP2',
                'DSHP', 'SHIP', 'LGEM', 'SHFR', 'SHNS', 'DRCL'
            ]
        },
        {
            id: 'track_only',
            name: 'Track-Only Models',
            models: [
                'TVCN', 'TVCE', 'TVCX',
                'CONU', 'GUNA', 'GUNS', 'HCCA',
                'BAMD', 'BAMM', 'BAMS', 'LBAR', 'XTRP',
                'CLIP', 'CLP5', 'DRCL', 'MRCL'
            ]
        }
    ];
    
    // Create label for the dropdown
    const categoryLabel = document.createElement('div');
    categoryLabel.className = 'model-category-label';
    categoryLabel.textContent = 'Model Type:';
    modelCategorySelector.appendChild(categoryLabel);
    
    // Create dropdown
    const categoryDropdown = document.createElement('select');
    categoryDropdown.className = 'model-category-dropdown';
    
    // Function to update category dropdown with track counts for current init time
    const updateCategoryDropdownCounts = (selectedInitTime) => {
        // Filter storms to only include those with the selected init time
        const currentInitStorms = selectedInitTime 
            ? storms.filter(storm => storm.initTime === selectedInitTime)
            : storms;
        
        // Count tracks for each category in the filtered set
        const categoryCounts = {};
        categoryCounts['all'] = currentInitStorms.length;
        
        // Count tracks in each category
        modelCategories.slice(1).forEach(category => {
            const categoryModels = category.models || [];
            const count = currentInitStorms.filter(storm => categoryModels.includes(storm.model)).length;
            categoryCounts[category.id] = count;
        });
        
        // Update dropdown options with current counts
        while (categoryDropdown.firstChild) {
            categoryDropdown.removeChild(categoryDropdown.firstChild);
        }
        
        // Get the list of models that are actually in the data
        const availableModels = [...new Set(currentInitStorms.map(storm => storm.model))];
        
        // Add options to the dropdown with track counts - only for categories with available models
        modelCategories.forEach(category => {
            // For non-"all" categories, check if any models are available
            if (category.id === 'all' || 
                (category.models && category.models.some(model => availableModels.includes(model)))) {
                
                const option = document.createElement('option');
                option.value = category.id;
                const count = categoryCounts[category.id];
                option.textContent = `${category.name} (${count} tracks)`;
                categoryDropdown.appendChild(option);
            }
        });
    };
    
    // Initialize dropdown with counts for the default init time (latest)
    const defaultInitTime = document.querySelector('.init-time-dropdown')?.value;
    updateCategoryDropdownCounts(defaultInitTime);
    
    // Add listener to init time dropdown to update category counts when changed
    const initTimeDropdown = dialog.querySelector('.init-time-dropdown');
    if (initTimeDropdown) {
        initTimeDropdown.addEventListener('change', function() {
            updateCategoryDropdownCounts(this.value);
        });
    }
    
    // Add change handler for dropdown
    //categoryDropdown.addEventListener('change', function() {
        //const selectedCategory = this.value;
       // const selectedInitTime = document.querySelector('.init-time-dropdown')?.value;
       // 
       // // Filter storms by both init time and category
       // let filteredStorms = storms;
       // 
       // // First filter by init time if selected
       // if (selectedInitTime) {
       //     filteredStorms = storms.filter(storm => storm.initTime === selectedInitTime);
       // }
       // 
       // // Then filter by model category if not "all"
       // if (selectedCategory !== 'all') {
       //     const categoryModels = modelCategories.find(cat => cat.id === selectedCategory)?.models || [];
       //     filteredStorms = filteredStorms.filter(storm => categoryModels.includes(storm.model));
       // }
       // 
       // // Display the filtered tracks
       // displayAdeckTracks(filteredStorms, selectedStormId);
       // 
       // // Show notification
       // showNotification(`Displaying ${selectedCategory} model tracks`, 'info', 1500);
    //});
        const categories = [
            { id: 'track_intensity', name: 'Track & Intensity Models' },
            { id: 'track_only', name: 'Track-Only Models' },
            { id: 'all', name: 'All Models' }
        ];
        
        let selectedCategory = 'all'; // Default category
        
        categories.forEach(category => {
            const label = document.createElement('label');
            label.className = 'category-checkbox-label';
        
            const checkbox = document.createElement('input');
            checkbox.type = 'radio';
            checkbox.name = 'model-category';
            checkbox.value = category.id;
            checkbox.checked = category.id === selectedCategory;
            checkbox.className = 'category-checkbox';
        
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    selectedCategory = this.value;
                
                    // Filter storms by both init time and category
                    const selectedInitTime = document.querySelector('.init-time-dropdown')?.value;
                    let filteredStorms = storms;
                
                    // First filter by init time if selected
                    if (selectedInitTime) {
                        filteredStorms = storms.filter(storm => storm.initTime === selectedInitTime);
                    }
                
                    // Then filter by model category if not "all"
                    if (selectedCategory !== 'all') {
                        const categoryModels = modelCategories.find(cat => cat.id === selectedCategory)?.models || [];
                        filteredStorms = filteredStorms.filter(storm => categoryModels.includes(storm.model));
                    }
                
                    // Display the filtered tracks
                    displayAdeckTracks(filteredStorms, selectedStormId);
                
                    // Show notification
                    showNotification(`Displaying ${category.name} model tracks`, 'info', 1500);
                }
            });
        
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(category.name));
            modelCategorySelector.appendChild(label);
        });
    
   
    
    //modelCategorySelector.appendChild(categoryDropdown);
    dialog.appendChild(modelCategorySelector);
    
    // Create content container
    const content = document.createElement('div');
    content.className = 'dialog-content';
    dialog.appendChild(content);
    
    // Create storm list
    const stormList = document.createElement('div');
    stormList.className = 'storm-list';
    content.appendChild(stormList);
    
    // Get dates and sort in descending order (newest first)
    const dates = Object.keys(groupedStorms).sort((a, b) => b.localeCompare(a));
    
    if (dates.length === 0) {
        stormList.innerHTML = '<div class="empty-state">No valid forecast tracks found. Please check the file format.</div>';
    } else {
        // Create date sections
        dates.forEach(date => {
            // Create date section code here...
            // ...existing code...
        });
    }
    
    // Add dialog to document
    document.body.appendChild(dialog);
    
    // Position the dialog in the middle-left of the screen
    const mapContainer = document.getElementById('map-container');
    const mapRect = mapContainer.getBoundingClientRect();
    
    dialog.style.position = 'absolute';
    dialog.style.top = '50%';
    dialog.style.left = mapRect.left + 20 + 'px'; // Position on left with margin
    dialog.style.transform = 'translateY(-50%)'; // Center vertically only
    dialog.style.maxHeight = '80vh'; // Limit height
    dialog.style.maxWidth = '35%'; // Limit width
    dialog.style.minWidth = '300px'; // Ensure minimum width
    
    // Set a high z-index to ensure visibility in fullscreen mode
    dialog.style.zIndex = document.fullscreenElement ? '10000' : '1000';
    
    // Store reference to dialog
    adeckStormSelectionDialog = dialog;
    
    // Make dialog draggable with enhanced draggability
    makeEnhancedDraggable(dialog);
    
    // Add event listeners for minimize and close buttons
    dialog.querySelector('.minimize-btn').addEventListener('click', () => {
        toggleDialogMinimize(dialog);
        // Don't trigger any zoom changes when minimizing
    });
    
    dialog.querySelector('.close-btn').addEventListener('click', () => {
        dialog.remove();
        adeckStormSelectionDialog = null;
        
        // Set the flag to indicate dialog was previously shown but is now closed
        adeckDialogWasShown = true;
        // Don't trigger any zoom changes when closing
    });
    
    // Add toggle all tracks button functionality
    const toggleAllTracksBtn = dialog.querySelector('#toggle-all-tracks');
    if (toggleAllTracksBtn) {
        // Create a flag to track track visibility state - initially all tracks are shown
        let allTracksVisible = true;
        
        toggleAllTracksBtn.addEventListener('click', function() {
            // Toggle the state
            allTracksVisible = !allTracksVisible;
            
            // Update button text
            this.textContent = allTracksVisible ? 'Hide All' : 'Show All';
            this.title = allTracksVisible ? 'Hide all tracks' : 'Show all tracks';
            
            // Toggle visibility of all track layers
            if (window.adeckLines && window.adeckLines.length > 0) {
                window.adeckLines.forEach(line => {
                    if (line) {
                        if (allTracksVisible) {
                            line.addTo(window.adeckLayerGroup);
                        } else {
                            window.adeckLayerGroup.removeLayer(line);
                        }
                    }
                });
            }
            
            // Toggle visibility of all track markers
            if (window.adeckMarkers && window.adeckMarkers.length > 0) {
                window.adeckMarkers.forEach(marker => {
                    if (marker) {
                        if (allTracksVisible) {
                            marker.addTo(window.adeckLayerGroup);
                        } else {
                            window.adeckLayerGroup.removeLayer(marker);
                        }
                    }
                });
            }
            
            // If a track is selected, keep it visible regardless
            if (selectedStormId !== null) {
                // Ensure the selected track remains visible
                window.adeckLines.forEach((line, index) => {
                    if (line && line.stormId === selectedStormId) {
                        line.addTo(window.adeckLayerGroup);
                    }
                });
                
                window.adeckMarkers.forEach((marker, index) => {
                    if (marker && marker.stormId === selectedStormId) {
                        marker.addTo(window.adeckLayerGroup);
                    }
                });
            }
        });
        
        // Initialize button text (initially all tracks are shown)
        toggleAllTracksBtn.textContent = 'Hide All';
        toggleAllTracksBtn.title = 'Hide all tracks';
    }
    
    // Add visual highlight to dialog header on hover
    header.addEventListener('mouseenter', () => {
        header.style.backgroundColor = '';
    });
    
    // Display all tracks for the latest init time by default
    window.AdeckReader.displayTracksByInitTime(storms);
}

// Enhanced draggable function specifically for A-deck dialogs
function makeEnhancedDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;
    let dragTimeout;
    
    // Find header to use as drag handle
    const header = element.querySelector('.dialog-header');
    if (header) {
        // Mouse events
        header.addEventListener('mousedown', dragMouseDown);
        
        // Touch events for mobile devices
        header.addEventListener('touchstart', dragTouchStart, { passive: false });
    } else {
        // If no header, use the whole element
        element.addEventListener('mousedown', dragMouseDown);
        element.addEventListener('touchstart', dragTouchStart, { passive: false });
    }
    
    function dragMouseDown(e) {
        e.preventDefault();
        
        // Get initial position
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Set dragging state
        isDragging = true;
        element.classList.add('dragging');
        
        // Add event listeners
        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', closeDragElement);
    }
    
    function dragTouchStart(e) {
        e.preventDefault();
        
        if (e.touches.length === 1) {
            // Get initial position from touch
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            
            // Set dragging state
            isDragging = true;
            element.classList.add('dragging');
            
            // Add event listeners
            document.addEventListener('touchmove', elementTouchDrag, { passive: false });
            document.addEventListener('touchend', closeTouchDragElement);
        }
    }
    
    function elementDrag(e) {
        e.preventDefault();
        
        if (!isDragging) return;
        
        // Calculate movement
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Throttle updates for better performance
        if (dragTimeout) {
            return;
        }
        
        dragTimeout = setTimeout(() => {
            // Update position
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.transform = 'none'; // Remove any transform when dragging starts
            dragTimeout = null;
        }, 10);
    }
    
    function elementTouchDrag(e) {
        e.preventDefault();
        
        if (!isDragging || e.touches.length !== 1) return;
        
        // Calculate movement from touch
        pos1 = pos3 - e.touches[0].clientX;
        dragTimeout = setTimeout(() => {
            // Update position
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.transform = 'none'; // Remove any transform when dragging starts
            dragTimeout = null;
        }, 10);
    }
    
    function closeDragElement() {
        // End dragging state
        isDragging = false;
        element.classList.remove('dragging');
        
        // Remove event listeners
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('mouseup', closeDragElement);
        
        // Clear any pending timeout
        if (dragTimeout) {
            clearTimeout(dragTimeout);
            dragTimeout = null;
        }
    }
    
    function closeTouchDragElement() {
        // End dragging state
        isDragging = false;
        element.classList.remove('dragging');
        
        // Remove event listeners
        document.removeEventListener('touchmove', elementTouchDrag);
        document.removeEventListener('touchend', closeTouchDragElement);
        
        // Clear any pending timeout
        if (dragTimeout) {
            clearTimeout(dragTimeout);
            dragTimeout = null;
        }
    }
    
    return element;
}

// Add this function to handle ADECK track display
function displayAdeckTracks(storms, selectedStormId = null, defaultModelsOnly = true) {
    // Remove existing tracks first
    removeAdeckTracks();
    
    if (!storms || !Array.isArray(storms) || storms.length === 0) {
        console.log("No ADECK tracks to display");
        return;
    }

    // Add a flag to track if we had to fall back to showing all models
    let usedFallback = false;

    window.currentModelFilterPreference = defaultModelsOnly;
    
    // Preserve the currently selected model category
    const categoryDropdown = document.querySelector('.model-category-dropdown');
    const selectedCategory = categoryDropdown ? categoryDropdown.value : 'all';
    
    // Filter storms based on the model display setting
    let filteredStorms;
   
    console.log(`Filtering storms: defaultModelsOnly = ${defaultModelsOnly}, selectedCategory = ${selectedCategory}`);
    if (defaultModelsOnly) {
        // Try to show default models first
        filteredStorms = storms.filter(storm => isDefaultModel(storm.model));
        
        // If no default models, fall back to all known models
        if (filteredStorms.length === 0) {
            filteredStorms = storms.filter(storm => isKnownModel(storm.model));
            console.log("No default models found, showing all known models");
            usedFallback = true; // Track that we used the fallback
        }
    } else {
        // Show all known models
        filteredStorms = storms.filter(storm => isKnownModel(storm.model));
    }
    
    // Apply model category filter if not "all"
    if (selectedCategory !== 'all') {
        // Get the model category definition
        const modelCategories = [
            { id: 'all', name: 'All Models' },
            { 
                id: 'track_intensity', 
                name: 'Track & Intensity Models', 
                models: [
                    'OFCL', 'OFCI', 'CARQ',
                    'AVNO', 'AVNI', 'GFS',
                    'GFDI', 'GFDL', 'GFDT', 'GFDN',
                    'UKMI', 'UKM', 'UKX', 'UKXI', 'UKX2', 'UKM2',
                    'CMC', 'HWRF', 'HMON',
                    'EMXI', 'EMX', 'EMX2', 'ECMWF',
                    'NGPS', 'NGPI', 'NGP2',
                    'DSHP', 'SHIP', 'LGEM', 'SHFR', 'SHNS', 'DRCL'
                ]
            },
            {
                id: 'track_only',
                name: 'Track-Only Models',
                models: [
                    'TVCN', 'TVCE', 'TVCX',
                    'CONU', 'GUNA', 'GUNS', 'HCCA',
                    'BAMD', 'BAMM', 'BAMS', 'LBAR', 'XTRP',
                    'CLIP', 'CLP5', 'DRCL', 'MRCL'
                ]
            }
        ];
        
        const categoryDef = modelCategories.find(cat => cat.id === selectedCategory);
        
        if (categoryDef && categoryDef.models) {
            const beforeCount = filteredStorms.length;
            filteredStorms = filteredStorms.filter(storm => categoryDef.models.includes(storm.model));
            console.log(`Applied ${selectedCategory} category filter: ${filteredStorms.length} of ${beforeCount} storms match`);
        }
    }
    
    if (filteredStorms.length === 0) {
        console.log("No tracks with known models to display");
        showNotification("No recognized forecast models to display", "warning");
        return;
    }
    
    console.log(`Displaying ${filteredStorms.length} recognized ADECK tracks (filtered from ${storms.length} total)`);

    // Store the current filter preference to preseve it for future use
    if (!usedFallback) {
        window.lastModelFilterPreference = defaultModelsOnly;
    }
    
    // Store the current category selection
    window.lastModelCategory = selectedCategory;
    
    // Process storms to add special styling for first points
    const processedStorms = window.AdeckReader 
        ? window.AdeckReader.processTracksForDisplay(filteredStorms, defaultModelsOnly)
        : filteredStorms;
    
    // Create a layer group for ADECK tracks if it doesn't exist
    if (!window.adeckLayerGroup) {
        window.adeckLayerGroup = L.layerGroup().addTo(map);
    }
    
    // Store references to all markers
    window.adeckMarkers = [];
    window.adeckLines = [];
    
    // Determine if any storm is selected
    const isAnyStormSelected = selectedStormId !== null;
    
    // Display each storm track
    processedStorms.forEach(storm => {
        const isSelected = selectedStormId === storm.id;
        const opacity = isAnyStormSelected ? (isSelected ? 1.0 : 0.3) : 0.8;
        const zIndexOffset = isSelected ? 500 : 0;
        
        // Get the model-specific color for the track line
        const modelColor = window.AdeckReader.getModelColor(storm.model);
        
        // Skip if model color is not defined (should not happen due to filtering)
        if (!modelColor) return;
        
        // Create polyline for the track
        const points = storm.points.map(point => [point.latitude, point.longitude]);
        if (points.length > 0) {
            const trackLine = L.polyline(points, {
                color: modelColor, // Keep track lines colored by model for differentiation
                weight: isSelected ? 3 : 2,
                opacity: opacity,
                smoothFactor: 1,
                className: `adeck-track ${isSelected ? 'selected-track' : ''} model-track-${storm.model}`,
                dashArray: isSelected ? '' : '5, 5',
                stormId: storm.id // Add this to identify each track's storm ID
            }).addTo(window.adeckLayerGroup);
            
            // Add metadata to the line
            trackLine.stormId = storm.id;
            trackLine.model = storm.model;
            
            // Add model description as a tooltip
            if (MODEL_DESCRIPTIONS[storm.model]) {
                trackLine.bindTooltip(`${storm.model}: ${MODEL_DESCRIPTIONS[storm.model]}`, {
                    sticky: true,
                    opacity: 0.9,
                    className: 'model-tooltip'
                });
            }
            
            // Add click handler
            trackLine.on('click', function() {
                selectAdeckTrack(storm.id);
                
                // Update the model description in the dialog if it exists
                updateModelDescriptionInDialog(storm.model);
            });
            
            window.adeckLines.push(trackLine);
        }
        
        // Create markers for each point - using the intensity-based category coloring
        storm.points.forEach((point, index) => {
            // Use hurricane category based on wind speed (same as CSV tracks)
            const category = getHurricaneCategory(point.wind_speed);
            
            // Determine marker size based on category and if it's the first point
            const iconSize = index === 0 ? (category.radius * 2) + 2 : category.radius * 2;
            
            // Create marker icon using category color instead of model color
            const icon = L.divIcon({
                className: `hurricane-marker category-${category.name.toLowerCase().replace(/\s+/g, '-')} ${index === 0 ? 'first-point' : ''}`,
                iconSize: [iconSize, iconSize],
                html: `<div style="background-color: ${category.color}; width: 100%; height: 100%; border-radius: 50%; 
                      ${index === 0 ? 'border: 2px solid #FFFFFF;' : ''}" 
                      class="${index === 0 ? 'first-point-marker' : ''}"></div>`,
                iconAnchor: [iconSize/2, iconSize/2]
            });
            
            // Create the marker
            const marker = L.marker([point.latitude, point.longitude], {
                icon: icon,
                opacity: opacity,
                title: `${storm.model} - ${category.name} - ${formatWindSpeed(point.wind_speed)}`,
                zIndexOffset: index === 0 ? zIndexOffset + 1000 : zIndexOffset
            }).addTo(window.adeckLayerGroup);
            
            // Add metadata to the marker
            marker.stormId = storm.id;
            marker.model = storm.model;
            marker.pointIndex = index;
            marker.category = category.name;
            marker.windSpeed = point.wind_speed;
            
            // Calculate actual time for this point using init time and tau (forecast hour)
            const pointTime = calculatePointTimeFromTau(storm.initTime, point.tau);
            marker.pointTime = pointTime;
            
            // Also store the time data directly on the point object for easier access
            point.pointTime = pointTime;
            
            // Add special styling for first point
            if (index === 0) {
                marker.on('add', function() {
                    const markerElement = this.getElement();
                    if (markerElement) {
                        markerElement.classList.add('track-first-point');
                        markerElement.style.zIndex = 1000;
                    }
                });
            }
            
            // Add click handler for marker
            marker.on('click', function() {
                selectAdeckTrack(storm.id);
                
                // Update the model description in the dialog if it exists
                updateModelDescriptionInDialog(storm.model);
                
                // Create popup using the same formatPopupContent function as CSV tracks
                if (window.formatPopupContent) {
                    // Add model name and actual time to the point data for display in popup
                    const pointData = {
                        ...point,
                        cycloneId: storm.cycloneId,
                        cycloneName: storm.model, // Just use the model name directly
                        pointTime: pointTime,     // Add the calculated time
                        initTime: storm.initTime  // Add the init time for reference
                    };
                    const content = window.formatPopupContent(pointData, index);
                    
                    // Create popup and position it 100km to the right
                    const popup = L.popup()
                        .setContent(content);
                        
                    marker.bindPopup(popup);
                    window.positionPopupToRight(marker, popup);
                } else {
                    // Fallback simple popup if formatPopupContent isn't available
                    // Format time information - show both init and forecast time
                    let timeDisplay = "";
                    if (pointTime) {
                        timeDisplay = `<br>Valid: ${formatPointTime(pointTime)}`;
                        if (index === 0) {
                            timeDisplay += " (Initial)";
                        } else {
                            timeDisplay += ` (+${point.tau}h)`;
                        }
                    } else if (point.tau !== undefined) {
                        timeDisplay = `<br>Forecast: +${point.tau}h`;
                    }
                    
                    // Format intensity and pressure with "Not Specified" for zero/missing values
                    const intensityDisplay = formatWindSpeed(point.wind_speed);
                    const pressureDisplay = formatPressure(point.mslp);
                    
                    // Determine which category label to show based on wind speed
                    let categoryDisplay = "Intensity: Not Specified";
                    let categoryColor = "#999"; // Default gray for unspecified
                    if (isSpecified(point.wind_speed)) {
                        const category = getHurricaneCategory(point.wind_speed);
                        categoryDisplay = category.name;
                        categoryColor = category.color;
                    }
                    
                    const popupContent = `
                        <div class="adeck-popup">
                            <b>${storm.model || 'Unknown Model'}</b><br>
                            <small class="model-description">${getModelDescription(storm.model)}</small>
                            <hr>
                            <div class="intensity-badge" style="background-color:${categoryColor}">
                                ${categoryDisplay}
                            </div>
                            Position: ${point.latitudeFormatted || point.latitude.toFixed(1)}, 
                                     ${point.longitudeFormatted || Math.abs(point.longitude).toFixed(1)}°${point.longitude >= 0 ? 'E' : 'W'}
                            <br>Init: ${storm.initTime ? formatPointTime(new Date(storm.initTime), true) : "Unknown"}${timeDisplay}
                            <br>Wind: ${intensityDisplay}
                            <br>Pressure: ${pressureDisplay}
                        </div>
                    `;
                    
                    const popup = L.popup().setContent(popupContent);
                    marker.bindPopup(popup);
                    window.positionPopupToRight(marker, popup);
                }
            });
            
            window.adeckMarkers.push(marker);
        });
    });
    
    // Apply zoom-appropriate symbology
    if (typeof updateAdeckSymbology === 'function') {
        updateAdeckSymbology();
    }
    
    // Fit bounds to include all tracks if no specific track is selected
    if (!isAnyStormSelected && window.adeckMarkers.length > 0) {
        const group = L.featureGroup(window.adeckMarkers);
        // only if fix view is not set 
        if (!window.isViewFixed) {
            map.fitBounds(group.getBounds(), { padding: [50, 50] });
        }
    }
    
    // Record that the A-deck dialog was shown
    if (typeof adeckDialogWasShown !== 'undefined') {
        adeckDialogWasShown = true;
    }
}

// Function to update the model description in the dialog
function updateModelDescriptionInDialog(modelName) {
    // Find the model description container if it exists
    const descContainer = document.querySelector('.model-description-container');
    if (!descContainer) {
        // Create it if it doesn't exist, but only if the dialog exists
        const dialog = document.getElementById('adeck-storm-selection');
        if (dialog) {
            const newDescContainer = document.createElement('div');
            newDescContainer.className = 'model-description-container';
            
            // Get the description text
            const description = getModelDescription(modelName);
            
            // Create description element
            const descElement = document.createElement('div');
            descElement.className = 'model-description active';
            descElement.innerHTML = `<strong>${modelName}:</strong> ${description}`;
            
            newDescContainer.appendChild(descElement);
            
            // Insert it after the header
            const header = dialog.querySelector('.dialog-header');
            if (header) {
                header.insertAdjacentElement('afterend', newDescContainer);
            } else {
                dialog.insertBefore(newDescContainer, dialog.firstChild.nextSibling);
            }
        }
    } else {
        // Update the existing container
        const description = getModelDescription(modelName);
        descContainer.innerHTML = `<div class="model-description active"><strong>${modelName}:</strong> ${description}</div>`;
    }
    
    // Also update the selected model info in the minimized dialog
    const selectedModelInfo = document.querySelector('.selected-model-info');
    if (selectedModelInfo) {
        selectedModelInfo.innerHTML = `<span class="selected-model-label">${modelName} track selected</span>`;
        selectedModelInfo.classList.remove('hidden');
    }
}

// Remove ADECK tracks from the map
function removeAdeckTracks() {
    if (window.adeckLayerGroup) {
        window.adeckLayerGroup.clearLayers();
    }
    
    window.adeckMarkers = [];
    window.adeckLines = [];
    
    // Hide the reopen button if we're clearing all A-deck data
    const reopenButton = document.getElementById('reopen-adeck-dialog');
    if (reopenButton && !window.adeckStorms) {
        reopenButton.style.display = 'none';
    }
}

// Function to update A-deck track symbology based on zoom level
function updateAdeckSymbology() {
    const zoomLevel = map.getZoom();
    
    // Update markers
    if (window.adeckMarkers && window.adeckMarkers.length > 0) {
        window.adeckMarkers.forEach(marker => {
            // Skip if marker is undefined or null
            if (!marker) return;
            
            // Check if this marker belongs to a hidden track
            const shouldBeHidden = marker.options && 
                                  marker.options.stormId && 
                                  window.AdeckReader && 
                                  window.AdeckReader.hiddenTracks && 
                                  window.AdeckReader.hiddenTracks[marker.options.stormId];
            
            if (shouldBeHidden) {
                // Use the helper function if available, otherwise apply styles directly
                if (window.AdeckReader && typeof window.AdeckReader.setMarkerVisibility === 'function') {
                    window.AdeckReader.setMarkerVisibility(marker, false);
                } else {
                    // Directly apply styling to hide the marker
                    if (marker.setStyle) {
                        marker.setStyle({
                            opacity: 0,
                            fillOpacity: 0,
                            stroke: false,
                            fill: false
                        });
                    }
                    
                    // Hide the DOM element if it exists
                    if (marker._path) {
                        marker._path.style.display = 'none';
                        marker._path.setAttribute('visibility', 'hidden');
                    }
                    
                    // Set radius to 0 if possible
                    if (marker.setRadius) {
                        marker.setRadius(0);
                    }
                }
                return; // Skip further styling
            }
            
            // At this point, the marker is visible, apply zoom-based styling
            // Scale marker size based on zoom level
            if (marker.setRadius) {
                let radius;
                if (zoomLevel <= 4) {
                    radius = 3;
                } else if (zoomLevel <= 6) {
                    radius = 4;
                } else if (zoomLevel <= 8) {
                    radius = 5;
                } else if (zoomLevel <= 10) {
                    radius = 6;
                } else {
                    radius = 7;
                }
                
                // Store original radius if not already stored
                if (!marker.options.originalRadius) {
                    marker.options.originalRadius = marker.getRadius ? marker.getRadius() : 5;
                }
                
                marker.setRadius(radius);
            }
            
            // Ensure marker is visible
            if (marker.setStyle) {
                marker.setStyle({
                    opacity: marker.options.originalOpacity || 1,
                    fillOpacity: marker.options.originalFillOpacity || 1,
                    stroke: true,
                    fill: true
                });
            }
            
            // Make sure SVG element is visible
            if (marker._path) {
                marker._path.style.display = '';
                marker._path.removeAttribute('visibility');
            }
        });
    }
    
    // Update line widths
    if (window.adeckLines && window.adeckLines.length > 0) {
        const baseLineWidth = 2;
        const selectedLineWidth = 3;
        
        // Calculate scale factor based on zoom
        let scaleFactor;
        if (zoomLevel <= 4) {
            scaleFactor = 0.8;
        } else if (zoomLevel <= 6) {
            scaleFactor = 1.0;
        } else if (zoomLevel <= 8) {
            scaleFactor = 1.2;
        } else if (zoomLevel <= 10) {
            scaleFactor = 1.5;
        } else {
            scaleFactor = 1.8;
        }
        
        window.adeckLines.forEach(line => {
            // Skip if line is undefined
            if (!line) return;
            
            const isSelected = selectedStormId && line.options && line.options.stormId === selectedStormId;
            const width = isSelected ? selectedLineWidth * scaleFactor : baseLineWidth * scaleFactor;
            
            if (line.setStyle) {
                line.setStyle({ weight: width });
            }
        });
    }
}

// Existing ADECK file handler needs to call our displayAdeckTracks function
// Update handleAdeckFileSelect or anywhere else that loads ADECK data
function handleAdeckFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        loadAdeckFile(files[0]);
    }
}

// Select a specific A-deck track and highlight it
function selectAdeckTrack(stormId) {
    // Store the selected storm ID
    selectedStormId = stormId;
    
    // Find the selected storm model from the markers or lines
    let selectedModel = null;
    if (window.adeckLines && window.adeckLines.length) {
        const selectedLine = window.adeckLines.find(line => line.stormId === stormId);
        if (selectedLine) {
            selectedModel = selectedLine.model;
        }
    }
    
    // Update currentModelName for future reference
    if (selectedModel) {
        currentModelName = selectedModel;
    }
    
    // Update the visual state of all lines and markers
    if (window.adeckLines) {
        window.adeckLines.forEach(line => {
            // Set line style based on selection state
            line.setStyle({
                opacity: line.stormId === stormId ? 1.0 : 0.3,
                weight: line.stormId === stormId ? 3 : 2,
                dashArray: line.stormId === stormId ? '' : '5, 5'
            });
            
            // Update CSS classes
            if (line.stormId === stormId) {
                line._path.classList.add('selected-track');
            } else {
                line._path.classList.remove('selected-track');
            }
        });
    }
    
    // Update marker opacity based on selection
    if (window.adeckMarkers) {
        window.adeckMarkers.forEach(marker => {
            marker.setOpacity(marker.stormId === stormId ? 1.0 : 0.3);
            
            // Update z-index to bring selected markers to front
            if (marker.stormId === stormId) {
                const isFirstPoint = marker.pointIndex === 0;
                marker.setZIndexOffset(isFirstPoint ? 1500 : 1000);
            } else {
                const isFirstPoint = marker.pointIndex === 0;
                marker.setZIndexOffset(isFirstPoint ? 500 : 0);
            }
        });
    }
    
    // Show notification about selected model
    if (selectedModel) {
        showNotification(`Selected ${selectedModel} forecast track`, 'info', 1500);
    }
    
    // Update the UI to highlight the selected model in any model lists
    highlightSelectedModel(selectedModel);
    
    // Apply zoom-appropriate symbology with the new selection
    updateAdeckSymbology();
    
    return selectedModel;
}

// Helper function to highlight the selected model in UI elements
function highlightSelectedModel(modelName) {
    // If there's any model selection UI, update it
    document.querySelectorAll('.adeck-model-button').forEach(btn => {
        if (btn.dataset.model === modelName) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
    
    // If there's a table with model rows, highlight the appropriate row
    document.querySelectorAll('.model-row').forEach(row => {
        if (row.dataset.model === modelName) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });
}

// Add a function to get model-specific colors
function getModelColor(model) {
    return window.AdeckReader.getModelColor(model);
}

// Check if a model is known (has a defined color)
function isKnownModel(model) {
    // Use AdeckReader's function if available
    if (window.AdeckReader && typeof window.AdeckReader.isKnownModel === 'function') {
        return window.AdeckReader.isKnownModel(model);
    }
    
    // Fallback to checking if it has a color
    return getModelColor(model) !== null;
}

// Check if a model should be shown by default
function isDefaultModel(model) {
    // Use AdeckReader's function if available
    if (window.AdeckReader && typeof window.AdeckReader.isDefaultModel === 'function') {
        return window.AdeckReader.isDefaultModel(model);
    }
    
    // Fallback to a simple list of important models
    const defaultModels = ['TVCN', 'TVCE', 'CONU', 'OFCL', 'OFCI'];
    return defaultModels.includes(model);
}

// Add reopening functionality for the A-deck dialog
function reopenAdeckDialog() {
    if (window.adeckStorms && window.adeckStorms.length > 0) {
        // Reopen the storm selection dialog with the existing data
        showStormSelectionDialog(window.adeckStorms);
        showNotification('A-deck selector reopened', 'info', 1500);
    } else {
        showNotification('No A-deck data available. Please load an A-deck file first.', 'warning');
    }
}

// Update formatPopupContent function to handle ADECK time information
window.formatAdeckTime = function(point) {
    if (point.pointTime) {
        let timeDisplay = formatPointTime(point.pointTime);
        
        // Add tau hours information if available
        if (point.tau !== undefined) {
            // For initial point (tau=0) use "Initial"
            if (point.tau === 0) {
                timeDisplay += " (Initial)";
            } else {
                timeDisplay += ` (Init+${point.tau}h)`;
            }
        }
        return timeDisplay;
    } else if (point.tau !== undefined && point.initTime) {
        // Calculate actual time from init + tau
        const pointTime = calculatePointTimeFromTau(point.initTime, point.tau);
        if (pointTime) {
            let timeDisplay = formatPointTime(pointTime);
            if (point.tau === 0) {
                timeDisplay += " (Initial)";
            } else {
                timeDisplay += ` (Init+${point.tau}h)`;
            }
            return timeDisplay;
        }
        // Fallback if we can't calculate the actual time
        return `Forecast +${point.tau}h from init`;
    } else if (point.tau !== undefined) {
        return `Forecast +${point.tau}h`;
    } else {
        return "Time not specified";
    }
};

// Make the helper functions available globally for custom popup templates
window.isSpecified = isSpecified;
window.formatParameter = formatParameter;

// Update the default formatPopupContent function to display "Not Specified" for zero values
if (!window.formatPopupContent) {
    window.formatPopupContent = function(point, index) {
        // Use the already implemented getHurricaneCategory function
        const category = isSpecified(point.wind_speed) ? getHurricaneCategory(point.wind_speed) : null;
        
        // Check if this is a best track (either isBestTrack flag or model is BEST)
        const isBestTrack = point.isBestTrack || point.model === 'BEST';
        
        // Handle both ADECK and regular CSV points
        const timeSection = point.tau !== undefined ?
            `<div class="metric">
                <strong class="var-name">Init Time:</strong> 
                <span class="var-value">${isBestTrack ? "N/A" : (point.initTime ? formatPointTime(new Date(point.initTime), true) : "Unknown")}</span>
            </div>
            <div class="metric">
                <strong class="var-name">Valid Time:</strong> 
                <span class="var-value">${window.formatAdeckTime(point)}</span>
            </div>` :
            `<div class="metric">
                <strong class="var-name">Time:</strong> 
                <span class="var-value">${formatPointTime(getPointTimestamp(point), true)}</span>
            </div>`;
        
        const categoryBadgeStyle = category ?
            `background-color: ${category.color}; color: #000;` :
            `background-color: #999; color: #fff;`;
            
        const categoryName = category ? category.name : "Not Specified";
        
        return `
            <div class="popup-content">
                <div class="popup-header" style="background-color:${category ? category.color+'40' : '#99999940'}; border-color:${category ? category.color : '#999'}">
                    <span class="popup-category" style="${categoryBadgeStyle}">${categoryName}</span>
                    <strong>${point.cycloneName || 'Cyclone'}</strong>
                    ${point.cycloneId ? `<small>${point.cycloneId}</small>` : ''}
                </div>
                <div class="popup-metrics">
                    <div class="metric">
                        <strong class="var-name">Position:</strong> 
                        <span class="var-value">${point.latitude.toFixed(2)}°, ${point.longitude.toFixed(2)}°</span>
                    </div>
                    ${timeSection}
                    <div class="metric">
                        <strong class="var-name">Wind Speed:</strong> 
                        <span class="var-value">${formatWindSpeed(point.wind_speed)}</span>
                    </div>
                    <div class="metric">
                        <strong class="var-name">Pressure:</strong> 
                        <span class="var-value">${formatPressure(point.mslp)}</span>
                    </div>
                    ${point.rmw ? `<div class="metric">
                        <strong class="var-name">RMW:</strong> 
                        <span class="var-value">${formatParameter(point.rmw, val => metersToDisplayUnits(val))}</span>
                    </div>` : ''}
                    ${point.roci ? `<div class="metric">
                        <strong class="var-name">ROCI:</strong> 
                        <span class="var-value">${formatParameter(point.roci, val => metersToDisplayUnits(val))}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    };
}

// New function to deselect all points and clear visualizations
function deselectAll() {
    // Reset selected point
    selectedPoint = null;
    selectedPointIndex = null;
    
    // Remove floating dialog if it exists
    removeFloatingDialog();
    
    // Clear all isochrones
    clearIsochrones();
    
    // Clear all storm visualizations
    clearAllStormVisualizations();
    
    // Deselect any track in ADECK data
    if (selectedStormId !== null) {
        selectedStormId = null;
        
        // Update visual state of ADECK tracks to show all equally
        if (window.adeckLines) {
            window.adeckLines.forEach(line => {
                // Reset all lines to default style
                line.setStyle({
                    opacity: 0.8,
                    weight: 2,
                    dashArray: '5, 5'
                });
                
                // Remove selected-track class
                line._path.classList.remove('selected-track');
            });
        }
        
        // Reset all markers to full opacity
        if (window.adeckMarkers) {
            window.adeckMarkers.forEach(marker => {
                marker.setOpacity(0.8);
                // Reset z-index offsets
                const isFirstPoint = marker.pointIndex === 0;
                marker.setZIndexOffset(isFirstPoint ? 500 : 0);
            });
        }
        
        // Apply updated symbology
        updateAdeckSymbology();
    }
    
    // Reset appearance of all cyclone track points
    resetPointAppearance();
    
    // Show notification
    showNotification('All selections cleared', 'info', 1500);
}

// Handle document clicks to close floating dialog when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    
    // Add event handler for deselect-all button
    const deselectAllBtn = document.getElementById('deselect-all');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', function() {
            deselectAll();
        });
    } else {
        console.warn("Could not find deselect-all button, will create one");
        
        // Create deselect-all button if it doesn't exist
        createDeselectAllButton();
    }
    
    // ...existing code...
});

// Function to create the deselect-all button dynamically if it doesn't exist in the HTML
function createDeselectAllButton() {
    // Create the button element
    const deselectBtn = document.createElement('button');
    deselectBtn.id = 'deselect-all';
    deselectBtn.className = 'control-btn deselect-btn';
    deselectBtn.title = 'Clear all selections';
    deselectBtn.innerHTML = '<i class="fas fa-times-circle"></i> Clear Selections';
    
    // Add click event listener
    deselectBtn.addEventListener('click', deselectAll);
    
    // Find where to place the button - add to compact-controls
    const compactControls = document.querySelector('.compact-controls');
    if (compactControls) {
        compactControls.appendChild(deselectBtn);
        console.log("Added deselect-all button to compact-controls");
    } else {
        // If compact-controls doesn't exist, add button directly to the map container for easy access
        const mapContainer = document.getElementById('map-container');
        if (mapContainer) {
            deselectBtn.style.position = 'absolute';
            deselectBtn.style.top = '10px';
            deselectBtn.style.right = '100px'; // Position to the left of potential other controls
            deselectBtn.style.zIndex = '1000'; // High z-index to be above map
            mapContainer.appendChild(deselectBtn);
            console.log("Added deselect-all button to map container");
        } else {
            console.error("Could not find suitable container for deselect-all button");
        }
    }
    
    // Add button styles if needed
    const style = document.createElement('style');
    style.textContent = `
        .deselect-btn {
            background-color: rgba(40, 40, 40, 0.8);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background-color 0.2s;
        }
        
        .deselect-btn:hover {
            background-color: rgba(60, 60, 60, 0.9);
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        .deselect-btn i {
            font-size: 14px;
        }
        
        /* Use a red X icon */
        .fa-times-circle:before {
            content: "✖";
            color: #ff6b6b;
        }
    `;
    document.head.appendChild(style);
}

function displayBdeckTrack(storm) {
    // Clear existing markers and visualizations
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    clearAllStormVisualizations();

    // Iterate through each point in the storm track
    storm.points.forEach((point, index) => {
        // Add a marker for each point
        const marker = L.marker([point.latitude, point.longitude], {
            title: `Point ${index}`,
            icon: L.divIcon({
                className: 'bdeck-marker',
                html: `<div style="background-color: #0066cc; width: 10px; height: 10px; border-radius: 50%;"></div>`,
                iconSize: [10, 10],
                iconAnchor: [5, 5]
            })
        });

        // Add click event to display storm attributes
        marker.on('click', () => {
            clearAllStormVisualizations();
            displayStormAttributes(index);
        });

        marker.addTo(map);
        markers.push(marker);
    });

    // Draw a polyline for the track
    const trackLine = L.polyline(
        storm.points.map(point => [point.latitude, point.longitude]),
        {
            color: '#0066cc',
            weight: 2,
            opacity: 0.8
        }
    ).addTo(map);

    // Fit the map to the track bounds
    const bounds = L.latLngBounds(storm.points.map(point => [point.latitude, point.longitude]));
    map.fitBounds(bounds);
}

function loadBdeckTrack(bdeckData) {
    // Parse the B-deck data into a storm object
    const storm = parseBdeckData(bdeckData);

    // Display the B-deck track on the map
    displayBdeckTrack(storm);
}

function parseBdeckData(bdeckData) {
    // Parse the B-deck data into a structured storm object
    const lines = bdeckData.split('\n').filter(line => line.trim());
    const points = lines.map(line => {
        const fields = line.split(',').map(field => field.trim());
        return {
            latitude: parseFloat(fields[6]) / 10, // Convert to decimal degrees
            longitude: -parseFloat(fields[7]) / 10, // Convert to decimal degrees
            windSpeed: parseInt(fields[8], 10),
            pressure: parseInt(fields[9], 10),
            r34_ne: parseInt(fields[13], 10) || NaN,
            r34_se: parseInt(fields[14], 10) || NaN,
            r34_sw: parseInt(fields[15], 10) || NaN,
            r34_nw: parseInt(fields[16], 10) || NaN
        };
    });

    return { points };
}

// Document ready event handling
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
    
    // Add event listener for toggle-isochrones button
    const toggleIsochronesBtn = document.getElementById('toggle-isochrones');
    if (toggleIsochronesBtn) {
        toggleIsochronesBtn.addEventListener('click', toggleIsochrones);
        console.log("Attached event listener to isochrones toggle button");
    } else {
        console.warn("Could not find toggle-isochrones button");
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
    
    // Enable drag and drop for all file types (CSV, shapefile, ADECK)
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        // Add click handler to the entire drop-zone
        dropZone.addEventListener('click', function(e) {
            // Don't handle clicks on the button itself (let the button's handler work)
            if (e.target.id !== 'upload-btn' && !e.target.closest('#upload-btn')) {
                // Trigger the file input click
                const fileInput = document.getElementById('csv-file');
                if (fileInput) {
                    fileInput.click();
                }
            }
        });
        
        // Prevent default behaviors for all drag events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Add highlight class on dragenter/dragover
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });
        
        // Remove highlight class on dragleave/drop
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
            dropZone.classList.add('highlight');
        }
        
        function unhighlight() {
            dropZone.classList.remove('highlight');
        }
        
        // Unified file drop handler for CSV, shapefiles, and ADECK files
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length === 0) return;
            
            // Get file extension to determine how to process
            const file = files[0];
            const fileName = file.name.toLowerCase();
            const extension = fileName.split('.').pop();
            
            // Check for shapefile types
            if (['shp', 'dbf', 'prj', 'zip', 'json', 'geojson', 'kml'].includes(extension)) {
                // Update loading count
                shapefileCount = files.length;
                updateLoadingCount(shapefileCount);
                
                // Process shapefile
                loadShapefile(files);
            } 
            // Check for ADECK file types
            else if (['dat', 'txt', 'adeck'].includes(extension)) {
                loadAdeckFile(file);
            }
            // Handle CSV file
            else if (extension === 'csv' || file.type === 'text/csv') {
                document.getElementById('csv-file').files = dt.files;
                loadCSVFile(file);
            } 
            else {
                showNotification('Please drop a valid CSV, ADECK, or shapefile', 'warning');
            }
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
            if (!floatingDialog.element.contains(e.target) && 
                !e.target.closest('.leaflet-marker-icon') && 
                !e.target.closest('.hurricane-marker')) {
                removeFloatingDialog();
                
                // Don't reset appearance when in Edit Cyclone Parameters mode (not edit mode)
                // This keeps storm visualizations visible when clicking elsewhere on the map
                if (editMode) {
                    resetPointAppearance();
                }
            }
        }
    });

    // Make sure map container clicks don't remove visualizations in parameter edit mode
    const mapContainer = document.getElementById('map'); 
    if (mapContainer) {
        mapContainer.addEventListener('click', function(e) {
            // If we're in parameter edit mode (not editMode) and not clicking on a marker,
            // prevent clearing storm visualizations
            if (!editMode && selectedPoint !== null && 
                !e.target.closest('.leaflet-marker-icon') && 
                !e.target.closest('.hurricane-marker')) {
                // Stop event propagation to prevent dialog removal
                e.stopPropagation();
                
                // If the floating dialog was open, just close it without resetting appearance
                if (floatingDialog) {
                    removeFloatingDialog();
                }
            }
        });
    }
    
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

    // ADECK file input handler
    const adeckFileInput = document.getElementById('adeck-file');
    if (adeckFileInput) {
        adeckFileInput.addEventListener('change', handleAdeckFileSelect);
    }

    // ADECK upload button handler
    const adeckUploadBtn = document.getElementById('adeck-upload-btn');
    if (adeckUploadBtn) {
        adeckUploadBtn.addEventListener('click', function() {
            const fileInput = document.getElementById('adeck-file');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    // Create a reopen button when closing the dialog
    const reopenButton = document.createElement('button');
    reopenButton.id = 'reopen-adeck-dialog';
    reopenButton.className = 'reopen-adeck-btn';
    reopenButton.innerHTML = '<i class="fas fa-hurricane"></i> Show A/B-Deck Selector';
    reopenButton.title = 'Reopen A/B-Deck Track Selector';
    reopenButton.style.display = 'none'; // Initially hidden
    
    // Position below the zoom/fullscreen controls in the left side
    reopenButton.style.position = 'absolute';
    reopenButton.style.top = '140px'; // Increased from 100px to position further below fullscreen control
    reopenButton.style.left = '10px';
    reopenButton.style.zIndex = '1000';
    
    // Add click handler
    reopenButton.addEventListener('click', reopenAdeckDialog);
    
    // Add to map container
    const mapContainerEl = document.getElementById('map-container'); // Renamed to avoid conflict
    if (mapContainerEl) {
        mapContainerEl.appendChild(reopenButton);
    }
    
    // Create a mutation observer to watch for dialog removal
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                // Check if the storm selection dialog was removed
                for (let i = 0; i < mutation.removedNodes.length; i++) {
                    const node = mutation.removedNodes[i];
                    if (node.id === 'adeck-storm-selection') {
                        // Show the reopen button if we have A-deck data
                        if (window.adeckStorms && window.adeckStorms.length > 0) {
                            reopenButton.style.display = 'block';
                            adeckDialogWasShown = true;
                        }
                    }
                }
            }
        });
    });
    
    // Start observing the document body for removed nodes
    observer.observe(document.body, { childList: true });
    
    // Create a style element for the reopen button
    const style = document.createElement('style');
    style.textContent = `
        .reopen-adeck-btn {
            background-color: rgba(40, 40, 40, 0.8);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 5px;
            transition: background-color 0.2s;
        }
        
        .reopen-adeck-btn:hover {
            background-color: rgba(60, 60, 60, 0.9);
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        .reopen-adeck-btn i {
            font-size: 16px;
        }
    `;
    document.head.appendChild(style);
});