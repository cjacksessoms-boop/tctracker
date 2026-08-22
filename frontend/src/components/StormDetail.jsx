import { useState } from "react";
import CyclonicWxModelViewer from "./CyclonicWxModelViewer.jsx";
import IframeEmbedPanel from "./IframeEmbedPanel.jsx";
import AdtPanel from "./AdtPanel.jsx";
import SpaghettiImagePanel from "./SpaghettiImagePanel.jsx";
import SatelliteLoopPanel from "./SatelliteLoopPanel.jsx";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "nrlmry", label: "Satellite" },
  { id: "irloop", label: "IR Loop" },
  { id: "spaghetti", label: "Spaghetti" },
  { id: "adt", label: "ADT" },
  { id: "models", label: "Models" },
];

// NRLMRY's GeoIPS TC dashboard uses the EXACT same storm ID format NHC
// gives us (e.g. "ep062026"), so we can build this URL automatically for
// any storm, present or future - no manual updates ever needed.
function nrlmryUrl(storm) {
  return `https://science.nrlmry.navy.mil/geoips/tcweb4/storm/${storm.id}`;
}

export default function StormDetail({ storm }) {
  const [tab, setTab] = useState("overview");

  return (
    <div className="storm-detail">
      <h2>{storm.name}</h2>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-button ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {tab === "overview" && (
          <table className="storm-stats">
            <tbody>
              <tr><td>Classification</td><td>{storm.classification || "—"}</td></tr>
              <tr><td>Max Sustained Wind</td><td>{storm.intensity ? `${storm.intensity} kt` : "—"}</td></tr>
              <tr><td>Min Pressure</td><td>{storm.pressure ? `${storm.pressure} mb` : "—"}</td></tr>
              <tr><td>Position</td><td>{storm.lat?.toFixed(1)}, {storm.lon?.toFixed(1)}</td></tr>
              <tr><td>Movement</td><td>{storm.movementDir ?? "—"} at {storm.movementSpeed ?? "—"} kt</td></tr>
              <tr><td>Last Update</td><td>{storm.lastUpdate ?? "—"}</td></tr>
            </tbody>
          </table>
        )}

        {tab === "nrlmry" && (
          <IframeEmbedPanel
            url={nrlmryUrl(storm)}
            title={`NRLMRY GeoIPS page for ${storm.name}`}
          />
        )}

        {tab === "irloop" && <SatelliteLoopPanel storm={storm} />}

        {tab === "spaghetti" && <SpaghettiImagePanel storm={storm} />}

        {tab === "adt" && <AdtPanel storm={storm} />}

        {tab === "models" && <CyclonicWxModelViewer storm={storm} />}
      </div>

      {storm.publicAdvisoryUrl && (
        <a
          className="advisory-link"
          href={storm.publicAdvisoryUrl}
          target="_blank"
          rel="noreferrer"
        >
          📄 Read latest NHC Public Advisory
        </a>
      )}
    </div>
  );
}
