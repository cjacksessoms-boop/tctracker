import { useEffect, useRef, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";

// See App.jsx for the explanation of this env var.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// A fixed, fast frame rate. We initially made this adaptive to real time
// gaps between frames, but real data turned out to be evenly spaced
// (confirmed via the backend's actual listing) - the unevenness you saw
// earlier was your machine lagging, not the data. So a simple constant
// pace is both simpler and, at this speed, actually smoother-looking
// than the variable-duration version.
const PLAYBACK_MS = 80;

// Loading an image getting cached (onload) is NOT the same as it being
// fully decoded and ready to paint instantly. Swapping <img src> during
// playback can still cause a decode-triggered stutter the first time
// each frame is actually displayed, even if it's sitting in cache.
// img.decode() forces that decode work to happen now, during the loading
// screen, instead of during playback.
function preloadImage(frame) {
  const img = new Image();
  img.referrerPolicy = "no-referrer"; // some servers block hotlinked Referer headers
  img.src = frame.url;
  return img
    .decode()
    .then(() => ({ ...frame, width: img.naturalWidth, height: img.naturalHeight }))
    .catch(() => Promise.reject(frame));
}

export default function SatelliteLoopPanel({ storm }) {
  const [status, setStatus] = useState("loading"); // loading | preloading | ok | empty | error
  const [frames, setFrames] = useState([]);
  const [listedCount, setListedCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timeoutRef = useRef(null);

  const stormCode = getJtwcCode(storm);

  useEffect(() => {
    setStatus("loading");
    setFrames([]);
    setIndex(0);
    if (!stormCode) {
      setStatus("empty");
      return;
    }

    let cancelled = false;

    fetch(`${API_BASE}/api/storm/${stormCode}/ir-frames`)
      .then((res) => {
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        return res.json();
      })
      .then(async (data) => {
        if (cancelled) return;
        const listed = data.frames ?? [];
        if (listed.length === 0) {
          setStatus("empty");
          return;
        }

        setStatus("preloading");
        setListedCount(listed.length);
        const results = await Promise.allSettled(listed.map(preloadImage));
        if (cancelled) return;

        const loaded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
        if (loaded.length === 0) {
          setStatus("empty");
        } else {
          setFrames(loaded);
          setIndex(loaded.length - 1); // start on the most recent frame
          setStatus("ok");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [stormCode]);

  // Autoplay loop, fixed pace - the crossfade rendering (see below) is
  // what actually makes this look smooth; timing just needs to be
  // consistent, not adaptive.
  useEffect(() => {
    if (status !== "ok" || !playing || frames.length < 2) return;
    timeoutRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, PLAYBACK_MS);
    return () => clearInterval(timeoutRef.current);
  }, [status, playing, frames.length]);

  if (status === "loading") {
    return <p className="placeholder-hint">Finding available loop frames…</p>;
  }

  if (status === "preloading") {
    return <p className="placeholder-hint">Loading and decoding loop frames…</p>;
  }

  if (status === "error") {
    return (
      <div className="placeholder-panel">
        <p>Couldn't reach the frame listing for this storm.</p>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="placeholder-panel">
        <p>No loop frames available yet for this storm.</p>
      </div>
    );
  }

  const currentFrame = frames[index];
  const hhmm = `${currentFrame.timestamp.slice(8, 10)}:${currentFrame.timestamp.slice(10, 12)}`;
  // Use the first frame's real dimensions to lock the container's aspect
  // ratio, so stacking every frame absolutely inside it never causes
  // layout shifts - only opacity changes, which the GPU compositor
  // handles without any repaint/decode work. This is the actual fix for
  // per-frame stutter: every frame is already painted once, we're just
  // toggling which layer is visible.
  const aspectRatio = frames[0] ? `${frames[0].width} / ${frames[0].height}` : "1 / 1";

  return (
    <div className="satellite-loop-panel">
      <div className="loop-frame-stack" style={{ aspectRatio }}>
        {frames.map((f, i) => (
          <img
            key={f.url}
            src={f.url}
            alt={`Satellite loop frame for ${storm.name}`}
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
        <span>{hhmm}Z</span>
      </div>
      {frames.length < listedCount && (
        <p className="placeholder-hint">
          {frames.length} of {listedCount} listed frames loaded successfully.
        </p>
      )}
    </div>
  );
}
