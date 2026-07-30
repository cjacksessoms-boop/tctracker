import { classifyIntensity } from "../utils/intensity.js";

export default function StormList({ storms, selectedId, onSelect, loading }) {
  if (loading) {
    return <div className="sidebar-message">Loading active storms…</div>;
  }

  if (storms.length === 0) {
    return <div className="sidebar-message">No active storms.</div>;
  }

  return (
    <ul className="storm-list">
      {storms.map((storm) => {
        // The left accent bar's color comes directly from the storm's
        // real intensity category - the same color scale used on the
        // map's intensity dots and the spaghetti legend - so the sidebar
        // itself carries real information at a glance, not just decoration.
        const { color } = classifyIntensity(storm.intensity);
        return (
          <li
            key={storm.id}
            className={`storm-list-item ${storm.id === selectedId ? "selected" : ""}`}
            style={{ "--cat-color": color }}
            onClick={() => onSelect(storm.id)}
          >
            <div className="storm-list-name">{storm.name}</div>
            <div className="storm-list-meta">
              {storm.classification} {storm.intensity ? `· ${storm.intensity} kt` : ""}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
