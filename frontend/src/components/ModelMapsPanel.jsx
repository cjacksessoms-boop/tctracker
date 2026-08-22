import { useEffect, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";

// ----------------------------------------------------------------------------
// tropicaltidbits storm-specific model maps follow this pattern (confirmed
// from a real URL you provided):
//   https://www.tropicaltidbits.com/analysis/models/{model}/{init}/{model}_{param}_{stormcode}_{frame}.png
//
// - {init} is the model's run/init time as YYYYMMDDHH (UTC), e.g. 2026072418
// - {stormcode} is JTWC-style: storm NUMBER + BASIN LETTER, e.g. "07E"
//   (NOT the same format as NHC's "ep072026" - we convert below)
// - {frame} is the forecast-hour step index (1, 2, 3...) within that run
//
// IMPORTANT LIMITATION (confirmed by you): the Euro/ECMWF model does NOT
// get storm-specific maps on this site - only US-run models like GFS,
// HWRF, HMON do. So the model dropdown only offers ones we can reasonably
// expect to work; anything else would just be another dead link.
// ----------------------------------------------------------------------------

const MODEL_OPTIONS = [
  { value: "gfs", label: "GFS" },
  // HWRF/HMON are hurricane-specific models that traditionally get
  // storm-centric maps too, but we haven't confirmed a working URL for
  // them yet - only offer once verified to avoid another dead link.
];

const PARAM_OPTIONS = [
  { value: "midRH", label: "Precip / MSLP / Thickness" }, // confirmed working
  // Add more here once you've confirmed their real URLs the same way.
];


// Models publish on a 6-hour cycle (00/06/12/18 UTC) but aren't available
// immediately - there's a processing/upload delay. We generate a list of
// recent candidate cycles, newest first, and let the <img> tag's onError
// tell us when a guess is wrong so we can fall back to an older one.
function recentCycles(count = 8) {
  const PUBLISH_DELAY_HOURS = 5;
  let t = new Date(Date.now() - PUBLISH_DELAY_HOURS * 60 * 60 * 1000);
  t.setUTCMinutes(0, 0, 0);
  t.setUTCHours(Math.floor(t.getUTCHours() / 6) * 6);

  const cycles = [];
  for (let i = 0; i < count; i++) {
    const c = new Date(t.getTime() - i * 6 * 60 * 60 * 1000);
    const yyyy = c.getUTCFullYear();
    const mm = String(c.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(c.getUTCDate()).padStart(2, "0");
    const hh = String(c.getUTCHours()).padStart(2, "0");
    cycles.push(`${yyyy}${mm}${dd}${hh}`);
  }
  return cycles;
}

function buildUrl(model, cycle, param, stormCode, frame) {
  return `https://www.tropicaltidbits.com/analysis/models/${model}/${cycle}/${model}_${param}_${stormCode}_${frame}.png`;
}

export default function ModelMapsPanel({ storm }) {
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [param, setParam] = useState(PARAM_OPTIONS[0].value);
  const [cycles] = useState(() => recentCycles());
  const [cycleIndex, setCycleIndex] = useState(0);
  const [frame, setFrame] = useState(1);
  const [status, setStatus] = useState("searching"); // searching | ready | notfound

  const stormCode = getJtwcCode(storm);

  // Reset the search whenever the storm/model/param changes.
  useEffect(() => {
    setCycleIndex(0);
    setFrame(1);
    setStatus(stormCode ? "searching" : "notfound");
  }, [storm.id, model, param, stormCode]);

  if (!stormCode) {
    return (
      <div className="placeholder-panel">
        <p>
          We don't have a confirmed basin-letter mapping for this storm's
          ID ("{storm.id}"), so we can't build a tropicaltidbits URL for it
          yet.
        </p>
      </div>
    );
  }

  const url = buildUrl(model, cycles[cycleIndex], param, stormCode, frame);

  function handleImgError() {
    if (status === "searching") {
      // Wrong guess at the init cycle - try the next older one.
      if (cycleIndex + 1 < cycles.length) {
        setCycleIndex((i) => i + 1);
      } else {
        setStatus("notfound");
      }
    } else if (status === "ready" && frame > 1) {
      // We were paging frames and went past the last available forecast
      // hour - step back to the last one that worked.
      setFrame((f) => Math.max(1, f - 1));
    }
  }

  function handleImgLoad() {
    setStatus("ready");
  }

  return (
    <div className="model-maps-panel">
      <div className="model-maps-controls">
        <label>
          Model:
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <label>
          Field:
          <select value={param} onChange={(e) => setParam(e.target.value)}>
            {PARAM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
      </div>

      {status === "searching" && (
        <p className="placeholder-hint">
          Looking for the latest available {model.toUpperCase()} run for
          this storm…
        </p>
      )}

      {status === "notfound" && (
        <div className="placeholder-panel">
          <p>
            Couldn't find a recent {model.toUpperCase()} run for storm code
            "{stormCode}". Either this storm doesn't have one yet, or the
            URL pattern has changed.
          </p>
          <a href="https://www.tropicaltidbits.com/analysis/models/" target="_blank" rel="noreferrer">
            Browse tropicaltidbits directly →
          </a>
        </div>
      )}

      {status !== "notfound" && (
        <>
          <img
            key={url}
            src={url}
            alt={`${model.toUpperCase()} run for ${storm.name}, frame ${frame}`}
            className="model-map-image"
            onError={handleImgError}
            onLoad={handleImgLoad}
          />

          {status === "ready" && (
            <div className="model-maps-frame-bar">
              <button onClick={() => setFrame((f) => Math.max(1, f - 1))} disabled={frame <= 1}>
                ← Prev
              </button>
              <span>Init {cycles[cycleIndex]}Z · Frame {frame}</span>
              <button onClick={() => setFrame((f) => f + 1)}>Next →</button>
              <a href={url} target="_blank" rel="noreferrer" className="open-new-tab-link">
                ↗ Full size
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
