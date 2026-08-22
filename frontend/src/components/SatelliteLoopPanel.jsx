import { useEffect, useRef, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";
import LoopCanvas from "./LoopCanvas.jsx";

// See App.jsx for the explanation of this env var.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const PLAYBACK_MS = 80;

// img.decode() forces the browser to fully decode the image now, during
// the loading screen, instead of the first time it's actually drawn -
// which is what used to cause a stutter on a frame's first appearance
// even when it was already cached. We keep the real Image object itself
// (not just its URL) so LoopCanvas can draw directly from it later.
function preloadImage(frame) {
  const img = new Image();
  img.referrerPolicy = "no-referrer"; // some servers block hotlinked Referer headers
  img.src = frame.url;
  return img
    .decode()
    .then(() => ({ ...frame, img }))
    .catch(() => Promise.reject(frame));
}

export default function SatelliteLoopPanel({ storm }) {
  const [status, setStatus] = useState("loading"); // loading | preloading | ok | empty | error
  const [frames, setFrames] = useState([]);
  const [listedCount, setListedCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef(null);

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

  useEffect(() => {
    if (status !== "ok" || !playing || frames.length < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, PLAYBACK_MS);
    return () => clearInterval(timerRef.current);
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

  return (
    <div className="satellite-loop-panel">
      <LoopCanvas images={frames.map((f) => f.img)} index={index} className="loop-canvas" />
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
