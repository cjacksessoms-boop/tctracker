# Tropical Cyclone Tracker

A full-stack web app for tracking active tropical cyclones, built with:
- **Backend:** Node.js + Express (fetches/proxies live NHC data)
- **Frontend:** React + Vite + Leaflet (map + UI)

## How this maps to what you already know

If you're used to C++ projects: `npm install` is like fetching/building your
dependencies (think vcpkg/conan), `npm run dev` is like running your compiled
binary but with auto-reload on save, and Vite is your build system (like
CMake). `package.json` is basically your project's manifest/Makefile combined.

## Project structure

```
cyclone-tracker/
  backend/          <- Express server, talks to NHC, port 3001
    server.js
    package.json
  frontend/         <- React app you view in the browser, port 5173
    src/
      App.jsx           <- top-level state + data fetching
      components/
        StormList.jsx   <- sidebar list of active storms
        StormMap.jsx     <- Leaflet map with storm markers + forecast cone
        StormDetail.jsx  <- tabbed panel (satellite/microwave/etc.)
    package.json
```

## Running it locally

You need [Node.js](https://nodejs.org) installed (v18+; v20 recommended).
Check with:
```
node --version
```

**Terminal 1 - start the backend:**
```
cd backend
npm install
npm start
```
You should see: `Cyclone tracker backend running at http://localhost:3001`

**Terminal 2 - start the frontend:**
```
cd frontend
npm install
npm run dev
```
It'll print a local URL, usually `http://localhost:5173`. Open that in your
browser.

## First-run checklist (important!)

I built this backend's NHC integration from memory of NHC's public JSON
schema, but I could NOT test the actual network call from my sandbox (no
internet access to noaa.gov there). Do this once you have it running:

1. With the backend running, open `http://localhost:3001/api/storms`
   directly in your browser.
2. Look at the real JSON. Compare field names to what
   `frontend/src/App.jsx` expects in the `normalizeStorm()` function
   (it's commented, right near the top).
3. If NHC's actual field names differ, adjust `normalizeStorm()` to match.
   This is the ONE function that translates their raw data into what the
   rest of the app expects, so a mismatch there is easy to spot and fix
   (the storm list will just show blank/odd values).

If there are no storms active when you test, the app will correctly show
"No active storms" — you can temporarily hardcode a fake storm object in
`App.jsx` to test the UI/map while waiting for a real one to form.

## What's built

**Live NHC data:**
- Active storm list (name, classification, wind, pressure, position)
- Map with clickable storm markers, forecast cone, and real spaghetti
  model tracks (raw ATCF data) with an intensity-colored legend and a
  per-model selector
- Link to NHC's official public advisory text

**Embedded external tools** (each with a fullscreen toggle):
- Satellite & Microwave → NRLMRY's GeoIPS dashboard
- ADT Estimates → CIMSS's per-storm ADT page
- Model Runs → Weatherfront (default), plus a GFS-specific fallback
  viewer and a tropicaltidbits option (currently blocked from embedding
  by that site itself)

## Deploying (so your friends can actually use it)

Right now this only runs on your own machine. To get a real URL, you need
to host the backend and frontend somewhere. This app is split into two
pieces, so they get deployed separately:

- **Backend** (Express server) → a service that can run a Node process
  continuously. **Render** is a solid free option for this.
- **Frontend** (the React app) → a static file host. **Vercel** or
  **Netlify** are both good, free, and simple.

### Step 0: Put your code on GitHub

Both Render and Vercel deploy by connecting to a GitHub repo. If you
haven't already:
```
cd cyclone-tracker
git init
git add .
git commit -m "Initial commit"
```
Then create a new repo on github.com and follow its instructions to push
this code there.

### Step 1: Deploy the backend (Render)

1. Go to [render.com](https://render.com) and sign up/log in (GitHub login is easiest).
2. Click **New +** → **Web Service**, and connect your GitHub repo.
3. Configure it:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Deploy. Render will give you a live URL like
   `https://cyclone-tracker-backend.onrender.com` — copy it, you'll need
   it in Step 2.

Note: Render's free tier "spins down" the server after periods of
inactivity, so the first request after a while can take ~30-60 seconds
to wake back up. That's normal on the free tier, not a bug.

### Step 2: Deploy the frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign up/log in with GitHub.
2. Click **Add New** → **Project**, and import the same repo.
3. Configure it:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Before deploying, add an **Environment Variable**:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** the backend URL you copied in Step 1 (no trailing slash)
5. Deploy. Vercel gives you a live URL like
   `https://cyclone-tracker.vercel.app` — that's the link you send to
   your friends.

### If you change the code later

Both Render and Vercel auto-redeploy whenever you push new commits to
GitHub, so your normal workflow becomes: edit code locally → test with
`npm run dev` → `git push` → it updates live automatically.


