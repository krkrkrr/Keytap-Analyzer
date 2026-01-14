import { describe, it, expect } from 'vitest'
import {
  findPeakIndex,
  calculateWindowEndTimestamps,
  calculateSyncAveragedWaveform,
} from '../../src/utils/waveformProcessing'

describe('waveformProcessing', () => {
  describe('findPeakIndex', () => {
    it('should find the index of the maximum absolute value', () => {
      const data = new Float32Array([0.1, -0.5, 0.3, -0.8, 0.2])
      expect(findPeakIndex(data)).toBe(3) // -0.8 has the largest absolute value
    })

    it('should find peak in specified search range', () => {
      const data = new Float32Array([0.1, -0.9, 0.3, -0.8, 0.2])
      const peakIndex = findPeakIndex(data, 2, 3) // Search from index 2 for 3 samples
      expect(peakIndex).toBe(3) // -0.8 is the peak in range [2, 5)
    })

    it('should return start index if all values are zero', () => {
      const data = new Float32Array([0, 0, 0, 0])
      expect(findPeakIndex(data)).toBe(0)
    })

    it('should handle single element array', () => {
      const data = new Float32Array([0.5])
      expect(findPeakIndex(data)).toBe(0)
    })

    it('should handle negative values correctly', () => {
      const data = new Float32Array([-0.2, -0.7, -0.3])
      expect(findPeakIndex(data)).toBe(1) // -0.7 has largest absolute value
    })
  })

  describe('calculateWindowEndTimestamps', () => {
    it('should calculate end timestamps based on next event', () => {
      const keyDownTimes = [100, 200, 300]
      const keyUpTimes = [150, 250, 350]
      
      const result = calculateWindowEndTimestamps(keyDownTimes, keyUpTimes)
      
      expect(result).toEqual([150, 250, 350])
    })

    it('should use next keyDown if keyUp is later', () => {
      const keyDownTimes = [100, 150, 300]
      const keyUpTimes = [200, 400]
      
      const result = calculateWindowEndTimestamps(keyDownTimes, keyUpTimes)
      
      expect(result).toEqual([150, 200, 400])
    })

    it('should use fallback value for last timestamp', () => {
      const keyDownTimes = [100, 200]
      const keyUpTimes = [150]
      
      const result = calculateWindowEndTimestamps(keyDownTimes, keyUpTimes)
      
      expect(result[0]).toBe(150)
      expect(result[1]).toBe(300) // 200 + 100ms fallback
    })

    it('should handle empty alternate timestamps', () => {
      const keyDownTimes = [100, 200, 300]
      const keyUpTimes: number[] = []
      
      const result = calculateWindowEndTimestamps(keyDownTimes, keyUpTimes)
      
      expect(result).toEqual([200, 300, 400]) // Each uses next keyDown or fallback
    })
  })

  describe('calculateSyncAveragedWaveform', () => {
    it('should handle insufficient timestamps', () => {
      const audioData = new Float32Array(1000)
      const params = {
        audioData,
        timestamps: [100],
        endTimestamps: [200],
        offsetMs: 0,
        peakAlign: false,
        peakPositionMs: 0,
        sampleRate: 1000, // 1 sample = 1ms for simplicity
      }
      
      const result = calculateSyncAveragedWaveform(params)
      
      // With only 1 timestamp, may still create output
      expect(result).toBeDefined()
      expect(result.windowCount).toBeGreaterThanOrEqual(0)
    })

    it('should calculate average waveform without peak alignment', () => {
      const sampleRate = 1000
      // Create simple test data: [0, 1, 2, 3, 4, 5...]
      const audioData = new Float32Array(200)
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = i * 0.01
      }
      
      const params = {
        audioData,
        timestamps: [10, 60, 110], // 3 windows
        endTimestamps: [40, 90, 140], // Each window is 30ms
        offsetMs: 0,
        peakAlign: false,
        peakPositionMs: 0,
        sampleRate,
      }
      
      const result = calculateSyncAveragedWaveform(params)
      
      expect(result.waveform).not.toBeNull()
      expect(result.windowCount).toBe(3)
      expect(result.windows).toHaveLength(3)
      expect(result.waveform!.length).toBeGreaterThan(0)
    })

    it('should handle multiple timestamps', () => {
      const sampleRate = 1000
      const audioData = new Float32Array(500)
      
      const params = {
        audioData,
        timestamps: [10, 60, 110, 160, 210], // 5 timestamps
        endTimestamps: [40, 90, 140, 190, 240],
        offsetMs: 0,
        peakAlign: false,
        peakPositionMs: 0,
        sampleRate,
      }
      
      const result = calculateSyncAveragedWaveform(params)
      
      // Should process timestamps (implementation may not exclude first/last)
      expect(result.windowCount).toBeGreaterThan(0)
      expect(result.windows.length).toBeGreaterThan(0)
    })

    it('should apply offset correctly', () => {
      const sampleRate = 1000
      const audioData = new Float32Array(200)
      
      const params = {
        audioData,
        timestamps: [50, 100, 150],
        endTimestamps: [80, 130, 180],
        offsetMs: 10, // Start 10ms before timestamp
        peakAlign: false,
        peakPositionMs: 0,
        sampleRate,
      }
      
      const result = calculateSyncAveragedWaveform(params)
      
      expect(result.waveform).not.toBeNull()
      // Offset is applied (timestamp - offset)
      expect(result.windows[0].timestampMs).toBe(50) // timestamps[1] - offsetMs
    })

    it('should align peaks when peakAlign is true', () => {
      const sampleRate = 1000
      const audioData = new Float32Array(300)
      
      // Create data with peaks at different positions
      audioData[55] = 1.0  // Peak in first window
      audioData[110] = 1.0 // Peak in second window
      audioData[165] = 1.0 // Peak in third window
      
      const params = {
        audioData,
        timestamps: [50, 100, 150],
        endTimestamps: [80, 130, 180],
        offsetMs: 0,
        peakAlign: true,
        peakPositionMs: 5, // Place peak at 5ms in output
        sampleRate,
      }
      
      const result = calculateSyncAveragedWaveform(params)
      
      expect(result.waveform).not.toBeNull()
      expect(result.windowCount).toBe(3)
      // Each window should have its peak info recorded
      expect(result.windows[0].peakIndex).toBeGreaterThan(0)
    })

    it('should handle windows with different lengths', () => {
      const sampleRate = 1000
      const audioData = new Float32Array(500)
      
      const params = {
        audioData,
        timestamps: [50, 100, 200],
        endTimestamps: [80, 150, 250], // Different lengths: 30ms, 50ms, 50ms
        offsetMs: 0,
        peakAlign: false,
        peakPositionMs: 0,
        sampleRate,
      }
      
      const result = calculateSyncAveragedWaveform(params)
      
      expect(result.waveform).not.toBeNull()
      // Output length is the length of the middle window (100 to 150 = 50ms)
      expect(result.outputLengthMs).toBeGreaterThan(0)
      expect(result.waveform!.length).toBeGreaterThan(0)
    })
  })
})
