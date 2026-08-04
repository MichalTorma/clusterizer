# Clusterizer

A browser-only Earth Engine application for mapping recurring nature types and unusual 10 m pixels from the annual AlphaEarth Foundations Satellite Embedding layer.

The app is a static UI tool, not a shared backend. Every Earth Engine request runs as the signed-in user against **their own** Earth Engine–enabled Google Cloud project — the same model as the Code Editor.

Anyone can use a hosted build (for example GitHub Pages): open the site, complete the setup gate with their own Earth Engine Cloud project, and run analyses. They do not need to run the app locally.

## What it does

For a small drawn polygon, Clusterizer:

1. loads all 64 annual embedding bands at their native 10 m resolution;
2. trains Earth Engine's server-side X-Means algorithm on every valid pixel in the polygon;
3. maps the trained clusters back to every 10 m pixel;
4. calculates global unusualness (distance to the assigned cluster centroid) and local contrast (difference from the immediate embedding neighbourhood);
5. reports cluster area, pixel count, within-cluster spread, and a configurable rare-type flag;
6. offers a direct GeoTIFF download of the cluster raster.

X-Means is used because it runs natively in Earth Engine and selects a cluster count within a configured range. It is not HDBSCAN: all pixels receive a class, and a high rarity score is an analytical signal rather than proof of a distinct habitat.

## Host on GitHub Pages

1. Create a **browser** OAuth 2.0 client ID in Google Cloud Console.
2. Under Authorized JavaScript origins, add:
   - `http://localhost:5173` (local development)
   - `https://<user>.github.io` (GitHub Pages origin — no path)
3. In the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_EE_OAUTH_CLIENT_ID` = your OAuth client ID  
   - optional `VITE_EE_PROJECT_ID` = default project suggestion only
5. On the same Google Cloud project that owns the OAuth client, enable **Cloud Resource Manager API** (needed so signed-in users can load their project list).
6. Push to `main` (or run the **Deploy GitHub Pages** workflow manually).

The site will be at `https://<user>.github.io/<repo>/`.

The OAuth client ID is intentionally public (it is baked into the static JS). Never add a service-account key or user token to this repository.

### OAuth consent tip

For accounts outside your Cloud org, the OAuth consent screen usually needs to be **External**. While the app is in Testing, add each Google account as a test user, or publish the app when ready.

## Local development

```bash
cp .env.example .env.local
# set VITE_EE_OAUTH_CLIENT_ID
npm install
npm run dev
```

## Using the tool (any EE user)

1. Open the hosted app (or local dev server).
2. Complete the **setup gate** (map stays hidden until this succeeds):
   - **Sign in** with the Google account that has Earth Engine access.
   - **Choose a Cloud project** from the list (or paste a project ID).
   - Wait for **readiness checks** — the app verifies the Earth Engine API and a tiny compute call on your project. If something is missing, follow the Console link shown for that check.
3. Draw or upload an analysis area, then run the analysis.

Returning visitors with a stored project ID get a one-click **Continue** that re-signs in and re-verifies before opening the map. Use **Change project** in the control panel to return to setup.

Quota and permissions follow the user’s project. The host Cloud project is only used to register the OAuth client for the web app.

For the project picker, enable **Cloud Resource Manager API** on the Google Cloud project that owns the OAuth client ID. If listing fails, users can still enter a project ID manually.

## Development

```bash
npm run lint
npm run build
npm test
```

## Practical limits

The initial UI caps all-pixel training at 50,000 valid 10 m pixels (about 5 km² before masking). This keeps the no-sampling workflow suitable for the intended small-area analysis and avoids known Earth Engine clustering memory limits. Larger regions need a different strategy, such as spatially balanced sampling or tiled analysis.

Direct downloads are appropriate for bounded areas. A future Drive export mode should be used for larger asynchronous exports.

## Data attribution

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind and is licensed CC-BY 4.0. See the [Earth Engine dataset page](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL) for terms and attribution requirements.
