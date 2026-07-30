import IframeEmbedPanel from "./IframeEmbedPanel.jsx";

// Same approach as Weatherfront: embed the whole site and let its own
// navigation handle picking the storm/model/parameter, rather than
// deep-linking a specific URL (their real URL structure is
// /models/{model}/{stormCode}/{param}/{initTime}/{frame}/ - confirmed
// from a real example - but guessing the current init time/frame isn't
// worth it when embedding the whole site is simpler and more robust).
const CYCLONICWX_URL = "https://cyclonicwx.com/";

export default function CyclonicWxPanel() {
  return <IframeEmbedPanel url={CYCLONICWX_URL} title="CyclonicWX" />;
}
