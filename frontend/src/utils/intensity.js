// Saffir-Simpson classification using knots (the unit ATCF/NHC/JTWC all
// use natively - no conversion needed).
//
// The color scale here is the standard Saffir-Simpson palette used on
// official/reference track maps, so the app reads like real operational
// products rather than an arbitrary theme. These same colors are the
// app's only data-encoding colors: map markers, sidebar category bars,
// category badges, and legends all pull from here, so a given color
// always means exactly one thing everywhere in the UI.
const SCALE = [
  { max: 34,       label: "Tropical Depression", short: "TD", color: "#5ebaff" },
  { max: 64,       label: "Tropical Storm",      short: "TS", color: "#00faf4" },
  { max: 83,       label: "Category 1",          short: "C1", color: "#ffffcc" },
  { max: 96,       label: "Category 2",          short: "C2", color: "#ffe775" },
  { max: 113,      label: "Category 3",          short: "C3", color: "#ffc140" },
  { max: 137,      label: "Category 4",          short: "C4", color: "#ff8f20" },
  { max: Infinity, label: "Category 5",          short: "C5", color: "#ff6060" },
];

const UNKNOWN = { label: "Unknown", short: "--", color: "#64748b" };

export function classifyIntensity(vmaxKt) {
  const kt = typeof vmaxKt === "string" ? parseFloat(vmaxKt) : vmaxKt;
  if (kt == null || Number.isNaN(kt)) return UNKNOWN;
  return SCALE.find((step) => kt < step.max) ?? UNKNOWN;
}

// Every category in scale order - used to render legends without
// hardcoding sample wind speeds at the call site.
export const INTENSITY_SCALE = SCALE.map(({ label, short, color }) => ({
  label,
  short,
  color,
}));

// Major hurricane = Cat 3+. Worth calling out separately in the UI
// because it's the threshold operational products emphasize.
export function isMajor(vmaxKt) {
  const kt = typeof vmaxKt === "string" ? parseFloat(vmaxKt) : vmaxKt;
  return !Number.isNaN(kt) && kt >= 96;
}
