import { useEffect, useState } from "react";
import StormList from "./components/StormList.jsx";
import StormMap from "./components/StormMap.jsx";
import StormDetail from "./components/StormDetail.jsx";
import StormHeader from "./components/StormHeader.jsx";
import { fetchKnackwxStorms } from "./utils/knackwx.js";
import { isMajor } from "./utils/intensity.js";

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

// Header clock: forecast products are always referenced in UTC/Z time,
// so that's what an operational header should show - not local time.
function useUtcClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatZulu(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}Z`;
}

function CycloneMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12c0-3.3 2.7-6 6-6 1.7 0 3 1.3 3 3 0 3.3-4 6-9 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 12c0 3.3-2.7 6-6 6-1.7 0-3-1.3-3-3 0-3.3 4-6 9-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" />
    </svg>
  );
}

export default function App() {
  const [storms, setStorms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [errorMsg, setErrorMsg] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const now = useUtcClock();

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
          setLastSync(new Date());
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
  const majorCount = storms.filter((s) => isMajor(s.intensity)).length;

  const feedState =
    status === "error" ? "is-error" : status === "loading" ? "is-loading" : "is-live";
  const feedLabel =
    status === "error"
      ? "Feed offline"
      : status === "loading"
      ? "Syncing"
      : `Synced ${lastSync ? formatZulu(lastSync) : ""}`;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <CycloneMark />
          </span>
          <h1 className="brand-title">Tropical Cyclone Tracker</h1>
          <span className="brand-sub">Global Operations Console</span>
        </div>

        <div className="header-spacer" />

        <div className="header-meta">
          <div className="header-stat">
            <span className="label-micro">Active</span>
            <span className="header-stat-value">{String(storms.length).padStart(2, "0")}</span>
          </div>
          <div className="header-stat">
            <span className="label-micro">Major</span>
            <span className="header-stat-value">{String(majorCount).padStart(2, "0")}</span>
          </div>
          <div className="header-stat">
            <span className="label-micro">UTC</span>
            <span className="header-stat-value">{formatZulu(now)}</span>
          </div>
          <div className={`feed-status ${feedState}`}>
            <span className="feed-dot" />
            {feedLabel}
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <StormList
            storms={storms}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={status === "loading"}
          />
        </aside>

        <main className="workspace">
          {status === "error" && (
            <div className="banner banner-error">
              <span className="banner-icon">⚠</span>
              <span>
                Couldn't load storm data. <code>{errorMsg}</code>
              </span>
            </div>
          )}

          {status === "ok" && storms.length === 0 ? (
            <div className="empty-state">
              <CycloneMark />
              <div className="empty-state-title">No active tropical cyclones</div>
              <div className="empty-state-sub">
                All monitored basins are currently quiet. This console refreshes
                automatically every five minutes.
              </div>
            </div>
          ) : (
            <>
              {selectedStorm && <StormHeader storm={selectedStorm} />}

              <StormMap
                storms={storms}
                selectedStorm={selectedStorm}
                onSelect={setSelectedId}
              />

              {selectedStorm && (
                <StormDetail storm={selectedStorm} apiBase={API_BASE} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
