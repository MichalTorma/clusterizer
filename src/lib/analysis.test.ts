import { describe, expect, it } from 'vitest'
import {
  approximatePolygonAreaM2,
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
