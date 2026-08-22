// ATCF basin prefixes -> human-readable names, plus a stable display
// order so the sidebar always groups basins the same way regardless of
// what order the upstream API happens to return storms in.
const BASINS = {
  AL: { label: "Atlantic",        short: "ATL" },
  EP: { label: "East Pacific",    short: "EPAC" },
  CP: { label: "Central Pacific", short: "CPAC" },
  WP: { label: "West Pacific",    short: "WPAC" },
  IO: { label: "Indian Ocean",    short: "NIO" },
  SH: { label: "Southern Hemisphere", short: "SHEM" },
  SL: { label: "South Atlantic",  short: "SATL" },
};

const ORDER = ["AL", "EP", "CP", "WP", "IO", "SH", "SL"];

// The long ATCF id ("al062026") is the most reliable basin source we
// have; storm.basin from the upstream feed is only a fallback.
export function basinCode(storm) {
  const fromId = storm?.id?.slice(0, 2)?.toUpperCase();
  if (fromId && BASINS[fromId]) return fromId;
  const fromField = storm?.basin?.toUpperCase?.();
  if (fromField && BASINS[fromField]) return fromField;
  return "OTHER";
}

export function basinInfo(code) {
  return BASINS[code] ?? { label: "Other Basins", short: "OTHER" };
}

// Groups storms by basin, strongest first within each group, and returns
// groups in canonical basin order.
export function groupByBasin(storms) {
  const buckets = new Map();
  for (const storm of storms) {
    const code = basinCode(storm);
    if (!buckets.has(code)) buckets.set(code, []);
    buckets.get(code).push(storm);
  }

  return [...buckets.entries()]
    .sort((a, b) => {
      const ai = ORDER.indexOf(a[0]);
      const bi = ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([code, list]) => ({
      code,
      ...basinInfo(code),
      storms: list.sort((a, b) => (b.intensity ?? -1) - (a.intensity ?? -1)),
    }));
}
