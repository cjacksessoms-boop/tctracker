// Standard Saffir-Simpson-style classification, using knots (the unit
// ATCF/NHC/JTWC all use natively - no conversion needed). This is used
// both for the map's intensity dots AND the sidebar's category accent
// bars, so the same color always means the same thing everywhere in the
// app - that consistency is deliberate, not incidental.
export function classifyIntensity(vmaxKt) {
  const kt = typeof vmaxKt === "string" ? parseFloat(vmaxKt) : vmaxKt;
  if (kt == null || Number.isNaN(kt)) return { label: "Unknown", color: "#7c8aa8" };
  if (kt < 34) return { label: "Tropical Depression", color: "#8fd3ff" };
  if (kt < 64) return { label: "Tropical Storm", color: "#3fa9f5" };
  if (kt < 83) return { label: "Category 1", color: "#ffd43b" };
  if (kt < 96) return { label: "Category 2", color: "#ffa94d" };
  if (kt < 113) return { label: "Category 3", color: "#ff6b6b" };
  if (kt < 137) return { label: "Category 4", color: "#f06595" };
  return { label: "Category 5", color: "#cc5de8" };
}
