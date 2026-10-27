import { describe, expect, it } from 'vitest'
import { brushDiameterPx } from './brush'

describe('brushDiameterPx', () => {
  it('turns a radius fraction into the on-screen circle', () => {
    expect(brushDiameterPx(0.04, 500)).toBe(40)
  })

  it('keeps a tiny brush visible', () => {
    expect(brushDiameterPx(0.001, 100)).toBe(8)
  })

  it('uses the minimum when the surface has not been measured', () => {
    expect(brushDiameterPx(0.04, 0)).toBe(8)
  })
})
