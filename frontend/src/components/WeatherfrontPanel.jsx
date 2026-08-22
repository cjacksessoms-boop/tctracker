import IframeEmbedPanel from "./IframeEmbedPanel.jsx";

// Weatherfront's app doesn't change its URL when you pick a storm/model/
// product inside it (it's a single-page app managing state internally
// rather than in the URL) - so unlike NRLMRY or tropicaltidbits, we can't
// build a storm-specific deep link. We embed the app's root and let
// people navigate to the right storm/model themselves inside the frame.
const WEATHERFRONT_URL = "https://app.weatherfront.com/";

export default function WeatherfrontPanel() {
  return <IframeEmbedPanel url={WEATHERFRONT_URL} title="Weatherfront" />;
}
