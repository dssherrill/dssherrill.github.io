// Copyright (c) David S. Sherrill
//    
// This file is part of Glide Range Map.
//
// Glide Range Map is free software: you can redistribute it and/or modify it under the terms 
// of the GNU General Public License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.
//
// Glide Range Map is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
// without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
// See the GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along with Glide Range Map. 
// If not, see https://www.gnu.org/licenses/.

/*jshint esversion: 6 */

// Clear stored entries on reset request
const paramsString = window.location.search;
let searchParams = new URLSearchParams(paramsString);
if (searchParams.has('reset')) {
    localStorage.removeItem("glideRatio");
    localStorage.removeItem("altitude");
    localStorage.removeItem("arrivalHeight");
    localStorage.removeItem("landingSpots");
}

// These address the unpredictable column labels in the CUP file, as described
// in the lengthy comment (below) in "function processCupData(allText)"
const INDEX_NAME = 0;
const INDEX_LAT = 3;
const INDEX_LON = 4;
const INDEX_ELEV = 5;
const INDEX_STYLE = 6;

class GlideParams {
    constructor(glideRatio, altitude, arrivalHeight) {
        this.glideRatio = glideRatio;
        this.altitude = altitude;
        this.arrivalHeight = arrivalHeight;
    }

    radius(elevation) {
        let r = feetToMeters(this.glideRatio * (this.altitude - this.arrivalHeight - elevation));
        if (isNaN(r)) r = 1.0;
        else r = Math.max(r, 1.0);
        return r;
    }
}

function getGlideParams() {
    let glideRatio = parseFloat(document.getElementById('glideRatioInput').value);
    let altitude = parseFloat(document.getElementById('altitudeInput').value);
    let arrivalHeight = parseFloat(document.getElementById('arrivalHeightInput').value);

    return new GlideParams(glideRatio, altitude, arrivalHeight);
}

// Parses an entry in a CUP file.
// The following link describes the 2018 format:
// https://downloads.naviter.com/docs/CUP-file-format-description.pdf
// But Naviter has updated the format since then, so we must deal with 2 formats.
// Both formats are CSV files (comma separated values) and conform to the CSV standard.
// It is the column assignments that differ.
//
// The 2018 format is
//      name,code,country,lat,lon,elev,style,rwdir,rwlen,freq,desc
//      0    1    2       3   4   5    6     7     8     9    10 
//
// The current version of SeeYou uses this format (notice that freq moves from index 9 to 10):
//      name,code,country,lat,lon,elev,style,rwdir,rwlen,rwwidth,freq,desc,userdata,pics
//      0    1    2       3   4   5    6     7     8     9       10   11   12       13
//
// Turnpoint Exchange has some files with line 1 as:
//      Title,Code,Country,Latitude,Longitude,Elevation,Style,Direction,Length,Frequency,Description
//
// As it turns out, the fields we are reading will always have the same position, and we can ignore the labels
//
class LandingSpot {
    constructor(csvRecord) {
        let values = Object.values(csvRecord);

        this.name = values[INDEX_NAME];
        this.style = values[INDEX_STYLE];

        // Parse elevation and convert to feet if needed
        // Format:  Number with an attached unit. Unit can be either "m" for meters or "ft" for feet.
        let elevation = values[INDEX_ELEV];
        if (elevation.endsWith("ft")) {
            this.elevation = Number(elevation.substr(0, elevation.length - 2));
        }
        else if (elevation.endsWith("m")) {
            this.elevation = metersToFeet(Number(elevation.substr(0, elevation.length - 1)));
        }

        // Parse lattitude
        // Format:   ddmm.mmm{N|S}
        // Example: "5107.830N" is equal to 51° 07.830' North
        let valueText = values[INDEX_LAT];
        let degrees = Number(valueText.substring(0, 2));
        let minutes = Number(valueText.substring(2, 8));
        let sign = valueText.endsWith("N") ? 1 : -1;
        let lat = sign * (degrees + minutes / 60.0);

        // Parse longitude
        // Format:   dddmm.mmm{E|W}
        // Example:  01410.467E is equal to 014° 10.467' East
        valueText = values[INDEX_LON];
        degrees = Number(valueText.substring(0, 3));
        minutes = Number(valueText.substring(3, 9));
        sign = valueText.endsWith("E") ? 1 : -1;
        let lon = sign * (degrees + minutes / 60.0);

        this.latLng = L.latLng(lat, lon);
        this.circle = NaN;
    }
}

let sterling = L.latLng(42.426, -71.793);
let map = L.map('map', { maxZoom: 18 }).setView(sterling, 9);

map.on('popupopen', function (e) {
    // If this is a Landing Spot popup, locate it on the circle center instead of the mouse click
    if (e.popup.fixedLatLng) {
        try { e.popup.setLatLng(e.popup.fixedLatLng); }
        catch (obj) { console.log("Repositioning circle failed for " + e); }
    }
});

let landingSpots = [];
let Airports = L.featureGroup().addTo(map);
let GrassStrips = L.featureGroup().addTo(map);
let Landables = L.featureGroup().addTo(map);

let overlays = {
    '<i style="background: #AAC896"/> Airports': Airports,
    '<i style="background: #AAAADC"/> Grass Strips': GrassStrips,
    '<i style="background: #E6E696"/> Landable Fields': Landables,
};

L.control.layers(null, overlays, { position: 'topleft' }).addTo(map);

// Open the layer control to reveal the legend for circle colors.
// The control will close the first time it loses focus
// or something on the map is clicked
$(".leaflet-control-layers").addClass("leaflet-control-layers-expanded");

// Display instructions in a Tooltip box when this page first loads.
let tooltip = L.tooltip({
    direction: 'center',
    permanent: true,
    interactive: true,
    noWrap: true,
    opacity: 1.0
});

tooltip.setContent(
    "<strong>NOTICE: The range circles ignore blocking terrain</strong>" +
    "<br>" +
    "<ul>" +
    "<li>Hover on the Layers control (near top-left)<br>to filter landing sites by type" +
    "<li>Adjust the soaring parameters (below map)" +
    "<li>Use the button to load your CUP file (optional)" +
    "<li>Click this box to dismiss it" +
    "</ul>" +
    "Contact:  soarer@sherrill.in"
);

tooltip.setLatLng(map.getCenter());
tooltip.addTo(map);

let el = tooltip.getElement();
el.addEventListener('click', function () { tooltip.remove(); });
el.style.pointerEvents = 'auto';


// These functions fire when the user checks a box for Landing Spot type
// in the Layers control, which adds the feature group to the map

// Keep the landables group on the bottom
Landables.on('add', function () {
    Landables.bringToBack();
});

// Keep the grass stips group in the middle
GrassStrips.on('add', function () {
    GrassStrips.bringToBack();
    Landables.bringToBack();
});


let tiles = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoiZHNzaGVycmlsbCIsImEiOiJjbDAydXFrbWowaDI5M2JtajBlZTFzaXluIn0.Wji4RxsuxVWPHl8yf26yJQ', {
    maxZoom: 18,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
}).addTo(map);

L.control.scale().addTo(map);

// Updates the radius of the circle for every landing spot using the parameters read from the form.\
// This is called when any input parameter changes
function drawLandingSpots(e) {
    let glideParams = getGlideParams();

    // Save the form inputs
    localStorage.setItem('glideRatio', glideParams.glideRatio);
    localStorage.setItem('altitude', glideParams.altitude);
    localStorage.setItem('arrivalHeight', glideParams.arrivalHeight);

    for (let ls of landingSpots) {
        ls.circle.setRadius(glideParams.radius(ls.elevation));
    }
}

// reload the last set of form inputs
function restoreGlideParameters() {
    loadStoredValue('glideRatio', 'glideRatioInput');
    loadStoredValue('altitude', 'altitudeInput');
    loadStoredValue('arrivalHeight', 'arrivalHeightInput');
}

// reload a single form input
function loadStoredValue(storageKey, htmlId) {
    // check whether the 'name' data item is stored in web Storage
    let storedText = localStorage.getItem(storageKey);
    if (storedText) {
        document.getElementById(htmlId).value = parseFloat(storedText);
    }
}

function feetToMeters(feet) {
    // one foot is exactly 0.3048 meters
    return feet * 0.3048;
}

function metersToFeet(meters) {
    return meters / 0.3048;
}

const loadFileForm = document.getElementById("loadFileForm");
const glideParameters = document.getElementById("glideParameters");
const csvFile = document.getElementById("csvFile");
const GRASS_SURFACE = 2;
const OUTLANDING = 3;
const GLIDING_AIRFIELD = 4;
const AIRPORT = 5;

// Loads the CUP file when the "Load File" button is clicked.
// Note that the CUP file format is a valid CSV file.
loadFileForm.addEventListener('change', loadCupFile);

// Updates circle sizes when the user changes any of the
// input paramters (glide ratio, altitude, and arrival height).
glideParameters.addEventListener('change', drawLandingSpots);

// Load the default landing spots
map.whenReady(function () {
    // Try to reload the stored copy of the CUP file
    let allText = localStorage.getItem('landingSpots');
    if (allText) {
        processCupData(allText);
        restoreGlideParameters();
        drawLandingSpots();
    }
    else {
        // Nothing has been stored.  Load the default CUP file
        fetch('https://dssherrill.github.io/Sterling,%20Massachusetts%202021%20SeeYou.cup')
            .then(response => response.text())
            .then(data => {
                restoreGlideParameters();
                processCupData(data);
            });
    }
});

function loadCupFile(e) {
    e.preventDefault();

    const input = csvFile.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const allText = e.target.result;
        processCupData(allText);
        localStorage.setItem('landingSpots', allText);
    };

    reader.readAsText(input);
}

function processCupData(allText) {

    removeAllLandingSpots();

    let glideParams = getGlideParams();

    let yellowOptions = { color: 'black', fillColor: 'yellow', opacity: 1, fillOpacity: 1 };
    let blueOptions = { color: 'black', fillColor: 'blue', opacity: 1, fillOpacity: 1 };
    let greenOptions = { color: 'black', fillColor: 'green', opacity: 1, fillOpacity: 1 };

    // find the task section and ignore everything in the file from there on
    let taskLocation = allText.indexOf("-----Related Tasks-----");

    // if string not found (or other error producing NaN or undefined)
    // then process the entire file
    taskLocation = (~taskLocation) ? taskLocation : allText.length;

    // Parse the CUP file (which is formatted as a CSV file).
    // Stop parsing when the Task section is reached.
    let result = $.csv.toObjects(allText.substring(0, taskLocation));
    if (result.length == 0) { return; }

    console.log(result[0]);
    console.log(result[result.length - 1]);

    // load ordinary airports first so they will be layered above all others
    while (result.length) {
        // Process the file in reverse order so that the circles for the first lines
        // will be created last and will therefore be on top of the others.
        // This allows a user to put their home airport as the first line in the 
        // CUP file to prevent it from being buried by other nearby airports.
        row = result.pop();
        console.log(result.length);
        let ls = new LandingSpot(row);
        if (ls == null)
        {
            console.log("oops");
        }
        if (ls.style == GLIDING_AIRFIELD || ls.style == AIRPORT) {
            ls.circle = L.circle(ls.latLng, greenOptions);
            ls.circle.addTo(Airports);
        }
        else if (ls.style == GRASS_SURFACE) {
            ls.circle = L.circle(ls.latLng, blueOptions);
            ls.circle.addTo(GrassStrips);
        }
        else if (ls.style == OUTLANDING) {
            ls.circle = L.circle(ls.latLng, yellowOptions);
            ls.circle.addTo(Landables);
        }
        else{
            continue;  // this row is not a landing spot (could be waypoint, etc.)
        }
        
        let radius = glideParams.radius(ls.elevation);
        let pop = L.popup().setLatLng(ls.latLng).setContent(ls.name + "<br>" + ls.elevation.toFixed(0) + " ft");
        // popup().setLatLng(ls.latLng) does not work;  the popup still appears at the mouse click instead of the circle center.
        // So save the desired center in fixedLatLng and use that value in the event handler to relocate the circle
        pop.fixedLatLng = ls.latLng;

        ls.circle.setRadius(radius).bindPopup(pop);
        landingSpots.push(ls);
    }

    // Force the layer order to be
    //  Airports (on top)
    //  Grass Strips
    //  Landable Fields
    GrassStrips.bringToBack();
    Landables.bringToBack();

    // Center the map on the set of all landing spots
    try {
        let bounds = Airports.getBounds().extend(GrassStrips.getBounds()).extend(Landables.getBounds());
        map.fitBounds(bounds);
        tooltip.setLatLng(bounds.getCenter());
    }
    // An error occurred while computing the bounds.  Airports contains only one circle.
    catch (e) {
        if (landingSpots.length > 0) {
            let ls = landingSpots[0];
            if (ls) {
                let center = landingSpots[0].circle.getLatLng();
                map.setView(center, 10);
                tooltip.setLatLng(center);
            }
        }
    }

    tooltip.addTo(map);

    // Open the layer control to reveal the legend for circle colors.
    // The control will close the first time it loses focus.
    $(".leaflet-control-layers").addClass("leaflet-control-layers-expanded");
}

// Remove all landing spots before loading a new CUP file
function removeAllLandingSpots() {
    // Remove circles from the map
    for (let ls of landingSpots) {
        let c = ls.circle;
        c.removeFrom(Airports);
        c.removeFrom(GrassStrips);
        c.removeFrom(Landables);
    }

    // Remove all landing spots from the array
    landingSpots.length = 0;
}

