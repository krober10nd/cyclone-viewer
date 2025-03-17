/**
 * Enhanced map legend with unit conversions
 */
function createMapLegend() {
    // Get existing legend div or create new one
    const legendDiv = document.querySelector('.map-legend') || 
                      document.createElement('div');
    
    if (!legendDiv.classList.contains('map-legend')) {
        legendDiv.className = 'map-legend';
        document.getElementById('map-container').appendChild(legendDiv);
    }
    
    // Create legend with units in km
    const legendItems = [
        { key: 'rmw', label: 'RMW', color: 'var(--rmw-color)' },
        { key: 'r34_ne', label: 'R34 NE', color: 'var(--r34-ne-color)' },
        { key: 'r34_se', label: 'R34 SE', color: 'var(--r34-se-color)' },
        { key: 'r34_sw', label: 'R34 SW', color: 'var(--r34-sw-color)' },
        { key: 'r34_nw', label: 'R34 NW', color: 'var(--r34-nw-color)' },
        { key: 'roci', label: 'ROCI', color: 'var(--roci-color)' }
    ];
    
    // Clear and rebuild legend
    legendDiv.innerHTML = '';
    
    // Add units note at top
    const unitsNote = document.createElement('div');
    unitsNote.className = 'legend-title';
    unitsNote.textContent = 'Storm Size (km)';
    legendDiv.appendChild(unitsNote);
    
    // Add legend items
    legendItems.forEach(item => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        
        const colorDot = document.createElement('span');
        colorDot.className = `color-dot ${item.key}`;
        colorDot.style.backgroundColor = item.color;
        
        const label = document.createTextNode(' ' + item.label);
        
        legendItem.appendChild(colorDot);
        legendItem.appendChild(label);
        legendDiv.appendChild(legendItem);
    });
    
    return legendDiv;
}

// Add to global scope
window.createMapLegend = createMapLegend;
