export type Position = [longitude: number, latitude: number]

export interface AnalysisParameters {
  coordinates: Position[]
  year: number
  minClusters: number
  maxClusters: number
  rareAreaM2: number
}

export const EMBEDDING_BANDS = Array.from(
  { length: 64 },
  (_, index) => `A${String(index).padStart(2, '0')}`,
)

export const MAX_ALL_PIXEL_TRAINING_PIXELS = 50_000

/** Soft distinct hues used when building a palette for N actual clusters. */
const CLUSTER_HUE_SATURATION = 42
const CLUSTER_HUE_LIGHTNESS = 62

function hslToHex(h: number, s: number, l: number) {
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const huePrime = ((h % 360) + 360) % 360 / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (huePrime < 1) [r, g, b] = [chroma, x, 0]
  else if (huePrime < 2) [r, g, b] = [x, chroma, 0]
  else if (huePrime < 3) [r, g, b] = [0, chroma, x]
  else if (huePrime < 4) [r, g, b] = [0, x, chroma]
  else if (huePrime < 5) [r, g, b] = [x, 0, chroma]
  else [r, g, b] = [chroma, 0, x]
  const match = lightness - chroma / 2
  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * One distinct colour per actual cluster (not stretched across maxClusters).
 * Hues are spaced evenly so neighbouring classes stay separable on the map.
 */
export function buildClusterPalette(clusterCount: number): string[] {
  const count = Math.max(0, Math.floor(clusterCount))
  if (count === 0) return []
  if (count === 1) return [hslToHex(152, CLUSTER_HUE_SATURATION, CLUSTER_HUE_LIGHTNESS)]
  return Array.from({ length: count }, (_, index) =>
    hslToHex((index * 360) / count, CLUSTER_HUE_SATURATION, CLUSTER_HUE_LIGHTNESS),
  )
}

/** Readable label colour on top of a cluster swatch. */
export function contrastTextForHex(hex: string): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return '#173f32'
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? '#173f32' : '#ffffff'
}

export function polygonIsValid(coordinates: Position[]) {
  return coordinates.length >= 3
}

export function approximatePolygonAreaM2(coordinates: Position[]) {
  if (!polygonIsValid(coordinates)) return 0

  const earthRadius = 6_371_008.8
  const radians = Math.PI / 180
  let total = 0

  for (let index = 0; index < coordinates.length; index += 1) {
    const [longitudeA, latitudeA] = coordinates[index]
    const [longitudeB, latitudeB] = coordinates[(index + 1) % coordinates.length]
    total +=
      (longitudeB - longitudeA) *
      radians *
      (2 + Math.sin(latitudeA * radians) + Math.sin(latitudeB * radians))
  }

  return Math.abs((total * earthRadius * earthRadius) / 2)
}

export function trainingEstimateLabel(coordinates: Position[]) {
  const pixelCount = Math.round(approximatePolygonAreaM2(coordinates) / 100)
  return `${pixelCount.toLocaleString()} possible 10 m pixels`
}
