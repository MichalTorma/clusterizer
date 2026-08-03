import ee from '@google/earthengine'
import {
  EMBEDDING_BANDS,
  MAX_ALL_PIXEL_TRAINING_PIXELS,
  type AnalysisParameters,
} from './analysis'
import { earthEngineConfig, getEarthEngineConfigurationError } from './config'

// The closure-compiled browser build reads `goog.global.ee` (i.e. window.ee)
// while generating API classes during initialization, which is only set up
// automatically when the library is loaded via a <script> tag. When bundled
// as a module, we must expose the export as that global ourselves.
;(globalThis as { ee?: unknown }).ee = ee

let earthEngineInitialized = false

export interface MapLayer {
  name: string
  url: string
  opacity?: number
}

export interface ClusterSummary {
  id: number
  pixelCount: number
  areaM2: number
  spread: number | null
  isRare: boolean
}

export interface AnalysisResult {
  layers: MapLayer[]
  summaries: ClusterSummary[]
  pixelCount: number
  download: () => Promise<void>
}

function eeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function evaluate<T>(value: any): Promise<T> {
  return new Promise((resolve, reject) => {
    value.evaluate((result: T | null, error: unknown) => {
      if (error) reject(eeError(error))
      else resolve(result as T)
    })
  })
}

async function evaluateFeatureProperties(collection: any): Promise<any[]> {
  const result = await evaluate<{ features?: Array<{ properties?: any }> } | any[]>(collection)
  if (Array.isArray(result)) return result
  return result.features?.map((feature) => feature.properties ?? feature) ?? []
}

function callback<T>(run: (resolve: (value: T) => void, reject: (error: Error) => void) => void) {
  return new Promise<T>((resolve, reject) => run(resolve, reject))
}

const EE_SCOPES = ['https://www.googleapis.com/auth/earthengine.readonly']

function initializeEarthEngine(resolve: () => void, reject: (error: Error) => void) {
  ee.initialize(
    null,
    null,
    () => {
      earthEngineInitialized = true
      resolve()
    },
    (error: unknown) => reject(eeError(error)),
    null,
    earthEngineConfig.projectId,
  )
}

export function authenticateEarthEngine() {
  const configurationError = getEarthEngineConfigurationError()
  if (configurationError) return Promise.reject(new Error(configurationError))

  return callback<void>((resolve, reject) => {
    ee.data.authenticateViaOauth(
      earthEngineConfig.clientId,
      () => initializeEarthEngine(resolve, reject),
      (error: unknown) => reject(eeError(error)),
      EE_SCOPES,
      undefined,
      true,
    )
  })
}

function analysisImage(parameters: AnalysisParameters) {
  const region = ee.Geometry.Polygon([
    [...parameters.coordinates, parameters.coordinates[0]],
  ])
  const start = `${parameters.year}-01-01`
  const end = `${parameters.year + 1}-01-01`
  const image = ee
    .ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL')
    .filterDate(start, end)
    .filterBounds(region)
    .mosaic()
    .select(EMBEDDING_BANDS)
    .clip(region)

  return { image, region }
}

async function mapUrl(image: any, visualization: Record<string, unknown>) {
  const map = await callback<any>((resolve, reject) =>
    image.getMap(visualization, (value: any, error: unknown) => {
      if (error) reject(eeError(error))
      else resolve(value)
    }),
  )
  const url = map?.tile_fetcher?.url_format ?? map?.urlFormat
  if (!url) throw new Error('Earth Engine did not return a map tile URL.')
  return url
}

function createGlobalRarityImage(image: any, clusters: any, summaries: ClusterSummary[], rawStats: any[]) {
  const distances = summaries
    .filter((summary) => summary.pixelCount > 0)
    .map((summary) => {
      const source = rawStats.find((stat) => stat.cluster === summary.id)
      const centroid = ee.Image.constant(
        EMBEDDING_BANDS.map((band) => Number(source?.[band] ?? 0)),
      ).rename(EMBEDDING_BANDS)
      return image
        .subtract(centroid)
        .pow(2)
        .reduce(ee.Reducer.sum())
        .sqrt()
        .rename('global_rarity')
        .updateMask(clusters.eq(ee.Image.constant(summary.id)))
    })

  return ee.ImageCollection.fromImages(distances).mosaic()
}

export async function runAnalysis(parameters: AnalysisParameters): Promise<AnalysisResult> {
  if (!earthEngineInitialized) throw new Error('Sign in to Earth Engine before running an analysis.')

  const { image, region } = analysisImage(parameters)
  const firstBand = EMBEDDING_BANDS[0]
  const pixelCount = await evaluate<number>(
    image.select(firstBand).reduceRegion({
      reducer: ee.Reducer.count(),
      geometry: region,
      scale: 10,
      maxPixels: 1e7,
      tileScale: 4,
    }).get(firstBand),
  )

  if (pixelCount > MAX_ALL_PIXEL_TRAINING_PIXELS) {
    throw new Error(
      `This polygon contains ${pixelCount.toLocaleString()} valid pixels. Keep all-pixel X-Means analyses below ${MAX_ALL_PIXEL_TRAINING_PIXELS.toLocaleString()} pixels.`,
    )
  }

  const training = image.sample({
    region,
    scale: 10,
    geometries: false,
    tileScale: 4,
  })
  const clusterer = ee.Clusterer
    .wekaXMeans(parameters.minClusters, parameters.maxClusters)
    .train(training, EMBEDDING_BANDS)
  const clusters = image.cluster(clusterer).rename('cluster')

  const rawStats = await evaluateFeatureProperties(
    ee.FeatureCollection(
      ee.List.sequence(0, parameters.maxClusters - 1).map((clusterId: any) => {
        const mask = clusters.eq(ee.Image.constant(clusterId))
        const statistics = image.updateMask(mask).reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: region,
          scale: 10,
          maxPixels: 1e7,
          tileScale: 4,
        })
        const count = clusters.updateMask(mask).reduceRegion({
          reducer: ee.Reducer.count(),
          geometry: region,
          scale: 10,
          maxPixels: 1e7,
          tileScale: 4,
        }).get('cluster')
        return ee.Feature(null, statistics.set('cluster', clusterId).set('pixelCount', count))
      }),
    ).filter(ee.Filter.gt('pixelCount', 0)),
  )

  let summaries: ClusterSummary[] = rawStats.map((stat) => {
    const pixelCountForCluster = Number(stat.pixelCount)
    return {
      id: Number(stat.cluster),
      pixelCount: pixelCountForCluster,
      areaM2: pixelCountForCluster * 100,
      spread: null,
      isRare: pixelCountForCluster * 100 < parameters.rareAreaM2,
    }
  })

  const spreadStats = await evaluateFeatureProperties(
    ee.FeatureCollection(
      summaries.map((summary) => {
        const source = rawStats.find((stat) => Number(stat.cluster) === summary.id)
        const centroid = ee.Image.constant(
          EMBEDDING_BANDS.map((band) => Number(source?.[band] ?? 0)),
        ).rename(EMBEDDING_BANDS)
        const spread = image
          .subtract(centroid)
          .pow(2)
          .reduce(ee.Reducer.sum())
          .sqrt()
          .updateMask(clusters.eq(ee.Image.constant(summary.id)))
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: region,
            scale: 10,
            maxPixels: 1e7,
            tileScale: 4,
          })
          .get('sum')
        return ee.Feature(null, { cluster: summary.id, spread })
      }),
    ),
  )
  summaries = summaries.map((summary) => ({
    ...summary,
    spread: Number(spreadStats.find((stat) => Number(stat.cluster) === summary.id)?.spread ?? 0),
  }))

  const globalRarity = createGlobalRarityImage(image, clusters, summaries, rawStats)
  const localMean = image.reduceNeighborhood({
    reducer: ee.Reducer.mean(),
    kernel: ee.Kernel.square({ radius: 1, units: 'pixels', normalize: false }),
  })
  const localNorm = localMean.pow(2).reduce(ee.Reducer.sum()).sqrt()
  const localRarity = ee.Image(1)
    .subtract(image.multiply(localMean).reduce(ee.Reducer.sum()).divide(localNorm))
    .rename('local_rarity')

  const palette = ['#6cc5a3', '#eab464', '#8d8fc7', '#d8799b', '#72a3c5', '#b5ca75', '#bf8bda', '#d4a57c']
  const [clusterUrl, globalRarityUrl, localRarityUrl] = await Promise.all([
    mapUrl(clusters, { min: 0, max: parameters.maxClusters - 1, palette }),
    mapUrl(globalRarity, { min: 0, max: 1.25, palette: ['#183b4e', '#56c596', '#f6d365', '#ed6a5a'] }),
    mapUrl(localRarity, { min: 0, max: 0.35, palette: ['#183b4e', '#56c596', '#f6d365', '#ed6a5a'] }),
  ])

  return {
    pixelCount,
    summaries,
    layers: [
      { name: 'Nature types', url: clusterUrl, opacity: 0.8 },
      { name: 'Global unusualness', url: globalRarityUrl, opacity: 0.75 },
      { name: 'Local contrast', url: localRarityUrl, opacity: 0.75 },
    ],
    download: async () => {
      const url = await callback<string>((resolve, reject) =>
        clusters.getDownloadURL(
          {
            name: `clusterizer-${parameters.year}`,
            region,
            scale: 10,
            crs: 'EPSG:4326',
            format: 'GEO_TIFF',
          },
          (value: string, error: unknown) => {
            if (error) reject(eeError(error))
            else resolve(value)
          },
        ),
      )
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}
