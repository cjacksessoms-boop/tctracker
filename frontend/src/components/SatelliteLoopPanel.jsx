import { useEffect, useRef, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";

// See App.jsx for the explanation of this env var.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// ms between frames during autoplay
const PLAYBACK_MS = 180;

function preloadImage(frame) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Some servers block "hotlinked" images by checking the Referer
    // header and rejecting requests that didn't come from their own
    // site. Telling the browser not to send that header at all is a
    // common, low-risk way around that.
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(frame);
    img.onerror = () => reject(frame);
    img.src = frame.url;
  });
}

export default function SatelliteLoopPanel({ storm }) {
  const [status, setStatus] = useState("loading"); // loading | preloading | ok | empty | error
  const [frames, setFrames] = useState([]);
  const [listedCount, setListedCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const intervalRef = useRef(null);

  const stormCode = getJtwcCode(storm);

  // Ask our backend for the REAL list of available frames (parsed from
  // Dapiya's own directory listing) rather than guessing timestamps -
  // different storms/basins turned out to capture at different, and not
  // perfectly regular, intervals, so guessing wasn't reliable.
  //
  // Once we have the list, we PRELOAD every frame into the browser's
  // image cache before allowing playback to start. Without this, a fast
  // frame-swap interval (180ms) outruns how long each image actually
  // takes to fetch from a remote server, so it looks stuck on one frame
  // even though the code is technically cycling through all of them.
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

        const loaded = listed.filter((_, i) => results[i].status === "fulfilled");
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

  // Autoplay loop.
  useEffect(() => {
    if (status !== "ok" || !playing || frames.length < 2) return;
    intervalRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, PLAYBACK_MS);
    return () => clearInterval(intervalRef.current);
  }, [status, playing, frames.length]);

  if (status === "loading") {
    return <p className="placeholder-hint">Finding available loop frames…</p>;
  }

  if (status === "preloading") {
    return <p className="placeholder-hint">Loading loop frames into cache…</p>;
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
  // timestamp is YYYYMMDDHHMMSS - slice out HH:MM for display
  const hhmm = `${currentFrame.timestamp.slice(8, 10)}:${currentFrame.timestamp.slice(10, 12)}`;

  return (
    <div className="satellite-loop-panel">
      <img
        src={currentFrame.url}
        alt={`Satellite loop frame for ${storm.name}`}
        className="spaghetti-image"
        referrerPolicy="no-referrer"
      />
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
