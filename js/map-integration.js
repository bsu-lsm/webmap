// Enhanced Landslide Map Integration with Risk Zone Toggle and 3D Support
let mainMap = null;
let mapboxMap = null;
let landslideLayer = null;
let riskZoneLayers = {}; // Store individual risk zone layers
let currentData = null;
let currentOpacity = 0.6;
let is3DMode = false;

// Configuration
const CONFIG = {
    BONTOC_CENTER: [17.106079, 120.941031],
    INITIAL_ZOOM: 14,
    MAP_BOUNDS: [
        [16.8, 120.7],  // Southwest corner [lat, lng]
        [17.4, 121.2]   // Northeast corner [lat, lng]
    ],
    GEOJSON_PATH: './data/landslide_susceptibility.geojson',
    RISK_COLORS: {
        'No Risk': 'transparent',    // Transparent - won't show
        'Low': '#90EE90',           // Light Green
        'Moderate': '#FFD700',      // Gold
        'High': '#FF6347',          // Tomato
        'Extreme': '#8B0000'        // Dark Red
    },
    RISK_VISIBILITY: {
        'No Risk': false,
        'Low': true,
        'Moderate': true,
        'High': true,
        'Extreme': true
    },
    // Add your Mapbox access token here (get free one from mapbox.com)
    MAPBOX_TOKEN: 'pk.eyJ1IjoianBhdWxwYXlvcGF5IiwiYSI6ImNtZHpuZG9yNzBmZ3Eya3B1b2hpOW1xeTYifQ.XwNdE0ALrZrRbHM5dOiuQA' // Replace with your token
};

window.CONFIG = CONFIG;

// Initialize map when map page is shown
function initializeLandslideMap() {
    console.log('Initializing landslide map...');
    
    // Clean up existing map
    if (mainMap) {
        mainMap.remove();
        mainMap = null;
    }
    
    // Clear the map container
    const mapContainer = document.querySelector('#landslide-map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }
    
    // Clear any existing content
    mapContainer.innerHTML = '';
    
    // Initialize Leaflet map
    mainMap = L.map('landslide-map', {
        center: CONFIG.BONTOC_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        minZoom: 11,
        maxZoom: 20,
        maxBounds: CONFIG.MAP_BOUNDS,
        maxBoundsViscosity: 0.5,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true
    });
    
    // Add base layers
    const baseLayers = addBaseLayers(mainMap);
    
    // Add controls
    addOpacityControl(mainMap);
    addRiskZoneToggleControl(mainMap);
    add3DToggleControl(mainMap);
    
    L.control.layers(baseLayers, null, {
        collapsed: true,
        position: 'topright'
    }).addTo(mainMap);
    
    L.control.scale({
        position: 'bottomleft',
        maxWidth: 80,
        metric: true,
        imperial: false
    }).addTo(mainMap);
    
    // Add legend
    addLegendControl(mainMap);
    
    // Load landslide data
    loadLandslideData(mainMap);
    
    return mainMap;
}

function addBaseLayers(map) {
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
        maxZoom: 19
    });
    
    const topoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, HERE, Garmin, FAO, NOAA, USGS',
        maxZoom: 16
    });
    
    // OpenTopoMap with detailed terrain
    const openTopoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap (CC-BY-SA)',
        maxZoom: 17
    });
    
    // Alternative terrain layer using CartoDB Positron
    const terrainLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    });
    
    // Add default layer
    topoLayer.addTo(map);
    
    return {
        "Topographic": topoLayer,
        "Satellite Imagery": satelliteLayer,
        "Detailed Topo": openTopoLayer,
        "Clean Terrain": terrainLayer,
        "OpenStreetMap": osmLayer
    };
}

function addRiskZoneToggleControl(map) {
    const toggleControl = L.control({position: 'topleft'});

    toggleControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'risk-zone-toggle-control');
        div.innerHTML = `
            <button class="embedded-btn export-btn" onclick="exportMapView()" title="Export Map">
                <i class="fas fa-download"></i>
            </button>
            <button class="embedded-btn fullscreen-btn" onclick="toggleFullScreen()" title="Full Screen">
                <i class="fas fa-expand"></i>
            </button>
            <button id="risk-toggle-icon" class="embedded-btn risk-toggle-icon" title="Show Risk Zones">
                <i class="fas fa-eye"></i>
            </button>
            <div id="risk-toggle-panel" class="risk-toggle-panel" style="display: none;">
                <div class="toggle-control-body" id="risk-zone-toggles">
                    ${Object.keys(CONFIG.RISK_COLORS)
                        .filter(riskLevel => riskLevel !== 'No Risk')
                        .map(riskLevel => {
                            const color = CONFIG.RISK_COLORS[riskLevel];
                            const isVisible = CONFIG.RISK_VISIBILITY[riskLevel];
                            return `
                                <div class="risk-toggle-item">
                                    <label class="risk-toggle-label">
                                        <input type="checkbox" 
                                            id="toggle-${riskLevel.toLowerCase().replace(' ', '-')}" 
                                            ${isVisible ? 'checked' : ''} 
                                            onchange="toggleRiskZone('${riskLevel}', this.checked)">
                                        <span class="risk-color-indicator" style="background-color: ${color};"></span>
                                        <span class="risk-level-text">${riskLevel}</span>
                                        <span class="feature-count" id="count-${riskLevel.toLowerCase().replace(' ', '-')}">0</span>
                                    </label>
                                </div>
                            `;
                        }).join('')}
                </div>
            </div>
        `;

        // Prevent map events on the control
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        // Show/hide panel on icon click
        setTimeout(() => {
            const iconBtn = div.querySelector('#risk-toggle-icon');
            const panel = div.querySelector('#risk-toggle-panel');
            const parent = iconBtn.parentElement;
            
            iconBtn.addEventListener('click', () => {
                if (panel.style.display === 'none') {
                    panel.style.display = 'block';
                    parent.classList.add('panel-active');
                    iconBtn.querySelector('i').className = 'fas fa-eye-slash'; // Change to "hide" icon
                } else {
                    panel.style.display = 'none';
                    parent.classList.remove('panel-active');
                    iconBtn.querySelector('i').className = 'fas fa-eye'; // Change back to "show" icon
                }
            });
        }, 100);

        return div;
    };

    toggleControl.addTo(map);
}

function add3DToggleControl(map) {
    const toggle3DControl = L.control({position: 'topleft'});
    
    toggle3DControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'toggle-3d-control');
        div.innerHTML = `
            <button class="control-3d-btn" onclick="toggle3DMode()" title="Toggle 3D View">
                <i class="fas fa-cube"></i>
                <span class="mode-text">3D</span>
            </button>
        `;
        
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        
        return div;
    };
    
    toggle3DControl.addTo(map);
}

function addEmbeddedMapControls(map) {
    // Create embedded export control
    const exportControl = L.control({position: 'topright'});
    
    exportControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'embedded-control export-control');
        div.innerHTML = `
            <button class="embedded-btn export-btn" onclick="exportMapView()" title="Export Map">
                <i class="fas fa-download"></i>
            </button>
        `;
        
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        
        return div;
    };
    
    // Create embedded fullscreen control
    const fullscreenControl = L.control({position: 'topright'});
    
    fullscreenControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'embedded-control fullscreen-control');
        div.innerHTML = `
            <button class="embedded-btn fullscreen-btn" onclick="toggleFullScreen()" title="Toggle Fullscreen">
                <i class="fas fa-expand"></i>
            </button>
        `;
        
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        
        return div;
    };
}

function loadLandslideData(map) {
    // Show loading indicator
    showLoadingIndicator();
    
    fetch(CONFIG.GEOJSON_PATH)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Landslide data loaded:', data);
            currentData = data;
            addLandslideLayersByRisk(map, data);
            hideLoadingIndicator();
        })
        .catch(error => {
            console.error('Error loading landslide data:', error);
            hideLoadingIndicator();
            // Load sample data as fallback
            loadSampleData(map);
        });
}

function addLandslideLayersByRisk(map, geojsonData) {
    // Clear existing layers
    Object.values(riskZoneLayers).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    riskZoneLayers = {};
    
    // Group features by risk level
    const featuresByRisk = {};
    geojsonData.features.forEach(feature => {
        const riskLevel = feature.properties.risk_level || 'Low';
        if (!featuresByRisk[riskLevel]) {
            featuresByRisk[riskLevel] = [];
        }
        featuresByRisk[riskLevel].push(feature);
    });
    
    // Create separate layers for each risk level
    Object.keys(CONFIG.RISK_COLORS).forEach(riskLevel => {
        if (riskLevel === 'No Risk') return; // Skip No Risk
        
        const features = featuresByRisk[riskLevel] || [];
        const layerData = {
            type: "FeatureCollection",
            features: features
        };
        
        const layer = L.geoJSON(layerData, {
            style: (feature) => styleFeature(feature, riskLevel),
            onEachFeature: onEachFeature,
            renderer: L.canvas()
        });
        
        riskZoneLayers[riskLevel] = layer;
        
        // Add to map if visibility is enabled
        if (CONFIG.RISK_VISIBILITY[riskLevel] && features.length > 0) {
            layer.addTo(map);
        }
        
        // Update feature count
        updateFeatureCount(riskLevel, features.length);
    });
    
    // Update statistics
    updateStatistics(geojsonData);
}

function styleFeature(feature, riskLevel) {
    const color = CONFIG.RISK_COLORS[riskLevel] || CONFIG.RISK_COLORS['Low'];
    
    return {
        fillColor: color,
        weight: 1,
        opacity: 0.3,
        color: color,
        fillOpacity: currentOpacity,
        className: `risk-zone-${riskLevel.toLowerCase().replace(' ', '-')}`
    };
}

function onEachFeature(feature, layer) {
    // Bind popup
    const props = feature.properties;
    const popupContent = createPopupContent(props);
    
    layer.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'landslide-popup'
    });
    
    // Add hover effects
    layer.on('mouseover', function(e) {
        const riskLevel = feature.properties.risk_level || 'Low';
        const color = CONFIG.RISK_COLORS[riskLevel];
        
        this.setStyle({
            weight: 3,
            opacity: 1,
            color: color,
            fillOpacity: Math.min(currentOpacity + 0.3, 1)
        });
        
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            this.bringToFront();
        }
    });
    
    layer.on('mouseout', function(e) {
        const riskLevel = feature.properties.risk_level || 'Low';
        if (riskZoneLayers[riskLevel]) {
            riskZoneLayers[riskLevel].resetStyle(this);
        }
    });
    
    // Add click handler for detailed info
    layer.on('click', function(e) {
        showDetailedInfo(props);
    });
}

function createPopupContent(properties) {
    const riskLevel = properties.risk_level || 'Unknown';
    const susceptibility = properties.susceptibility_avg || 0;
    const area = properties.area_sqm ? (properties.area_sqm / 10000).toFixed(2) : 'N/A';
    const color = CONFIG.RISK_COLORS[riskLevel] || '#666';
    
    return `
        <div class="landslide-popup">
            <h4 style="color: ${color}; margin: 0 0 10px 0;">
                <i class="fas fa-mountain" style="margin-right: 8px;"></i>
                ${riskLevel} Risk Zone
            </h4>
            <div class="popup-row">
                <strong>Susceptibility:</strong> ${(susceptibility * 100).toFixed(1)}%
            </div>
            <div class="popup-row">
                <strong>Area:</strong> ${area} hectares
            </div>
            <div class="popup-row">
                <strong>Risk Classification:</strong> ${riskLevel}
            </div>
            <div style="margin-top: 10px; text-align: center;">
                <button onclick="showDetailedAnalysis('${properties.id || 'unknown'}')" 
                        class="popup-btn">
                    Detailed Analysis
                </button>
            </div>
        </div>
    `;
}

function toggleRiskZone(riskLevel, isVisible) {
    CONFIG.RISK_VISIBILITY[riskLevel] = isVisible;
    
    const layer = riskZoneLayers[riskLevel];
    if (!layer) return;
    
    if (isVisible) {
        if (!mainMap.hasLayer(layer)) {
            layer.addTo(mainMap);
        }
    } else {
        if (mainMap.hasLayer(layer)) {
            mainMap.removeLayer(layer);
        }
    }
    
    // Update toggle all button state
    updateToggleAllButton();
}

function toggleAllRiskZones() {
    // Get current visibility states
    const anyVisible = Object.keys(CONFIG.RISK_COLORS).some(riskLevel => {
        return CONFIG.RISK_VISIBILITY[riskLevel];
    });

    // Determine new state: if any are visible, hide all; else, show all
    const newState = !anyVisible;

    Object.keys(CONFIG.RISK_COLORS).forEach(riskLevel => {
        CONFIG.RISK_VISIBILITY[riskLevel] = newState;
        // Update checkbox UI
        const checkbox = document.getElementById(`toggle-${riskLevel.toLowerCase().replace(' ', '-')}`);
        if (checkbox) checkbox.checked = newState;
        // Update layer visibility
        toggleRiskZone(riskLevel, newState);
    });
}

function updateToggleAllButton() {
    const toggleAllBtn = document.querySelector('.toggle-all-btn i');
    const allVisible = Object.keys(CONFIG.RISK_COLORS)
        .filter(level => level !== 'No Risk')
        .every(level => CONFIG.RISK_VISIBILITY[level]);
    
    if (toggleAllBtn) {
        toggleAllBtn.className = allVisible ? 'fas fa-toggle-on' : 'fas fa-toggle-off';
    }
}

function updateFeatureCount(riskLevel, count) {
    const countElement = document.getElementById(`count-${riskLevel.toLowerCase().replace(' ', '-')}`);
    if (countElement) {
        countElement.textContent = count;
    }
}

function addLegendControl(map) {
    const legend = L.control({position: 'bottomright'});
    
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `
            <div class="legend-title">
                <i class="fas fa-exclamation-triangle"></i>
                Landslide Risk
            </div>
        `;
        
        Object.entries(CONFIG.RISK_COLORS).forEach(([level, color]) => {
            if (level === 'No Risk') return; // Skip No Risk in legend
            div.innerHTML += `
                <div class="legend-item">
                    <span class="legend-color" style="background-color: ${color}"></span>
                    <span class="legend-label">${level}</span>
                </div>
            `;
        });
        
        return div;
    };
    
    legend.addTo(map);
}

function addOpacityControl(map) {
    const opacityControl = L.control({position: 'topright'});
    
    opacityControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'opacity-control');
        div.innerHTML = `
            <div class="opacity-control-container">
                <label class="opacity-label">
                    <i class="fas fa-adjust"></i>
                </label>
                <input type="range" 
                       id="opacity-slider" 
                       class="opacity-slider" 
                       min="0" 
                       max="100" 
                       value="60" 
                       step="5">
                <span class="opacity-value">60%</span>
            </div>
        `;
        
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        
        return div;
    };
    
    opacityControl.addTo(map);
    
    // Add event listener for slider
    setTimeout(() => {
        const slider = document.getElementById('opacity-slider');
        const valueDisplay = document.querySelector('.opacity-value');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', function() {
                const opacity = this.value / 100;
                currentOpacity = opacity;
                valueDisplay.textContent = this.value + '%';
                
                // Update all risk zone layers
                Object.values(riskZoneLayers).forEach(layer => {
                    if (layer && mainMap.hasLayer(layer)) {
                        layer.setStyle({fillOpacity: opacity});
                    }
                });
            });
        }
    }, 100);
}

// Utility functions
function hideMapControlsForExport() {
    // Hide all Leaflet controls
    const leafletControls = document.querySelectorAll('.leaflet-control-container .leaflet-control');
    leafletControls.forEach(control => {
        control.style.display = 'none';
    });
    
    // Hide embedded controls
    const embeddedControls = document.querySelectorAll('.embedded-control');
    embeddedControls.forEach(control => {
        control.style.display = 'none';
    });
}

function showMapControlsAfterExport() {
    // Show all Leaflet controls
    const leafletControls = document.querySelectorAll('.leaflet-control-container .leaflet-control');
    leafletControls.forEach(control => {
        control.style.display = '';
    });
    
    // Show embedded controls
    const embeddedControls = document.querySelectorAll('.embedded-control');
    embeddedControls.forEach(control => {
        control.style.display = '';
    });
}

function showLoadingIndicator(message = 'Loading map data...') {
    const indicator = document.createElement('div');
    indicator.id = 'loading-indicator';
    indicator.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(indicator);
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function loadSampleData(map) {
    // Sample data for demonstration
    const sampleData = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "risk_level": "High",
                    "susceptibility_avg": 0.82,
                    "area_sqm": 23000,
                    "id": "zone_001"
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [120.9200, 17.1100],
                        [120.9300, 17.1100],
                        [120.9300, 17.1000],
                        [120.9200, 17.1000],
                        [120.9200, 17.1100]
                    ]]
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "risk_level": "Moderate",
                    "susceptibility_avg": 0.58,
                    "area_sqm": 18000,
                    "id": "zone_002"
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [120.9300, 17.1000],
                        [120.9400, 17.1000],
                        [120.9400, 17.0900],
                        [120.9300, 17.0900],
                        [120.9300, 17.1000]
                    ]]
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "risk_level": "Low",
                    "susceptibility_avg": 0.25,
                    "area_sqm": 35000,
                    "id": "zone_003"
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [120.9400, 17.1000],
                        [120.9500, 17.1000],
                        [120.9500, 17.0900],
                        [120.9400, 17.0900],
                        [120.9400, 17.1000]
                    ]]
                }
            }
        ]
    };
    
    addLandslideLayersByRisk(map, sampleData);
}

function updateStatistics(data) {
    const stats = calculateStats(data);
    console.log('Landslide Statistics:', stats);
}

function calculateStats(geojsonData) {
    const stats = {
        totalAreas: 0,
        riskLevels: {},
        totalArea: 0
    };
    
    geojsonData.features.forEach(feature => {
        const riskLevel = feature.properties.risk_level || 'Unknown';
        const area = feature.properties.area_sqm || 0;
        
        stats.totalAreas++;
        stats.totalArea += area;
        
        if (!stats.riskLevels[riskLevel]) {
            stats.riskLevels[riskLevel] = { count: 0, area: 0 };
        }
        stats.riskLevels[riskLevel].count++;
        stats.riskLevels[riskLevel].area += area;
    });
    
    return stats;
}

// Export functions
function exportMap() {
    const options = {
        'PNG Image': () => exportMapAsImage(),
        'GeoJSON Data': () => exportGeoJSON(),
        'Summary Report': () => exportSummaryReport()
    };
    
    showExportModal(options);
}

function exportMapAsImage() {
    if (typeof html2canvas !== 'undefined') {
        showLoadingIndicator('Generating map image...');
        
        // Hide all map controls before capturing
        hideMapControlsForExport();
        
        const mapElement = document.getElementById('landslide-map');
        
        // Wait a bit for controls to hide
        setTimeout(() => {
            html2canvas(mapElement, {
                useCORS: true,
                allowTaint: false,
                scale: 2, // Higher quality
                backgroundColor: '#ffffff'
            }).then(canvas => {
                // Show controls again
                showMapControlsAfterExport();
                
                const link = document.createElement('a');
                const currentDate = new Date().toISOString().split('T')[0];
                link.download = `bontoc_landslide_map_${currentDate}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                hideLoadingIndicator();
            }).catch(error => {
                // Show controls again even if error
                showMapControlsAfterExport();
                console.error('Error generating image:', error);
                hideLoadingIndicator();
                alert('Error generating image. Please try again.');
            });
        }, 200);
    } else {
        alert('Image export functionality is not available. Please ensure html2canvas is loaded.');
    }
}

function exportMapAsPDF() {
    // Debug logging
    console.log('PDF export starting...');
    console.log('html2canvas available:', typeof html2canvas !== 'undefined');
    console.log('window.jspdf:', typeof window.jspdf);
    console.log('window.jsPDF:', typeof window.jsPDF);
    console.log('window object keys containing pdf:', Object.keys(window).filter(key => key.toLowerCase().includes('pdf')));
    
    // Check if libraries are available
    if (typeof html2canvas === 'undefined') {
        alert('html2canvas library is not loaded. Cannot export PDF.');
        return;
    }
    
    // Check jsPDF with multiple possible locations
    let jsPDF;
    if (window.jspdf && window.jspdf.jsPDF) {
        jsPDF = window.jspdf.jsPDF;
        console.log('Using window.jspdf.jsPDF');
    } else if (window.jsPDF) {
        jsPDF = window.jsPDF;
        console.log('Using window.jsPDF');
    } else if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        jsPDF = jspdf.jsPDF;
        console.log('Using global jspdf.jsPDF');
    } else {
        console.error('jsPDF not found in any expected location');
        alert('jsPDF library is not loaded properly. Please refresh the page and try again.');
        return;
    }
    
    showLoadingIndicator('Generating PDF...');
    
    // Hide all map controls before capturing
    hideMapControlsForExport();
    
    const mapElement = document.getElementById('landslide-map');
    
    // Wait a bit for controls to hide
    setTimeout(() => {
        html2canvas(mapElement, {
            useCORS: true,
            allowTaint: false,
            scale: 2
        }).then(canvas => {
            // Show controls again
            showMapControlsAfterExport();
            
            try {
                console.log('Creating PDF with jsPDF...');
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a4'
                });
                
                // Calculate dimensions for A4 landscape
                const pdfWidth = 297; // A4 landscape width
                const pdfHeight = 210; // A4 landscape height
                const margin = 20;
                
                // Calculate image dimensions to fit in PDF with margins
                const maxWidth = pdfWidth - (2 * margin);
                const maxHeight = pdfHeight - (2 * margin) - 30; // Reserve space for title
                
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
                
                const scaledWidth = imgWidth * ratio;
                const scaledHeight = imgHeight * ratio;
                
                // Center the image
                const x = (pdfWidth - scaledWidth) / 2;
                const y = margin + 20; // Leave space for title
                
                // Add title
                pdf.setFontSize(16);
                pdf.setFont(undefined, 'bold');
                pdf.text('Landslide Susceptibility Map - Bontoc-Sagada Landscape', pdfWidth / 2, margin, { align: 'center' });
                
                // Add map image
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                pdf.addImage(imgData, 'JPEG', x, y, scaledWidth, scaledHeight);
                
                // Add footer with date
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                const currentDate = new Date().toLocaleDateString();
                pdf.text(`Generated: ${currentDate}`, margin, pdfHeight - 15);
                pdf.text('Source: Benguet State University - Center for Geoinformatics', pdfWidth - margin, pdfHeight - 15, { align: 'right' });
                
                // Save the PDF
                const filename = `bontoc_landslide_map_${new Date().toISOString().split('T')[0]}.pdf`;
                pdf.save(filename);
                
                hideLoadingIndicator();
                console.log('PDF exported successfully');
                
            } catch (pdfError) {
                console.error('Error creating PDF:', pdfError);
                hideLoadingIndicator();
                alert('Error creating PDF: ' + pdfError.message);
            }
        }).catch(error => {
            // Show controls again even if error
            showMapControlsAfterExport();
            console.error('Error capturing map image:', error);
            hideLoadingIndicator();
            alert('Error capturing map image. Please try again.');
        });
    }, 200);
}

function exportSummaryReport() {
    if (!currentData) {
        alert('No data available for export. Please load the map data first.');
        return;
    }
    
    const stats = calculateStats(currentData);
    const currentDate = new Date().toLocaleDateString();
    
    const reportContent = `
LANDSLIDE SUSCEPTIBILITY ANALYSIS REPORT
Bontoc-Sagada Landscape, Mountain Province
Generated: ${currentDate}

========================================

SUMMARY STATISTICS:
- Total Analyzed Areas: ${stats.totalAreas}
- Total Area Coverage: ${(stats.totalArea / 10000).toFixed(2)} hectares

RISK LEVEL DISTRIBUTION:
${Object.entries(stats.riskLevels).map(([level, data]) => 
    `- ${level}: ${data.count} areas (${((data.area / stats.totalArea) * 100).toFixed(1)}%)`
).join('\n')}

METHODOLOGY:
This analysis uses Recursive Feature Elimination and Bayesian Ensemble Meta-Learning 
with Spatial Uncertainty Propagation to assess landslide susceptibility.

DISCLAIMER:
This map is for planning and awareness purposes only. Field verification 
is recommended for detailed site-specific assessments.

Generated by BSU Landslide Susceptibility Mapping System
Contact: geoinformatics@bsu.edu.ph
    `;
    
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `landslide_analysis_report_${new Date().toISOString().split('T')[0]}.txt`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

function showExportModal(options) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'export-modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.7);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 15px;
        padding: 2rem;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    `;
    
    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0; color: #333;">
                <i class="fas fa-download" style="margin-right: 8px;"></i>
                Export Map
            </h3>
            <button onclick="closeExportModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div style="display: grid; gap: 0.5rem;">
            ${options.map(option => `
                <button onclick="${option.action.toString().match(/=> (\w+)/)?.[1]}(); closeExportModal();" 
                        style="
                            display: flex;
                            align-items: center;
                            gap: 1rem;
                            padding: 1rem;
                            background: linear-gradient(135deg, #000b18 0%, #0052a2 100%);
                            color: white;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 1rem;
                            transition: transform 0.2s ease;
                        " 
                        onmouseover="this.style.transform='translateY(-2px)'"
                        onmouseout="this.style.transform='translateY(0)'">
                    <i class="${option.icon}" style="font-size: 1.2rem;"></i>
                    ${option.label}
                </button>
            `).join('')}
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close modal when clicking overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeExportModal();
        }
    });
}

function closeExportModal() {
    const modal = document.getElementById('export-modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Add fullscreen change event listeners
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function handleFullscreenChange() {
    const fullscreenBtn = document.querySelector('.fullscreen-btn');
    const fullscreenIcon = fullscreenBtn?.querySelector('i');
    
    if (fullscreenBtn && fullscreenIcon) {
        if (document.fullscreenElement || document.webkitFullscreenElement || 
            document.mozFullScreenElement || document.msFullscreenElement) {
            fullscreenIcon.className = 'fas fa-compress';
            fullscreenBtn.title = 'Exit Fullscreen';
            fullscreenBtn.classList.add('fullscreen-active');
        } else {
            fullscreenIcon.className = 'fas fa-expand';
            fullscreenBtn.title = 'Toggle Fullscreen';
            fullscreenBtn.classList.remove('fullscreen-active');
        }
    }
    
    // Invalidate map size after fullscreen change
    if (mainMap) {
        setTimeout(() => {
            mainMap.invalidateSize();
        }, 100);
    }
}

function exportGeoJSON() {
    if (currentData) {
        const dataStr = JSON.stringify(currentData, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'bontoc_landslide_data.geojson';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Override existing showPage function
    const originalShowPage = window.showPage;
    window.showPage = function(pageId) {
        if (originalShowPage) originalShowPage(pageId);
        
        if (pageId === 'map') {
            setTimeout(() => {
                initializeLandslideMap();
            }, 100);
        }
    };
});

// Global functions for button handlers
window.exportMapView = function() {
    const options = [
        {
            label: 'Export as PNG Image',
            action: () => exportMapAsImage(),
            icon: 'fas fa-image'
        },
        {
            label: 'Export as PDF',
            action: () => exportMapAsPDF(),
            icon: 'fas fa-file-pdf'
        },
        {
            label: 'Export GeoJSON Data',
            action: () => exportGeoJSON(),
            icon: 'fas fa-file-code'
        },
        {
            label: 'Export Summary Report',
            action: () => exportSummaryReport(),
            icon: 'fas fa-file-alt'
        }
    ];
    
    showExportModal(options);
};

window.toggleFullScreen = function() {
    const mapContainer = document.querySelector('.map-container');
    if (!document.fullscreenElement) {
        if (mapContainer.requestFullscreen) {
            mapContainer.requestFullscreen();
        } else if (mapContainer.webkitRequestFullscreen) {
            mapContainer.webkitRequestFullscreen();
        } else if (mapContainer.mozRequestFullScreen) {
            mapContainer.mozRequestFullScreen();
        } else if (mapContainer.msRequestFullscreen) {
            mapContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
};

// Global functions for the toggle control
window.toggleRiskZone = toggleRiskZone;
window.toggleAllRiskZones = toggleAllRiskZones;

// 3D Mode Functions
window.toggle3DMode = function() {
    console.log('Toggle 3D mode called, current mode:', is3DMode ? '3D' : '2D');
    
    // Validate Mapbox token
    if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN === 'pk.YOUR_MAPBOX_TOKEN_HERE') {
        console.error('Mapbox token not configured');
        alert('Please add your Mapbox access token to enable 3D features. Get a free token at mapbox.com');
        return;
    }
    
    // Basic token format validation
    if (!CONFIG.MAPBOX_TOKEN.startsWith('pk.')) {
        console.error('Invalid Mapbox token format');
        alert('Invalid Mapbox token format. Token should start with "pk."');
        return;
    }
    
    console.log('Mapbox token appears valid:', CONFIG.MAPBOX_TOKEN.substring(0, 20) + '...');
    
    const button = document.querySelector('.control-3d-btn');
    const modeText = button?.querySelector('.mode-text');
    
    if (!is3DMode) {
        console.log('Switching to 3D mode...');
        // Switch to 3D Mapbox
        showLoadingIndicator('Loading 3D terrain...');
        
        try {
            initializeMapbox3D();
            if (button) {
                button.classList.add('active-3d');
                if (modeText) modeText.textContent = '2D';
            }
            is3DMode = true;
        } catch (error) {
            console.error('Error switching to 3D mode:', error);
            hideLoadingIndicator();
            alert('Error switching to 3D mode: ' + error.message);
        }
    } else {
        console.log('Switching to 2D mode...');
        // Switch back to 2D Leaflet
        showLoadingIndicator('Loading 2D map...');
        
        try {
            // Clean up Mapbox map
            if (mapboxMap) {
                console.log('Removing Mapbox map...');
                mapboxMap.remove();
                mapboxMap = null;
            }
            
            // Remove custom 3D controls
            const customControls = document.querySelector('.mapbox-custom-controls');
            if (customControls) {
                console.log('Removing custom 3D controls...');
                customControls.remove();
            }
            
            // Reinitialize Leaflet map
            setTimeout(() => {
                console.log('Reinitializing Leaflet map...');
                initializeLandslideMap();
                hideLoadingIndicator();
            }, 100);
            
            if (button) {
                button.classList.remove('active-3d');
                if (modeText) modeText.textContent = '3D';
            }
            is3DMode = false;
        } catch (error) {
            console.error('Error switching to 2D mode:', error);
            hideLoadingIndicator();
            alert('Error switching to 2D mode: ' + error.message);
        }
    }
};

function initializeMapbox3D() {
    console.log('Initializing Mapbox 3D...');
    
    // Clean up Leaflet map
    if (mainMap) {
        console.log('Cleaning up Leaflet map...');
        mainMap.remove();
        mainMap = null;
    }
    
    // Clear container
    const mapContainer = document.querySelector('#landslide-map');
    if (!mapContainer) {
        console.error('Map container not found');
        hideLoadingIndicator();
        alert('Map container not found. Please refresh the page.');
        return;
    }
    
    console.log('Clearing map container...');
    mapContainer.innerHTML = '';
    
    // Load Mapbox GL JS
    if (!window.mapboxgl) {
        console.log('Mapbox GL JS not loaded, loading...');
        loadMapboxGL(() => {
            console.log('Mapbox GL JS loaded, creating map...');
            createMapbox3DMap();
        });
    } else {
        console.log('Mapbox GL JS already available, creating map...');
        createMapbox3DMap();
    }
}

function loadMapboxGL(callback) {
    console.log('Loading Mapbox GL JS...');
    
    // Check if already loaded
    if (window.mapboxgl) {
        console.log('Mapbox GL JS already loaded');
        callback();
        return;
    }
    
    // Load Mapbox GL JS CSS (using latest version that supports TerrainControl)
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
    cssLink.onerror = () => {
        console.error('Failed to load Mapbox GL CSS');
        hideLoadingIndicator();
        alert('Failed to load Mapbox GL CSS. Please check your internet connection.');
    };
    document.head.appendChild(cssLink);
    
    // Load Mapbox GL JS (using latest version that supports TerrainControl)
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
    script.onload = () => {
        console.log('Mapbox GL JS v3.0.1 loaded successfully');
        // Verify TerrainControl is available
        if (window.mapboxgl && window.mapboxgl.TerrainControl) {
            console.log('TerrainControl is available');
        } else {
            console.warn('TerrainControl is not available in this version');
        }
        callback();
    };
    script.onerror = () => {
        console.error('Failed to load Mapbox GL JS');
        hideLoadingIndicator();
        alert('Failed to load Mapbox GL JS. Please check your internet connection and try again.');
    };
    document.head.appendChild(script);
}

function createMapbox3DMap() {
    console.log('Creating Mapbox 3D map...');
    console.log('Mapbox token:', CONFIG.MAPBOX_TOKEN ? 'Present' : 'Missing');
    
    try {
        // Validate token format more thoroughly
        if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN.length < 10 || !CONFIG.MAPBOX_TOKEN.startsWith('pk.')) {
            throw new Error('Invalid or missing Mapbox token. Please check your token configuration.');
        }
        
        mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
        
        console.log('Initializing Mapbox map...');
        mapboxMap = new mapboxgl.Map({
            container: 'landslide-map',
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [CONFIG.BONTOC_CENTER[1], CONFIG.BONTOC_CENTER[0]],
            zoom: CONFIG.INITIAL_ZOOM - 1,
            pitch: 60,
            bearing: 0,
            antialias: true,
            maxZoom: 18,
            minZoom: 8
        });
        
        console.log('Mapbox map created, waiting for load event...');
        
        // Add error handler with detailed error information
        mapboxMap.on('error', (e) => {
            console.error('Mapbox error details:', e);
            console.error('Error type:', e.error?.type || 'unknown');
            console.error('Error message:', e.error?.message || 'Unknown error');
            console.error('Error status:', e.error?.status || 'No status');
            
            hideLoadingIndicator();
            
            let errorMessage = 'Error loading Mapbox map';
            if (e.error?.message) {
                if (e.error.message.includes('token')) {
                    errorMessage = 'Invalid Mapbox access token. Please check your token configuration.';
                } else if (e.error.message.includes('network') || e.error.message.includes('fetch')) {
                    errorMessage = 'Network error loading map. Please check your internet connection.';
                } else {
                    errorMessage += ': ' + e.error.message;
                }
            }
            
            alert(errorMessage);
        });
        
        // Add style load handler
        mapboxMap.on('style.load', () => {
            console.log('Mapbox style loaded');
        });
        
        mapboxMap.on('load', () => {
            console.log('Mapbox 3D map loaded successfully');
            
            try {
                // Add terrain source and terrain
                console.log('Adding terrain source...');
                mapboxMap.addSource('mapbox-dem', {
                    'type': 'raster-dem',
                    'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                    'tileSize': 512,
                    'maxzoom': 14
                });
                
                console.log('Setting terrain...');
                mapboxMap.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 2 });
                
                // Add 3D buildings
                console.log('Adding 3D buildings...');
                add3DBuildings();
                
                // Add navigation controls FIRST
                console.log('Adding navigation controls...');
                mapboxMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
                
                // THEN add terrain control (only after navigation controls are added)
                console.log('Adding terrain control...');
                if (mapboxgl.TerrainControl) {
                    try {
                        mapboxMap.addControl(
                            new mapboxgl.TerrainControl({
                                source: 'mapbox-dem',
                                exaggeration: 2
                            }),
                            'top-right'
                        );
                        console.log('Terrain control added successfully');
                    } catch (terrainError) {
                        console.warn('Error adding terrain control:', terrainError);
                        // Call alternative terrain control if native one fails
                        addAlternativeTerrainControl();
                    }
                } else {
                    console.warn('TerrainControl not available in this Mapbox GL JS version');
                    // Add alternative terrain toggle button
                    addAlternativeTerrainControl();
                }
                
                // Load landslide data
                console.log('Loading landslide data for 3D...');
                loadLandslideDataFor3D();
                
                // Add custom 3D controls
                console.log('Adding custom 3D controls...');
                add3DCustomControls();
                
                // Hide loading indicator
                console.log('3D map setup complete');
                hideLoadingIndicator();
                
            } catch (setupError) {
                console.error('Error during 3D map setup:', setupError);
                hideLoadingIndicator();
                alert('Error setting up 3D features: ' + setupError.message);
            }
        });
        
        // Set timeout for map loading
        setTimeout(() => {
            if (!mapboxMap.loaded()) {
                console.error('Mapbox map load timeout after 30 seconds');
                hideLoadingIndicator();
                alert('Map loading timed out after 30 seconds. Please check your internet connection and Mapbox token.');
            }
        }, 30000);
        
    } catch (error) {
        console.error('Error creating Mapbox map:', error);
        hideLoadingIndicator();
        alert('Error creating 3D map: ' + error.message);
    }
}

function addAlternativeTerrainControl(attempt = 1) {
    // Try up to 10 times, every 500ms
    if (attempt > 10) {
        console.warn('Terrain button could not be added after multiple attempts.');
        return;
    }
    
    setTimeout(() => {
        const zoomGroup = document.querySelector('.mapboxgl-ctrl-zoom');
        if (zoomGroup) {
            // Prevent duplicate terrain button
            if (zoomGroup.querySelector('.mapboxgl-ctrl-terrain')) {
                console.log('Terrain button already exists.');
                return;
            }
            console.log('Adding terrain button to zoom controls (attempt ' + attempt + ')');

            // Separator line
            const separator = document.createElement('div');
            separator.style.cssText = `
                width: 80%;
                height: 1px;
                background: #ddd;
                margin: 4px auto;
            `;

            // Terrain button
            const terrainBtn = document.createElement('button');
            terrainBtn.className = 'mapboxgl-ctrl-icon mapboxgl-ctrl-terrain';
            terrainBtn.title = 'Toggle 3D Terrain';
            terrainBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 18l6-8 4 5 5-7 4 10z"/>
                </svg>
            `;

            // Set initial state (terrain is enabled by default)
            terrainBtn.classList.add('terrain-active');

            terrainBtn.onclick = () => {
                const enabled = !terrainBtn.classList.contains('terrain-active');
                if (enabled) {
                    mapboxMap.setTerrain({ source: 'mapbox-dem', exaggeration: 2 });
                    terrainBtn.classList.add('terrain-active');
                } else {
                    mapboxMap.setTerrain(null);
                    terrainBtn.classList.remove('terrain-active');
                }
            };

            zoomGroup.appendChild(separator);
            zoomGroup.appendChild(terrainBtn);
            
            console.log('Terrain button added successfully to zoom controls');
            
        } else {
            console.log('Zoom controls not found (attempt ' + attempt + '), retrying...');
            addAlternativeTerrainControl(attempt + 1);
        }
    }, 1000); // Increased timeout to 1000ms for better reliability
}

function add3DBuildings() {
    // Add 3D buildings layer
    mapboxMap.addLayer({
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'height']
            ],
            'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                15,
                0,
                15.05,
                ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.8
        }
    });
}

function add3DCustomControls() {
    // Create a container for custom controls
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'mapbox-custom-controls';
    controlsContainer.style.cssText = `
        position: absolute;
        top: 16px;
        left: 16px;
        z-index: 1002;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    
    // 2D Toggle Button
    const toggle2DBtn = document.createElement('button');
    toggle2DBtn.className = 'embedded-btn mapbox-control-btn';
    toggle2DBtn.innerHTML = '<i class="fas fa-cube"></i>';
    toggle2DBtn.title = 'Switch to 2D Mode';
    toggle2DBtn.onclick = () => window.toggle3DMode();
    
    // Export Button
    const exportBtn = document.createElement('button');
    exportBtn.className = 'embedded-btn mapbox-control-btn';
    exportBtn.innerHTML = '<i class="fas fa-download"></i>';
    exportBtn.title = 'Export Map';
    exportBtn.onclick = () => window.exportMapView();
    
    // Fullscreen Button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'embedded-btn mapbox-control-btn fullscreen-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.title = 'Toggle Fullscreen';
    fullscreenBtn.onclick = () => window.toggleFullScreen();
    
    // Risk Zones Toggle Button
    const riskToggleBtn = document.createElement('button');
    riskToggleBtn.className = 'embedded-btn mapbox-control-btn risk-toggle-btn';
    riskToggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
    riskToggleBtn.title = 'Toggle Risk Zones';
    riskToggleBtn.onclick = () => toggle3DRiskZones();
    
    // Add buttons to container
    controlsContainer.appendChild(toggle2DBtn);
    controlsContainer.appendChild(exportBtn);
    controlsContainer.appendChild(fullscreenBtn);
    controlsContainer.appendChild(riskToggleBtn);
    
    // Add to map container
    const mapContainer = document.querySelector('#landslide-map');
    mapContainer.appendChild(controlsContainer);
    
    // Create opacity control in bottom left
    const opacityControl = document.createElement('div');
    opacityControl.className = 'mapbox-opacity-control-bottom';
    opacityControl.style.cssText = `
        position: absolute;
        bottom: 16px;
        left: 16px;
        z-index: 1002;
        background: white;
        border-radius: 8px;
        padding: 8px 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 150px;
    `;
    opacityControl.innerHTML = `
        <i class="fas fa-adjust" style="color: #666; font-size: 14px;"></i>
        <input type="range" 
               id="mapbox-opacity-slider" 
               style="flex: 1; height: 4px; border-radius: 2px; background: #ddd; outline: none; -webkit-appearance: none;"
               min="0" 
               max="100" 
               value="60" 
               step="5">
        <span id="mapbox-opacity-value" style="font-size: 11px; color: #666; font-weight: 600; min-width: 30px;">60%</span>
    `;
    
    // Add opacity control to map container
    mapContainer.appendChild(opacityControl);
    
    // Add opacity slider functionality
    setTimeout(() => {
        const slider = document.getElementById('mapbox-opacity-slider');
        const valueDisplay = document.getElementById('mapbox-opacity-value');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', function() {
                const opacity = this.value / 100;
                currentOpacity = opacity;
                valueDisplay.textContent = this.value + '%';
                
                // Update all 3D risk zone layers
                if (window.mapbox3DLayers) {
                    Object.keys(window.mapbox3DLayers).forEach(riskLevel => {
                        const layerInfo = window.mapbox3DLayers[riskLevel];
                        if (layerInfo && layerInfo.visible) {
                            try {
                                mapboxMap.setPaintProperty(layerInfo.layerId, 'fill-opacity', opacity);
                            } catch (error) {
                                console.warn('Error updating opacity for layer:', layerInfo.layerId, error);
                            }
                        }
                    });
                }
            });
        }
    }, 100);
}

function loadLandslideDataFor3D() {
    console.log('Loading landslide data for 3D map...');
    
    fetch(CONFIG.GEOJSON_PATH)
        .then(response => {
            console.log('Fetch response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('3D landslide data loaded successfully:', data);
            currentData = data;
            addLandslideLayersTo3D(data);
        })
        .catch(error => {
            console.error('Error loading 3D landslide data:', error);
            console.log('Using sample data for 3D demonstration...');
            // Use sample data for demonstration
            const sampleData = createSample3DData();
            addLandslideLayersTo3D(sampleData);
        });
}

function addLandslideLayersTo3D(geojsonData) {
    console.log('Adding landslide layers to 3D map...', geojsonData);
    
    // Group features by risk level
    const featuresByRisk = {};
    geojsonData.features.forEach(feature => {
        const riskLevel = feature.properties.risk_level || 'Low';
        if (!featuresByRisk[riskLevel]) {
            featuresByRisk[riskLevel] = [];
        }
        featuresByRisk[riskLevel].push(feature);
    });
    
    console.log('Features grouped by risk level:', featuresByRisk);
    
    // Store the 3D layers for toggling
    window.mapbox3DLayers = {};
    
    // Add each risk level as a separate layer
    Object.keys(CONFIG.RISK_COLORS).forEach(riskLevel => {
        if (riskLevel === 'No Risk') return;
        
        const features = featuresByRisk[riskLevel] || [];
        if (features.length === 0) {
            console.log(`No features for risk level: ${riskLevel}`);
            return;
        }
        
        console.log(`Adding layer for ${riskLevel} with ${features.length} features`);
        
        const sourceId = `landslide-${riskLevel.toLowerCase().replace(' ', '-')}`;
        const layerId = `landslide-layer-${riskLevel.toLowerCase().replace(' ', '-')}`;
        const borderLayerId = `${layerId}-border`;
        
        // Store layer info for toggling
        window.mapbox3DLayers[riskLevel] = {
            sourceId,
            layerId,
            borderLayerId,
            visible: CONFIG.RISK_VISIBILITY[riskLevel]
        };
        
        try {
            // Add source
            console.log(`Adding source: ${sourceId}`);
            mapboxMap.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                }
            });
            
            // Add fill layer
            console.log(`Adding fill layer: ${layerId}`);
            mapboxMap.addLayer({
                id: layerId,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': CONFIG.RISK_COLORS[riskLevel],
                    'fill-opacity': CONFIG.RISK_VISIBILITY[riskLevel] ? currentOpacity : 0
                }
            });
            
            // Add border layer
            console.log(`Adding border layer: ${borderLayerId}`);
            mapboxMap.addLayer({
                id: borderLayerId,
                type: 'line',
                source: sourceId,
                paint: {
                    'line-color': CONFIG.RISK_COLORS[riskLevel],
                    'line-width': 1,
                    'line-opacity': CONFIG.RISK_VISIBILITY[riskLevel] ? 0.8 : 0
                }
            });
            
            // Add popup on click
            mapboxMap.on('click', layerId, (e) => {
                const properties = e.features[0].properties;
                const popupContent = createMapboxPopupContent(properties);
                
                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(popupContent)
                    .addTo(mapboxMap);
            });
            
            // Change cursor on hover
            mapboxMap.on('mouseenter', layerId, () => {
                mapboxMap.getCanvas().style.cursor = 'pointer';
            });
            
            mapboxMap.on('mouseleave', layerId, () => {
                mapboxMap.getCanvas().style.cursor = '';
            });
            
            console.log(`Successfully added layers for ${riskLevel}`);
            
        } catch (layerError) {
            console.error(`Error adding layers for ${riskLevel}:`, layerError);
        }
    });
    
    console.log('Finished adding all 3D layers');
}

function toggle3DRiskZones() {
    if (!window.mapbox3DLayers) return;
    
    // Check if any layers are currently visible
    const anyVisible = Object.values(window.mapbox3DLayers).some(layer => layer.visible);
    const newVisibility = !anyVisible;
    
    // Toggle all layers
    Object.keys(window.mapbox3DLayers).forEach(riskLevel => {
        const layerInfo = window.mapbox3DLayers[riskLevel];
        layerInfo.visible = newVisibility;
        
        // Update layer opacity using current opacity value
        try {
            mapboxMap.setPaintProperty(layerInfo.layerId, 'fill-opacity', newVisibility ? currentOpacity : 0);
            mapboxMap.setPaintProperty(layerInfo.borderLayerId, 'line-opacity', newVisibility ? 0.8 : 0);
        } catch (error) {
            console.warn('Error updating layer visibility:', error);
        }
    });
    
    // Update button icon
    const riskToggleBtn = document.querySelector('.risk-toggle-btn i');
    if (riskToggleBtn) {
        riskToggleBtn.className = newVisibility ? 'fas fa-eye-slash' : 'fas fa-eye';
    }
}

function createMapboxPopupContent(properties) {
    const riskLevel = properties.risk_level || 'Unknown';
    const susceptibility = properties.susceptibility_avg || 0;
    const area = properties.area_sqm ? (properties.area_sqm / 10000).toFixed(2) : 'N/A';
    const color = CONFIG.RISK_COLORS[riskLevel] || '#666';
    
    return `
        <div class="landslide-popup">
            <h4 style="color: ${color}; margin: 0 0 10px 0;">
                <i class="fas fa-mountain" style="margin-right: 8px;"></i>
                ${riskLevel} Risk Zone (3D)
            </h4>
            <div class="popup-row">
                <strong>Susceptibility:</strong> ${(susceptibility * 100).toFixed(1)}%
            </div>
            <div class="popup-row">
                <strong>Area:</strong> ${area} hectares
            </div>
            <div class="popup-row">
                <strong>Risk Classification:</strong> ${riskLevel}
            </div>
        </div>
    `;
}

function createMapboxPopupContent(properties) {
    const riskLevel = properties.risk_level || 'Unknown';
    const susceptibility = properties.susceptibility_avg || 0;
    const area = properties.area_sqm ? (properties.area_sqm / 10000).toFixed(2) : 'N/A';
    const color = CONFIG.RISK_COLORS[riskLevel] || '#666';
    
    return `
        <div class="landslide-popup">
            <h4 style="color: ${color}; margin: 0 0 10px 0;">
                <i class="fas fa-mountain" style="margin-right: 8px;"></i>
                ${riskLevel} Risk Zone (3D)
            </h4>
            <div class="popup-row">
                <strong>Susceptibility:</strong> ${(susceptibility * 100).toFixed(1)}%
            </div>
            <div class="popup-row">
                <strong>Area:</strong> ${area} hectares
            </div>
            <div class="popup-row">
                <strong>Risk Classification:</strong> ${riskLevel}
            </div>
        </div>
    `;
}

function createSample3DData() {
    // Sample data for demonstration when real data is not available
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {
                    risk_level: "High",
                    susceptibility_avg: 0.8,
                    area_sqm: 50000
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [[
                        [CONFIG.BONTOC_CENTER[1] - 0.01, CONFIG.BONTOC_CENTER[0] - 0.01],
                        [CONFIG.BONTOC_CENTER[1] + 0.01, CONFIG.BONTOC_CENTER[0] - 0.01],
                        [CONFIG.BONTOC_CENTER[1] + 0.01, CONFIG.BONTOC_CENTER[0] + 0.01],
                        [CONFIG.BONTOC_CENTER[1] - 0.01, CONFIG.BONTOC_CENTER[0] + 0.01],
                        [CONFIG.BONTOC_CENTER[1] - 0.01, CONFIG.BONTOC_CENTER[0] - 0.01]
                    ]]
                }
            }
        ]
    };
}