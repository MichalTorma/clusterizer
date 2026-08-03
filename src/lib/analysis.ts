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
