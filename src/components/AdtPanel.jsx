import { getJtwcCode } from "../utils/atcf.js";
import IframeEmbedPanel from "./IframeEmbedPanel.jsx";

// CIMSS publishes per-storm ADT (Advanced Dvorak Technique) intensity
// estimate pages using the same JTWC-style storm code (e.g. "06E") that
// NRLMRY and tropicaltidbits use - confirmed from a real URL:
//   https://tropic.ssec.wisc.edu/real-time/adt/odt06E.html
function adtUrl(stormCode) {
  return `https://tropic.ssec.wisc.edu/real-time/adt/odt${stormCode}.html`;
}

export default function AdtPanel({ storm }) {
  const stormCode = getJtwcCode(storm);

  if (!stormCode) {
    return (
      <div className="placeholder-panel">
        <p>
          We don't have a confirmed basin-letter mapping for this storm's
          ID ("{storm.id}") yet.
        </p>
      </div>
    );
  }

  return (
    <IframeEmbedPanel
      url={adtUrl(stormCode)}
      title={`CIMSS ADT page for ${storm.name}`}
    />
  );
}
