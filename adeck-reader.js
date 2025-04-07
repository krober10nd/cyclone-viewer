/**
 * ADECK File Reader
 * Parses ADECK format (Automated Tropical Cyclone Forecast) files and converts to a format usable by the cyclone viewer
 */

window.AdeckReader = {
    // Initialize hiddenTracks as an object at the top level
    hiddenTracks: {},


    addFixViewButton: function() {
        const dialog = document.getElementById('adeck-storm-selection');
        if (dialog) {
            // Create the Fix View button
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

            // Append the button to the dialog
            dialog.appendChild(fixViewButton);
        }
    },

    /**
     * Parse ADECK file content and extract storm tracks
     * @param {string} content - Raw text content of the ADECK file
     * @returns {Object} Object containing storm tracks and metadata
     */
    parseAdeckFile: function(content) {
        console.log("Parsing ADECK file...");
        
        // Split content into lines and filter out empty lines and comments
        const lines = content.split(/\r?\n/).filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('#');
        });
        
        if (lines.length === 0) {
            console.error("ADECK file is empty or contains only comments");
            return { storms: [], count: 0 };
        }
        
        // Check if the first line is a header
        const firstLine = lines[0].trim().toUpperCase();
        const isHeader = firstLine.includes("BASIN") && 
                        (firstLine.includes("CYCLONE") || firstLine.includes("CYCLONE_NUM")) && 
                        firstLine.includes("LAT") && 
                        firstLine.includes("LON");
        
        // Extract column indices from header or use defaults
        let columnMap = this.getDefaultColumnMap();
        
        if (isHeader) {
            console.log("Found header row:", firstLine);
            columnMap = this.parseHeaderRow(firstLine);
            // Remove header from lines to process
            lines.shift();
        }
        
        console.log("Using column mapping:", columnMap);
        
        // For storing all storms by their unique ID
        const stormsByModelAndInit = {};
        
        // Process each line
        let processedLines = 0;
        
        lines.forEach((line, lineIndex) => {
            try {
                const parts = line.split(',').map(part => part.trim());
                
                // Skip lines that don't have enough parts
                if (parts.length < Math.max(columnMap.lat, columnMap.lon, columnMap.model) + 1) {
                    console.warn(`Line ${lineIndex + 1} has insufficient data (${parts.length} columns)`);
                    return;
                }
                
                // Extract values using column map
                const record = this.extractValuesFromLine(parts, columnMap);
                
                // Skip if critical data is missing
                if (!record || 
                    !record.basin || 
                    !record.number || 
                    !record.initYYYYMMDDHH || 
                    !record.model || 
                    record.latitude === undefined || 
                    record.longitude === undefined) {
                    console.warn(`Skipping line ${lineIndex + 1} due to missing critical data`);
                    return;
                }
                
                // Create a storm ID based on basin, cyclone number, and year
                const year = record.initYYYYMMDDHH.substring(0, 4);
                const stormId = `${record.basin}${record.number}${year}`;
                
                // Format official cyclone identifier (e.g., "aal162004")
                const cycloneId = this.formatCycloneId(record.basin, record.number, year);
                
                // Create a unique model/init time key
                const modelInitKey = `${stormId}_${record.model}_${record.initYYYYMMDDHH}`;
                
                // Get or create storm object
                if (!stormsByModelAndInit[modelInitKey]) {
                    // Format initialization time nicely for display
                    const initDate = this.formatDateTime(record.initYYYYMMDDHH);
                    
                    // Create a human-readable cyclone name
                    const cycloneName = this.formatCycloneName(record.basin, record.number, year);
                    
                    stormsByModelAndInit[modelInitKey] = {
                        id: modelInitKey,
                        stormId: stormId,
                        name: `${record.model} [${initDate}]`,
                        basin: record.basin,
                        year: parseInt(year),
                        number: record.number,
                        model: record.model,
                        initTime: record.initYYYYMMDDHH,
                        cycloneId: cycloneId,     // Add formatted cyclone ID (e.g., "aal162004")
                        cycloneName: cycloneName, // Add human-readable name (e.g., "AL16 (2004)")
                        points: []
                    };
                }
                
                // Convert ADECK point to cyclone viewer format
                const point = this.convertPointFormat(record);
                
                // Add point to storm only if it has valid coordinates
                if (point && !isNaN(point.latitude) && !isNaN(point.longitude)) {
                    stormsByModelAndInit[modelInitKey].points.push(point);
                    processedLines++;
                } else {
                    console.warn(`Skipping point with invalid coordinates: lat=${point?.latitude}, lon=${point?.longitude}`);
                }
            } catch (error) {
                console.error(`Error parsing line ${lineIndex + 1}:`, error, line);
            }
        });
        
        // Convert to array and sort storm points by forecast hour (TAU)
        const storms = Object.values(stormsByModelAndInit).map(storm => {
            storm.points.sort((a, b) => a.tau - b.tau);
            return storm;
        });

        console.log("Storm init times:", storms.map(s => s.initTime));
        
        console.log(`Parsed ${storms.length} forecast tracks with ${processedLines} valid points from ADECK file`);
        return {
            storms: storms,
            count: storms.length
        };
    },

    /**
     * Get default column mapping for ADECK format
     */
    getDefaultColumnMap: function() {
        return {
            basin: 0,         // BASIN
            cycloneNum: 1,    // CYCLONE_NUM
            initTime: 2,      // YYYYMMDDHH
            tau: 3,           // TAU (HH since init time)
            model: 4,         // MODEL (name of the forecast model)
            forecast_lead: 5, // Forecast lead time (not always present)
            lat: 6,           // LAT 
            lon: 7,           // LON
            vmax: 8,          // VMAX
            mslp: 9,          // MSLP
            stormType: 10     // TY (tropical depression, tropical storm, etc.)
        };
    },

    /**
     * Parse header row to determine column positions
     */
    parseHeaderRow: function(headerLine) {
        const parts = headerLine.split(',').map(part => part.trim().toUpperCase());
        const columnMap = {};
        
        parts.forEach((header, index) => {
            if (header === 'BASIN') columnMap.basin = index;
            else if ((header === 'CYCLONE_NUM' || header === 'CYCLONE' || header.includes('CY')) && header.includes('NUM')) columnMap.cycloneNum = index;
            else if (header === 'YYYYMMDDHH' || header.includes('DATE') || header.includes('TIME')) columnMap.initTime = index;
            else if (header === 'MODEL' || header.includes('TECH')) columnMap.model = index;
            else if (header === 'TAU' || header.includes('HOUR') || header.includes('FHOUR')) columnMap.tau = index;
            else if (header === 'FORECAST_LEAD' || header === 'LEAD' || header === 'LEAD_TIME') columnMap.forecast_lead = index;
            else if (header === 'LAT') columnMap.lat = index;
            else if (header === 'LON') columnMap.lon = index;
            else if (header === 'VMAX' || header.includes('WIND')) columnMap.vmax = index;
            else if (header === 'MSLP' || header.includes('PRES')) columnMap.mslp = index;
            else if (header === 'TY' || header.includes('TYPE')) columnMap.stormType = index;
        });
        
        // Fallback to defaults for any missing columns
        const defaults = this.getDefaultColumnMap();
        for (const key in defaults) {
            if (columnMap[key] === undefined) {
                columnMap[key] = defaults[key];
                console.log(`Header missing ${key}, using default position ${defaults[key]}`);
            }
        }
        
        return columnMap;
    },

    /**
     * Extract values from a line using column mapping
     */
    extractValuesFromLine: function(parts, columnMap) {
        if (!parts || parts.length <= Math.max(columnMap.lat, columnMap.lon)) {
            console.warn("Line has insufficient columns for lat/lon");
            return null;
        }
        
        const record = {
            basin: parts[columnMap.basin] || 'XX',
            number: parts[columnMap.cycloneNum] || '00',
            initYYYYMMDDHH: parts[columnMap.initTime] || '0000000000',
            model: parts[columnMap.model] || 'UNKN',
        };
        
        // Determine forecast lead time, prioritizing forecast_lead over tau if available
        if (columnMap.forecast_lead !== undefined && parts[columnMap.forecast_lead] && parts[columnMap.forecast_lead].trim() !== '') {
            record.forecast_lead = parseInt(parts[columnMap.forecast_lead]) || 0;
            // Also set tau for backward compatibility
            record.tau = record.forecast_lead;
        } else {
            record.tau = parseInt(parts[columnMap.tau]) || 0;
            record.forecast_lead = record.tau; // Set forecast_lead to tau for consistency
        }
        
        const initDateTime = record.initYYYYMMDDHH;
        if (initDateTime && initDateTime.length >= 10) {
            record.year = parseInt(initDateTime.substring(0, 4));
            record.month = parseInt(initDateTime.substring(4, 6));
            record.day = parseInt(initDateTime.substring(6, 8));
            record.hour = parseInt(initDateTime.substring(8, 10));
            record.minute = 0;
        } else {
            const now = new Date();
            record.year = now.getUTCFullYear();
            record.month = now.getUTCMonth() + 1;
            record.day = now.getUTCDate();
            record.hour = now.getUTCHours();
            record.minute = 0;
        }
        
        try {
            const latPart = parts[columnMap.lat];
            if (latPart) {
                if (latPart.includes('N') || latPart.includes('S')) {
                    const numericPart = latPart.replace(/[NS]/g, '');
                    const latValue = parseFloat(numericPart);
                    const adjustedLatValue = numericPart.includes('.') ? latValue : latValue / 10.0;
                    record.latitude = latPart.includes('S') ? -adjustedLatValue : adjustedLatValue;
                    record.latitudeFormatted = `${adjustedLatValue.toFixed(1)}°${latPart.includes('S') ? 'S' : 'N'}`;
                } else {
                    let latValue = parseFloat(latPart);
                    if (Math.abs(latValue) > 90) {
                        latValue = latValue / 10.0;
                    }
                    record.latitude = latValue;
                    record.latitudeFormatted = `${latValue.toFixed(1)}°${latValue >= 0 ? 'N' : 'S'}`;
                }
            }
        } catch (e) {
            console.error("Error parsing latitude:", parts[columnMap.lat], e);
        }
        
        try {
            const lonPart = parts[columnMap.lon];
            if (lonPart) {
                if (lonPart.includes('E') || lonPart.includes('W')) {
                    const numericPart = lonPart.replace(/[EW]/g, '');
                    const lonValue = parseFloat(numericPart);
                    const adjustedLonValue = numericPart.includes('.') ? lonValue : lonValue / 10.0;
                    record.longitude = lonPart.includes('W') ? -adjustedLonValue : adjustedLonValue;
                    record.longitudeFormatted = `${adjustedLonValue.toFixed(1)}°${lonPart.includes('W') ? 'W' : 'E'}`;
                } else {
                    let lonValue = parseFloat(lonPart);
                    if (Math.abs(lonValue) > 180) {
                        lonValue = lonValue / 10.0;
                    }
                    if ((record.basin === 'AL' || record.basin === 'EP' || record.basin === 'CP') && lonValue > 0) {
                        record.longitude = -lonValue;
                    } else {
                        record.longitude = lonValue;
                    }
                    record.longitudeFormatted = `${Math.abs(lonValue).toFixed(1)}°${lonValue >= 0 ? 'E' : 'W'}`;
                }
            }
        } catch (e) {
            console.error("Error parsing longitude:", parts[columnMap.lon], e);
        }

        // Skip records with (0,0) coordinates
        if (record.latitude === 0. && record.longitude === 0.) {
            console.warn("Skipping point with (0,0) coordinates");
            return null;
        }
        
        if (parts[columnMap.vmax] && parts[columnMap.vmax] !== '') {
            const vmax = parseFloat(parts[columnMap.vmax]);
            if (!isNaN(vmax)) {
                record.max_wind_kt = vmax;
                if (vmax === 0.0) {
                    record.max_wind_kt = null;
                }
                record.wind_speed = vmax * 0.514444;
            }
        }
        
        if (parts[columnMap.mslp] && parts[columnMap.mslp] !== '') {
            const mslp = parseFloat(parts[columnMap.mslp]);
            if (!isNaN(mslp)) {
                record.mslp = mslp;
            }
        }
        
        if (columnMap.stormType !== undefined && parts[columnMap.stormType]) {
            record.type = parts[columnMap.stormType];
        }
        
        if (columnMap.model !== undefined && parts[columnMap.model]) {
            record.modelRaw = parts[columnMap.model].trim();
        }
        
        return record;
    },

    /**
     * Convert ADECK record to cyclone viewer point format
     */
    convertPointFormat: function(record) {
        if (record.latitude === undefined || record.longitude === undefined || 
            isNaN(record.latitude) || isNaN(record.longitude)) {
            return null;
        }
        
        try {
            const baseDate = new Date(Date.UTC(
                record.year, 
                record.month - 1, 
                record.day, 
                record.hour || 0, 
                record.minute || 0
            ));
            
            const forecastLead = record.forecast_lead !== undefined ? record.forecast_lead : record.tau || 0;
            
            const forecastDate = new Date(baseDate.getTime() + (forecastLead * 60 * 60 * 1000));
            
            const point = {
                latitude: record.latitude,
                longitude: record.longitude,
                forecast_lead: forecastLead,
                tau: forecastLead,
                year_utc: forecastDate.getUTCFullYear(),
                month_utc: forecastDate.getUTCMonth() + 1,
                day_utc: forecastDate.getUTCDate(),
                hour_utc: forecastDate.getUTCHours(),
                minute_utc: forecastDate.getUTCMinutes(),
                init_time: record.initYYYYMMDDHH,
                wind_speed: record.wind_speed || null,
                mslp: record.mslp || null,
                model: record.model || "UNKNOWN",
                type: record.type || null,
                latitudeFormatted: record.latitudeFormatted,
                longitudeFormatted: record.longitudeFormatted,
                modelRaw: record.modelRaw || record.model
            };
            
            return point;
        } catch (error) {
            console.error("Error creating point from record:", error, record);
            return null;
        }
    },

    /**
     * Format date-time string for display
     */
    formatDateTime: function(yyyymmddhh) {
        if (!yyyymmddhh || yyyymmddhh.length < 10) return 'Unknown';
        
        const year = yyyymmddhh.substring(0, 4);
        const month = yyyymmddhh.substring(4, 6);
        const day = yyyymmddhh.substring(6, 8);
        const hour = yyyymmddhh.substring(8, 10);
        
        return `${year}-${month}-${day} ${hour}Z`;
    },

    /**
     * Format the official cyclone identifier in lowercase format
     */
    formatCycloneId: function(basin, number, year) {
        return `a${basin.toLowerCase()}${number}${year}`;
    },

    /**
     * Format a human-readable cyclone name
     */
    formatCycloneName: function(basin, number, year) {
        let basinName = basin;
        
        const basinNames = {
            'AL': 'Atlantic',
            'EP': 'Eastern Pacific',
            'CP': 'Central Pacific',
            'WP': 'Western Pacific',
            'IO': 'Indian Ocean',
            'SH': 'Southern Hemisphere',
            'BB': 'Bay of Bengal',
            'AS': 'Arabian Sea',
            'SL': 'South Atlantic'
        };
        
        if (basinNames[basin]) {
            basinName = basinNames[basin];
        }
        
        return `${basinName} - Cyclone ${number} (${year})`;
    },

    /**
     * Check if a model is recognized in our system
     */
    isKnownModel: function(model) {
        return !!this.getModelColor(model);
    },
    /** 
     * create isDefaultModel with ALL the models
     */
    isDefaultModel: function(model) {
        // Models to show by default all the models 
        const defaultModels = [
            'OFCL', 'OFCI', 'CARQ',
            'AVNO', 'AVNI', 'GFS',
            'GFDI', 'GFDL', 'GFDT', 'GFDN',
            'UKMI', 'UKM', 'UKX', 'UKXI', 'UKX2', 'UKM2',
            'CMC', 'HWRF', 'HMON',
            'EMXI', 'EMX', 'EMX2', 'ECMWF',
            'NGPS', 'NGPI', 'NGP2',
            'DSHP', 'SHIP', 'LGEM', 'SHFR', 'SHNS', 'DRCL',
            'TVCN', 'TVCE', 'TVCX',
            'CONU', 'GUNA', 'GUNS', 'HCCA',
            'BAMD', 'BAMM', 'BAMS', 'LBAR', 'XTRP',
            'CLIP', 'CLP5', 'DRCL', 'MRCL',
            // Add all other models here
        ];
        return defaultModels.includes(model);
    },
    /**
     * Process tracks for display by adding special styling for first points
     */
    processTracksForDisplay: function(storms, defaultModelsOnly = true) {
        // Filter storms if defaultModelsOnly is true
        let filteredStorms = storms;
        
        if (defaultModelsOnly) {
            filteredStorms = storms.filter(storm => this.isDefaultModel(storm.model));
            
            // If no default models, fall back to all known models
            if (filteredStorms.length === 0) {
                filteredStorms = storms.filter(storm => this.isKnownModel(storm.model));
            }
        }
        
        // Process each storm to mark first point and enhance display
        return filteredStorms.map(storm => {
            // Mark first point for special styling
            if (storm.points && storm.points.length > 0) {
                storm.points[0].isFirstPoint = true;
                
                // Calculate perpendicular line coordinates for the first point
                if (storm.points.length > 1) {
                    // Get first two points to determine direction
                    const p1 = storm.points[0];
                    const p2 = storm.points[1];
                    
                    // Calculate direction vector
                    const dx = p2.longitude - p1.longitude;
                    const dy = p2.latitude - p1.latitude;
                    
                    // Normalize and get perpendicular vector (rotate 90 degrees)
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const perpDx = -dy / length;
                    const perpDy = dx / length;
                    
                    //console.log(`Perpendicular vector for ${storm.name}: (${perpDx}, ${perpDy})`);
                    // Create perpendicular line of appropriate length (adjust the multiplier for desired length)
                    const perpLineLength = 1.0; // Adjust this for longer/shorter perpendicular lines
                    
                    p1.perpLine = {
                        start: {
                            lat: p1.latitude - perpDy * perpLineLength,
                            lng: p1.longitude - perpDx * perpLineLength
                        },
                        end: {
                            lat: p1.latitude + perpDy * perpLineLength,
                            lng: p1.longitude + perpDx * perpLineLength
                        },
                        color: this.getModelColor(storm.model) // Use the same color as the track
                    };
                }
                
                // Ensure forecast lead time is properly formatted for all points
                storm.points.forEach(point => {
                    // Make sure forecast_lead and tau are synchronized
                    if (point.forecast_lead !== undefined && point.tau === undefined) {
                        point.tau = point.forecast_lead;
                    } else if (point.tau !== undefined && point.forecast_lead === undefined) {
                        point.forecast_lead = point.tau;
                    }
                    
                    // Make sure init_time is available for display
                    if (!point.init_time && storm.initTime) {
                        point.init_time = storm.initTime;
                    }
                });
            }
            return storm;
        });
    },

    /**
     * Draw perpendicular line for ADECK track start points
     * @param {Object} point - The first point of a track with perpLine property
     * @param {Object} map - The Leaflet map object
     * @returns {Object} The created polyline object
     */
    drawPerpendicularLine: function(point, map) {
        if (!point || !point.perpLine || !map) return null;
        
        // Create polyline for the perpendicular line
        const perpLine = L.polyline([
            [point.perpLine.start.lat, point.perpLine.start.lng],
            [point.perpLine.end.lat, point.perpLine.end.lng]
        ], {
            color: point.perpLine.color || '#FFFFFF',
            weight: 3,
            opacity: 0.2,
            dashArray: '5,5' // Make it dashed for better visibility
        }).addTo(map);
        
        return perpLine;
    },

    /**
     * Highlight rows in the UI that match the selected model
     */
    highlightModelRows: function(modelName) {
        document.querySelectorAll('.model-row').forEach(row => {
            if (row.dataset.model === modelName) {
                row.classList.add('highlighted');
            } else {
                row.classList.remove('highlighted');
            }
        });
    },

    /**
     * Highlight the selected model in UI elements
     * @param {string} modelName - Name of the model to highlight
     */
    highlightSelectedModel: function(modelName) {
        // Update row highlighting
        document.querySelectorAll('.model-row').forEach(row => {
            if (row.dataset.model === modelName) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
        
        // Update model buttons if they exist
        document.querySelectorAll('.adeck-model-button').forEach(btn => {
            if (btn.dataset.model === modelName) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    },

    /**
     * Group storms by date and model for organization in the UI
     * @param {Array} storms - Array of storm track objects
     * @returns {Object} Grouped storms by date and model
     */
    groupStormsByDateAndModel: function(storms) {
        const grouped = {};
        
        // First, ensure we have storms to process
        if (!storms || !Array.isArray(storms) || storms.length === 0) {
            return {};
        }
        
        // Group by initialization date and then by model
        storms.forEach(storm => {
            // Use the init time as the primary key, fallback to a default if not available
            const dateKey = storm.initTime || 'unknown';
            
            // Create date group if it doesn't exist
            if (!grouped[dateKey]) {
                grouped[dateKey] = {};
            }
            
            // Create model group under this date if it doesn't exist
            const modelName = storm.model || 'unknown';
            if (!grouped[dateKey][modelName]) {
                grouped[dateKey][modelName] = [];
            }
            
            // Add this storm to the appropriate group
            grouped[dateKey][modelName].push(storm);
        });
        
        return grouped;
    },

    /**
     * Create initialization time selector dropdown
     * @param {Array} storms - Array of storm track objects 
     * @param {Function} onChangeCallback - Function to call when init time changes
     * @returns {HTMLElement} The init time selector UI element
     */
    createInitTimeSelector: function(storms, onChangeCallback) {
        const container = document.createElement('div');
        container.className = 'init-time-selector';
        
        const label = document.createElement('label');
        label.textContent = 'Initialization Time:';
        label.className = 'init-time-label';
        
        const dropdown = document.createElement('select');
        dropdown.className = 'init-time-dropdown';
        
        // Get unique init times
        const initTimes = [...new Set(storms.map(storm => storm.initTime))];
        
        // Sort by most recent first
        initTimes.sort((a, b) => b.localeCompare(a));
        
        // Add options to dropdown
        initTimes.forEach((initTime) => {
            const option = document.createElement('option');
            option.value = initTime;
            option.textContent = this.formatDateTime(initTime);
            dropdown.appendChild(option);
        });
        
        // Add change handler for dropdown
        dropdown.addEventListener('change', function() {
           const selectedInitTime = this.value;
           
           // Preserve both the model filter preference and the category
           const modelFilterPreference = window.lastModelFilterPreference !== undefined ?
               window.lastModelFilterPreference : true;
               
           // Store the currently selected category to restore it after changing init time
           const categoryDropdown = document.querySelector('.model-category-dropdown');
           if (categoryDropdown) {
               window.lastModelCategory = categoryDropdown.value;
           }
           
           if (onChangeCallback) {
               onChangeCallback(selectedInitTime);
           } else {
               // Call the default handler
               window.AdeckReader.displayTracksByInitTime(storms, selectedInitTime, modelFilterPreference);
           }
        });
        
        container.appendChild(label);
        container.appendChild(dropdown);
        
        return container;
    },
    
    /**
     * Display tracks for a specific initialization time
     * @param {Array} storms - All storm track objects
     * @param {string} initTime - Selected initialization time (null for all)
     * @param {boolean} defaultModelsOnly - Whether to show only default models
     */
    displayTracksByInitTime: function(storms, initTime = null, defaultModelsOnly = true) {
        if (!storms || storms.length === 0) {
            console.log("No storms available to display");
            return;
        }
        
        // If no init time specified, use the latest one
        if (!initTime) {
            const initTimes = [...new Set(storms.map(storm => storm.initTime))];
            initTimes.sort((a, b) => b.localeCompare(a)); // Most recent first
            initTime = initTimes[0];
            
            // Update the dropdown to match if it exists
            const dropdown = document.querySelector('.init-time-dropdown');
            if (dropdown) {
                dropdown.value = initTime;
            }
        }
        
        // Filter storms by the selected init time
        let filteredStorms;
        if (initTime === 'all') {
            filteredStorms = storms;
        } else {
            filteredStorms = storms.filter(storm => storm.initTime === initTime);
        }
        
        console.log(`Filtered to ${filteredStorms.length} tracks for init time ${initTime}`);
        
        // Preserve the current model filter preference
        const currentModelPreference = window.currentModelFilterPreference !== undefined ? 
            window.currentModelFilterPreference : defaultModelsOnly;
        
        // Store the currently selected model category before updating the UI
        const categoryDropdown = document.querySelector('.model-category-dropdown');
        const previousCategory = categoryDropdown ? categoryDropdown.value : 'all';
        window.lastModelCategory = previousCategory;
        
        console.log(`Preserving model category: ${previousCategory}`);
        
        // Update the storm list UI
        this.updateStormList(filteredStorms);
        
        // Display the tracks with the preserved model preference
        if (typeof window.displayAdeckTracks === 'function') {
            console.log(`Using model filter preference: ${currentModelPreference}`);
            console.log(`Last selected model category: ${window.lastModelCategory || 'all'}`);
            
            // First ensure the category dropdown has the correct value
            if (window.lastModelCategory && categoryDropdown && categoryDropdown.value !== window.lastModelCategory) {
                categoryDropdown.value = window.lastModelCategory;
            }
            
            // Then trigger the filtering by category before displaying tracks
            if (window.lastModelCategory && window.lastModelCategory !== 'all') {
                this.filterModelsByCategory(window.lastModelCategory, this.getModelCategories());
            }
            
            // Finally, display the tracks with the selected category already applied
            window.displayAdeckTracks(filteredStorms, window.selectedStormID, currentModelPreference, window.lastModelCategory);
        } else {
            this.updateStormList(filteredStorms);
        }
    },

    /**
     * Filter models by category
     * @param {string} categoryId - ID of the category to filter by
     * @param {Array} modelCategories - Array of model category definitions
     */
    filterModelsByCategory: function(categoryId, modelCategories) {
        // Find the selected category and its models
        const category = modelCategories.find(cat => cat.id === categoryId);
        if (!category) return;
        
        // Get the models in this category
        const modelsInCategory = category.models || [];
        
        // Update the UI to show only models in this category
        const modelRows = document.querySelectorAll('.model-row');
        
        modelRows.forEach(row => {
            const modelName = row.dataset.model;
            if (categoryId === 'all' || modelsInCategory.includes(modelName)) {
                row.style.display = ''; // Show the row
                
                // Also show the parent category section if it's not currently visible
                const categorySection = row.closest('.model-category-section');
                if (categorySection) {
                    categorySection.style.display = '';
                }
            } else {
                row.style.display = 'none'; // Hide the row
                
                // Check if all rows in this category are now hidden
                const categorySection = row.closest('.model-category-section');
                if (categorySection) {
                    const visibleRows = categorySection.querySelectorAll('.model-row[style="display: ;"], .model-row:not([style*="display: none"])');
                    if (visibleRows.length === 0) {
                        categorySection.style.display = 'none'; // Hide the entire category
                    }
                }
            }
        });
        
        return modelsInCategory;
    },

    /**
     * Update storm list display in the dialog
     * @param {Array} filteredStorms - Storms to display
     */
    updateStormList: function(filteredStorms) {
        // Find the storm list element
        const stormList = document.querySelector('.storm-list');
        if (!stormList) return;
        
        stormList.innerHTML = '';
        
        if (filteredStorms.length === 0) {
            stormList.innerHTML = '<div class="empty-state">No tracks available for this initialization time.</div>';
            return;
        }
        
        // Group by model type
        const modelCategories = this.getModelCategories();
        
        // Only show models that are actually plotted
        const availableModels = [...new Set(filteredStorms.map(storm => storm.model))];
        
        // Create category sections - but only for models that are being displayed
        modelCategories.slice(1).forEach(category => {
            // Filter storms by this category, but only including models that are in the available set
            const categoryModels = category.models.filter(model => availableModels.includes(model));
            const categoryStorms = filteredStorms.filter(storm => categoryModels.includes(storm.model));
            
            if (categoryStorms.length === 0) return;
            
            const categorySection = document.createElement('div');
            categorySection.className = 'model-category-section';
            
            const categoryHeader = document.createElement('h4');
            categoryHeader.className = 'category-header';
            categoryHeader.textContent = category.name;
            categorySection.appendChild(categoryHeader);
            
            // Create table for models
            const modelTable = document.createElement('table');
            modelTable.className = 'model-table';
            
            // Add header row
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            
            // Removed the "Points" column, keeping only Model and Init Time
            ['Model', 'Init Time'].forEach(title => {
                const th = document.createElement('th');
                th.textContent = title;
                headerRow.appendChild(th);
            });
            
            thead.appendChild(headerRow);
            modelTable.appendChild(thead);
            
            // Add rows for each model
            const tbody = document.createElement('tbody');
            
            categoryStorms.forEach(storm => {
                const row = document.createElement('tr');
                row.className = 'model-row';
                row.dataset.model = storm.model;
                row.dataset.stormId = storm.id;
                
                // Model column
                const modelCell = document.createElement('td');
                modelCell.style.fontWeight = 'bold';

                // Create visibility toggle button
                const visibilityBtn = document.createElement('button');
                visibilityBtn.className = 'visibility-toggle';
                visibilityBtn.dataset.visible = 'true';
                visibilityBtn.textContent = '👁️'; // Unicode eye symbol instead of Font Awesome
                visibilityBtn.title = 'Toggle visibility';
                visibilityBtn.style.marginRight = '5px';
                visibilityBtn.style.border = 'none';
                visibilityBtn.style.background = 'transparent';
                visibilityBtn.style.cursor = 'pointer';
                visibilityBtn.dataset.stormId = storm.id; // Add this to easily find the button later
    
                // Add click handler for visibility toggle
                visibilityBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent row selection
                    this.toggleTrackVisibility(storm.id);
                });
    
                // Create a wrapper div to contain button and model name
                const modelWrapper = document.createElement('div');
                modelWrapper.style.display = 'flex';
                modelWrapper.style.alignItems = 'center';
                modelWrapper.appendChild(visibilityBtn);
                modelWrapper.appendChild(document.createTextNode(storm.model));
                
                // Apply color indicator
                const modelColor = this.getModelColor(storm.model);
                modelCell.style.borderLeft = `4px solid ${modelColor}`;

                // Add the wrapper to the cell
                modelCell.appendChild(modelWrapper);
                
                row.appendChild(modelCell);
                
                // Init time column
                const initTimeCell = document.createElement('td');
                initTimeCell.textContent = this.formatDateTime(storm.initTime);
                row.appendChild(initTimeCell);
                
                tbody.appendChild(row);
            });
            
            modelTable.appendChild(tbody);
            categorySection.appendChild(modelTable);
            stormList.appendChild(categorySection);
        });
        
        // Store the currently selected category before updating the list
        const categoryDropdown = document.querySelector('.model-category-dropdown');
        const previousCategory = categoryDropdown ? categoryDropdown.value : 'all';
        
        // After updating the list, restore the previous category selection if it exists
        if (previousCategory && categoryDropdown && categoryDropdown.value !== previousCategory) {
            // Only change if a different option is now selected
            categoryDropdown.value = previousCategory;
            
            // Trigger a change event to update the UI
            categoryDropdown.dispatchEvent(new Event('change'));
        }
    },

    /**
     * Get model categories configuration
     * @returns {Array} Array of model category definitions
     */
    getModelCategories: function() {
        return [
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
                    'CLIP', 'CLP5', 'MRCL'
                ]
            }
        ];
    },

    /**
     * Helper function to reliably hide or show a marker
     * @param {Object} marker - The Leaflet marker to modify
     * @param {boolean} visible - Whether the marker should be visible
     */
    setMarkerVisibility: function(marker, visible) {
        if (!marker) return;
        
        if (visible) {
            // Show marker - restore original properties using setStyle if available
            if (marker.setStyle) {
                marker.setStyle({
                    opacity: marker.options.originalOpacity || 1,
                    fillOpacity: marker.options.originalFillOpacity || 1,
                    stroke: true,
                    fill: true
                });
            } else if (marker.setOpacity) {
                // For regular markers that don't have setStyle
                marker.setOpacity(marker.options.originalOpacity || 1);
            }
            
            // Reset radius if it was changed
            if (marker.options.originalRadius && marker.setRadius) {
                marker.setRadius(marker.options.originalRadius);
            } else if (marker.setRadius) {
                marker.setRadius(5); // Default radius
            }
            
            // Make sure SVG element is visible if it exists
            if (marker._path) {
                marker._path.style.display = '';
                marker._path.setAttribute('visibility', 'visible');
            }
        } else {
            // Store original radius if not already stored
            if (!marker.options.originalRadius && marker.getRadius) {
                marker.options.originalRadius = marker.getRadius();
            }
            
            // Hide marker using appropriate method
            if (marker.setStyle) {
                marker.setStyle({
                    opacity: 0,
                    fillOpacity: 0,
                    stroke: false,
                    fill: false
                });
            } else if (marker.setOpacity) {
                // For regular markers that don't have setStyle
                marker.setOpacity(0);
            }
            
            // Set radius to 0 for CircleMarkers
            if (marker.setRadius) {
                marker.setRadius(0);
            }
            
            // Hide the SVG element directly
            if (marker._path) {
                marker._path.style.display = 'none';
                marker._path.setAttribute('visibility', 'hidden');
            }
            
            // Close any open popups
            if (marker.closePopup) {
                marker.closePopup();
            }
        }
    },

    /**
     * Toggle visibility of a specific track
     * @param {string} trackId - ID of the track to toggle
     */
    toggleTrackVisibility: function(trackId) {
        // Ensure hiddenTracks is initialized
        if (!this.hiddenTracks) {
            this.hiddenTracks = {};
        }
        
        // Get current visibility state (default to true if not set)
        const isCurrentlyVisible = !(this.hiddenTracks[trackId] || false);
        
        // Update our tracking of hidden tracks
        if (isCurrentlyVisible) {
            this.hiddenTracks[trackId] = true;
            // Store in localStorage to persist across zoom events
            try {
                const hiddenTracks = JSON.parse(localStorage.getItem('adeckHiddenTracks') || '{}');
                hiddenTracks[trackId] = true;
                localStorage.setItem('adeckHiddenTracks', JSON.stringify(hiddenTracks));
            } catch (e) {
                console.warn('Could not save hidden track state to localStorage', e);
            }
        } else {
            delete this.hiddenTracks[trackId];
            // Remove from localStorage
            try {
                const hiddenTracks = JSON.parse(localStorage.getItem('adeckHiddenTracks') || '{}');
                delete hiddenTracks[trackId];
                localStorage.setItem('adeckHiddenTracks', JSON.stringify(hiddenTracks));
            } catch (e) {
                console.warn('Could not remove hidden track state from localStorage', e);
            }
        }
        
        // Find and update all visibility toggle buttons for this storm
        const buttons = document.querySelectorAll(`.visibility-toggle[data-storm-id="${trackId}"]`);
        buttons.forEach(btn => {
            btn.dataset.visible = (!isCurrentlyVisible).toString();
            btn.textContent = isCurrentlyVisible ? '⊗' : '👁️'; // Change to closed eye when hidden
            btn.title = isCurrentlyVisible ? 'Show track' : 'Hide track';
        });
        
        // Get all map layers representing this track
        if (window.adeckLayerGroup) {
            // Find and toggle markers
            if (window.adeckMarkers) {
                window.adeckMarkers.forEach(marker => {
                    // More robust checking for stormId - check in multiple places
                    const markerStormId = 
                        (marker.options && marker.options.stormId) || // Check in options
                        marker.stormId || // Check directly on marker
                        (marker.feature && marker.feature.properties && marker.feature.properties.stormId); // Check in GeoJSON properties
                    
                    if (markerStormId === trackId) {
                        this.setMarkerVisibility(marker, !isCurrentlyVisible);
                    }
                });
            }
            
            // Find and toggle track lines
            if (window.adeckLines) {
                window.adeckLines.forEach(line => {
                    const lineStormId = 
                        (line.options && line.options.stormId) || 
                        line.stormId || 
                        (line.feature && line.feature.properties && line.feature.properties.stormId);
                        
                    if (lineStormId === trackId) {
                        if (isCurrentlyVisible) {
                            line.setStyle({ 
                                opacity: 0,
                                stroke: false
                            });
                            line._path && (line._path.style.display = 'none'); // Hide SVG path element
                        } else {
                            line.setStyle({ 
                                opacity: line.options.originalOpacity || 1,
                                stroke: true
                            });
                            line._path && (line._path.style.display = ''); // Show SVG path element
                        }
                    }
                });
            }
        }
        
        return !isCurrentlyVisible; // Return the new visibility state
    },

    /**
     * Apply visibility state to tracks from stored settings
     * Called after zoom events to maintain visibility
     */
    applyStoredVisibility: function() {
        try {
            const hiddenTracks = JSON.parse(localStorage.getItem('adeckHiddenTracks') || '{}');
            
            // Update our internal tracking
            this.hiddenTracks = hiddenTracks;
            
            // Apply to all markers and lines
            if (window.adeckMarkers) {
                window.adeckMarkers.forEach(marker => {
                    // More robust checking for stormId - check in multiple places
                    const markerStormId = 
                        (marker.options && marker.options.stormId) || // Check in options
                        marker.stormId || // Check directly on marker
                        (marker.feature && marker.feature.properties && marker.feature.properties.stormId); // Check in GeoJSON properties
                    
                    if (markerStormId) {
                        const isHidden = hiddenTracks[markerStormId];
                        // Use our helper function that handles different marker types
                        this.setMarkerVisibility(marker, !isHidden);
                    }
                });
            }
            
            // Find and toggle track lines
            if (window.adeckLines) {
                window.adeckLines.forEach(line => {
                    // More robust checking for stormId - check in multiple places
                    const lineStormId = 
                        (line.options && line.options.stormId) || 
                        line.stormId || 
                        (line.feature && line.feature.properties && line.feature.properties.stormId);
                    
                    if (lineStormId && hiddenTracks[lineStormId]) {
                        line.setStyle({ 
                            opacity: 0,
                            stroke: false 
                        });
                        line._path && (line._path.style.display = 'none');
                    } else if (lineStormId && !hiddenTracks[lineStormId]) {
                        line.setStyle({ 
                            opacity: line.options.originalOpacity || 1,
                            stroke: true 
                        });
                        line._path && (line._path.style.display = '');
                    }
                });
            }
            
            // Update button states
            Object.keys(hiddenTracks).forEach(trackId => {
                const buttons = document.querySelectorAll(`.visibility-toggle[data-storm-id="${trackId}"]`);
                buttons.forEach(btn => {
                    btn.dataset.visible = "false";
                    btn.textContent = '⊗';
                    btn.title = 'Show track';
                });
            });
            
        } catch (e) {
            console.warn('Could not apply stored visibility settings', e);
        }
    },

    /**
     * Render ADECK tracks on the map
     * @param {Array} tracks - The processed ADECK tracks
     * @param {Object} map - Leaflet map object
     * @param {Object} options - Rendering options
     */
    renderTracks: function(tracks, map, options = {}) {
        if (!tracks || !map) return;

        // Initialize track layers object if not existing
        if (!window.trackLayers) {
            window.trackLayers = {};
        }

        // Render each track
        tracks.forEach(track => {
            const trackLayerGroup = L.layerGroup().addTo(map);
            this.renderSingleTrack(track, map, trackLayerGroup, options);

            // Store reference to this track's layer
            window.trackLayers[track.id] = trackLayerGroup;
        });

        return window.trackLayers;
    },

    /**
     * Render a single ADECK track on the map
     * @param {Object} track - The processed ADECK track
     * @param {Object} map - Leaflet map object
     * @param {Object} layerGroup - Layer group to add track to
     * @param {Object} options - Rendering options
     */
    renderSingleTrack: function(track, map, layerGroup, options = {}) {
        if (!track || !track.points || track.points.length === 0) return;
        
        // Get track color based on model
        const trackColor = this.getModelColor(track.model);
        
        // Check if this track should be hidden
        let isHidden = false;
        try {
            const hiddenTracks = JSON.parse(localStorage.getItem('adeckHiddenTracks') || '{}');
            isHidden = !!hiddenTracks[track.id];
            // Update our internal state
            if (isHidden) {
                this.hiddenTracks[track.id] = true;
            }
        } catch (e) {
            console.warn('Could not check track visibility state', e);
        }
        
        // Create coordinate array for polyline
        const trackCoords = track.points.map(point => [point.latitude, point.longitude]);
        
        // Create and add the track polyline
        const trackLine = L.polyline(trackCoords, {
            color: trackColor,
            weight: options.trackWeight || 2,
            opacity: isHidden ? 0 : (options.trackOpacity || 0.8),
            stroke: !isHidden,
            stormId: track.id,
            originalOpacity: options.trackOpacity || 0.8
        }).addTo(layerGroup);
        
        // If hidden, hide the SVG path
        if (isHidden && trackLine._path) {
            trackLine._path.style.display = 'none';
        }
        
        // Store reference to track line for visibility toggling
        if (!window.adeckLines) {
            window.adeckLines = [];
        }
        window.adeckLines.push(trackLine);
        
        // If this is a forecast track, draw perpendicular line at first point
        if (track.points[0].isFirstPoint && track.points[0].perpLine) {
            const perpLine = this.drawPerpendicularLine(track.points[0], map);
            if (perpLine) {
                layerGroup.addLayer(perpLine);
                // Apply hidden state if needed
                if (isHidden && perpLine._path) {
                    perpLine._path.style.display = 'none';
                }
            }
        }
        
        // Make sure window.adeckMarkers exists
        if (!window.adeckMarkers) {
            window.adeckMarkers = [];
        }
        
        // Add markers for special points if needed
        track.points.forEach((point, index) => {
            // Add marker for first point (forecast start)
            if (point.isFirstPoint) {
                const marker = L.circleMarker([point.latitude, point.longitude], {
                    color: trackColor,
                    fillColor: '#FFFFFF',
                    fillOpacity: isHidden ? 0 : 1,
                    opacity: isHidden ? 0 : 1,
                    stroke: !isHidden,
                    fill: !isHidden,
                    weight: 2,
                    radius: 5,
                    stormId: track.id,
                    originalOpacity: 1,
                    originalFillOpacity: 1,
                    originalColor: trackColor,
                    originalFillColor: '#FFFFFF'
                }).addTo(layerGroup);
                
                // If hidden, hide the SVG path
                if (isHidden && marker._path) {
                    marker._path.style.display = 'none';
                }
                
                // Add marker to global array for visibility toggling
                window.adeckMarkers.push(marker);
                
                // Add popup if needed
                if (typeof window.formatPopupContent === 'function') {
                    marker.bindPopup(() => window.formatPopupContent(point, index));
                }
            }
        });
    },

    /**
     * Get model color based on model name
     * @param {string} model - Model name
     * @returns {string} Color code for the model
     */
    getModelColor: function(model) {
        // Model-specific colors based on type and importance
        const modelColors = {
            // Official forecast products
            'OFCL': '#FFFFFF',
            'OFCI': '#F0F0F0',
            'CARQ': '#FFFFFF',
            'BEST': '#FFFFFF',
            
            // Major global models
            'AVNO': '#FF6B6B',
            'GFS': '#FF6B6B', 
            'GFSO': '#FF6B6B',
            'HWRF': '#4D96FF',
            'HMON': '#6BCB77',
            'ECMF': '#FFD93D',
            'ECMWF': '#FFD93D',
            'EMXI': '#FFD93D',
            'UKM': '#B983FF',
            'UKMET': '#B983FF',
            'UKMI': '#B983FF',
            'CMC': '#FF9F45',
            'NVGM': '#FF7D9B',
            'CTCX': '#4D96FF',
            
            // Consensus models
            'TVCN': '#00CCCC',
            'TVCE': '#00AAAA',
            'TVCX': '#009999',
            'GUNA': '#AAFFAA',
            'GUNS': '#88FF88',
            'CONU': '#88DDDD',
            'HCCA': '#AADDFF',
            
            // Statistical & simpler models
            'DSHP': '#AAAAAA',
            'SHIP': '#BBBBBB',
            'LGEM': '#CCCCCC',
            'BAMD': '#DDDDDD',
            'BAMM': '#DDDDDD',
            'BAMS': '#DDDDDD',
            'LBAR': '#DDDDDD',
            'XTRP': '#DDDDDD'
        };
        
        // Return the color or a default color if model not found
        return modelColors[model] || '#AAAAAA';
    }
};

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add function to window object for global access
    window.initializeAdeckDialog = function(dialogSelector = '.adeck-dialog') {
        if (window.AdeckReader && typeof window.AdeckReader.initializeDialog === 'function') {
            window.AdeckReader.initializeDialog(dialogSelector);
        }
    };
    
    // Try to initialize right away
    window.initializeAdeckDialog();
    
    // Set up event listener for zoom events to maintain visibility
    if (window.map) {
        window.map.on('zoomend', function() {
            window.AdeckReader.applyStoredVisibility();
        });
    }
    
    // Provide AdeckTrackRenderer as a global alias to AdeckReader's rendering functions
    window.AdeckTrackRenderer = {
        renderTracks: function(tracks, map, options) {
            return window.AdeckReader.renderTracks(tracks, map, options);
        },
        renderSingleTrack: function(track, map, layerGroup, options) {
            return window.AdeckReader.renderSingleTrack(track, map, layerGroup, options);
        }
    };
});

console.log("ADECK Reader initialized");