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
    <div className="nrlmry-panel">
      <div className="nrlmry-toolbar">
        <button
          className="fullscreen-toggle-btn"
          onClick={() => setIsFullscreen((v) => !v)}
        >
          {isFullscreen ? "✕ Close fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>

      <div className={`nrlmry-iframe-wrap ${isFullscreen ? "fullscreen" : ""}`}>
        {isFullscreen && (
          <button className="fullscreen-close-btn" onClick={() => setIsFullscreen(false)}>
            ✕ Close
          </button>
        )}
        <iframe key={url} src={url} title={title} className="nrlmry-iframe" />
      </div>
    </div>
  );
}
