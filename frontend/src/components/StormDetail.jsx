import { useState } from "react";
import ModelMapsPanel from "./ModelMapsPanel.jsx";
import CyclonicWxPanel from "./CyclonicWxPanel.jsx";
import CyclonicWxModelViewer from "./CyclonicWxModelViewer.jsx";
import WeatherfrontPanel from "./WeatherfrontPanel.jsx";
import IframeEmbedPanel from "./IframeEmbedPanel.jsx";
import AdtPanel from "./AdtPanel.jsx";
import SpaghettiImagePanel from "./SpaghettiImagePanel.jsx";
import SatelliteLoopPanel from "./SatelliteLoopPanel.jsx";
import { basinCode, basinInfo } from "../utils/basin.js";
import { classifyIntensity } from "../utils/intensity.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "nrlmry", label: "Satellite" },
  { id: "irloop", label: "IR Loop" },
  { id: "spaghetti", label: "Guidance" },
  { id: "adt", label: "ADT" },
  { id: "models", label: "Model Runs" },
];

const MODEL_MODES = [
  { id: "weatherfront", label: "Weatherfront" },
  { id: "cyclonicwx-viewer", label: "CyclonicWX" },
  { id: "cyclonicwx-embed", label: "CWX Site" },
  { id: "fallback", label: "GFS Viewer" },
];

// NRLMRY's GeoIPS TC dashboard uses the EXACT same storm ID format NHC
// gives us (e.g. "ep062026"), so we can build this URL automatically for
// any storm, present or future - no manual updates ever needed. This is
// the one confirmed to actually allow iframe embedding.
function nrlmryUrl(storm) {
  return `https://science.nrlmry.navy.mil/geoips/tcweb4/storm/${storm.id}`;
}

// Overview readings are rendered as a grid of labelled cells rather than
// a bordered table - same information, but it aligns cleanly, reflows on
// narrow screens, and matches the vitals strip above the map.
function Stat({ label, value }) {
  const empty = value == null || value === "" || value === "—";
  return (
    <div className="stat-cell">
      <span className="label-micro">{label}</span>
      <span className={`stat-cell-value ${empty ? "is-empty" : ""}`}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

export default function StormDetail({ storm }) {
  const [tab, setTab] = useState("overview");
  const [modelsMode, setModelsMode] = useState("weatherfront");

  const basin = basinInfo(basinCode(storm));
  const { label: category } = classifyIntensity(storm.intensity);

  return (
    <section className="panel storm-detail">
      <div className="tab-bar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab-button ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {tab === "overview" && (
          <div className="stat-grid">
            <Stat label="Category" value={category} />
            <Stat label="Classification" value={storm.classification} />
            <Stat label="Basin" value={basin.label} />
            <Stat
              label="Max Sustained Wind"
              value={storm.intensity ? `${storm.intensity} kt` : null}
            />
            <Stat
              label="Min Pressure"
              value={storm.pressure ? `${storm.pressure} mb` : null}
            />
            <Stat
              label="Movement"
              value={
                storm.movementDir != null && storm.movementSpeed != null
                  ? `${storm.movementDir} at ${storm.movementSpeed} kt`
                  : null
              }
            />
            <Stat
              label="Position"
              value={
                storm.lat != null && storm.lon != null
                  ? `${storm.lat.toFixed(1)}, ${storm.lon.toFixed(1)}`
                  : null
              }
            />
            <Stat label="ATCF ID" value={(storm.id ?? "").toUpperCase()} />
            <Stat label="Last Update" value={storm.lastUpdate} />
          </div>
        )}

        {tab === "nrlmry" && (
          <IframeEmbedPanel
            url={nrlmryUrl(storm)}
            title={`NRLMRY GeoIPS · ${storm.name}`}
          />
        )}

        {tab === "irloop" && <SatelliteLoopPanel storm={storm} />}

        {tab === "spaghetti" && (
          <div className="imagery-panel">
            <div className="placeholder-panel">
              <p>
                Model tracks for NHC-covered storms are also plotted directly
                on the track map above, with a full intensity legend.
              </p>
            </div>
            <SpaghettiImagePanel storm={storm} />
          </div>
        )}

        {tab === "adt" && <AdtPanel storm={storm} />}

        {tab === "models" && (
          <div className="imagery-panel">
            <div className="imagery-controls">
              <span className="field-label">Source</span>
              <div className="segmented">
                {MODEL_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`ctl ${modelsMode === m.id ? "active" : ""}`}
                    onClick={() => setModelsMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {modelsMode === "weatherfront" && <WeatherfrontPanel />}
            {modelsMode === "cyclonicwx-viewer" && <CyclonicWxModelViewer storm={storm} />}
            {modelsMode === "cyclonicwx-embed" && <CyclonicWxPanel />}
            {modelsMode === "fallback" && <ModelMapsPanel storm={storm} />}
          </div>
        )}
      </div>

      {(storm.publicAdvisoryUrl || storm.forecastAdvisoryUrl) && (
        <footer className="detail-footer">
          {storm.publicAdvisoryUrl && (
            <a
              className="ctl"
              href={storm.publicAdvisoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              NHC Public Advisory ↗
            </a>
          )}
          {storm.forecastAdvisoryUrl && (
            <a
              className="ctl"
              href={storm.forecastAdvisoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              Forecast Advisory ↗
            </a>
          )}
        </footer>
      )}
    </section>
  );
}
