import { useEffect, useState } from "react";
import StormList from "./components/StormList.jsx";
import StormMap from "./components/StormMap.jsx";
import StormDetail from "./components/StormDetail.jsx";
import { fetchKnackwxStorms } from "./utils/knackwx.js";

// Where our backend lives during local development.
// In local development this defaults to your backend running on
// localhost:3001. Once deployed, set VITE_API_BASE_URL (see README) to
// your live backend's URL instead - Vite bakes env vars starting with
// VITE_ into the build at build time.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// knackwx's API (utils/knackwx.js) is now our PRIMARY storm list source -
// one clean array covering every basin globally, including invests NHC/
// JTWC haven't officially numbered yet. We still separately fetch NHC's
// own feed here, but ONLY to enrich matching storms with two things
// knackwx doesn't include: the forecast cone shape (for the map) and a
// link to NHC's official advisory text. If NHC's fetch fails, we simply
// don't get those two extras - the storm list itself still works fine,
// since it no longer depends on NHC being reachable.
//
// Builds a lookup of { [normalizedId]: {forecastConeUrl, publicAdvisoryUrl, forecastAdvisoryUrl} }
// from NHC's raw feed, keyed the same way knackwx's long_atcf_id is
// formatted (lowercase, e.g. "ep062026"), so we can merge the two by id.
function buildNhcExtras(nhcActiveStorms) {
  const map = {};
  for (const raw of nhcActiveStorms) {
    const id = (raw.id ?? raw.binNumber ?? raw.stormId ?? "").toLowerCase();
    if (!id) continue;
    map[id] = {
      publicAdvisoryUrl: raw.publicAdvisory?.url ?? null,
      forecastAdvisoryUrl: raw.forecastAdvisory?.url ?? null,
      forecastConeUrl:
        raw.forecastCone?.url ??
        raw.trackConeFullDay?.url ??
        raw.forecastCone?.geojson ??
        null,
    };
  }
  return map;
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
        const [knackwxResult, nhcResult] = await Promise.allSettled([
          fetchKnackwxStorms(),
          fetch(`${API_BASE}/api/storms`).then((r) => {
            if (!r.ok) throw new Error(`NHC endpoint returned ${r.status}`);
            return r.json();
          }),
        ]);

        // knackwx is the primary source - if it fails, that's a real
        // error worth surfacing, since the whole storm list depends on it.
        if (knackwxResult.status === "rejected") {
          throw knackwxResult.reason;
        }

        const nhcExtras =
          nhcResult.status === "fulfilled"
            ? buildNhcExtras(nhcResult.value.activeStorms ?? nhcResult.value.storms ?? [])
            : {};

        const merged = knackwxResult.value.map((storm) => {
          const extras = nhcExtras[storm.id?.toLowerCase()];
          return extras ? { ...storm, ...extras } : storm;
        });

        if (!cancelled) {
          setStorms(merged);
          setStatus("ok");
          // Only auto-select on the very first load - functional update
          // form avoids a stale-closure bug on the refresh interval.
          setSelectedId((prev) => prev ?? merged[0]?.id ?? null);
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
    // than that in practice, and we don't want to hammer these APIs.
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
        <p className="subtitle">Live global storm data</p>
      </header>

      {status === "error" && (
        <div className="banner banner-error">
          Couldn't load storm data.
          <br />
          <code>{errorMsg}</code>
        </div>
      )}

      {status === "ok" && storms.length === 0 && (
        <div className="banner banner-info">
          No active storms right now. Quiet skies!
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
