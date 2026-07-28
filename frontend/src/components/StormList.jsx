export default function StormList({ storms, selectedId, onSelect, loading }) {
  if (loading) {
    return <div className="sidebar-message">Loading active storms…</div>;
  }

  if (storms.length === 0) {
    return <div className="sidebar-message">No active storms.</div>;
  }

  return (
    <ul className="storm-list">
      {storms.map((storm) => (
        <li
          key={storm.id}
          className={`storm-list-item ${storm.id === selectedId ? "selected" : ""}`}
          onClick={() => onSelect(storm.id)}
        >
          <div className="storm-list-name">{storm.name}</div>
          <div className="storm-list-meta">
            {storm.classification} {storm.intensity ? `· ${storm.intensity} kt` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
