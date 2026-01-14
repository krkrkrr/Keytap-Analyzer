import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAudioFeatures } from '../../src/hooks/useAudioFeatures'

describe('useAudioFeatures', () => {
  describe('空のデータ', () => {
    it('should return null for all features when no data provided', () => {
      const { result } = renderHook(() => useAudioFeatures(null, 48000))

      expect(result.current.rms).toBeNull()
      expect(result.current.zcr).toBeNull()
      expect(result.current.energy).toBeNull()
      expect(result.current.spectralCentroid).toBeNull()
      expect(result.current.spectralFlatness).toBeNull()
      expect(result.current.chroma).toBeNull()
      expect(result.current.loudness).toBeNull()
    })

    it('should return null for empty Float32Array', () => {
      const { result } = renderHook(() =>
        useAudioFeatures(new Float32Array(0), 48000)
      )

      expect(result.current.rms).toBeNull()
      expect(result.current.energy).toBeNull()
    })
  })

  describe('有効なデータ', () => {
    it('should calculate features for valid waveform data', () => {
      // Create a simple sine wave
      const sampleRate = 48000
      const frequency = 440 // A4 note
      const duration = 0.1 // 100ms
      const numSamples = Math.floor(sampleRate * duration)
      const waveform = new Float32Array(numSamples)

      for (let i = 0; i < numSamples; i++) {
        waveform[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, sampleRate))

      // RMS should be approximately 0.5 / sqrt(2) ≈ 0.354
      expect(result.current.rms).not.toBeNull()
      expect(result.current.rms).toBeGreaterThan(0)
      expect(result.current.rms).toBeLessThan(1)

      // Energy should be positive
      expect(result.current.energy).not.toBeNull()
      expect(result.current.energy).toBeGreaterThan(0)

      // ZCR should be positive for sine wave
      expect(result.current.zcr).not.toBeNull()
      expect(result.current.zcr).toBeGreaterThan(0)
    })

    it('should calculate spectral features', () => {
      const sampleRate = 48000
      const waveform = new Float32Array(4096)
      
      // Create a simple signal
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * 0.3
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, sampleRate))

      expect(result.current.spectralCentroid).not.toBeNull()
      expect(result.current.spectralFlatness).not.toBeNull()
      expect(result.current.spectralRolloff).not.toBeNull()
      expect(result.current.spectralSpread).not.toBeNull()
    })

    it('should calculate chroma features', () => {
      const sampleRate = 48000
      const waveform = new Float32Array(4096)
      
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, sampleRate))

      expect(result.current.chroma).not.toBeNull()
      expect(result.current.chroma).toHaveLength(12) // 12 chromatic notes
    })

    it('should calculate loudness features', () => {
      const sampleRate = 48000
      const waveform = new Float32Array(4096)
      
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.random() * 0.5
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, sampleRate))

      expect(result.current.loudness).not.toBeNull()
      expect(result.current.loudness?.total).toBeGreaterThan(0)
      expect(result.current.loudness?.specific).toBeInstanceOf(Float32Array)
    })
  })

  describe('エッジケース', () => {
    it('should handle very short waveforms', () => {
      const waveform = new Float32Array(100)
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin(i * 0.1)
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, 48000))

      // Should still calculate some features even with short buffer
      expect(result.current.rms).not.toBeNull()
    })

    it('should handle all-zero waveform', () => {
      const waveform = new Float32Array(2048).fill(0)

      const { result } = renderHook(() => useAudioFeatures(waveform, 48000))

      expect(result.current.rms).toBe(0)
      expect(result.current.energy).toBe(0)
      expect(result.current.zcr).toBe(0)
    })

    it('should handle waveform with single non-zero value', () => {
      const waveform = new Float32Array(2048).fill(0)
      waveform[1024] = 1.0

      const { result } = renderHook(() => useAudioFeatures(waveform, 48000))

      expect(result.current.rms).toBeGreaterThan(0)
      expect(result.current.energy).toBeGreaterThan(0)
    })

    it('should recalculate when waveform changes', () => {
      const waveform1 = new Float32Array(2048).fill(0.5)
      const { result, rerender } = renderHook(
        ({ data, sr }) => useAudioFeatures(data, sr),
        { initialProps: { data: waveform1, sr: 48000 } }
      )

      const firstRms = result.current.rms

      const waveform2 = new Float32Array(2048).fill(0.3)
      rerender({ data: waveform2, sr: 48000 })

      const secondRms = result.current.rms

      expect(firstRms).not.toEqual(secondRms)
    })

    it('should recalculate when sample rate changes', () => {
      const waveform = new Float32Array(2048)
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000)
      }

      const { result, rerender } = renderHook(
        ({ data, sr }) => useAudioFeatures(data, sr),
        { initialProps: { data: waveform, sr: 48000 } }
      )

      const firstCentroid = result.current.spectralCentroid

      rerender({ data: waveform, sr: 44100 })

      const secondCentroid = result.current.spectralCentroid

      // Spectral centroid may change with different sample rate
      expect(firstCentroid).not.toBeNull()
      expect(secondCentroid).not.toBeNull()
    })
  })

  describe('特徴量の範囲', () => {
    it('should have RMS in valid range', () => {
      const waveform = new Float32Array(2048)
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin(i * 0.1) * 0.5
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, 48000))

      expect(result.current.rms).toBeGreaterThanOrEqual(0)
      expect(result.current.rms).toBeLessThanOrEqual(1)
    })

    it('should have spectral flatness in [0, 1] range', () => {
      const waveform = new Float32Array(2048)
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.random() * 0.5
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, 48000))

      if (result.current.spectralFlatness !== null) {
        expect(result.current.spectralFlatness).toBeGreaterThanOrEqual(0)
        expect(result.current.spectralFlatness).toBeLessThanOrEqual(1)
      }
    })

    it('should have ZCR as non-negative', () => {
      const waveform = new Float32Array(2048)
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin(i * 0.1)
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, 48000))

      expect(result.current.zcr).toBeGreaterThanOrEqual(0)
    })

    it('should have spectral centroid within Nyquist frequency', () => {
      const sampleRate = 48000
      const waveform = new Float32Array(2048)
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = Math.sin((2 * Math.PI * 5000 * i) / sampleRate)
      }

      const { result } = renderHook(() => useAudioFeatures(waveform, sampleRate))

      if (result.current.spectralCentroid !== null) {
        expect(result.current.spectralCentroid).toBeGreaterThan(0)
        expect(result.current.spectralCentroid).toBeLessThanOrEqual(sampleRate / 2)
      }
    })
  })
})
