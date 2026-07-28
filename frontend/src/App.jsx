import { useEffect, useState } from "react";
import StormList from "./components/StormList.jsx";
import StormMap from "./components/StormMap.jsx";
import StormDetail from "./components/StormDetail.jsx";

// Where our backend lives during local development.
// In local development this defaults to your backend running on
// localhost:3001. Once deployed, set VITE_API_BASE_URL (see README) to
// your live backend's URL instead - Vite bakes env vars starting with
// VITE_ into the build at build time.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// NHC's JSON has slightly varying field names across versions of their
// schema. This function pulls out the values we care about defensively -
// if you check /api/storms in your browser and see different field names,
// this is the ONE place you need to update.
// NHC often reports lat/lon as strings with a hemisphere LETTER stuck on
// the end, e.g. "14.7N" or "51.9W" - NOT a plain signed number. If we just
// parseFloat() that, we get 51.9 instead of -51.9, which plots the storm
// on the wrong side of the globe (mirrored across the prime meridian /
// equator). This function strips the letter and applies the correct sign.
function parseCoord(value) {
  if (value == null) return NaN;
  if (typeof value === "number") return value; // already a plain number

  const str = String(value).trim();
  const match = str.match(/^(-?\d+(\.\d+)?)\s*([NSEW])?$/i);
  if (!match) return parseFloat(str); // fallback, unknown format

  let num = parseFloat(match[1]);
  const hemisphere = match[3]?.toUpperCase();
  if (hemisphere === "S" || hemisphere === "W") num = -Math.abs(num);
  if (hemisphere === "N" || hemisphere === "E") num = Math.abs(num);
  return num;
}

function normalizeStorm(raw) {
  return {
    id: raw.id ?? raw.binNumber ?? raw.stormId,
    name: raw.name ?? "Unnamed",
    classification: raw.classification ?? raw.classificationLong ?? "",
    intensity: raw.intensity ?? raw.maxWind ?? null, // knots
    pressure: raw.pressure ?? raw.minimumPressure ?? null, // millibars
    // NHC's CurrentStorms.json conveniently includes BOTH a human-readable
    // string ("19.5N") AND a pre-signed numeric version. Always prefer the
    // numeric one - it's already correctly signed for the map (negative =
    // West/South). Only fall back to parsing the string if the numeric
    // field is ever missing.
    lat: raw.latitudeNumeric ?? parseCoord(raw.latitude ?? raw.lat),
    lon: raw.longitudeNumeric ?? parseCoord(raw.longitude ?? raw.lon),
    movementDir: raw.movementDir ?? null,
    movementSpeed: raw.movementSpeed ?? null,
    lastUpdate: raw.lastUpdate ?? raw.lastUpdateTime ?? null,
    // Links to per-storm products, when present:
    publicAdvisoryUrl: raw.publicAdvisory?.url ?? null,
    forecastAdvisoryUrl: raw.forecastAdvisory?.url ?? null,
    forecastConeUrl:
      raw.forecastCone?.url ??
      raw.trackConeFullDay?.url ??
      raw.forecastCone?.geojson ??
      null,
    raw, // keep the original around in case you need a field not listed above
  };
}

export default function App() {
  const [storms, setStorms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/storms`);
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        const data = await res.json();

        // NHC wraps the list under "activeStorms" in the current schema.
        const list = data.activeStorms ?? data.storms ?? [];
        const normalized = list.map(normalizeStorm);

        if (!cancelled) {
          setStorms(normalized);
          setStatus("ok");
          if (normalized.length > 0) setSelectedId(normalized[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(err.message);
        }
      }
    }

    load();
    // Refresh every 5 minutes - active storm data doesn't change faster
    // than that in practice, and we don't want to hammer NHC's servers.
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selectedStorm = storms.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>🌀 Tropical Cyclone Tracker</h1>
        <p className="subtitle">Live data from the National Hurricane Center</p>
      </header>

      {status === "error" && (
        <div className="banner banner-error">
          Couldn't reach the backend at {API_BASE}. Is it running?
          <br />
          <code>{errorMsg}</code>
        </div>
      )}

      {status === "ok" && storms.length === 0 && (
        <div className="banner banner-info">
          No active storms right now in NHC's area of responsibility
          (Atlantic / East & Central Pacific). Quiet skies!
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar">
          <StormList
            storms={storms}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={status === "loading"}
          />
        </aside>

        <main className="main-panel">
          <StormMap
            storms={storms}
            selectedStorm={selectedStorm}
            onSelect={setSelectedId}
          />
          {selectedStorm && (
            <StormDetail storm={selectedStorm} apiBase={API_BASE} />
          )}
        </main>
      </div>
    </div>
  );
}
