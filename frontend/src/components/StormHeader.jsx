import { classifyIntensity, isMajor } from "../utils/intensity.js";
import { basinCode, basinInfo } from "../utils/basin.js";

// Formats a decimal lat/lon pair the way forecast products do:
// hemisphere letters instead of signs (e.g. "18.4N 62.7W").
function formatPosition(lat, lon) {
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}${ns} ${Math.abs(lon).toFixed(1)}${ew}`;
}

function Vital({ label, value, unit }) {
  const empty = value == null || value === "";
  return (
    <div className="vital">
      <span className="label-micro">{label}</span>
      <span className={`vital-value ${empty ? "is-empty" : ""}`}>
        {empty ? "—" : value}
        {!empty && unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

// The persistent "current conditions" strip. Previously these readings
// lived inside an Overview tab, meaning the storm's core vitals vanished
// the moment you switched to satellite or model imagery. Operational
// products keep them pinned - so now they sit above the map at all times.
export default function StormHeader({ storm }) {
  const { label, color, short } = classifyIntensity(storm.intensity);
  const basin = basinInfo(basinCode(storm));
  const position = formatPosition(storm.lat, storm.lon);

  const movement =
    storm.movementDir != null && storm.movementSpeed != null
      ? `${storm.movementDir} ${storm.movementSpeed}`
      : null;

  return (
    <section className="storm-header" style={{ "--cat-color": color }}>
      <div className="storm-header-id">
        <div className="storm-header-name">
          <h2>{storm.name}</h2>
          <span className="cat-badge">
            {short} · {label}
          </span>
          {isMajor(storm.intensity) && <span className="major-flag">Major</span>}
        </div>
        <div className="storm-header-sub">
          <span>{(storm.jtwcCode ?? storm.id ?? "").toUpperCase()}</span>
          <span className="storm-list-sep">/</span>
          <span>{basin.label}</span>
          {storm.lastUpdate && (
            <>
              <span className="storm-list-sep">/</span>
              <span>Updated {storm.lastUpdate}</span>
            </>
          )}
        </div>
      </div>

      <div className="vitals">
        <Vital label="Max Wind" value={storm.intensity} unit="kt" />
        <Vital label="Min Pressure" value={storm.pressure} unit="mb" />
        <Vital label="Movement" value={movement} unit="kt" />
        <Vital label="Position" value={position} />
      </div>
    </section>
  );
}
