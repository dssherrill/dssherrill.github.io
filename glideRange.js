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

let sterling = L.latLng(42.426, -71.793);
let map = L.map('map').setView(sterling, 8);

// var popup = L.popup()
// .setLatLng(sterling)
// .setContent('I am a standalone popup.')
// .openOn(map);

let landingSpots = [];
let Airports = L.featureGroup().addTo(map);
let GrassStrips = L.featureGroup().addTo(map);
let Landables = L.featureGroup().addTo(map);

var overlays = {
    '<i style="background: #AAC896"/> Airports': Airports,
    '<i style="background: #AAAADC"/> Grass Strips': GrassStrips,
    '<i style="background: #E6E696"/> Landable Fields': Landables,
};

L.control.layers(null, overlays, { position: 'topleft' }).addTo(map);

// Open the layer control to reveal the legend for circle colors.
// The control will close the first time it loses focus.
$(".leaflet-control-layers").addClass("leaflet-control-layers-expanded");

// Keep the landables group on the bottom
Landables.on('add', function () {
    Landables.bringToBack();
});

// Keep the grass stips group in the middle
GrassStrips.on('add', function () {
    GrassStrips.bringToBack();
    Landables.bringToBack();
});

let tiles = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
    maxZoom: 18,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
}).addTo(map);

L.control.scale().addTo(map);

let glideRatio = parseFloat(document.getElementById('glideRatioInput').value);
let altitude = parseFloat(document.getElementById('altitudeInput').value);
let arrivalHeight = parseFloat(document.getElementById('arrivalHeightInput').value);

// function onMapClick(e) {
// 	L.popup()
// 		.setLatLng(e.latlng)
// 		.setContent(e.latlng.toString())
// 		.openOn(map);
// }

// Updates the radius of the circle for every landing spot using the parameters read from the form
function drawLandingSpots(e) {
    let glideRatio = parseFloat(document.getElementById('glideRatioInput').value);
    let altitude = parseFloat(document.getElementById('altitudeInput').value);
    let arrivalHeight = parseFloat(document.getElementById('arrivalHeightInput').value);

    for (let ls of landingSpots) {
        radius = glideRatio * (altitude - arrivalHeight - ls.elevation);
        radius = Math.max(1.0, radius);
        ls.circle.setRadius(feetToMeters(radius));
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
    fetch('https://dssherrill.github.io/Sterling,%20Massachusetts%202021%20SeeYou.cup')
        .then(response => response.text())
        .then(data => parseCupText(data));
});

function loadCupFile(e) {
    e.preventDefault();

    const input = csvFile.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const allText = e.target.result;
        parseCupText(allText);
    }

    reader.readAsText(input);
}

// These address the unpredictable column labels in the CUP file, as described
// in the large comment below.
const INDEX_NAME = 0;
const INDEX_LAT = 3;
const INDEX_LON = 4;
const INDEX_ELEV = 5;
const INDEX_STYLE = 6;

function parseCupText(allText) {

    removeAllLandingSpots();

    glideRatio = parseFloat(document.getElementById('glideRatioInput').value);
    altitude = parseFloat(document.getElementById('altitudeInput').value);
    arrivalHeight = parseFloat(document.getElementById('arrivalHeightInput').value);

    let yellowOptions = { color: 'black', fillColor: 'yellow', opacity: 1, fillOpacity: 1 };
    let blueOptions = { color: 'black', fillColor: 'blue', opacity: 1, fillOpacity: 1 };
    let greenOptions = { color: 'black', fillColor: 'green', opacity: 1, fillOpacity: 1 };

    // delete tasks
    let taskLocation = allText.indexOf("-----Related Tasks-----");

    // fix taskLocation if string not found, or other error producing NaN or undefined
    taskLocation = (~taskLocation) ? taskLocation : allText.length;

    // Parse the CUP file (which is formatted as a CSV file).
    // Stop parsing when the Task section is reached.
    let result = $.csv.toObjects(allText.substring(0, taskLocation));
    if (result.length == 0) { return };

    // "result" is an array of objects.  The keys for each object are the column labels from 
    // the first row of the CUP file, but these labels are arbitrary and not at all consistent.
    // SeeYou creates CUP files with line 1 as follows:
    //      name,code,country,lat,lon,elev,style,rwdir,rwlen,rwwidth,freq,desc,userdata,pics
    //      0    1    2       3   4   5    6
    // Turnpoint Exchange has some files with line 1 as:
    //      Title,Code,Country,Latitude,Longitude,Elevation,Style,Direction,Length,Frequency,Description
    //
    // What's more, newer files have extra columns.
    // Previous format (2018)
    // name,code,country,lat,lon,elev,style,rwdir,rwlen,freq,desc
    //
    // Current format
    // name,code,country,lat,lon,elev,style,rwdir,rwlen,rwwidth,freq,desc,userdata,pics
    //
    // So, the fields we are reading will always have the same position, but the label will vary,
    // and therefore the object keys will vary.
    // "keys" defined here is passed to the LandingSpot constructor to addresses this problem.
    let keys = Object.keys(result[0]);

    console.log(result[0]);
    console.log(result[result.length - 1]);


    let numLines = result.length;
    let numGroups = 3;
    let numIterations = numGroups * numLines;
    let iteration = 0;

    let key_style = keys[INDEX_STYLE];

    // load ordinary airports first so they will be layered above all others
    while (result.length) {
        // Process the file in reverse order so that the circles for the first lines
        // will be created last and will therefore be on top of the others.
        // This allows a user to put their home airport as the first line in the 
        // CUP file to prevent it from being buried by other nearby airports.
        row = result.pop();
        if (row[key_style] == GLIDING_AIRFIELD || row[key_style] == AIRPORT) {
            let ls = new LandingSpot(row, keys, greenOptions);
            landingSpots.push(ls);
            ls.circle.addTo(Airports);
        }
        else if (row[key_style] == GRASS_SURFACE) {
            let ls = new LandingSpot(row, keys, blueOptions);
            landingSpots.push(ls);
            ls.circle.addTo(GrassStrips);
        }
        else if (row[key_style] == OUTLANDING) {
            let ls = new LandingSpot(row, keys, yellowOptions);
            landingSpots.push(ls);
            ls.circle.addTo(Landables);
        }
    }

    // Force the layer order to be
    //  Airports (on top)
    //  Grass Strips
    //  Landable Fields
    GrassStrips.bringToBack();
    Landables.bringToBack();

    map.fitBounds(Airports.getBounds());
};

// Remove all landing spots before loading a new CUP file
function removeAllLandingSpots() {
    // Remove circles from the map
    for (ls of landingSpots) {
        let c = ls.circle;
        c.removeFrom(Airports);
        c.removeFrom(GrassStrips);
        c.removeFrom(Landables);
    }

    // Remove all landing spots from the array
    landingSpots.length = 0;
}

// Parses an entry in a CUP file.
function LandingSpot(csvRecord, keys, options) {

    this.name = csvRecord[keys[INDEX_NAME]];
    this.style = csvRecord[keys[INDEX_STYLE]];

    // Parse elevation
    let elevation = csvRecord[keys[INDEX_ELEV]];
    if (elevation.endsWith("ft")) {
        this.elevation = Number(elevation.substr(0, elevation.length - 2));
    }
    else if (elevation.endsWith("m")) {
        this.elevation = metersToFeet(Number(elevation.substr(0, elevation.length - 1)));
    }

    // Parse lattitude
    let valueText = csvRecord[keys[INDEX_LAT]];;
    let degrees = Number(valueText.substring(0, 2));
    let minutes = Number(valueText.substring(2, 8));
    let sign = valueText.endsWith("N") ? 1 : -1;
    let lat = sign * (degrees + minutes / 60.0);

    // Parse longitude
    valueText = csvRecord[keys[INDEX_LON]];;
    degrees = Number(valueText.substring(0, 3));
    minutes = Number(valueText.substring(3, 9));
    sign = valueText.endsWith("E") ? 1 : -1;
    let lon = sign * (degrees + minutes / 60.0);

    this.latLng = L.latLng(lat, lon);
    let radius = glideRatio * (altitude - arrivalHeight - this.elevation);
    options.radius = feetToMeters(radius);

    if (isNaN(radius)) {
        console.log(this.name + "radius is NaN");
    }
    else {
        this.circle = L.circle(this.latLng,
            options).bindPopup(this.name + "<br>" + this.elevation.toFixed(0) + " ft");
    }
}
