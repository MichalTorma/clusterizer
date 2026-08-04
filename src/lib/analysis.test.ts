import { describe, expect, it } from 'vitest'
import {
  approximatePolygonAreaM2,
  buildClusterPalette,
  contrastTextForHex,
  polygonIsValid,
  trainingEstimateLabel,
} from './analysis'

describe('analysis geometry helpers', () => {
  const square: [number, number][] = [
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
  ]

  it('requires a polygon with three vertices', () => {
    expect(polygonIsValid([])).toBe(false)
    expect(polygonIsValid(square)).toBe(true)
  })

  it('calculates a useful small-area estimate', () => {
    expect(approximatePolygonAreaM2(square)).toBeGreaterThan(1_000_000)
    expect(approximatePolygonAreaM2(square)).toBeLessThan(1_500_000)
  })

  it('turns the estimate into a ten-metre pixel count', () => {
    expect(trainingEstimateLabel(square)).toMatch(/possible 10 m pixels/)
  })
})

describe('cluster palette', () => {
  it('builds one colour per actual cluster', () => {
    expect(buildClusterPalette(0)).toEqual([])
    expect(buildClusterPalette(5)).toHaveLength(5)
    expect(new Set(buildClusterPalette(8)).size).toBe(8)
  })

  it('picks readable label contrast', () => {
    expect(contrastTextForHex('#ffffff')).toBe('#173f32')
    expect(contrastTextForHex('#102018')).toBe('#ffffff')
  })
})
