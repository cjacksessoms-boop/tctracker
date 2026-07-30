import { getJtwcCode } from "../utils/atcf.js";
import IframeEmbedPanel from "./IframeEmbedPanel.jsx";

// tropicaltidbits' model page takes the storm's JTWC-style region code as
// a query param and lets their own page UI handle model/parameter/runtime
// selection - IF it embeds. CONFIRMED (by you, in-browser): it does not -
// the site actively refuses to be framed rather than silently failing.
// Kept here (behind a toggle in StormDetail) in case that ever changes,
// or in case a different browser/session behaves differently.
function tidbitsUrl(stormCode) {
  return `https://www.tropicaltidbits.com/analysis/models/?model=gfs&region=${stormCode}`;
}

export default function TropicalTidbitsPanel({ storm }) {
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
      url={tidbitsUrl(stormCode)}
      title={`tropicaltidbits models page for ${storm.name}`}
    />
  );
}
