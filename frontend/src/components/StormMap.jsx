import { useEffect, useMemo, useState } from "react";
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
import { classifyIntensity, INTENSITY_SCALE } from "../utils/intensity.js";

// Storm position markers are rendered as divIcons instead of Leaflet's
// stock blue pin, so every marker is colored by its real Saffir-Simpson
// category - the same encoding used in the sidebar and legend. The
// selected storm additionally gets an animated locator ring.
function stormIcon(color, selected) {
  return L.divIcon({
    className: "",
    html: `<div class="storm-marker ${selected ? "is-selected" : ""}" style="--cat-color:${color}">
             <span class="storm-marker-ring"></span>
             <span class="storm-marker-dot"></span>
           </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Smoothly pan/zoom to the selected storm. react-leaflet requires this
// "useMap" pattern for imperative map control from inside the tree.
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

// A desaturated palette for model tracks. These are deliberately muted
// relative to the Saffir-Simpson colors so guidance spaghetti never
// competes visually with actual intensity encoding.
const PALETTE = [
  "#7aa2c9", "#c99a6e", "#8fbf8a", "#b58fc4", "#6fb3b8",
  "#c48f8f", "#9aa7d1", "#bfae76", "#89bda6", "#c288a8",
];
function colorForModel(tech) {
  let hash = 0;
  for (let i = 0; i < tech.length; i++) hash = (hash * 31 + tech.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// A handful of models worth labeling clearly in the legend - everything
// else still draws, just under its raw ATCF tech code, to avoid an
// unreadable wall of text (a-decks can contain 20-30+ techs/members).
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

// The official track is drawn heavier than guidance members so the
// consensus forecast stays readable inside a dense spaghetti plot.
function trackStyle(tech) {
  const official = tech === "OFCL";
  return {
    color: official ? "#ffffff" : colorForModel(tech),
    weight: official ? 3 : 1.6,
    opacity: official ? 0.95 : 0.65,
  };
}

export default function StormMap({ storms, selectedStorm, onSelect }) {
  const [coneGeoJson, setConeGeoJson] = useState(null);
  const [modelTracks, setModelTracks] = useState({}); // { TECH: [{lat,lon,tau}] }
  const [showSpaghetti, setShowSpaghetti] = useState(true);
  const [showIntensity, setShowIntensity] = useState(true);
  const [selectedModel, setSelectedModel] = useState("ALL");
  const [spaghettiStatus, setSpaghettiStatus] = useState("idle"); // idle|loading|ok|error
  const [legendOpen, setLegendOpen] = useState(true);

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
  const modelOptions = useMemo(
    () =>
      [...modelEntries]
        .map(([tech]) => tech)
        .sort((a, b) => {
          if (a === "OFCL") return -1;
          if (b === "OFCL") return 1;
          return (KNOWN_MODELS[a] ?? a).localeCompare(KNOWN_MODELS[b] ?? b);
        }),
    [modelTracks]
  );

  const showLegend = showSpaghetti && visibleModelEntries.length > 0;

  return (
    <section className="panel map-panel">
      <div className="panel-head">
        <div className="panel-head-title">
          <span className="eyebrow">Track Map</span>
        </div>

        <div className="toolbar toolbar-spacer">
          {selectedStorm && (
            <>
              <label className="ctl-check">
                <input
                  type="checkbox"
                  checked={showSpaghetti}
                  onChange={(e) => setShowSpaghetti(e.target.checked)}
                />
                Guidance tracks
              </label>
              <label className="ctl-check">
                <input
                  type="checkbox"
                  checked={showIntensity}
                  onChange={(e) => setShowIntensity(e.target.checked)}
                />
                Intensity points
              </label>

              {modelEntries.length > 0 && (
                <select
                  className="ctl-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  aria-label="Filter guidance model"
                >
                  <option value="ALL">All models ({modelEntries.length})</option>
                  {modelOptions.map((tech) => (
                    <option key={tech} value={tech}>
                      {KNOWN_MODELS[tech] ?? tech}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>

        {spaghettiStatus === "loading" && (
          <span className="status-text">
            <span className="spinner" />
            Loading guidance
          </span>
        )}
        {spaghettiStatus === "error" && (
          <span className="status-text is-error">Guidance unavailable</span>
        )}
      </div>

      <div className="panel-body panel-body-flush">
        <MapContainer center={[20, -60]} zoom={3} className="map-canvas" zoomControl={true} scrollWheelZoom={false}>
          {/* Esri World Imagery - real satellite/aerial photography,
              same general idea as Google Earth's basemap, no API key
              needed. */}
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          {/* Transparent place-name/border overlay on top of the raw
              imagery - satellite tiles alone have no labels at all. */}
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

          {/* Forecast cone drawn as a subtle white envelope - present but
              never louder than the tracks and markers inside it. */}
          {coneGeoJson && (
            <GeoJSON
              key={selectedStorm?.id}
              data={coneGeoJson}
              style={{
                color: "#ffffff",
                weight: 1,
                opacity: 0.5,
                fillColor: "#ffffff",
                fillOpacity: 0.07,
              }}
            />
          )}

          {showSpaghetti && (
            <LayerGroup key={`${selectedStorm?.id ?? "none"}-${selectedModel}`}>
              {visibleModelEntries.map(([tech, points]) => {
                const positions = points
                  .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lon))
                  .map((p) => [p.lat, p.lon]);
                if (positions.length < 2) return null;
                return (
                  <Polyline key={tech} positions={positions} pathOptions={trackStyle(tech)} />
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
                          radius={tech === "OFCL" ? 5 : 3.5}
                          pathOptions={{
                            color: "#070a0f",
                            weight: 1,
                            fillColor: color,
                            fillOpacity: 0.95,
                          }}
                        >
                          <Tooltip direction="top" offset={[0, -4]}>
                            <span className="map-tip-title">
                              {KNOWN_MODELS[tech] ?? tech}
                            </span>
                            <br />
                            <span className="map-tip-meta">
                              {p.tau >= 0 ? `+${p.tau}h` : `${p.tau}h`} ·{" "}
                              {p.vmax != null ? `${p.vmax} kt` : "wind n/a"} · {label}
                            </span>
                          </Tooltip>
                        </CircleMarker>
                      );
                    })
                )}
            </LayerGroup>
          )}

          {/* Current storm positions drawn last so they always sit on top
              of guidance tracks and the cone. */}
          {storms.map((storm) =>
            Number.isNaN(storm.lat) || Number.isNaN(storm.lon) ? null : (
              <Marker
                key={storm.id}
                position={[storm.lat, storm.lon]}
                icon={stormIcon(
                  classifyIntensity(storm.intensity).color,
                  storm.id === selectedStorm?.id
                )}
                zIndexOffset={storm.id === selectedStorm?.id ? 1000 : 0}
                eventHandlers={{ click: () => onSelect(storm.id) }}
              >
                <Popup>
                  <span className="map-popup-name">{storm.name}</span>
                  <span className="map-popup-meta">
                    {storm.classification}
                    {storm.intensity ? ` · ${storm.intensity} kt` : ""}
                    {storm.pressure ? ` · ${storm.pressure} mb` : ""}
                  </span>
                </Popup>
              </Marker>
            )
          )}

          <FlyToStorm storm={selectedStorm} />
        </MapContainer>

        {showLegend && (
          <div className="map-legend">
            <button
              type="button"
              className="map-legend-head"
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
            >
              <span>Legend</span>
              <span>{legendOpen ? "−" : "+"}</span>
            </button>

            {legendOpen && (
              <div className="map-legend-body">
                {showIntensity && (
                  <div className="legend-section">
                    <div className="eyebrow legend-section-title">Saffir-Simpson Scale</div>
                    <div className="cat-scale">
                      {INTENSITY_SCALE.map((step) => (
                        <span
                          key={step.label}
                          className="cat-scale-step"
                          style={{ background: step.color }}
                          title={step.label}
                        />
                      ))}
                    </div>
                    <div className="cat-scale-labels">
                      {INTENSITY_SCALE.map((step) => (
                        <span key={step.label}>{step.short}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="legend-section">
                  <div className="eyebrow legend-section-title">
                    Guidance ({visibleModelEntries.length})
                  </div>
                  <div className="legend-row">
                    {visibleModelEntries.map(([tech]) => (
                      <span key={tech} className="legend-item">
                        <span
                          className="legend-swatch-line"
                          style={{
                            background: trackStyle(tech).color,
                            height: tech === "OFCL" ? 3 : 2.5,
                          }}
                        />
                        {KNOWN_MODELS[tech] ?? tech}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
