/**
 * Custom popup template function for consistent popup formatting
 */
function formatPopupContent(point, index) {
    // Format number with commas and decimal places
    function formatNum(number, decimals = 2) {
        if (number === undefined || number === null || isNaN(number)) {
            return "N/A";
        }
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }
    
    // Format coordinates to degrees with cardinal directions
    function formatCoordinates(lat, lon) {
        if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
            return "N/A";
        }
        
        // Format latitude with N or S
        const latDirection = lat >= 0 ? 'N' : 'S';
        const latDegrees = Math.abs(lat).toFixed(4);
        const latFormatted = `${latDegrees}° ${latDirection}`;
        
        // Format longitude with E or W
        const lonDirection = lon >= 0 ? 'E' : 'W';
        const lonDegrees = Math.abs(lon).toFixed(4);
        const lonFormatted = `${lonDegrees}° ${lonDirection}`;
        
        return `${latFormatted}, ${lonFormatted}`;
    }
    
    // Format datetime fields into a single string
    function formatDateTime(point) {
        // Check if we have the necessary UTC time fields
        if (point.year_utc !== undefined && 
            point.month_utc !== undefined && 
            point.day_utc !== undefined) {
            
            // Pad month and day with leading zeros if needed
            const month = String(point.month_utc).padStart(2, '0');
            const day = String(point.day_utc).padStart(2, '0');
            
            // Default hour to 0 if not present
            const hour = point.hour_utc !== undefined ? 
                String(point.hour_utc).padStart(2, '0') : '00';
            
            // Default minute to 0 if not present
            const minute = point.minute_utc !== undefined ? 
                String(point.minute_utc).padStart(2, '0') : '00';
            
            return `${point.year_utc}-${month}-${day} ${hour}:${minute} UTC`;
        }
        
        return "N/A";
    }
    
    // Format wind speed with unit awareness - get current unitSystem from window
    function formatWindUnit(speed) {
        const currentUnitSystem = typeof window.unitSystem !== 'undefined' ? window.unitSystem : 'metric';
        console.log("Formatting wind with unit system:", currentUnitSystem);
        
        if (currentUnitSystem === 'metric') {
            return `${formatNum(speed || 0)} m/s`;
        } else {
            const conversion = window.UNIT_CONVERSIONS ? window.UNIT_CONVERSIONS.WIND_MS_TO_MPH : 2.23694;
            return `${formatNum((speed || 0) * conversion)} mph`;
        }
    }
    
    // Format distance with unit awareness - updated for meter values
    function formatDistanceUnit(valueMeters) {
        if (valueMeters === undefined || valueMeters === null || isNaN(valueMeters)) {
            return "N/A";
        }
        
        const currentUnitSystem = typeof window.unitSystem !== 'undefined' ? window.unitSystem : 'metric';
        
        if (currentUnitSystem === 'metric') {
            // Convert meters to kilometers
            return `${formatNum(valueMeters * 0.001, 0)} km`;
        } else {
            // Convert meters to miles (m -> km -> miles)
            return `${formatNum(valueMeters * 0.001 * 0.621371, 0)} mi`;
        }
    }
    
    // Get the hurricane category to style the popup
    const category = getHurricaneCategory(point.wind_speed);
    
    // Increased max-height from 500px to 625px (25% taller)
    let content = `<div class="popup-content" style="border-color:${category.color}; max-height: 625px;">`;
    
    // Header section with same color as border but improved text contrast
    content += `<div class="popup-header" style="background-color:${category.color}40; border-color:${category.color}">
        <strong style="color: #ffffff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);">Cyclone Position #${index}</strong>
        <span class="popup-category" style="background-color:${category.color}; color:#000000; text-shadow:none;">
            ${category.name}
        </span>
    </div>`;
    
    // Key metrics section with aligned values and consistent unit display - use wider class
    // Add a mini-header for key metrics
    content += `
        <div class="metric-divider">
            <span class="metric-section">KEY METRICS</span>
        </div>`;
    content += `<div class="popup-metrics wide-metrics">
        <div class="metric">
            <strong class="var-name">MAX. WIND SPEED:</strong> 
            <span class="var-value">${formatWindUnit(point.wind_speed)}</span>
        </div>
        <div class="metric">
            <strong class="var-name">MIN. PRESSURE:</strong> 
            <span class="var-value">${point.mslp || 'N/A'} hPa</span>
        </div>
        <div class="metric">
            <strong class="var-name">POSITION:</strong> 
            <span class="var-value">${formatCoordinates(point.latitude, point.longitude)}</span>
        </div>`;
    
    // Add DateTime if available
    const dateTime = formatDateTime(point);
    if (dateTime !== "N/A") {
        content += `
        <div class="metric">
            <strong class="var-name">TIME:</strong> 
            <span class="var-value">${dateTime}</span>
        </div>`;
    }
    
    // Add storm radius metrics
    const radiusMetrics = [
        { key: 'rmw', label: 'RMW' },
        { key: 'r34_ne', label: 'R34 NE' },
        { key: 'r34_se', label: 'R34 SE' },
        { key: 'r34_sw', label: 'R34 SW' },
        { key: 'r34_nw', label: 'R34 NW' },
        { key: 'roci', label: 'ROCI' }
    ];
    
    // Add a mini-header for storm size parameters
    content += `
        <div class="metric-divider">
            <span class="metric-section">STORM SIZE</span>
        </div>`;
    
    // Add each radius parameter
    radiusMetrics.forEach(metric => {
        // Get value from either short or long format
        let value = point[metric.key];
        
        // Skip if still no value
        if (value === undefined || value === null) return;
        
        content += `
        <div class="metric radius-metric">
            <strong class="var-name">${metric.label}:</strong> 
            <span class="var-value">${formatDistanceUnit(value)}</span>
        </div>`;
    });
    
    content += `</div>`;
    
    content += '</div>'; // Close popup-content
    
    return content;
}

// Override Leaflet's default bindPopup to apply custom styling
L.Marker.prototype._originalBindPopup = L.Marker.prototype.bindPopup;
L.Marker.prototype.bindPopup = function(content, options) {
    // Get the point data from marker (assumes marker.pointIndex exists)
    if (typeof this.pointIndex !== 'undefined' && Array.isArray(window.data)) {
        const point = window.data[this.pointIndex];
        if (point) {
            const category = getHurricaneCategory(point.wind_speed);
            
            // Set popup options with custom class and border color
            options = L.extend({
                className: `category-popup category-${category.name.toLowerCase().replace(/\s+/g, '-')}`,
                borderColor: category.color,
                offset: L.point(30, 0), // Offset popup to the right
                autoPanPadding: [50, 50],
                closeButton: true,
                maxWidth: 320, // Increased from default to ensure wider popup
                minWidth: 300, // Set minimum width to prevent narrow popups
                minHeight: 450, // Increased from 350px to show more content
                maxHeight: 650 // Increased from 500px to show more content
            }, options);
            
            // Add CSS for minimum height if not already in document
            if (!document.getElementById('popup-min-height-style')) {
                const style = document.createElement('style');
                style.id = 'popup-min-height-style';
                style.textContent = `
                    .leaflet-popup-content {
                        min-height: 450px; /* Increased from 350px */
                        max-height: 650px; /* Increased from 500px */
                        overflow-y: auto;
                        overflow-x: hidden;
                        padding: 0;
                    }
                    
                    /* Ensure popup container is tall enough */
                    .leaflet-popup {
                        min-height: 450px; /* Increased from 350px */
                    }
                    
                    /* Improve scrolling behavior */
                    .leaflet-popup-scrolled {
                        border-top: none;
                        border-bottom: none;
                        overflow: auto; /* Ensure scrolling works */
                    }
                    
                    /* Ensure popup content fills available space */
                    .popup-content {
                        height: auto;
                        min-height: 450px; /* Increased from 350px */
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }
    
    // Use original bindPopup, but store a reference to the popup
    const result = this._originalBindPopup(content, options);
    
    // Add custom event handler to reposition popup on open
    this.on('popupopen', function(e) {
        // Force right-side positioning after popup opens
        setTimeout(() => {
            const popup = e.popup;
            if (popup && popup._container) {
                // Get positions
                const markerPoint = this._map.latLngToContainerPoint(this.getLatLng());
                const popupPoint = this._map.latLngToContainerPoint(popup.getLatLng());
                
                // If popup is not to the right of the marker, move it there
                if (popupPoint.x <= markerPoint.x + 15) {
                    const newLatLng = this._map.containerPointToLatLng(
                        L.point(markerPoint.x + 250, markerPoint.y)
                    );
                    popup.setLatLng(newLatLng);
                }
            }
        }, 10);
    });
    
    return result;
};

// Create a right-side popup positioning function
function positionPopupToRight(marker, popup) {
    // Get the marker's pixel position
    const map = marker._map;
    const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
    
    // Calculate a position to the right of the marker
    const rightPoint = L.point(markerPoint.x + 80, markerPoint.y);
    const rightLatLng = map.containerPointToLatLng(rightPoint);
    
    // Set the popup position
    popup.setLatLng(rightLatLng);
    
    // After positioning, ensure the popup doesn't get cut off at the bottom of the screen
    const popupEl = popup._container;
    if (popupEl) {
        const popupHeight = popupEl.offsetHeight;
        const mapHeight = map.getContainer().offsetHeight;
        const popupTop = popupEl.offsetTop;
        
        // If popup would extend below the map, adjust its position
        if (popupTop + popupHeight > mapHeight - 20) {
            const newTop = Math.max(20, mapHeight - 20 - popupHeight);
            popupEl.style.top = newTop + 'px';
        }
    }
    
    return popup;
}

// Add global function for repositioning popups
window.positionPopupToRight = positionPopupToRight;

// Add a style tag to ensure popups have enough room
const popupStyle = document.createElement('style');
popupStyle.textContent = `
    .leaflet-popup-content {
        margin: 8px;
        overflow-y: auto;
    }
    
    .category-popup .leaflet-popup-content-wrapper {
        max-height: 95vh; /* Increased from 80vh */
    }
    
    .popup-content {
        max-height: 90vh; /* Increased from 70vh */
        overflow-y: auto;
    }
    
    /* Ensure metric sections don't get squished */
    .popup-metrics .metric {
        margin-bottom: 6px;
    }
`;
document.head.appendChild(popupStyle);

// Make this function globally available
window.formatPopupContent = formatPopupContent;
