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
let activeProjectId: string | undefined
let googleSignedIn = false

export interface CloudProjectOption {
  projectId: string
  displayName: string
  earthEngineLabeled: boolean
}

export function getActiveEarthEngineProjectId() {
  return activeProjectId
}

export function isGoogleSignedIn() {
  return googleSignedIn
}

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
  sampleClusterAt: (longitude: number, latitude: number) => Promise<number | null>
  getClusterHighlightUrl: (clusterId: number) => Promise<string>
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

/** EE compute + Cloud Resource Manager (project picker). */
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/earthengine.readonly',
  'https://www.googleapis.com/auth/cloud-platform.read-only',
]

function requireClientId() {
  const configurationError = getEarthEngineConfigurationError()
  if (configurationError) throw new Error(configurationError)
  return earthEngineConfig.clientId as string
}

function getAuthorizationHeader() {
  const token = ee.data.getAuthToken?.() as string | null | undefined
  if (!token) {
    throw new Error('Sign in with Google before listing or selecting a Cloud project.')
  }
  return token
}

/**
 * Google sign-in only. Project selection / ee.initialize happen afterwards.
 */
export function signInWithGoogle() {
  const clientId = requireClientId()

  return callback<void>((resolve, reject) => {
    ee.data.authenticateViaOauth(
      clientId,
      () => {
        googleSignedIn = true
        resolve()
      },
      (error: unknown) => {
        googleSignedIn = false
        reject(eeError(error))
      },
      OAUTH_SCOPES,
      undefined,
      true,
    )
  })
}

export type ProjectListErrorKind = 'crm_disabled' | 'other'

export interface ProjectListVerification {
  ok: boolean
  projects: CloudProjectOption[]
  errorKind?: ProjectListErrorKind
  message?: string
}

export type EarthEngineReadyErrorKind =
  | 'ee_api_disabled'
  | 'ee_access'
  | 'permission'
  | 'unknown'

export interface EarthEngineReadyVerification {
  ok: boolean
  projectId: string
  errorKind?: EarthEngineReadyErrorKind
  message?: string
}

function classifyEarthEngineError(message: string): EarthEngineReadyErrorKind {
  const lower = message.toLowerCase()
  if (
    lower.includes('api has not been used')
    || lower.includes('has not been enabled')
    || lower.includes('is disabled')
    || (lower.includes('earthengine.googleapis.com') && lower.includes('enable'))
  ) {
    return 'ee_api_disabled'
  }
  if (
    lower.includes('not registered')
    || lower.includes('no earth engine access')
    || lower.includes('earth engine access')
    || lower.includes('signup')
  ) {
    return 'ee_access'
  }
  if (
    lower.includes('permission')
    || lower.includes('denied')
    || lower.includes('serviceusage')
    || lower.includes('403')
    || lower.includes('forbidden')
  ) {
    return 'permission'
  }
  return 'unknown'
}

/**
 * List active Cloud projects the signed-in user can see.
 * Earth Engine–labeled projects are sorted first when labels are present.
 */
export async function listAccessibleCloudProjects(): Promise<CloudProjectOption[]> {
  const authorization = getAuthorizationHeader()
  const projects: CloudProjectOption[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://cloudresourcemanager.googleapis.com/v3/projects:search')
    url.searchParams.set('query', 'state:ACTIVE')
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, {
      headers: { Authorization: authorization },
    })

    if (!response.ok) {
      const detail = await response.text()
      if (response.status === 403) {
        throw new Error(
          'Could not list Cloud projects. Enable the Cloud Resource Manager API on the OAuth client Cloud project, then try again.',
        )
      }
      throw new Error(`Project list failed (${response.status}): ${detail.slice(0, 240)}`)
    }

    const data = (await response.json()) as {
      projects?: Array<{
        projectId?: string
        displayName?: string
        labels?: Record<string, string>
      }>
      nextPageToken?: string
    }

    for (const project of data.projects ?? []) {
      if (!project.projectId) continue
      projects.push({
        projectId: project.projectId,
        displayName: project.displayName || project.projectId,
        earthEngineLabeled: Boolean(project.labels && 'earth-engine' in project.labels),
      })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return projects.sort((a, b) => {
    if (a.earthEngineLabeled !== b.earthEngineLabeled) return a.earthEngineLabeled ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })
}

/**
 * Soft check: project listing is optional (manual ID still works).
 * A 403 usually means Cloud Resource Manager API is off on the host OAuth project.
 */
export async function verifyProjectListAccess(): Promise<ProjectListVerification> {
  try {
    const projects = await listAccessibleCloudProjects()
    return { ok: true, projects }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const errorKind: ProjectListErrorKind =
      message.toLowerCase().includes('cloud resource manager') || message.includes('403')
        ? 'crm_disabled'
        : 'other'
    return { ok: false, projects: [], errorKind, message }
  }
}

/**
 * Hard check: initialize EE against the project and run a tiny read-only evaluate.
 */
export async function verifyEarthEngineReady(projectId: string): Promise<EarthEngineReadyVerification> {
  const trimmed = projectId.trim()
  if (!trimmed) {
    return {
      ok: false,
      projectId: '',
      errorKind: 'unknown',
      message: 'Choose or enter an Earth Engine–enabled Google Cloud project.',
    }
  }

  try {
    await initializeEarthEngineProject(trimmed)
    await evaluate(ee.Image.constant(1).rename('ok'))
    return { ok: true, projectId: trimmed }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return {
      ok: false,
      projectId: trimmed,
      errorKind: classifyEarthEngineError(message),
      message,
    }
  }
}

/**
 * Bind Earth Engine API calls to the chosen Cloud project (quota / permissions).
 */
export function initializeEarthEngineProject(projectId: string) {
  const trimmed = projectId.trim()
  if (!trimmed) {
    return Promise.reject(new Error('Choose or enter an Earth Engine–enabled Google Cloud project.'))
  }
  if (!googleSignedIn && !ee.data.getAuthToken?.()) {
    return Promise.reject(new Error('Sign in with Google before selecting a project.'))
  }

  return callback<void>((resolve, reject) => {
    earthEngineInitialized = false
    activeProjectId = undefined
    ee.initialize(
      null,
      null,
      () => {
        earthEngineInitialized = true
        activeProjectId = trimmed
        googleSignedIn = true
        resolve()
      },
      (error: unknown) => {
        earthEngineInitialized = false
        activeProjectId = undefined
        reject(eeError(error))
      },
      null,
      trimmed,
    )
  })
}

/** @deprecated Prefer signInWithGoogle + initializeEarthEngineProject. */
export async function authenticateEarthEngine(projectId: string) {
  await signInWithGoogle()
  await initializeEarthEngineProject(projectId)
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

  const highlightUrlCache = new Map<number, Promise<string>>()

  return {
    pixelCount,
    summaries,
    layers: [
      { name: 'Nature types', url: clusterUrl, opacity: 0.8 },
      { name: 'Global unusualness', url: globalRarityUrl, opacity: 0.75 },
      { name: 'Local contrast', url: localRarityUrl, opacity: 0.75 },
    ],
    sampleClusterAt: async (longitude, latitude) => {
      const sampled = await evaluate<number | null>(
        clusters
          .reduceRegion({
            reducer: ee.Reducer.first(),
            geometry: ee.Geometry.Point([longitude, latitude]),
            scale: 10,
            maxPixels: 1e6,
          })
          .get('cluster'),
      )
      return sampled == null || Number.isNaN(Number(sampled)) ? null : Number(sampled)
    },
    getClusterHighlightUrl: (clusterId) => {
      const cached = highlightUrlCache.get(clusterId)
      if (cached) return cached

      const highlight = clusters.eq(ee.Image.constant(clusterId)).selfMask()
      const pending = mapUrl(highlight, {
        min: 0,
        max: 1,
        palette: ['#ff4d2e'],
      })
      highlightUrlCache.set(clusterId, pending)
      return pending
    },
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
