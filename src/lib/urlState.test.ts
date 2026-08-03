import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP_VIEW,
  parseMapView,
  parsePolygon,
  readUrlState,
  serializePolygon,
} from './urlState'

describe('urlState', () => {
  it('round-trips polygon coordinates', () => {
    const coordinates: [number, number][] = [
      [13.39513, 52.51739],
      [13.41, 52.52],
      [13.38, 52.51],
    ]
    const encoded = serializePolygon(coordinates)
    expect(encoded).toBe('13.39513,52.51739;13.41,52.52;13.38,52.51')
    expect(parsePolygon(encoded!)).toEqual(coordinates)
  })

  it('ignores malformed polygon pairs', () => {
    expect(parsePolygon('1,2;bad;3,4')).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('parses an explicit map view', () => {
    const params = new URLSearchParams('lat=52.51739&lon=13.39513&z=12.5')
    expect(parseMapView(params)).toEqual({
      center: [52.51739, 13.39513],
      zoom: 12.5,
    })
  })

  it('reads shared state from the query string', () => {
    const state = readUrlState(
      '?lat=52.5&lon=13.4&z=11&poly=13.39,52.51;13.4,52.52;13.38,52.51',
    )
    expect(state.view).toEqual({ center: [52.5, 13.4], zoom: 11 })
    expect(state.coordinates).toHaveLength(3)
    expect(state.fitPolygon).toBe(false)
  })

  it('falls back to the default view and flags polygon fitting', () => {
    const state = readUrlState('?poly=13.39,52.51;13.4,52.52;13.38,52.51')
    expect(state.view).toEqual(DEFAULT_MAP_VIEW)
    expect(state.fitPolygon).toBe(true)
  })
})
