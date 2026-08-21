import { useEffect, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";

// ----------------------------------------------------------------------------
// CyclonicWX's per-storm model maps follow this pattern (confirmed from a
// real URL you provided):
//   https://cyclonicwx.com/data/models/{model}/{stormCode}/4panel/{model}_{stormCode}_4panel_{init}_f{frameHour}.png
//
// - {stormCode} is JTWC-style (e.g. "12W") - same format our other panels
//   already use via getJtwcCode()
// - {init} is the model's run/init time as YYYYMMDDHH (UTC)
// - {frameHour} is the forecast hour, zero-padded to 3 digits (f006, f012...)
//
// Only models with a CONFIRMED real slug are listed below - the site's
// dropdown shows many more (ECMWF, GEFS, HAFS, etc.) but we don't yet
// know their exact URL slugs, so we're not guessing and risking a dead
// link. Add more here once confirmed the same way "gfs" was.
// ----------------------------------------------------------------------------

const MODEL_OPTIONS = [
  { value: "gfs", label: "GFS" },
];

const FRAME_STEP_HOURS = 6;
// Start guessing at the one frame we've actually confirmed exists
// (f006). f000 may not be published for this product at all - starting
// there meant every single cycle guess failed on the very first check,
// which our search logic misread as "wrong cycle" and burned through
// every candidate before giving up, even when the right cycle was there
// all along.
const STARTING_FRAME_HOUR = 6;

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

function buildUrl(model, cycle, stormCode, frameHour) {
  const f = String(frameHour).padStart(3, "0");
  return `https://cyclonicwx.com/data/models/${model}/${stormCode}/4panel/${model}_${stormCode}_4panel_${cycle}_f${f}.png`;
}

export default function CyclonicWxModelViewer({ storm }) {
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [cycles] = useState(() => recentCycles());
  const [cycleIndex, setCycleIndex] = useState(0);
  const [frameHour, setFrameHour] = useState(STARTING_FRAME_HOUR);
  const [status, setStatus] = useState("searching"); // searching | ready | notfound

  const stormCode = getJtwcCode(storm);

  useEffect(() => {
    setCycleIndex(0);
    setFrameHour(STARTING_FRAME_HOUR);
    setStatus(stormCode ? "searching" : "notfound");
  }, [storm.id, model, stormCode]);

  if (!stormCode) {
    return (
      <div className="placeholder-panel">
        <p>No confirmed storm code available for this storm yet.</p>
      </div>
    );
  }

  const url = buildUrl(model, cycles[cycleIndex], stormCode, frameHour);

  function handleImgError() {
    if (status === "searching") {
      if (cycleIndex + 1 < cycles.length) {
        setCycleIndex((i) => i + 1);
      } else {
        setStatus("notfound");
      }
    } else if (status === "ready" && frameHour > STARTING_FRAME_HOUR) {
      setFrameHour((f) => Math.max(STARTING_FRAME_HOUR, f - FRAME_STEP_HOURS));
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
      </div>

      {status === "searching" && (
        <p className="placeholder-hint">
          Looking for the latest available {model.toUpperCase()} run for this storm…
        </p>
      )}

      {status === "notfound" && (
        <div className="placeholder-panel">
          <p>
            Couldn't find a recent {model.toUpperCase()} run for storm code
            "{stormCode}" on CyclonicWX.
          </p>
          <a href="https://cyclonicwx.com/" target="_blank" rel="noreferrer">
            Browse CyclonicWX directly →
          </a>
        </div>
      )}

      {status !== "notfound" && (
        <>
          <img
            key={url}
            src={url}
            alt={`${model.toUpperCase()} run for ${storm.name}, +${frameHour}h`}
            className="model-map-image"
            onError={handleImgError}
            onLoad={handleImgLoad}
          />

          {status === "ready" && (
            <div className="model-maps-frame-bar">
              <button
                onClick={() => setFrameHour((f) => Math.max(STARTING_FRAME_HOUR, f - FRAME_STEP_HOURS))}
                disabled={frameHour <= STARTING_FRAME_HOUR}
              >
                ← Prev
              </button>
              <span>Init {cycles[cycleIndex]}Z · +{frameHour}h</span>
              <button onClick={() => setFrameHour((f) => f + FRAME_STEP_HOURS)}>
                Next →
              </button>
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
