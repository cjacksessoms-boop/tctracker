import { useState } from "react";
import ModelMapsPanel from "./ModelMapsPanel.jsx";
import TropicalTidbitsPanel from "./TropicalTidbitsPanel.jsx";
import WeatherfrontPanel from "./WeatherfrontPanel.jsx";
import IframeEmbedPanel from "./IframeEmbedPanel.jsx";
import AdtPanel from "./AdtPanel.jsx";
import SpaghettiImagePanel from "./SpaghettiImagePanel.jsx";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "nrlmry", label: "Satellite & Microwave" },
  { id: "spaghetti", label: "Spaghetti Models" },
  { id: "adt", label: "ADT Estimates" },
  { id: "models", label: "Model Runs" },
];

// NRLMRY's GeoIPS TC dashboard uses the EXACT same storm ID format NHC
// gives us (e.g. "ep062026"), so we can build this URL automatically for
// any storm, present or future - no manual updates ever needed. This is
// the one confirmed to actually allow iframe embedding.
function nrlmryUrl(storm) {
  return `https://science.nrlmry.navy.mil/geoips/tcweb4/storm/${storm.id}`;
}

export default function StormDetail({ storm }) {
  const [tab, setTab] = useState("overview");
  const [modelsMode, setModelsMode] = useState("weatherfront"); // weatherfront | fallback | tidbits

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

        {tab === "spaghetti" && (
          <div className="models-tab">
            <div className="placeholder-panel">
              <p>
                Model tracks for NHC-covered storms are also plotted
                directly on the map above, with an intensity legend.
              </p>
            </div>
            <SpaghettiImagePanel storm={storm} />
          </div>
        )}

        {tab === "adt" && <AdtPanel storm={storm} />}

        {tab === "models" && (
          <div className="models-tab">
            <div className="models-mode-toggle">
              <button
                className={`tab-button ${modelsMode === "weatherfront" ? "active" : ""}`}
                onClick={() => setModelsMode("weatherfront")}
              >
                Weatherfront
              </button>
              <button
                className={`tab-button ${modelsMode === "fallback" ? "active" : ""}`}
                onClick={() => setModelsMode("fallback")}
              >
                GFS Viewer
              </button>
              <button
                className={`tab-button ${modelsMode === "tidbits" ? "active" : ""}`}
                onClick={() => setModelsMode("tidbits")}
              >
                tropicaltidbits
              </button>
            </div>
            {modelsMode === "fallback" && <ModelMapsPanel storm={storm} />}
            {modelsMode === "tidbits" && <TropicalTidbitsPanel storm={storm} />}
            {modelsMode === "weatherfront" && <WeatherfrontPanel />}
          </div>
        )}
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
