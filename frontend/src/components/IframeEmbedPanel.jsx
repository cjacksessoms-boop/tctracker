import { useEffect, useState } from "react";

// Generic embed panel for any external dashboard shown inline.
//
// Fullscreen toggle: we deliberately keep the SAME <iframe> element
// mounted the whole time and just change its wrapper's CSS (rather than
// creating a second iframe for fullscreen mode), so entering/exiting
// fullscreen never reloads the embedded page or loses your navigation
// inside it.
export default function IframeEmbedPanel({ url, title }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  return (
    <div className="embed-panel">
      <div className="embed-toolbar">
        <span className="field-label">External source</span>
        <div className="toolbar-spacer" />
        <a className="ctl" href={url} target="_blank" rel="noreferrer">
          Open in new tab ↗
        </a>
        <button className="ctl" onClick={() => setIsFullscreen(true)}>
          Fullscreen
        </button>
      </div>

      <div className={`embed-frame-wrap ${isFullscreen ? "fullscreen" : ""}`}>
        {isFullscreen && (
          <div className="fullscreen-bar">
            <span className="fullscreen-bar-title">{title}</span>
            <button className="ctl" onClick={() => setIsFullscreen(false)}>
              Exit <span className="kbd">Esc</span>
            </button>
          </div>
        )}
        <iframe key={url} src={url} title={title} className="embed-frame" />
      </div>
    </div>
  );
}
