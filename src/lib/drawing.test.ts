import { describe, expect, it } from 'vitest'
import { rectangleFromCorners, rectangleIsValid } from './drawing'

describe('drawing helpers', () => {
  it('builds a clockwise rectangle from two corners', () => {
    expect(rectangleFromCorners([10, 60], [11, 61])).toEqual([
      [10, 60],
      [11, 60],
      [11, 61],
      [10, 61],
    ])
  })

  it('rejects degenerate rectangles', () => {
    expect(rectangleIsValid([10, 60], [10, 60])).toBe(false)
    expect(rectangleIsValid([10, 60], [10.01, 60.01])).toBe(true)
  })
})
