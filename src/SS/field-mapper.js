/**
 * Utility functions for mapping between long and short field names
 * for storm radius parameters
 */

// Mappings between long and short field names
const fieldMappings = {
    // Long to short mappings - UPDATED to match exact CSV column names
    'radius_of_maximum_winds_m': 'rmw',
    'radius_of_34_kt_winds_ne_m': 'r34_ne',
    'radius_of_34_kt_winds_se_m': 'r34_se',
    'radius_of_34_kt_winds_sw_m': 'r34_sw',
    'radius_of_34_kt_winds_nw_m': 'r34_nw',
    'radius_of_outer_closed_isobar_m': 'roci',
};

// Create reverse mappings (short to long)
const reverseFieldMappings = {};
Object.entries(fieldMappings).forEach(([longName, shortName]) => {
    reverseFieldMappings[shortName] = longName;
});

/**
 * Convert a long field name to its short version
 * @param {string} longName - The long field name (e.g. radius_of_34_kt_winds_ne_m)
 * @returns {string} The short field name (e.g. r34_ne) or the original name if no mapping exists
 */
function getLongToShortName(longName) {
    return fieldMappings[longName] || longName;
}

/**
 * Convert a short field name to its long version
 * @param {string} shortName - The short field name (e.g. r34_ne)
 * @returns {string} The long field name (e.g. radius_of_34_kt_winds_ne_m) or the original name if no mapping exists
 */
function getShortToLongName(shortName) {
    return reverseFieldMappings[shortName] || shortName;
}

/**
 * Convert field names in an object from long to short format
 * @param {Object} dataObj - Object with long field names
 * @returns {Object} New object with short field names
 */
function convertObjectToShortNames(dataObj) {
    const result = {};
    
    Object.entries(dataObj).forEach(([key, value]) => {
        const shortKey = getLongToShortName(key);
        result[shortKey] = value;
    });
    
    return result;
}

/**
 * Convert field names in an object from short to long format
 * @param {Object} dataObj - Object with short field names
 * @returns {Object} New object with long field names
 */
function convertObjectToLongNames(dataObj) {
    const result = {};
    
    Object.entries(dataObj).forEach(([key, value]) => {
        const longKey = getShortToLongName(key);
        result[longKey] = value;
    });
    
    return result;
}

// Make functions available globally
window.getLongToShortName = getLongToShortName;
window.getShortToLongName = getShortToLongName;
window.convertObjectToShortNames = convertObjectToShortNames;
window.convertObjectToLongNames = convertObjectToLongNames;
