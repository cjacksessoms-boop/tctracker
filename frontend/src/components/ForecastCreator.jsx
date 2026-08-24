import { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  CircleMarker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { classifyIntensity, INTENSITY_SCALE } from "../utils/intensity.js";

// Clicking the map adds a new forecast point. Each click is treated as
// the next forecast hour in the sequence (+12h from the previous one) -
// that's an editable starting assumption, not a real forecast model.
const HOUR_STEP = 12;
const DEFAULT_WIND_KT = 50;

// Classifications that aren't purely wind-speed-based - "Invest" is a
// pre-designation status, "Extratropical" is a structural/thermal
// classification, not an intensity tier - so these are explicit
// per-point overrides rather than something classifyIntensity() could
// ever derive from a wind number alone.
const SPECIAL_CLASSIFICATIONS = {
  INVEST: { label: "Invest", short: "INVEST", color: "#94a3b8" },
  EXTRATROPICAL: { label: "Extratropical", short: "EX", color: "#a78bfa" },
};

function pointClassification(p) {
  return p.override ? SPECIAL_CLASSIFICATIONS[p.override] : classifyIntensity(p.wind);
}

function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Builds a widening "cone" polygon around the track by offsetting each
// point perpendicular to its local direction, with the offset distance
// growing with forecast hour. This is a fun, illustrative approximation
// of NHC's cone of uncertainty - not their actual statistical model
// (which is based on historical forecast error, not a fixed formula) -
// so it's meant for exploring "what if" scenarios, not as a real
// forecast product.
//
// The radius starts SMALL and grows non-linearly (rather than starting
// already-wide and growing slowly) - that near-zero start is what
// actually makes this read as a flaring cone instead of a rectangle
// with only a couple of points on the track.
function buildCone(points) {
  if (points.length < 2) return null;

  const left = [];
  const right = [];

  points.forEach((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    let dx, dy;
    if (prev && next) {
      dx = next.lon - prev.lon;
      dy = next.lat - prev.lat;
    } else if (next) {
      dx = next.lon - p.lon;
      dy = next.lat - p.lat;
    } else {
      dx = p.lon - prev.lon;
      dy = p.lat - prev.lat;
    }
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const steps = p.hour / HOUR_STEP;
    const radiusDeg = 0.015 + Math.pow(steps, 1.3) * 0.035;

    left.push([p.lat + ny * radiusDeg, p.lon + nx * radiusDeg]);
    right.push([p.lat - ny * radiusDeg, p.lon - nx * radiusDeg]);
  });

  return [...left, ...right.reverse()];
}

export default function ForecastCreator({ seedStorm }) {
  const [points, setPoints] = useState([]);

  function addPoint(lat, lon) {
    const nextHour = points.length === 0 ? 0 : points[points.length - 1].hour + HOUR_STEP;
    setPoints((prev) => [...prev, { lat, lon, hour: nextHour, wind: DEFAULT_WIND_KT, override: null }]);
  }

  function updateWind(index, wind) {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, wind } : p)));
  }

  function updateOverride(index, override) {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, override: override || null } : p)));
  }

  function removeLast() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function clearAll() {
    setPoints([]);
  }

  function seedFromStorm() {
    if (!seedStorm || Number.isNaN(seedStorm.lat) || Number.isNaN(seedStorm.lon)) return;
    setPoints([
      {
        lat: seedStorm.lat,
        lon: seedStorm.lon,
        hour: 0,
        wind: parseFloat(seedStorm.intensity) || DEFAULT_WIND_KT,
        override: null,
      },
    ]);
  }

  const cone = buildCone(points);
  const trackPositions = points.map((p) => [p.lat, p.lon]);
  const mapCenter = points.length > 0 ? trackPositions[trackPositions.length - 1] : [20, -60];

  return (
    <div className="forecast-creator">
      <div className="creator-toolbar">
        <div className="creator-toolbar-info">
          <p>
            Click the map to drop forecast points, each one +{HOUR_STEP}h from the last.
            Set each point's wind speed (or mark it Invest/Extratropical) below.
          </p>
        </div>
        <div className="creator-toolbar-actions">
          {seedStorm && (
            <button className="ctl" onClick={seedFromStorm}>
              Start from {seedStorm.name}'s position
            </button>
          )}
          <button className="ctl" onClick={removeLast} disabled={points.length === 0}>
            Undo last point
          </button>
          <button className="ctl" onClick={clearAll} disabled={points.length === 0}>
            Clear
          </button>
        </div>
      </div>

      <MapContainer
        center={mapCenter}
        zoom={4}
        className="map-canvas"
        style={{ height: "420px", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapClickHandler onClick={addPoint} />

        {cone && (
          <Polygon
            positions={cone}
            pathOptions={{ color: "#3b9eff", weight: 1, fillColor: "#3b9eff", fillOpacity: 0.12 }}
          />
        )}

        {trackPositions.length > 1 && (
          <Polyline positions={trackPositions} pathOptions={{ color: "#eaeef7", weight: 2, opacity: 0.8 }} />
        )}

        {points.map((p, i) => {
          const { color, short } = pointClassification(p);
          return (
            <CircleMarker
              key={i}
              center={[p.lat, p.lon]}
              radius={7}
              pathOptions={{ color: "#05070c", weight: 1.5, fillColor: color, fillOpacity: 0.95 }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                +{p.hour}h · {p.override ? short : `${p.wind} kt · ${short}`}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {points.length > 0 && (
        <div className="creator-points-list">
          {points.map((p, i) => {
            const { label, color } = pointClassification(p);
            return (
              <div key={i} className="creator-point-row">
                <span className="creator-point-hour">+{p.hour}h</span>
                <select
                  className="ctl-select"
                  value={p.override ?? ""}
                  onChange={(e) => updateOverride(i, e.target.value)}
                >
                  <option value="">Auto (by wind)</option>
                  <option value="INVEST">Invest</option>
                  <option value="EXTRATROPICAL">Extratropical</option>
                </select>
                <input
                  type="range"
                  min={10}
                  max={175}
                  step={5}
                  value={p.wind}
                  onChange={(e) => updateWind(i, Number(e.target.value))}
                  className="scrubber"
                  disabled={!!p.override}
                />
                <span className="creator-point-wind" style={{ color }}>
                  {p.override ? label : `${p.wind} kt · ${label}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="legend-section">
        <div className="legend-row">
          {INTENSITY_SCALE.map((cat) => (
            <span key={cat.short} className="legend-item">
              <span className="legend-swatch-dot" style={{ background: cat.color }} />
              {cat.label}
            </span>
          ))}
          {Object.values(SPECIAL_CLASSIFICATIONS).map((cat) => (
            <span key={cat.short} className="legend-item">
              <span className="legend-swatch-dot" style={{ background: cat.color }} />
              {cat.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
