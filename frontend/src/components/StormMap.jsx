import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  Polyline,
  CircleMarker,
  Tooltip,
  LayerGroup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { classifyIntensity } from "../utils/intensity.js";

// Leaflet's default marker icons reference image files in a way that
// doesn't play nicely with Vite's bundler by default. This block fixes
// that - it's boilerplate you'll see in most react-leaflet projects.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Small helper component: whenever the selected storm changes, smoothly
// pan/zoom the map to center on it. react-leaflet requires this "useMap"
// pattern for imperative map control from inside the tree.
function FlyToStorm({ storm }) {
  const map = useMap();
  useEffect(() => {
    if (storm && !Number.isNaN(storm.lat) && !Number.isNaN(storm.lon)) {
      map.flyTo([storm.lat, storm.lon], 6, { duration: 0.75 });
    }
  }, [storm, map]);
  return null;
}

// See App.jsx for the explanation of this env var.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// A fixed palette so each model gets a distinct, readable color. We hash
// the model's name to an index so the same model (e.g. "AVNO"/GFS) gets
// the same color across renders, without needing to hardcode every
// possible model name (new ensemble members etc. show up all the time).
const PALETTE = [
  "#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#38d9a9",
  "#4dabf7", "#748ffc", "#9775fa", "#da77f2", "#f783ac",
];
function colorForModel(tech) {
  let hash = 0;
  for (let i = 0; i < tech.length; i++) hash = (hash * 31 + tech.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// A handful of models worth labeling clearly in the legend - everything
// else still draws, just grouped as "other models" in the legend to avoid
// an unreadable wall of text (a-decks can contain 20-30+ techs/members).
const KNOWN_MODELS = {
  OFCL: "NHC Official",
  AVNO: "GFS",
  AVNI: "GFS (interpolated)",
  EMX: "ECMWF",
  EMXI: "ECMWF (interpolated)",
  HWRF: "HWRF",
  HMON: "HMON",
  CTCX: "COAMPS-TC",
  UKM: "UKMET",
  UKMI: "UKMET (interpolated)",
  CMC: "CMC (Canadian)",
};

export default function StormMap({ storms, selectedStorm, onSelect }) {
  const [coneGeoJson, setConeGeoJson] = useState(null);
  const [modelTracks, setModelTracks] = useState({}); // { TECH: [{lat,lon,tau}] }
  const [showSpaghetti, setShowSpaghetti] = useState(true);
  const [showIntensity, setShowIntensity] = useState(true);
  const [selectedModel, setSelectedModel] = useState("ALL");
  const [spaghettiStatus, setSpaghettiStatus] = useState("idle"); // idle|loading|ok|error

  // When the selected storm has a forecast-cone GeoJSON URL, fetch it
  // through our backend proxy (to dodge CORS) and draw it on the map.
  useEffect(() => {
    setConeGeoJson(null);
    if (!selectedStorm?.forecastConeUrl) return;

    const proxied = `${API_BASE}/api/proxy?url=${encodeURIComponent(
      selectedStorm.forecastConeUrl
    )}`;

    fetch(proxied)
      .then((res) => res.json())
      .then(setConeGeoJson)
      .catch((err) => {
        console.warn("Could not load forecast cone:", err.message);
      });
  }, [selectedStorm]);

  // Fetch real spaghetti-model tracks (raw ATCF a-deck data, parsed
  // server-side) whenever the selected storm changes.
  useEffect(() => {
    setModelTracks({});
    setSelectedModel("ALL");
    if (!selectedStorm?.id) return;

    setSpaghettiStatus("loading");
    fetch(`${API_BASE}/api/storm/${selectedStorm.id}/adeck`)
      .then((res) => {
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setModelTracks(data.models ?? {});
        setSpaghettiStatus("ok");
      })
      .catch((err) => {
        console.warn("Could not load spaghetti model data:", err.message);
        setSpaghettiStatus("error");
      });
  }, [selectedStorm]);

  const modelEntries = Object.entries(modelTracks);
  const visibleModelEntries =
    selectedModel === "ALL"
      ? modelEntries
      : modelEntries.filter(([tech]) => tech === selectedModel);

  // Sort dropdown options alphabetically by display label, but keep
  // "NHC Official" (OFCL) pinned near the top since it's the one people
  // usually want first.
  const modelOptions = [...modelEntries]
    .map(([tech]) => tech)
    .sort((a, b) => {
      if (a === "OFCL") return -1;
      if (b === "OFCL") return 1;
      return (KNOWN_MODELS[a] ?? a).localeCompare(KNOWN_MODELS[b] ?? b);
    });

  return (
    <div className="map-wrapper">
      {selectedStorm && (
        <div className="map-toolbar">
          <label className="spaghetti-toggle">
            <input
              type="checkbox"
              checked={showSpaghetti}
              onChange={(e) => setShowSpaghetti(e.target.checked)}
            />
            Spaghetti
          </label>
          <label className="spaghetti-toggle">
            <input
              type="checkbox"
              checked={showIntensity}
              onChange={(e) => setShowIntensity(e.target.checked)}
            />
            Intensity dots
          </label>
          {modelEntries.length > 0 && (
            <label className="model-select-label">
              Model:
              <select
                className="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                <option value="ALL">All models</option>
                {modelOptions.map((tech) => (
                  <option key={tech} value={tech}>
                    {KNOWN_MODELS[tech] ?? tech}
                  </option>
                ))}
              </select>
            </label>
          )}
          {spaghettiStatus === "loading" && <span className="map-status">loading model tracks…</span>}
          {spaghettiStatus === "error" && <span className="map-status map-status-error">couldn't load model tracks</span>}
        </div>
      )}

      <MapContainer
        center={[20, -60]}
        zoom={3}
        style={{ height: "420px", width: "100%", borderRadius: "8px" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {storms.map((storm) =>
          Number.isNaN(storm.lat) || Number.isNaN(storm.lon) ? null : (
            <Marker
              key={storm.id}
              position={[storm.lat, storm.lon]}
              eventHandlers={{ click: () => onSelect(storm.id) }}
            >
              <Popup>
                <strong>{storm.name}</strong>
                <br />
                {storm.classification}
                {storm.intensity ? ` — ${storm.intensity} kt` : ""}
              </Popup>
            </Marker>
          )
        )}

        {coneGeoJson && <GeoJSON data={coneGeoJson} />}

        {showSpaghetti && (
          <LayerGroup key={`${selectedStorm?.id ?? "none"}-${selectedModel}`}>
            {visibleModelEntries.map(([tech, points]) => {
              const positions = points
                .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon))
                .map((p) => [p.lat, p.lon]);
              if (positions.length < 2) return null;
              return (
                <Polyline
                  key={tech}
                  positions={positions}
                  pathOptions={{ color: colorForModel(tech), weight: 2, opacity: 0.8 }}
                />
              );
            })}

            {showIntensity &&
              visibleModelEntries.flatMap(([tech, points]) =>
                points
                  .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon))
                  .map((p) => {
                    const { label, color } = classifyIntensity(p.vmax);
                    return (
                      <CircleMarker
                        key={`${tech}-${p.tau}`}
                        center={[p.lat, p.lon]}
                        radius={5}
                        pathOptions={{
                          color: "#05070c", // dark outline so markers stand out
                          weight: 1,
                          fillColor: color,
                          fillOpacity: 0.95,
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -4]}>
                          <strong>{KNOWN_MODELS[tech] ?? tech}</strong> — {p.tau >= 0 ? `+${p.tau}h` : `${p.tau}h`}
                          <br />
                          {p.vmax != null ? `${p.vmax} kt` : "wind: n/a"} · {label}
                        </Tooltip>
                      </CircleMarker>
                    );
                  })
              )}
          </LayerGroup>
        )}

        <FlyToStorm storm={selectedStorm} />
      </MapContainer>

      {showSpaghetti && visibleModelEntries.length > 0 && (
        <div className="spaghetti-legend">
          <div className="legend-row">
            {visibleModelEntries.map(([tech]) => (
              <span key={tech} className="legend-item">
                <span
                  className="legend-swatch legend-swatch-line"
                  style={{ background: colorForModel(tech) }}
                />
                {KNOWN_MODELS[tech] ?? tech}
              </span>
            ))}
          </div>

          {showIntensity && (
            <div className="legend-row legend-row-intensity">
              {["Tropical Depression", "Tropical Storm", "Category 1", "Category 2", "Category 3", "Category 4", "Category 5"].map(
                (label, i) => {
                  const sample = [20, 50, 75, 90, 105, 125, 140][i];
                  const { color } = classifyIntensity(sample);
                  return (
                    <span key={label} className="legend-item">
                      <span className="legend-swatch legend-swatch-dot" style={{ background: color }} />
                      {label}
                    </span>
                  );
                }
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
