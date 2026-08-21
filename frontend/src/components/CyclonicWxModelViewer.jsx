import { useEffect, useRef, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";

// ----------------------------------------------------------------------------
// CyclonicWX's per-storm model maps follow this pattern (confirmed from a
// real URL you provided):
//   https://cyclonicwx.com/data/models/{model}/{stormCode}/4panel/{model}_{stormCode}_4panel_{init}_f{frameHour}.png
//
// - {stormCode} is JTWC-style (e.g. "12W")
// - {init} is the model's run/init time as YYYYMMDDHH (UTC)
// - {frameHour} is the forecast hour, zero-padded to 3 digits (f006, f012...)
//
// Model slugs were provided directly by you from the site itself. GFS's
// frame pattern (starts at f006, steps by 6h) was independently
// confirmed via a real URL - HAFS models turned out to run on a
// different cadence (starts at f003), which is why each model below
// carries its own timing instead of assuming they all match GFS.
const MODEL_OPTIONS = [
  { value: "gfs", label: "GFS", startFrame: 6, stepHours: 6 },
  { value: "ecmwf", label: "ECMWF (Euro)", startFrame: 6, stepHours: 6 },
  { value: "hafsai", label: "HAFS-A", startFrame: 3, stepHours: 3 },
  { value: "hafsao", label: "HAFS-A Parent", startFrame: 3, stepHours: 3 },
  { value: "hafsbi", label: "HAFS-B", startFrame: 3, stepHours: 3 },
  { value: "hafsbo", label: "HAFS-B Parent", startFrame: 3, stepHours: 3 },
];

// How far out to probe for additional frames once a cycle is found.
// Extra probes past a model's real max forecast length just fail to
// load and get dropped - harmless, just a few wasted requests.
const MAX_FRAME_HOUR = 240;
const PLAYBACK_MS = 250; // slower than the IR loop - forecast maps read better a bit slower

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

// Same technique as the IR loop: fully decode each image before playback
// starts, so swapping between them during autoplay is a cheap opacity
// flip rather than a decode-triggered stutter.
function preloadFrame(url, frameHour) {
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  img.src = url;
  return img
    .decode()
    .then(() => ({ url, frameHour, width: img.naturalWidth, height: img.naturalHeight }))
    .catch(() => Promise.reject(url));
}

export default function CyclonicWxModelViewer({ storm }) {
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [cycles] = useState(() => recentCycles());
  const [status, setStatus] = useState("searching"); // searching | preloading | ready | notfound
  const [cycleUsed, setCycleUsed] = useState(null);
  const [frames, setFrames] = useState([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef(null);

  const stormCode = getJtwcCode(storm);

  useEffect(() => {
    setStatus(stormCode ? "searching" : "notfound");
    setFrames([]);
    setIndex(0);
    setCycleUsed(null);
    if (!stormCode) return;

    let cancelled = false;
    const modelConfig = MODEL_OPTIONS.find((m) => m.value === model);
    const { startFrame, stepHours } = modelConfig;

    async function run() {
      // Step 1: find the most recent cycle that actually has data, by
      // testing this model's confirmed starting frame against each
      // candidate cycle, newest first.
      let foundCycle = null;
      for (const cycle of cycles) {
        try {
          await preloadFrame(buildUrl(model, cycle, stormCode, startFrame), startFrame);
          foundCycle = cycle;
          break;
        } catch {
          // try the next older cycle
        }
      }

      if (cancelled) return;
      if (!foundCycle) {
        setStatus("notfound");
        return;
      }

      setCycleUsed(foundCycle);
      setStatus("preloading");

      // Step 2: now that we know the cycle is real, probe+preload every
      // forecast hour out to MAX_FRAME_HOUR in parallel, at this model's
      // own step interval. Whichever ones succeed become the loop, in order.
      const candidates = [];
      for (let h = startFrame; h <= MAX_FRAME_HOUR; h += stepHours) {
        candidates.push(h);
      }
      const results = await Promise.allSettled(
        candidates.map((h) => preloadFrame(buildUrl(model, foundCycle, stormCode, h), h))
      );
      if (cancelled) return;

      const loaded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (loaded.length === 0) {
        setStatus("notfound");
      } else {
        setFrames(loaded);
        setIndex(0);
        setStatus("ready");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [stormCode, model, cycles]);

  // Autoplay loop.
  useEffect(() => {
    if (status !== "ready" || !playing || frames.length < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, PLAYBACK_MS);
    return () => clearInterval(timerRef.current);
  }, [status, playing, frames.length]);

  if (!stormCode) {
    return (
      <div className="placeholder-panel">
        <p>No confirmed storm code available for this storm yet.</p>
      </div>
    );
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

      {status === "preloading" && (
        <p className="placeholder-hint">Loading forecast frames…</p>
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

      {status === "ready" && (
        <div className="satellite-loop-panel">
          <div
            className="loop-frame-stack"
            style={{ aspectRatio: `${frames[0].width} / ${frames[0].height}` }}
          >
            {frames.map((f, i) => (
              <img
                key={f.url}
                src={f.url}
                alt={`${model.toUpperCase()} run for ${storm.name}, +${f.frameHour}h`}
                className="loop-frame"
                style={{ opacity: i === index ? 1 : 0 }}
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
          <div className="model-maps-frame-bar">
            <button onClick={() => setPlaying((p) => !p)}>
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              className="loop-scrubber"
            />
            <span>Init {cycleUsed}Z · +{frames[index].frameHour}h</span>
            <a
              href={frames[index].url}
              target="_blank"
              rel="noreferrer"
              className="open-new-tab-link"
            >
              ↗ Full size
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
