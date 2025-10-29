// Initialize map
const map = L.map("map", {
  zoomControl: true,
  attributionControl: false,
}).setView([30.3753, 69.3451], 5);

// Add Google Satellite base layer
L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
  maxZoom: 20,
  subdomains: ["mt0", "mt1", "mt2", "mt3"],
}).addTo(map);

// Load Pakistan boundary (optional visual)
fetch("Data/pak_boundary.geojson")
  .then((response) => response.json())
  .then((data) => {
    const boundaryLayer = L.geoJSON(data, {
      style: { color: "#007bff", weight: 3, fillOpacity: 0 },
    }).addTo(map);
    map.fitBounds(boundaryLayer.getBounds());
  });

// KMZ + KML file list
const mapFiles = [
  "Data/KMZ/chappu Cp1.kmz",
  "Data/KMZ/Chappu CP 2.kmz",
  "Data/KMZ/Chappu CP 3.kmz",
  "Data/KMZ/Chappu CP 4.kmz",
  "Data/KMZ/Chappu CP 5.kmz",
  "Data/KMZ/Chappu CP 6.kmz",
  "Data/KMZ/Chappu CP 7.kmz",
  "Data/KMZ/CP Garhi Yasin.kmz",
  "Data/KMZ/CP MRH 1.kmz",
  "Data/KMZ/CP MRH 3.kmz",
  "Data/KMZ/CP Valley 1.kmz",
  "Data/KMZ/CP Valley 2.kmz",
];

// Distinct colors
const colors = [
  "#FF5733", "#33FF57", "#3357FF", "#F39C12", "#9B59B6", "#E74C3C",
  "#16A085", "#2980B9", "#D35400", "#8E44AD", "#2ECC71", "#1ABC9C"
];

let totalArea = 0;
const legendList = document.getElementById("legendList");
const totalAreaEl = document.getElementById("totalArea");

// Create a global feature group to fit all polygons together
const allLayers = L.featureGroup().addTo(map);

// Main loader (auto-detect KMZ or KML)


// keep a global reference of layers
const layerMap = {};

async function loadMapFile(filePath, color) {
  try {
    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();
    let geojson;

    // --- Handle KMZ or KML ---
    if (filePath.endsWith(".kmz")) {
      const zip = await JSZip.loadAsync(arrayBuffer);
      const kmlFile = Object.keys(zip.files).find(name => name.endsWith(".kml"));
      if (!kmlFile) return console.warn(`⚠️ No KML found in ${filePath}`);
      const kmlText = await zip.files[kmlFile].async("text");
      const kml = new DOMParser().parseFromString(kmlText, "text/xml");
      geojson = toGeoJSON.kml(kml);
    } else if (filePath.endsWith(".kml")) {
      const text = new TextDecoder().decode(arrayBuffer);
      const kml = new DOMParser().parseFromString(text, "text/xml");
      geojson = toGeoJSON.kml(kml);
    }

    if (!geojson) return;

    // --- Fix: Convert closed LineStrings (circles) to Polygons ---
    const fixedFeatures = geojson.features.map(f => {
      if (f.geometry?.type === "LineString") {
        const coords = f.geometry.coordinates;
        if (coords.length < 3) return f;

        // Distance between start & end points
        const first = coords[0];
        const last = coords[coords.length - 1];
        const dist = turf.distance(turf.point(first), turf.point(last), { units: "kilometers" });

        // If ends are within 100 m, treat as closed shape
        if (dist < 0.1) {
          coords.push(first);
          return {
            ...f,
            geometry: { type: "Polygon", coordinates: [coords] },
          };
        }
      }
      return f;
    });

    // --- Keep only polygons ---
    const polygons = fixedFeatures.filter(f =>
      f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
    );

    if (polygons.length === 0) {
      console.warn(`⚠️ ${filePath}: No polygons or closed lines found.`);
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="legend-color" style="background:${color}"></span>
        ${filePath.split("/").pop()} - No polygon
      `;
      legendList.appendChild(li);
      return;
    }

    const polygonGeoJSON = { type: "FeatureCollection", features: polygons };

    // --- Calculate area ---
    const areaSqMeters = turf.area(polygonGeoJSON);
    const areaKm2 = areaSqMeters / 1e6;
    const areaAcres = areaSqMeters / 4046.85642;
    totalArea += areaAcres;

    // --- Create map layer ---
    const name = filePath.split("/").pop().replace(/\.(kmz|kml)$/i, "");
    const layer = L.geoJSON(polygonGeoJSON, {
      style: {
        color,
        weight: 4,
        opacity: 0.9,
        fillOpacity: 0.35,
        fillColor: color,
      },
      onEachFeature: (feature, lyr) => {
        lyr.bindPopup(`
          <b>${name}</b><br>
          Area: ${areaKm2.toFixed(2)} km²<br>
          ≈ ${areaAcres.toFixed(2)} acres
        `);
             // 👇 Zoom to this KMZ when user clicks it on the map
        lyr.on("click", () => {
            const center = turf.center(polygonGeoJSON).geometry.coordinates;
    console.log(`📍 Center of ${name}:`, center);
        handleLayerSelection(lyr, name);

          map.flyToBounds(layer.getBounds(), { duration: 1.5 });
          lyr.openPopup();
        });
      },
    }).addTo(allLayers);

    // store in global map
    layerMap[name] = layer;

    // --- Automatically open all popups ---
    setTimeout(() => {
      layer.eachLayer(l => l.openPopup());
    }, 500);

    // --- Add legend entry ---
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="legend-color" style="background:${color}"></span>
      <span class="legend-name" style="cursor:pointer;"><strong>${name}= </strong></span> ${areaKm2.toFixed(2)} km² (≈${areaAcres.toFixed(2)} acres)
    `;
    legendList.appendChild(li);

    // --- Zoom to KMZ when legend clicked ---
    const legendName = li.querySelector(".legend-name");
    legendName.addEventListener("click", () => {
        const center = turf.center(polygonGeoJSON).geometry.coordinates;
    console.log(`📍 Center of ${name}:`, center);

      map.flyToBounds(layer.getBounds(), { duration: 1.5 });
      layer.eachLayer(l => l.openPopup());
    });

    // --- Hover highlight ---
    legendName.addEventListener("mouseenter", () => {
      layer.setStyle({
        weight: 6,
        color: "#FFFF00",
        opacity: 1.0,
      });
      layer.bringToFront();
    });
    legendName.addEventListener("mouseleave", () => {
      layer.setStyle({
        color,
        weight: 4,
        opacity: 0.9,
        fillOpacity: 0.35,
        fillColor: color,
      });
    });

    // --- Update total area ---
    totalAreaEl.innerHTML = `<strong>Total Area:</strong> ${totalArea.toFixed(2)} acres`;

    console.log(`✅ Loaded ${filePath} | Area: ${areaKm2.toFixed(2)} km² (${areaAcres.toFixed(2)} acres)`);

  } catch (err) {
    console.error(`❌ Error loading ${filePath}:`, err);
  }
}



// Load all KMZ + KML files
(async () => {
  for (let i = 0; i < mapFiles.length; i++) {
    await loadMapFile(mapFiles[i], colors[i % colors.length]);
  }
  // Once all loaded → zoom to all polygons
  map.fitBounds(allLayers.getBounds());
})();


////button
// Get the analysis button
// Make sure analysis.js is loaded in HTML
// <script src="analysis.js"></script>

const analysisBtn = document.getElementById("analysisBtn");
analysisBtn.disabled = true;
analysisBtn.style.opacity = "0.5";
analysisBtn.style.cursor = "not-allowed";

let selectedLayer = null;

// When KMZ clicked
function handleLayerSelection(layer, name) {
  if (selectedLayer && selectedLayer !== layer) {
    selectedLayer.setStyle({ weight: 4 });
  }

  selectedLayer = layer;
  layer.setStyle({ weight: 8 });

  const bounds = layer.getBounds();
  const center = bounds.getCenter();
  const lat = center.lat;
  const lon = center.lng;

  analysisBtn.disabled = false;
  analysisBtn.style.opacity = "1";
  analysisBtn.style.cursor = "pointer";
  analysisBtn.dataset.lat = lat;
  analysisBtn.dataset.lon = lon;
  analysisBtn.dataset.name = name;

  console.log(`📍 Selected ${name}:`, lat, lon);
}

// When “Start Analysis” is clicked
analysisBtn.addEventListener("click", () => {
  const lat = parseFloat(analysisBtn.dataset.lat);
  const lon = parseFloat(analysisBtn.dataset.lon);
  const kmzName = analysisBtn.dataset.name;

  runAnalysis(lat, lon, kmzName, map);
});

