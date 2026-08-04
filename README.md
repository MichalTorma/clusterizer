# Clusterizer

A browser-only Earth Engine application for mapping recurring nature types and unusual 10 m pixels from the annual AlphaEarth Foundations Satellite Embedding layer.

The app is a static UI — no analysis backend of its own. Every Earth Engine request runs as the signed-in user against **their own** Earth Engine–enabled Google Cloud project (same model as the Code Editor).

Anyone can use a hosted build (for example [GitHub Pages](https://michaltorma.github.io/clusterizer/)): open the site, finish the setup gate with their own Cloud project, then analyse. They do not need to run the app locally.

## What it does

For a small drawn or uploaded polygon, Clusterizer:

1. loads all 64 annual embedding bands at their native 10 m resolution;
2. trains Earth Engine's server-side X-Means algorithm on every valid pixel in the polygon;
3. maps the trained clusters back to every 10 m pixel;
4. calculates global unusualness (distance to the assigned cluster centroid) and local contrast (difference from the immediate embedding neighbourhood);
5. reports cluster area, pixel count, within-cluster spread, and a configurable rare-type flag;
6. offers a direct GeoTIFF download of the cluster raster.

You can also search a place, switch basemaps, draw a polygon or rectangle, upload vector files (GeoJSON, KML, GPX, zipped Shapefile, WKT), and click the map to highlight every pixel of a selected nature type. Map view and polygon are kept in the URL so links are shareable.

X-Means runs natively in Earth Engine and picks a cluster count within a configured range. It is not HDBSCAN: all pixels receive a class, and a high rarity score is an analytical signal rather than proof of a distinct habitat.

## Using the tool

The **map stays hidden** until setup succeeds.

1. Open the hosted app (or local `npm run dev`).
2. **Setup gate**
   - **Sign in** with the Google account that already works in the Earth Engine Code Editor.
   - **Choose a Cloud project** from the list, or paste a project ID.
   - **Readiness checks** run automatically: they confirm the Earth Engine API and a tiny read-only compute call on *your* project. If a check fails, follow the Console link shown for that item and retry.
3. Draw or upload an analysis area, tune clustering options if needed, then run the analysis.
4. Inspect types from the inventory or by clicking the map; download a GeoTIFF when useful.

Returning visitors: the app silently reuses an existing Google session when possible and opens the map after re-verifying the stored project — no login popup unless the session expired. Use **Change project** in the control panel to return to setup without auto-entering.

### What you need (end user)

| Requirement | Why |
| --- | --- |
| Google account with Earth Engine access | OAuth identity for EE compute |
| Cloud project with **Earth Engine API** enabled | All analysis calls use that project’s quota and permissions |
| Permission to use EE on that project | e.g. Earth Engine Viewer (or higher) plus ability to use enabled APIs |

Project listing is convenient but optional: if the list fails, paste a project ID manually.

### Host vs your project

- **Your** Cloud project: Earth Engine API, EE access, IAM — where compute runs.
- **Host** Cloud project (whoever published the app): only the browser OAuth client, plus **Cloud Resource Manager API** so the app can list *your* projects after sign-in. The host never receives your analyses or quota.

## Host on GitHub Pages

1. Create a **Web application** OAuth 2.0 client ID in Google Cloud Console.
2. Under Authorized JavaScript origins, add:
   - `http://localhost:5173` (local development)
   - `https://<user>.github.io` (GitHub Pages origin — **no** repo path)
3. On that same Cloud project (the one that owns the OAuth client), enable **Cloud Resource Manager API** so signed-in users can load their project list.
4. In the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_EE_OAUTH_CLIENT_ID` = your OAuth client ID (required)
   - `VITE_EE_PROJECT_ID` = optional seed / suggestion only; each visitor still connects with their own project
6. Push to `main` (or run the **Deploy GitHub Pages** workflow manually).

The site will be at `https://<user>.github.io/<repo>/`. The workflow sets `VITE_BASE_PATH` to `/<repo>/` automatically.

The OAuth client ID is intentionally public (it is baked into the static JS). Never add a service-account key or user token to this repository.

### OAuth consent tip

For accounts outside your Cloud org, the OAuth consent screen usually needs to be **External**. While the app is in Testing, add each Google account as a test user, or publish the app when ready.

Requested scopes: Earth Engine read-only and Cloud Platform read-only (for listing projects).

## Local development

```bash
cp .env.example .env.local
# set VITE_EE_OAUTH_CLIENT_ID (required)
# optional: VITE_EE_PROJECT_ID as a default suggestion
npm install
npm run dev
```

Vite also loads `.env` if you prefer that filename. Leave `VITE_BASE_PATH` unset for local root URLs.

```bash
npm run lint
npm run build
npm test
```

## Practical limits

The UI caps all-pixel training at 50,000 valid 10 m pixels (about 5 km² before masking). That keeps the no-sampling workflow suitable for small areas and avoids known Earth Engine clustering memory limits. Larger regions need a different strategy, such as spatially balanced sampling or tiled analysis.

Direct downloads are appropriate for bounded areas. A future Drive export mode should be used for larger asynchronous exports.

## Data attribution

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind and is licensed CC-BY 4.0. See the [Earth Engine dataset page](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL) for terms and attribution requirements.
