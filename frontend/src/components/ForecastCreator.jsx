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

// Andrew's monotone chain convex hull - a well-established algorithm
// that always produces a valid, simple (non-self-intersecting) polygon
// no matter how the input points are arranged. That guarantee is the
// whole point of using it here.
function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
function convexHull(pts) {
  const points = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length <= 2) return points;

  const lower = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

const CIRCLE_SAMPLES = 24;

function pointRadiusDeg(p) {
  const steps = p.hour / HOUR_STEP;
  // Tuned so the cone reaches roughly NHC's real full-size scale by
  // about 120 hours (5 days) out.
  return 0.03 + Math.pow(steps, 1.5) * 0.11;
}

function circleSamples(p) {
  const radiusDeg = pointRadiusDeg(p);
  const pts = [];
  for (let i = 0; i < CIRCLE_SAMPLES; i++) {
    const angle = (i / CIRCLE_SAMPLES) * 2 * Math.PI;
    pts.push([p.lat + radiusDeg * Math.sin(angle), p.lon + radiusDeg * Math.cos(angle)]);
  }
  return pts;
}

// Builds the "cone" as a chain of overlapping capsule shapes, one per
// consecutive pair of points, rather than a single hull over every
// point at once. This matters for two reasons a single whole-track hull
// got wrong:
//   1. CENTERING - the outer tangent lines of exactly two circles are
//      mathematically guaranteed to be symmetric about the line joining
//      their centers. A hull over many points at once has no such
//      guarantee and can end up visibly off-center from the real track,
//      especially once radii differ a lot between points.
//   2. SHAPE AT BENDS - a whole-track hull only cares about the outer
//      envelope of ALL circles combined, so a bend in the middle of the
//      track (e.g. heading north, then turning) can get "swallowed"
//      entirely, collapsing into a straight-line triangle from start to
//      end instead of following the actual path.
// Each capsule is still a 2-circle hull, so it's individually always
// simple/convex - immune to the self-intersection problem erratic or
// looping tracks caused with the old direction-offset method. Adjacent
// capsules share the exact same circle at their shared point, so bends
// come out as a natural rounded elbow rather than a sharp seam.
function buildConeSegments(points) {
  if (points.length === 0) return [];
  if (points.length === 1) return [circleSamples(points[0])];

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const samples = [...circleSamples(points[i]), ...circleSamples(points[i + 1])];
    segments.push(convexHull(samples));
  }
  return segments;
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

  const coneSegments = buildConeSegments(points);
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
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={false}
      >
        {/* Esri World Imagery - real satellite/aerial photography, same
            general idea as Google Earth's basemap, no API key needed. */}
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        {/* A transparent overlay of place names/borders on top of the
            imagery - without this, satellite tiles alone have no labels
            at all, unlike Google Earth's default view. */}
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />

        <MapClickHandler onClick={addPoint} />

        {coneSegments.map((segment, i) => (
          <Polygon
            key={i}
            positions={segment}
            pathOptions={{ stroke: false, fillColor: "#3b9eff", fillOpacity: 0.18 }}
          />
        ))}

        {trackPositions.length > 1 && (
          <Polyline positions={trackPositions} pathOptions={{ color: "#ffffff", weight: 2, opacity: 0.9 }} />
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
