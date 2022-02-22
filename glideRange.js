        var sterling = L.latLng(42.426, -71.793);
        var map = L.map('map').setView(sterling, 8);

        var tiles = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
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
        var searchControl = new L.esri.Controls.Geosearch().addTo(map);

        var results = new L.LayerGroup().addTo(map);

        searchControl.on('results', function (data) {
            results.clearLayers();
            for (var i = data.results.length - 1; i >= 0; i--) {
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

        function buttonUpdateClick(e) {
            drawLandingSpots();
        }

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

        function loadCupFile(e) {
            e.preventDefault();

            glideRatio = parseFloat(document.getElementById('glideRatioInput').value);
            altitude = parseFloat(document.getElementById('altitudeInput').value);
            arrivalHeight = parseFloat(document.getElementById('arrivalHeightInput').value);

            const input = csvFile.files[0];
            const reader = new FileReader();

            let yellowOptions = { color: 'black', fillColor: 'yellow', opacity: 1, fillOpacity: 1 };
            let blueOptions = { color: 'black', fillColor: 'blue', opacity: 1, fillOpacity: 1 };
            let greenOptions = { color: 'black', fillColor: 'green', opacity: 1, fillOpacity: 1 };

            reader.onload = function (e) {
                const allText = e.target.result;

                // delete tasks
                let taskLocation = allText.indexOf("-----Related Tasks-----");

                // correct taskLocation if string not found, or other error producing NaN or undefined
                taskLocation = (~taskLocation) ? taskLocation : allText.length;

                // parse the CUP file (which is formatted as a CSV file)
                let result = $.csv.toObjects(allText.substring(0, taskLocation));
                console.log(result[0]);
                console.log(result[result.length - 1]);

                // add landables first
                for (let row of result) {
                    if (row.style == OUTLANDING) {
                        let a = new LandingSpot(row, yellowOptions);
                        landingSpots.push(a);
                    }
                }

                // airports with grass surface will be layered above landable fields
                for (let row of result) {
                    if (row.style == GRASS_SURFACE) {
                        let a = new LandingSpot(row, blueOptions);
                        landingSpots.push(a);
                    }
                }

                // load ordinary airports last so they will be layered above all others
                for (let row of result) {
                    if (row.style == GLIDING_AIRFIELD || row.style == AIRPORT) {
                        let a = new LandingSpot(row, greenOptions);
                        landingSpots.push(a);
                    }
                }

                // Draw the landing spots according to the selected check boxes
                drawLandingSpots();
            };

            // Parses an entry in a CUP file.
            // Will probably die if the file contains tasks.
            function LandingSpot(csvRecord, options) {
                this.name = csvRecord.name;
                this.style = csvRecord.style;

                // Parse elevation
                if (csvRecord.elev.endsWith("ft")) {
                    this.elevation = Number(csvRecord.elev.substr(0, csvRecord.elev.length - 2));
                }
                else if (csvRecord.elev.endsWith("m")) {
                    this.elevation = metersToFeet(Number(csvRecord.elev.substr(0, csvRecord.elev.length - 1)));
                }

                // Parse lattitude
                let s = csvRecord.lat;
                let degrees = Number(s.substring(0, 2));
                let minutes = Number(s.substring(2, 8));
                let sign = s.endsWith("N") ? 1 : -1;
                let lat = sign * (degrees + minutes / 60.0);

                // Parse longitude
                s = csvRecord.lon;
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

            reader.readAsText(input);
        };