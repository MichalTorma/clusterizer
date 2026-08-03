# Clusterizer

A browser-only Earth Engine application for mapping recurring nature types and unusual 10 m pixels from the annual AlphaEarth Foundations Satellite Embedding layer.

The app deliberately does not use an application server or service-account credentials. Every Earth Engine request runs as the signed-in user.

## What it does

For a small drawn polygon, Clusterizer:

1. loads all 64 annual embedding bands at their native 10 m resolution;
2. trains Earth Engine's server-side X-Means algorithm on every valid pixel in the polygon;
3. maps the trained clusters back to every 10 m pixel;
4. calculates global unusualness (distance to the assigned cluster centroid) and local contrast (difference from the immediate embedding neighbourhood);
5. reports cluster area, pixel count, within-cluster spread, and a configurable rare-type flag;
6. offers a direct GeoTIFF download of the cluster raster.

X-Means is used because it runs natively in Earth Engine and selects a cluster count within a configured range. It is not HDBSCAN: all pixels receive a class, and a high rarity score is an analytical signal rather than proof of a distinct habitat.

## Setup

1. Create or use a Google Cloud project enabled for Earth Engine.
2. Create a browser OAuth 2.0 client ID and add the deployed domain (and `http://localhost:5173` for local development) as authorized JavaScript origins.
3. Copy `.env.example` to `.env.local` and set the public client ID and GCP project ID.
4. Install and run:

```bash
npm install
npm run dev
```

The browser OAuth flow requires users to have Earth Engine access. The client ID is intentionally public; never add a service-account key or user token to this repository.

## Development

```bash
npm run lint
npm run build
```

## Practical limits

The initial UI caps all-pixel training at 50,000 valid 10 m pixels (about 5 km² before masking). This keeps the no-sampling workflow suitable for the intended small-area analysis and avoids known Earth Engine clustering memory limits. Larger regions need a different strategy, such as spatially balanced sampling or tiled analysis.

Direct downloads are appropriate for bounded areas. A future Drive export mode should be used for larger asynchronous exports.

## Data attribution

The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind and is licensed CC-BY 4.0. See the [Earth Engine dataset page](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL) for terms and attribution requirements.
