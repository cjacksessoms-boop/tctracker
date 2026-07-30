// knackwx's ATCFv2 API gives us ONE clean array covering every active
// storm globally (all basins, invests included) - confirmed real via a
// direct browser fetch() call, no API key or CORS issues. This replaces
// our old separate NHC-JSON-parsing + JTWC-bulletin-parsing setup for
// the storm list itself. We keep NHC's own feed around separately only
// to enrich EP/AL/CP storms with extras this API doesn't include
// (forecast cone shape, official advisory text links) - see App.jsx.
const KNACKWX_URL = "https://api.knackwx.com/atcf/v2";

// Standard ATCF "cyclone nature" codes. Not exhaustive, but covers the
// common ones - unmapped codes just fall back to showing the raw code.
const CYCLONE_NATURE_LABELS = {
  DB: "Disturbance",
  TD: "Tropical Depression",
  TS: "Tropical Storm",
  TY: "Typhoon",
  ST: "Super Typhoon",
  HU: "Hurricane",
  SS: "Subtropical Storm",
  SD: "Subtropical Depression",
  EX: "Extratropical",
  IN: "Inland",
  DS: "Dissipating",
  WV: "Tropical Wave",
  LO: "Low",
};

function titleCase(str) {
  if (!str) return "Unnamed";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function normalizeKnackwxStorm(raw) {
  return {
    // long_atcf_id matches NHC's own storm ID format exactly when NHC
    // covers the storm (e.g. "ep062026") - so this one field now unifies
    // ID handling across every basin, including ones NHC doesn't cover.
    id: raw.long_atcf_id ?? raw.atcf_id,
    jtwcCode: raw.atcf_id, // e.g. "06E", "12W" - already the exact format our embed panels need
    name: titleCase(raw.storm_name),
    classification: CYCLONE_NATURE_LABELS[raw.cyclone_nature] ?? raw.cyclone_nature ?? "",
    intensity: raw.winds ?? null,
    pressure: raw.pressure ?? null,
    lat: raw.latitude,
    lon: raw.longitude,
    movementDir: raw.movedir ?? null,
    movementSpeed: raw.movespeed ?? null,
    lastUpdate: raw.last_updated ?? raw.analysis_time ?? null,
    basin: raw.basin ?? null,
    source: "knackwx",
    raw,
  };
}

export async function fetchKnackwxStorms() {
  const res = await fetch(KNACKWX_URL);
  if (!res.ok) throw new Error(`knackwx API returned ${res.status}`);
  const data = await res.json();
  return data.map(normalizeKnackwxStorm);
}
