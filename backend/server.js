// ============================================================================
// Tropical Cyclone Tracker - Backend Server
// ----------------------------------------------------------------------------
// This is a small Express server. Its ONLY job is to fetch data from the
// National Hurricane Center (NHC) on the server side and hand it to our
// React frontend as JSON.
//
// Why do we need this instead of calling NHC directly from the browser?
// Because of a browser security rule called CORS (Cross-Origin Resource
// Sharing). Some servers (like NHC's) don't send the special headers that
// let a webpage running on "localhost:5173" fetch data from
// "www.nhc.noaa.gov" directly. A backend server has no such restriction,
// so it fetches the data and re-serves it to our frontend.
//
// Think of this file as the "engine room" - it doesn't render anything,
// it just gathers data and answers questions the frontend asks it.
// ============================================================================

import express from "express";
import cors from "cors";
import zlib from "node:zlib";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors()); // allow the frontend (different port) to call this server

// ----------------------------------------------------------------------------
// NHC publishes a single JSON file listing every currently active storm
// worldwide (Atlantic + East/Central Pacific, which is what NHC covers).
// Docs / background: https://www.nhc.noaa.gov/gis/
// ----------------------------------------------------------------------------
const NHC_CURRENT_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";

// Simple in-memory cache so we don't hammer NHC's servers on every click.
// (NHC asks that automated tools not poll too aggressively.)
let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 60 * 1000; // 1 minute

async function getCurrentStorms() {
  const isFresh = Date.now() - cache.fetchedAt < CACHE_MS;
  if (isFresh && cache.data) return cache.data;

  const res = await fetch(NHC_CURRENT_STORMS_URL, {
    headers: { "User-Agent": "cyclone-tracker-hobby-project/1.0" },
  });
  if (!res.ok) {
    throw new Error(`NHC request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  cache = { data, fetchedAt: Date.now() };
  return data;
}

// GET /api/storms  -> list of all currently active storms
app.get("/api/storms", async (req, res) => {
  try {
    const data = await getCurrentStorms();
    // NHC's JSON schema (as of this writing) looks roughly like:
    // { activeStorms: [ { id, binNumber, name, classification, intensity,
    //     pressure, latitude, longitude, lastUpdate, movementDir,
    //     movementSpeed, forecastAdvisory: {url}, publicAdvisory: {url},
    //     track (or forecastTrack) geojson links, ... }, ... ] }
    //
    // NOTE FOR YOU: the exact field names can shift slightly over time.
    // The very first time you run this for real, add a
    // console.log(JSON.stringify(data, null, 2))
    // right here, hit /api/storms in your browser, and compare the real
    // response to what App.jsx expects. I could not test this call from my
    // sandbox (no internet access to noaa.gov there), so treat this as a
    // strong first draft, not gospel.
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to fetch storm data from NHC", detail: err.message });
  }
});

// ----------------------------------------------------------------------------
// ATCF a-deck data - this is the RAW data spaghetti-model websites are built
// from. NHC (and the wider tropical meteorology community) publishes every
// model's forecast track in a plain-text format here:
//   https://ftp.nhc.noaa.gov/atcf/aid_public/a<stormid>.dat.gz
// where <stormid> is exactly the same id NHC already gives us in
// CurrentStorms.json (e.g. "ep062026"), gzip-compressed CSV-ish text.
//
// Each line = one model's forecast for one storm at one forecast hour.
// Field reference (0-indexed, comma separated, NHC's public ATCF format doc):
//   [0] BASIN            e.g. "EP"
//   [1] CY               cyclone number, e.g. "06"
//   [2] YYYYMMDDHH       the forecast CYCLE (issue) time
//   [4] TECH             model identifier, e.g. "OFCL","AVNO","EMX","HWRF"
//   [5] TAU              forecast hour (0, 12, 24, 36...)
//   [6] LatN/S           e.g. "195N" = 19.5N (tenths of a degree + hemisphere)
//   [7] LonE/W           e.g. "1057W" = 105.7W (tenths of a degree + hemisphere)
//   [8] VMAX             max wind, knots
//
// We only keep the MOST RECENT cycle present in the file, since older
// cycles are stale forecasts superseded by newer ones.
// ----------------------------------------------------------------------------

function parseAtcfCoord(raw) {
  // raw looks like "195N" or "1057W" - last char is hemisphere, rest is
  // tenths of a degree.
  const hemisphere = raw.slice(-1).toUpperCase();
  const magnitude = parseInt(raw.slice(0, -1), 10) / 10;
  if (hemisphere === "S" || hemisphere === "W") return -magnitude;
  return magnitude;
}

function parseAdeck(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let latestCycle = null;
  const rows = [];

  for (const line of lines) {
    const f = line.split(",").map((v) => v.trim());
    if (f.length < 8) continue;

    const cycle = f[2];
    const tech = f[4];
    const tau = parseInt(f[5], 10);
    const lat = parseAtcfCoord(f[6]);
    const lon = parseAtcfCoord(f[7]);
    const vmax = parseInt(f[8], 10) || null;

    if (!latestCycle || cycle > latestCycle) latestCycle = cycle;
    rows.push({ cycle, tech, tau, lat, lon, vmax });
  }

  const models = {};
  for (const row of rows) {
    if (row.cycle !== latestCycle) continue; // drop stale forecast cycles
    if (!models[row.tech]) models[row.tech] = [];
    models[row.tech].push({ tau: row.tau, lat: row.lat, lon: row.lon, vmax: row.vmax });
  }
  // Sort each model's points by forecast hour so lines draw correctly.
  for (const tech of Object.keys(models)) {
    models[tech].sort((a, b) => a.tau - b.tau);
  }

  return { cycle: latestCycle, models };
}

app.get("/api/storm/:id/adeck", async (req, res) => {
  const { id } = req.params; // e.g. "ep062026"
  const url = `https://ftp.nhc.noaa.gov/atcf/aid_public/a${id}.dat.gz`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "cyclone-tracker-hobby-project/1.0" },
    });
    if (!upstream.ok) {
      throw new Error(`ATCF request failed: ${upstream.status} ${upstream.statusText}`);
    }
    const gzipBuffer = Buffer.from(await upstream.arrayBuffer());
    const text = zlib.gunzipSync(gzipBuffer).toString("utf-8");
    const parsed = parseAdeck(text);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to fetch/parse ATCF data", detail: err.message });
  }
});


// GET /api/proxy?url=<geojson url from a storm's record>
// Generic pass-through so the frontend can request cone/track/etc GeoJSON
// files that NHC links to per-storm, without hitting CORS issues.
// We allowlist the domain for safety - this must only ever proxy NOAA/NHC.
const ALLOWED_HOSTS = [
  "www.nhc.noaa.gov",
  "nhc.noaa.gov",
];

app.get("/api/proxy", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: "Missing url query param" });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ error: "Invalid url" });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return res.status(403).json({ error: `Host not allowed: ${parsed.hostname}` });
  }

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "cyclone-tracker-hobby-project/1.0" },
    });
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("content-type", contentType);
    const body = await upstream.arrayBuffer();
    res.send(Buffer.from(body));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Proxy fetch failed", detail: err.message });
  }
});

// ----------------------------------------------------------------------------
// Dapiya's IR satellite loop imagery is served as individual timestamped
// files, not one animated file (confirmed via your browser's Network
// tab). We initially tried GUESSING which timestamps exist based on a
// fixed interval, but real data proved that wrong - different
// storms/basins capture at different intervals (Dolphin: every 150s,
// Genevieve: every ~60s), and even a single storm's sequence has gaps
// (missed frames). So instead, we fetch Dapiya's real directory listing
// page and parse out the actual filenames that exist - authoritative,
// not guessed.
function parseDapiyaListing(html, stormCode) {
  const pattern = new RegExp(`href="(${stormCode}_OTT_(\\d{14})\\.png)"`, "g");
  const frames = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    frames.push({ filename: match[1], timestamp: match[2] });
  }
  frames.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return frames;
}

app.get("/api/storm/:stormCode/ir-frames", async (req, res) => {
  const { stormCode } = req.params; // e.g. "12W", "07E"
  const listingUrl = `https://data.dapiya.top/history/${stormCode}/OTT/`;

  try {
    const upstream = await fetch(listingUrl, {
      headers: { "User-Agent": "cyclone-tracker-hobby-project/1.0" },
    });
    if (!upstream.ok) {
      throw new Error(`Listing request failed: ${upstream.status}`);
    }
    const html = await upstream.text();
    const allFrames = parseDapiyaListing(html, stormCode);

    const RECENT_FRAME_COUNT = 30;
    const recent = allFrames.slice(-RECENT_FRAME_COUNT).map((f) => ({
      ...f,
      url: `https://data.dapiya.top/history/${stormCode}/OTT/${f.filename}`,
    }));

    res.json({ frames: recent });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to fetch IR frame listing", detail: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));



app.listen(PORT, () => {
  console.log(`Cyclone tracker backend running at http://localhost:${PORT}`);
});
