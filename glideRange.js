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

let tiles = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
    maxZoom: 18,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
}).addTo(map);


// Control 2: This add a scale to the map
L.control.scale().addTo(map);

// Control 3: This add a Search bar
let searchControl = new L.esri.Controls.Geosearch().addTo(map);

let results = new L.LayerGroup().addTo(map);

searchControl.on('results', function (data) {
    results.clearLayers();
    for (let i = data.results.length - 1; i >= 0; i--) {
        results.addLayer(L.marker(data.results[i].latlng));
    }
});

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

    let inputElements = document.getElementsByClassName('messageCheckbox');
    let airport = inputElements[0].checked;
    let grassStrip = inputElements[1].checked;
    let landable = inputElements[2].checked;

    for (let a of landingSpots) {
        a.circle.removeFrom(map);

        radius = glideRatio * (altitude - arrivalHeight - a.elevation);
        radius = Math.max(1.0, radius);
        a.circle.setRadius(feetToMeters(radius));

        if ((a.style == OUTLANDING && landable) ||
            (a.style == GRASS_SURFACE && grassStrip) ||
            (a.style == AIRPORT && airport) ||
            (a.style == GLIDING_AIRFIELD && airport)) {
            a.circle.addTo(map);
        }
    }
}

function feetToMeters(feet) {
    // one foot is exactly 0.3048 meters
    return feet * 0.3048;
}

function metersToFeet(meters) {
    return meters / 0.3048;
}

// map.on('click', onMapClick);

let landingSpots = [];

const myForm = document.getElementById("myForm");
const csvFile = document.getElementById("csvFile");
const GRASS_SURFACE = 2;
const OUTLANDING = 3;
const GLIDING_AIRFIELD = 4;
const AIRPORT = 5;

// Loads the CUP file when the "Load File" button is clicked.
// Note that the CUP file format is a valid CSV file.
myForm.addEventListener('change', loadCupFile);
myForm.addEventListener("submit", loadCupFile);

glideParameters.addEventListener('change', drawLandingSpots);

// let elem = document.getElementById("myBar");
// let progressElement = document.getElementById("loadProgress");
// let i = 0;
// function move() {
//     if (i == 0) {
//         elem.style.visibility = "visible";
//         i = 1;
//         let width = 10;
//         let id = setInterval(frame, 10);
//         function frame() {
//             if (width >= 100) {
//                 clearInterval(id);
//                 i = 0;
//             } else {
//                 width++;
//                 elem.style.width = width + "%";
//                 elem.innerHTML = width + "%";
//             }
//         }
//     }
// }

// Load the default landing spots
fetch('https://dssherrill.github.io/Sterling,%20Massachusetts%202021%20SeeYou.cup')
    .then(response => response.text())
    .then(data => parseCupText(data));

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

    removeAllCircles();

    // delete tasks
    let taskLocation = allText.indexOf("-----Related Tasks-----");

    glideRatio = parseFloat(document.getElementById('glideRatioInput').value);
    altitude = parseFloat(document.getElementById('altitudeInput').value);
    arrivalHeight = parseFloat(document.getElementById('arrivalHeightInput').value);

    let yellowOptions = { color: 'black', fillColor: 'yellow', opacity: 1, fillOpacity: 1 };
    let blueOptions = { color: 'black', fillColor: 'blue', opacity: 1, fillOpacity: 1 };
    let greenOptions = { color: 'black', fillColor: 'green', opacity: 1, fillOpacity: 1 };

    // correct taskLocation if string not found, or other error producing NaN or undefined
    taskLocation = (~taskLocation) ? taskLocation : allText.length;

    // parse the CUP file (which is formatted as a CSV file)
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

    // elem.style.visibility = "visible";
    // progressElement.max = numIterations;

    function updateProgress() {
        iteration++;
        // progressElement.value = iteration;
        // let percent = (100 * iteration / numIterations).toFixed(0);
        // if (iteration%(numIterations/10).toFixed(0) == 0) {
        //     console.log(percent);
        // }
        // elem.style.width = percent + "%";
        // elem.innerHTML = percent + "%";
    }

    let key_style = keys[INDEX_STYLE];
    // add landables first
    for (let row of result) {
        updateProgress();
        if (row[key_style] == OUTLANDING) {
            let a = new LandingSpot(row, keys, yellowOptions);
            landingSpots.push(a);
        }
    }

    // airports with grass surface will be layered above landable fields
    for (let row of result) {
        updateProgress();
        if (row[key_style] == GRASS_SURFACE) {
            let a = new LandingSpot(row, keys, blueOptions);
            landingSpots.push(a);
        }
    }

    // load ordinary airports last so they will be layered above all others
    for (let row of result) {
        updateProgress();
        if (row[key_style] == GLIDING_AIRFIELD || row[key_style] == AIRPORT) {
            let a = new LandingSpot(row, keys, greenOptions);
            landingSpots.push(a);
        }
    }

    // Draw the landing spots according to the selected check boxes
    drawLandingSpots();
};

function removeAllCircles() {
    // Remove each circle from the map
    for (let a of landingSpots) {
        a.circle.removeFrom(map);
    }

    // Remove all circles from the array
    landingSpots.length = 0;
}

// Parses an entry in a CUP file.
// Will probably die if the file contains tasks.
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
    let s = csvRecord[keys[INDEX_LAT]];;
    let degrees = Number(s.substring(0, 2));
    let minutes = Number(s.substring(2, 8));
    let sign = s.endsWith("N") ? 1 : -1;
    let lat = sign * (degrees + minutes / 60.0);

    // Parse longitude
    s = csvRecord[keys[INDEX_LON]];;
    degrees = Number(s.substring(0, 3));
    minutes = Number(s.substring(3, 9));
    sign = s.endsWith("E") ? 1 : -1;
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
