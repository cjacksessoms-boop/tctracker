import { classifyIntensity } from "../utils/intensity.js";
import { groupByBasin } from "../utils/basin.js";

// The active-storm register. Storms are grouped by basin with sticky
// headers and sorted strongest-first inside each basin, so the list has
// a stable, meaningful order instead of whatever order the upstream feed
// happened to return.
export default function StormList({ storms, selectedId, onSelect, loading }) {
  if (loading) {
    return (
      <>
        <div className="sidebar-head">
          <span className="eyebrow">Active Systems</span>
        </div>
        <div className="sidebar-scroll">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </>
    );
  }

  if (storms.length === 0) {
    return (
      <>
        <div className="sidebar-head">
          <span className="eyebrow">Active Systems</span>
          <span className="sidebar-count">0</span>
        </div>
        <div className="sidebar-message">
          No active systems are being tracked in any basin.
        </div>
      </>
    );
  }

  const groups = groupByBasin(storms);

  return (
    <>
      <div className="sidebar-head">
        <span className="eyebrow">Active Systems</span>
        <span className="sidebar-count">{storms.length}</span>
      </div>

      <div className="sidebar-scroll">
        {groups.map((group) => (
          <section className="basin-group" key={group.code}>
            <header className="basin-head">
              <span className="eyebrow">{group.label}</span>
              <span className="basin-head-count">{group.storms.length}</span>
            </header>

            <ul className="storm-list">
              {group.storms.map((storm) => {
                // The category color drives the row's swatch, its
                // selected-state accent bar, and the category tag - the
                // exact same scale used on the map and in the legend, so
                // one color always means one thing across the whole app.
                const { color, short } = classifyIntensity(storm.intensity);
                const isSelected = storm.id === selectedId;

                return (
                  <li key={storm.id}>
                    <button
                      type="button"
                      className={`storm-list-item ${isSelected ? "selected" : ""}`}
                      style={{ "--cat-color": color }}
                      onClick={() => onSelect(storm.id)}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <span className="storm-swatch" />

                      <span className="storm-row-main">
                        <span className="storm-list-name">{storm.name}</span>
                        <span className="storm-list-meta">
                          <span className="storm-list-id">
                            {(storm.jtwcCode ?? storm.id ?? "").toUpperCase()}
                          </span>
                          <span className="storm-list-sep">/</span>
                          <span>{storm.classification || "Unclassified"}</span>
                        </span>
                      </span>

                      <span className="storm-row-wind">
                        <span className="storm-row-kt">
                          {storm.intensity ?? "--"}
                          <span className="storm-row-kt-unit">kt</span>
                        </span>
                        <span className="storm-row-cat">{short}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
