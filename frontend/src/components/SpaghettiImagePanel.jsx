import { useEffect, useState } from "react";

// knackwx's CDN publishes per-storm guidance images keyed by the exact
// same long_atcf_id format we already use as storm.id (e.g. "wp122026"
// for Dolphin) - confirmed from real URLs. This covers every basin,
// including West Pacific storms our own map-based plotting can't reach
// (that one's built on NHC's ATCF archive, which is US-basins-only).
function knackwxImageUrl(storm, suffix) {
  return `https://cdn.knackwx.com/aid/early/${storm.id}_${suffix}.png`;
}

function KnackwxImage({ storm, suffix, label }) {
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const url = knackwxImageUrl(storm, suffix);

  useEffect(() => setStatus("loading"), [storm.id, suffix]);

  return (
    <div className="imagery-block">
      <h4 className="eyebrow imagery-label">{label}</h4>
      {status === "error" && (
        <p className="placeholder-hint">Not available yet for this storm.</p>
      )}
      <img
        key={url}
        src={url}
        alt={`${label} for ${storm.name}`}
        className="static-image"
        style={{ display: status === "error" ? "none" : "block" }}
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}

export default function SpaghettiImagePanel({ storm }) {
  return (
    <div className="imagery-panel">
      <KnackwxImage storm={storm} suffix="tracks" label="Track guidance" />
      <KnackwxImage storm={storm} suffix="winds" label="Intensity guidance" />
    </div>
  );
}
