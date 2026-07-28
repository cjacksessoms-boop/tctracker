// NHC gives us storm IDs like "ep072026" (basin + number + year).
// Several other sites (NRLMRY, tropicaltidbits) use a different,
// JTWC-style convention instead: NUMBER + BASIN LETTER, e.g. "07E".
// This is the one shared place that conversion happens, so if we ever
// discover it's wrong for a basin we haven't tested, there's only one
// spot to fix.
const BASIN_LETTER = { EP: "E", CP: "C", AL: "L", WP: "W" };

export function stormToJtwcCode(id) {
  if (!id || id.length < 4) return null;
  const basin = id.slice(0, 2).toUpperCase();
  const num = id.slice(2, 4);
  const letter = BASIN_LETTER[basin];
  if (!letter) return null; // unsupported/unconfirmed basin convention
  return `${num}${letter}`;
}
