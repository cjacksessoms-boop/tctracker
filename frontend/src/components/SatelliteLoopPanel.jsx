import { useEffect, useRef, useState } from "react";
import { getJtwcCode } from "../utils/atcf.js";

// See App.jsx for the explanation of this env var.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// ms between frames during autoplay, used only for the wrap-around
// transition (last frame back to first), since real elapsed time doesn't
// mean much there.
const PLAYBACK_MS_DEFAULT = 180;

// Base playback pace, in ms of screen-time per second of real-world time
// elapsed between two frames. A typical ~150s gap plays for about 180ms;
// a 600s (10 min) gap would play for 720ms if left unclamped, which is
// why we clamp it - long enough to register as "this jumped further,"
// short enough not to feel like the loop stalled.
const MS_PER_REAL_SECOND = 1.2;
const MIN_FRAME_MS = 100;
const MAX_FRAME_MS = 550;

// timestamp is "YYYYMMDDHHMMSS" - parse into a real comparable moment.
function parseTimestamp(ts) {
  const y = ts.slice(0, 4), mo = ts.slice(4, 6), d = ts.slice(6, 8);
  const h = ts.slice(8, 10), mi = ts.slice(10, 12), s = ts.slice(12, 14);
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

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

  // Autoplay loop - each frame's on-screen duration is based on how much
  // REAL time elapsed before the next frame, not a fixed beat. Without
  // this, a 10-minute data gap and a 1-minute data gap play at the same
  // speed, which reads as jerky/stuttery even though the code itself is
  // running smoothly - the unevenness is in the source data's capture
  // times, not the playback mechanism.
  useEffect(() => {
    if (status !== "ok" || !playing || frames.length < 2) return;

    const nextIndex = (index + 1) % frames.length;
    let durationMs = PLAYBACK_MS_DEFAULT;

    if (nextIndex !== 0) {
      // Not wrapping back to the start - use the real gap between these
      // two specific frames.
      const deltaSeconds =
        (parseTimestamp(frames[nextIndex].timestamp) - parseTimestamp(frames[index].timestamp)) / 1000;
      durationMs = Math.min(
        MAX_FRAME_MS,
        Math.max(MIN_FRAME_MS, deltaSeconds * MS_PER_REAL_SECOND)
      );
    }

    intervalRef.current = setTimeout(() => setIndex(nextIndex), durationMs);
    return () => clearTimeout(intervalRef.current);
  }, [status, playing, frames, index]);

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
