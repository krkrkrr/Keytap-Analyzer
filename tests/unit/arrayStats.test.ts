import { describe, it, expect } from 'vitest'
import {
  arrayMin,
  arrayMax,
  arrayAbsMax,
  arraySum,
  arrayMean,
  arrayRms,
  calculateWaveformStats,
} from '../../src/utils/arrayStats'

describe('arrayStats', () => {
  describe('arrayMin', () => {
    it('should return the minimum value in an array', () => {
      expect(arrayMin([3, 1, 4, 1, 5])).toBe(1)
      expect(arrayMin(new Float32Array([3, 1, 4, 1, 5]))).toBe(1)
    })

    it('should handle negative numbers', () => {
      expect(arrayMin([-5, -1, -10, 0, 3])).toBe(-10)
    })

    it('should return NaN for empty array', () => {
      expect(arrayMin([])).toBeNaN()
    })

    it('should handle large arrays without stack overflow', () => {
      const largeArray = new Float32Array(1000000).fill(1)
      largeArray[500000] = 0.5
      expect(arrayMin(largeArray)).toBe(0.5)
    })
  })

  describe('arrayMax', () => {
    it('should return the maximum value in an array', () => {
      expect(arrayMax([3, 1, 4, 1, 5])).toBe(5)
      expect(arrayMax(new Float32Array([3, 1, 4, 1, 5]))).toBe(5)
    })

    it('should handle negative numbers', () => {
      expect(arrayMax([-5, -1, -10, 0, 3])).toBe(3)
    })

    it('should return NaN for empty array', () => {
      expect(arrayMax([])).toBeNaN()
    })

    it('should handle large arrays without stack overflow', () => {
      const largeArray = new Float32Array(1000000).fill(1)
      largeArray[500000] = 1.5
      expect(arrayMax(largeArray)).toBe(1.5)
    })
  })

  describe('arrayAbsMax', () => {
    it('should return the maximum absolute value', () => {
      expect(arrayAbsMax([3, -5, 4, 1, 2])).toBe(5)
      expect(arrayAbsMax([-1, -2, -3])).toBe(3)
      expect(arrayAbsMax([1, 2, 3])).toBe(3)
    })

    it('should return NaN for empty array', () => {
      expect(arrayAbsMax([])).toBeNaN()
    })
  })

  describe('arraySum', () => {
    it('should return the sum of all elements', () => {
      expect(arraySum([1, 2, 3, 4, 5])).toBe(15)
      expect(arraySum(new Float32Array([1, 2, 3, 4, 5]))).toBe(15)
    })

    it('should handle negative numbers', () => {
      expect(arraySum([-1, 2, -3, 4])).toBe(2)
    })

    it('should return 0 for empty array', () => {
      expect(arraySum([])).toBe(0)
    })
  })

  describe('arrayMean', () => {
    it('should return the mean of all elements', () => {
      expect(arrayMean([1, 2, 3, 4, 5])).toBe(3)
      expect(arrayMean([2, 4, 6])).toBe(4)
    })

    it('should handle negative numbers', () => {
      expect(arrayMean([-2, 0, 2])).toBe(0)
    })

    it('should return NaN for empty array', () => {
      expect(arrayMean([])).toBeNaN()
    })
  })

  describe('arrayRms', () => {
    it('should calculate RMS value correctly', () => {
      const result = arrayRms([1, -1, 2, -2])
      expect(result).toBeCloseTo(Math.sqrt(2.5), 5)
    })

    it('should return 0 for all zeros', () => {
      expect(arrayRms([0, 0, 0, 0])).toBe(0)
    })

    it('should return NaN for empty array', () => {
      expect(arrayRms([])).toBeNaN()
    })

    it('should handle Float32Array', () => {
      const result = arrayRms(new Float32Array([1, 2, 3]))
      expect(result).toBeCloseTo(Math.sqrt(14 / 3), 5)
    })
  })

  describe('calculateWaveformStats', () => {
    it('should calculate all statistics at once', () => {
      const data = [1, -2, 3, -4, 5]
      const stats = calculateWaveformStats(data)

      expect(stats).not.toBeNull()
      expect(stats!.length).toBe(5)
      expect(stats!.min).toBe(-4)
      expect(stats!.max).toBe(5)
      expect(stats!.absMax).toBe(5)
      expect(stats!.mean).toBe(0.6)
      expect(stats!.peakIndex).toBe(4)
    })

    it('should return null for empty array', () => {
      expect(calculateWaveformStats([])).toBeNull()
    })

    it('should handle Float32Array', () => {
      const data = new Float32Array([0.5, -0.5, 1.0])
      const stats = calculateWaveformStats(data)

      expect(stats).not.toBeNull()
      expect(stats!.absMax).toBe(1.0)
      expect(stats!.peakIndex).toBe(2)
    })
  })
})
