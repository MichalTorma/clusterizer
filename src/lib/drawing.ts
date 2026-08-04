import type { Position } from './analysis'

export type DrawTool = 'inspect' | 'polygon' | 'rectangle'

export function rectangleFromCorners(a: Position, b: Position): Position[] {
  const west = Math.min(a[0], b[0])
  const east = Math.max(a[0], b[0])
  const south = Math.min(a[1], b[1])
  const north = Math.max(a[1], b[1])
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ]
}

export function rectangleIsValid(a: Position, b: Position, minDegrees = 1e-5) {
  return Math.abs(a[0] - b[0]) >= minDegrees && Math.abs(a[1] - b[1]) >= minDegrees
}

export function toLatLngs(coordinates: Position[]): [number, number][] {
  return coordinates.map(([longitude, latitude]) => [latitude, longitude])
}
