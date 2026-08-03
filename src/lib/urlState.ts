import type { Position } from './analysis'

export interface MapView {
  /** Leaflet [latitude, longitude] */
  center: [number, number]
  zoom: number
}

export interface AppUrlState {
  view: MapView
  coordinates: Position[]
  /** True when the URL had a polygon but no explicit map view. */
  fitPolygon: boolean
}

export const DEFAULT_MAP_VIEW: MapView = {
  center: [20, 0],
  zoom: 2,
}

const COORD_DECIMALS = 5

function roundCoord(value: number) {
  const factor = 10 ** COORD_DECIMALS
  return Math.round(value * factor) / factor
}

function roundZoom(value: number) {
  return Math.round(value * 100) / 100
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function serializePolygon(coordinates: Position[]): string | undefined {
  if (coordinates.length === 0) return undefined
  return coordinates
    .map(([longitude, latitude]) => `${roundCoord(longitude)},${roundCoord(latitude)}`)
    .join(';')
}

export function parsePolygon(value: string | null): Position[] {
  if (!value?.trim()) return []

  const coordinates: Position[] = []
  for (const pair of value.split(';')) {
    const [lonText, latText] = pair.split(',')
    const longitude = Number(lonText)
    const latitude = Number(latText)
    if (!isFiniteNumber(longitude) || !isFiniteNumber(latitude)) continue
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) continue
    coordinates.push([roundCoord(longitude), roundCoord(latitude)])
  }
  return coordinates
}

export function parseMapView(params: URLSearchParams): MapView | undefined {
  const latText = params.get('lat')
  const lonText = params.get('lon')
  const zoomText = params.get('z')
  if (latText == null || lonText == null || zoomText == null) return undefined

  const lat = Number(latText)
  const lon = Number(lonText)
  const zoom = Number(zoomText)
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon) || !isFiniteNumber(zoom)) return undefined
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || zoom < 0 || zoom > 22) return undefined
  return {
    center: [roundCoord(lat), roundCoord(lon)],
    zoom: roundZoom(zoom),
  }
}

export function readUrlState(search = window.location.search): AppUrlState {
  const params = new URLSearchParams(search)
  const coordinates = parsePolygon(params.get('poly'))
  const view = parseMapView(params)
  return {
    view: view ?? DEFAULT_MAP_VIEW,
    coordinates,
    fitPolygon: Boolean(coordinates.length && !view),
  }
}

export function writeUrlState(state: Pick<AppUrlState, 'view' | 'coordinates'>) {
  const url = new URL(window.location.href)
  const params = url.searchParams

  params.set('lat', String(roundCoord(state.view.center[0])))
  params.set('lon', String(roundCoord(state.view.center[1])))
  params.set('z', String(roundZoom(state.view.zoom)))

  const poly = serializePolygon(state.coordinates)
  if (poly) params.set('poly', poly)
  else params.delete('poly')

  const next = `${url.pathname}${params.toString() ? `?${params}` : ''}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    window.history.replaceState(null, '', next)
  }
}
