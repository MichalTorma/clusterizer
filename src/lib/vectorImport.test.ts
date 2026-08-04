import { describe, expect, it } from 'vitest'
import {
  boundsFromPositions,
  normalizeRing,
  parseWktPolygon,
  pickLargestRing,
  ringsFromGeoJson,
} from './vectorImport'

describe('vectorImport', () => {
  it('normalizes and drops a closed ring duplicate', () => {
    expect(
      normalizeRing([
        [10, 60],
        [11, 60],
        [11, 61],
        [10, 61],
        [10, 60],
      ]),
    ).toEqual([
      [10, 60],
      [11, 60],
      [11, 61],
      [10, 61],
    ])
  })

  it('extracts polygons from a FeatureCollection', () => {
    const rings = ringsFromGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [10, 60],
                [11, 60],
                [11, 61],
                [10, 61],
                [10, 60],
              ],
            ],
          },
        },
      ],
    })
    expect(rings).toHaveLength(1)
    expect(rings[0]).toHaveLength(4)
  })

  it('picks the largest ring and builds leaflet bounds', () => {
    const small: [number, number][] = [
      [10, 60],
      [10.01, 60],
      [10.01, 60.01],
      [10, 60.01],
    ]
    const large: [number, number][] = [
      [10, 60],
      [11, 60],
      [11, 61],
      [10, 61],
    ]
    expect(pickLargestRing([small, large])).toEqual(large)
    expect(boundsFromPositions(large)).toEqual([
      [60, 10],
      [61, 11],
    ])
  })

  it('parses WKT polygons', () => {
    const rings = parseWktPolygon('POLYGON ((10 60, 11 60, 11 61, 10 61, 10 60))')
    expect(rings[0]).toEqual([
      [10, 60],
      [11, 60],
      [11, 61],
      [10, 61],
    ])
  })
})
