import { gpx, kml } from '@tmcw/togeojson'
import shp from 'shpjs'
import { approximatePolygonAreaM2, type Position } from './analysis'

export interface ImportedPolygon {
  coordinates: Position[]
  sourceName: string
  /** Leaflet [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]]
}

type Ring = Position[]

function isFinitePosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  )
}

export function normalizeRing(ring: Array<number[] | Position>): Position[] {
  const positions: Position[] = []
  for (const point of ring) {
    if (!isFinitePosition(point)) continue
    const longitude = Number(point[0])
    const latitude = Number(point[1])
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) continue
    positions.push([longitude, latitude])
  }

  if (
    positions.length >= 2 &&
    positions[0][0] === positions[positions.length - 1][0] &&
    positions[0][1] === positions[positions.length - 1][1]
  ) {
    positions.pop()
  }

  return positions
}

function collectRingsFromGeometry(geometry: any, rings: Ring[]) {
  if (!geometry) return
  const type = geometry.type
  const coordinates = geometry.coordinates

  if (type === 'Polygon' && Array.isArray(coordinates?.[0])) {
    const ring = normalizeRing(coordinates[0])
    if (ring.length >= 3) rings.push(ring)
    return
  }

  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    for (const polygon of coordinates) {
      if (!Array.isArray(polygon?.[0])) continue
      const ring = normalizeRing(polygon[0])
      if (ring.length >= 3) rings.push(ring)
    }
    return
  }

  if (type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    for (const child of geometry.geometries) collectRingsFromGeometry(child, rings)
  }
}

export function ringsFromGeoJson(data: unknown): Ring[] {
  const rings: Ring[] = []
  if (!data || typeof data !== 'object') return rings

  const value = data as Record<string, unknown>
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    for (const feature of value.features) {
      collectRingsFromGeometry((feature as { geometry?: unknown }).geometry, rings)
    }
    return rings
  }

  if (value.type === 'Feature') {
    collectRingsFromGeometry(value.geometry, rings)
    return rings
  }

  collectRingsFromGeometry(value, rings)
  return rings
}

export function pickLargestRing(rings: Ring[]): Ring | undefined {
  if (rings.length === 0) return undefined
  return rings.reduce((best, ring) =>
    approximatePolygonAreaM2(ring) > approximatePolygonAreaM2(best) ? ring : best,
  )
}

export function boundsFromPositions(coordinates: Position[]): [[number, number], [number, number]] {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude)
    east = Math.max(east, longitude)
    south = Math.min(south, latitude)
    north = Math.max(north, latitude)
  }
  return [
    [south, west],
    [north, east],
  ]
}

export function parseWktPolygon(text: string): Ring[] {
  const match = text.match(/POLYGON\s*Z?\s*\(\s*\((.+?)\)\s*\)/i)
    ?? text.match(/MULTIPOLYGON\s*Z?\s*\(\s*\(\s*\((.+?)\)\s*\)/i)
  if (!match) return []

  const ring = match[1]
    .split(',')
    .map((pair) => {
      const parts = pair.trim().split(/\s+/)
      return [Number(parts[0]), Number(parts[1])] as Position
    })

  const normalized = normalizeRing(ring)
  return normalized.length >= 3 ? [normalized] : []
}

function extensionOf(fileName: string) {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

function parseXmlDocument(text: string) {
  const document = new DOMParser().parseFromString(text, 'text/xml')
  const parseError = document.querySelector('parsererror')
  if (parseError) throw new Error('The XML file could not be parsed.')
  return document
}

async function geoJsonFromFile(file: File): Promise<unknown> {
  const extension = extensionOf(file.name)

  if (extension === '.zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const buffer = await file.arrayBuffer()
    const parsed = await shp(buffer)
    // shpjs returns a FeatureCollection, or a map of layer name -> FeatureCollection.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !('type' in parsed)) {
      const layers = Object.values(parsed as Record<string, unknown>)
      return {
        type: 'FeatureCollection',
        features: layers.flatMap((layer) => {
          if (layer && typeof layer === 'object' && Array.isArray((layer as { features?: unknown[] }).features)) {
            return (layer as { features: unknown[] }).features
          }
          return []
        }),
      }
    }
    return parsed
  }

  const text = await file.text()
  const trimmed = text.trimStart()

  if (extension === '.kml' || /<kml[\s>]/i.test(trimmed)) {
    return kml(parseXmlDocument(text))
  }

  if (extension === '.gpx' || /<gpx[\s>]/i.test(trimmed)) {
    return gpx(parseXmlDocument(text))
  }

  if (extension === '.wkt' || /^\s*(MULTI)?POLYGON\s*\(/i.test(trimmed)) {
    const rings = parseWktPolygon(text)
    if (!rings.length) throw new Error('No POLYGON geometry found in the WKT file.')
    return {
      type: 'FeatureCollection',
      features: rings.map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] },
      })),
    }
  }

  if (
    extension === '.geojson' ||
    extension === '.json' ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    return JSON.parse(text) as unknown
  }

  throw new Error('Unsupported file type. Use GeoJSON, KML, GPX, WKT, or a zipped Shapefile.')
}

export async function importPolygonFromFile(file: File): Promise<ImportedPolygon> {
  const geojson = await geoJsonFromFile(file)
  const rings = ringsFromGeoJson(geojson)
  const coordinates = pickLargestRing(rings)
  if (!coordinates) {
    throw new Error('No polygon geometry found in that file.')
  }

  return {
    coordinates,
    sourceName: file.name,
    bounds: boundsFromPositions(coordinates),
  }
}

export const VECTOR_UPLOAD_ACCEPT = [
  '.geojson',
  '.json',
  '.kml',
  '.gpx',
  '.wkt',
  '.zip',
  'application/geo+json',
  'application/json',
  'application/vnd.google-earth.kml+xml',
].join(',')
