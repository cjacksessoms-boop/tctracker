import { useState } from "react";
import L from "leaflet";
import polygonClipping from "polygon-clipping";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  CircleMarker,
  Marker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { classifyIntensity, categoryNumber, INTENSITY_SCALE } from "../utils/intensity.js";

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

// Smooths a jagged sequence of points into a curve by sampling several
// interpolated points between each pair, instead of connecting them
// with hard straight-line segments - this is what removes the sharp
// angular look from the track line.
function catmullRom(pts, segmentsPerSpan = 12) {
  if (pts.length < 3) return pts;
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const result = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t, t3 = t2 * t;
      const lat =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const lon =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      result.push([lat, lon]);
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

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

// Smooths the visual track LINE (not the cone, which already uses a
// different, more robust circle-union method) by interpolating a curve
// through the clicked points instead of connecting them with straight
// segments - removes the sharp angular look between points.
function catmullRomLine(points, segmentsPerSpan = 12) {
  if (points.length < 3) return points;
  const at = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan;
      const t2 = t * t, t3 = t2 * t;
      const lat =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const lon =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      result.push([lat, lon]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

// A uniform-color, numbered marker style - hurricane categories 1-5
// show their number, tropical storm/depression strength (and Invest/
// Extratropical overrides) show a plain blank badge. This is a clean,
// reliable div-based badge rather than hand-drawn spiral artwork, since
// custom vector icons are hard to get right without being able to
// preview the actual rendered result.
const STORM_SYMBOL_COLOR = "#8b1a1a";
function buildStormIcon(p) {
  const num = p.override ? null : categoryNumber(p.wind);
  return L.divIcon({
    className: "storm-symbol-icon",
    html: `<div class="storm-symbol-badge">${num ?? ""}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

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

// The capsule segments above overlap each other wherever the track
// bends or points are close together - rendering them as separate
// semi-transparent shapes means every overlap stacks its opacity on top
// of itself, so those spots look visibly darker/brighter than the rest
// of the cone. The real fix is a proper boolean union: merge every
// segment into ONE flat shape first, so there's only ever a single
// layer of fill anywhere on the map, with no double-counted overlaps.
// Writing a correct polygon-union algorithm from scratch is genuinely
// tricky computational geometry (handling every edge-intersection case
// correctly), so this uses a small, well-tested library rather than a
// hand-rolled version that might get an edge case wrong.
function unionSegments(segments) {
  if (segments.length === 0) return null;
  const asPolygons = segments.map((ring) => [[...ring, ring[0]]]); // close each ring
  return polygonClipping.union(...asPolygons);
}

// Formats a point's actual forecast time as "5:00 AM Mon" - UTC rather
// than a guessed local time zone, since a track can span many time
// zones and we have no reliable way to know which one applies at each
// point.
function formatPointTime(baseTime, hourOffset) {
  const dt = new Date(baseTime.getTime() + hourOffset * 3600 * 1000);
  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${time} ${weekday} UTC`;
}

// NHC's Tropical Weather Outlook uses a rough 3-tier color scheme for
// formation chance percentages: yellow for low, orange for medium, red
// for high. These are the commonly recognized approximate cutoffs, not
// verbatim from an official NHC style guide, so treat them as a solid
// approximation rather than an exact match.
function aoiColor(pct) {
  if (pct >= 60) return "#ef4444"; // high
  if (pct >= 40) return "#f97316"; // medium
  return "#fbbf24"; // low
}
function aoiTierLabel(pct) {
  if (pct >= 60) return "High";
  if (pct >= 40) return "Medium";
  return "Low";
}

export default function ForecastCreator({ seedStorm }) {
  const [points, setPoints] = useState([]);
  const [mode, setMode] = useState("track"); // track | aoi
  const [aois, setAois] = useState([]); // { id, ring: [[lat,lon],...], pct }
  const [drawingRing, setDrawingRing] = useState([]);
  const [pendingPct, setPendingPct] = useState("40");
  // Only set when the track was seeded from a real storm's actual
  // current time - free-drawn points have no real clock to reference,
  // so time labels only ever show when this is non-null.
  const [baseTime, setBaseTime] = useState(null);

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
    setBaseTime(null);
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
    setBaseTime(seedStorm.lastUpdate ? new Date(seedStorm.lastUpdate) : null);
  }

  function handleMapClick(lat, lon) {
    if (mode === "aoi") {
      setDrawingRing((prev) => [...prev, [lat, lon]]);
    } else {
      addPoint(lat, lon);
    }
  }

  function finishAoi() {
    if (drawingRing.length < 3) return;
    const pct = Math.max(0, Math.min(100, parseInt(pendingPct, 10) || 0));
    setAois((prev) => [...prev, { id: Date.now(), ring: drawingRing, pct }]);
    setDrawingRing([]);
  }

  function undoAoiVertex() {
    setDrawingRing((prev) => prev.slice(0, -1));
  }

  function cancelAoi() {
    setDrawingRing([]);
  }

  function removeLastAoi() {
    setAois((prev) => prev.slice(0, -1));
  }

  function clearAois() {
    setAois([]);
    setDrawingRing([]);
  }

  const coneSegments = buildConeSegments(points);
  const coneUnion = unionSegments(coneSegments);
  const trackPositions = points.map((p) => [p.lat, p.lon]);
  const smoothedTrack = catmullRom(trackPositions);
  const mapCenter = points.length > 0 ? trackPositions[trackPositions.length - 1] : [20, -60];

  return (
    <div className="forecast-creator">
      <div className="creator-toolbar">
        <div className="creator-toolbar-info">
          <p>
            Click the map to drop forecast points, each one +{HOUR_STEP}h from the last.
            Set each point's wind speed (or mark it Invest/Extratropical) below.
            {mode === "aoi" && " Right now clicks place AOI vertices instead - toggle it off to go back to track points."}
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
          <label className="ctl-check">
            <input
              type="checkbox"
              checked={mode === "aoi"}
              onChange={(e) => setMode(e.target.checked ? "aoi" : "track")}
            />
            Draw outlook area (AOI) instead
          </label>
        </div>
      </div>

      {mode === "aoi" && (
        <div className="creator-toolbar">
          <div className="creator-toolbar-info">
            <p>
              Click the map to place AOI vertices (need at least 3), set a formation-chance
              percentage, then finish the shape. Color follows NHC's Low/Medium/High scheme.
            </p>
          </div>
          <div className="creator-toolbar-actions">
            <label className="aoi-pct-input">
              Chance
              <input
                type="number"
                min={0}
                max={100}
                value={pendingPct}
                onChange={(e) => setPendingPct(e.target.value)}
              />
              %
            </label>
            <button className="ctl" onClick={undoAoiVertex} disabled={drawingRing.length === 0}>
              Undo vertex
            </button>
            <button className="ctl" onClick={cancelAoi} disabled={drawingRing.length === 0}>
              Cancel shape
            </button>
            <button className="ctl active" onClick={finishAoi} disabled={drawingRing.length < 3}>
              Finish AOI
            </button>
            <button className="ctl" onClick={removeLastAoi} disabled={aois.length === 0}>
              Undo last AOI
            </button>
            <button className="ctl" onClick={clearAois} disabled={aois.length === 0}>
              Clear AOIs
            </button>
          </div>
        </div>
      )}

      <MapContainer
        center={mapCenter}
        zoom={4}
        className="map-canvas"
        style={{ height: "420px", width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={false}
        worldCopyJump={true}
        minZoom={3}
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
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        />

        <MapClickHandler onClick={handleMapClick} />

        {coneUnion && (
          <Polygon
            positions={coneUnion}
            pathOptions={{ color: "#3b9eff", weight: 1.5, fillColor: "#3b9eff", fillOpacity: 0.18 }}
          />
        )}

        {trackPositions.length > 1 && (
          <Polyline
            positions={catmullRomLine(trackPositions)}
            pathOptions={{ color: "#ffffff", weight: 2, opacity: 0.9 }}
          />
        )}

        {points.map((p, i) => {
          const { short } = pointClassification(p);
          const detail = p.override ? short : `${p.wind} kt · ${short}`;
          // Stagger labels on a 4-way rotation (not just left/right) so
          // consecutive labels get more separation from both the track
          // AND each other, especially when points are close together.
          const side = i % 2 === 0 ? "right" : "left";
          const offsetX = side === "right" ? 80 : -80;
          const offsetY = Math.floor(i / 2) % 2 === 0 ? -16 : 16;

          return (
            <Marker key={i} position={[p.lat, p.lon]} icon={buildStormIcon(p)}>
              {baseTime ? (
                <Tooltip
                  direction={side}
                  offset={[offsetX, offsetY]}
                  permanent={true}
                  className="forecast-time-label"
                >
                  <strong>{formatPointTime(baseTime, p.hour)}</strong>
                  <br />+{p.hour}h · {detail}
                </Tooltip>
              ) : (
                <Tooltip direction="top" offset={[0, -6]}>
                  +{p.hour}h · {detail}
                </Tooltip>
              )}
            </Marker>
          );
        })}
        {aois.map((aoi) => {
          const color = aoiColor(aoi.pct);
          return (
            <Polygon
              key={aoi.id}
              positions={aoi.ring}
              pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.32 }}
            >
              <Tooltip permanent={true} direction="center" className="aoi-pct-label">
                <strong>{aoi.pct}%</strong>
                <br />
                {aoiTierLabel(aoi.pct)}
              </Tooltip>
            </Polygon>
          );
        })}

        {drawingRing.length > 0 && (
          <Polygon
            positions={drawingRing}
            pathOptions={{ color: aoiColor(parseInt(pendingPct, 10) || 0), weight: 2, dashArray: "6 6", fillOpacity: 0.15 }}
          />
        )}
        {drawingRing.map((pt, i) => (
          <CircleMarker
            key={i}
            center={pt}
            radius={4}
            pathOptions={{ color: "#05070c", weight: 1, fillColor: "#ffffff", fillOpacity: 1 }}
          />
        ))}
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
        <div className="legend-row">
          <span className="legend-item">
            <span className="legend-swatch-dot" style={{ background: aoiColor(20) }} />
            Formation chance: Low
          </span>
          <span className="legend-item">
            <span className="legend-swatch-dot" style={{ background: aoiColor(50) }} />
            Medium
          </span>
          <span className="legend-item">
            <span className="legend-swatch-dot" style={{ background: aoiColor(80) }} />
            High
          </span>
        </div>
      </div>
    </div>
  );
}
