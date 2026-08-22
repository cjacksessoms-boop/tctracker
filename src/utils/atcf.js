// NHC gives us storm IDs like "ep072026" (basin + number + year).
// Several other sites (NRLMRY, tropicaltidbits, CIMSS ADT) use a
// different, JTWC-style convention instead: NUMBER + BASIN LETTER, e.g.
// "07E". This is the one shared place that conversion happens.
const BASIN_LETTER = { EP: "E", CP: "C", AL: "L", WP: "W" };

export function stormToJtwcCode(id) {
  if (!id || id.length < 4) return null;
  const basin = id.slice(0, 2).toUpperCase();
  const num = id.slice(2, 4);
  const letter = BASIN_LETTER[basin];
  if (!letter) return null; // unsupported/unconfirmed basin convention
  return `${num}${letter}`;
}

// The single place every embed/panel should call to get a storm's
// JTWC-style code. JTWC-sourced storms already carry their real code
// directly (storm.jtwcCode, e.g. "12W", parsed straight from their own
// bulletin) - no conversion needed or possible for those. NHC-sourced
// storms don't have that field, so we derive it from their NHC id.
export function getJtwcCode(storm) {
  return storm.jtwcCode ?? stormToJtwcCode(storm.id);
}
