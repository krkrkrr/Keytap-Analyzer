import { describe, it, expect } from 'vitest'
import { encodeWav, decodeWav } from '../../src/utils/audioExport'

describe('audioExport', () => {
  describe('encodeWav', () => {
    it('should encode Float32Array to WAV format', () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
      const sampleRate = 48000
      
      const buffer = encodeWav(samples, sampleRate)
      
      expect(buffer).toBeInstanceOf(ArrayBuffer)
      expect(buffer.byteLength).toBeGreaterThan(44) // WAV header + data
    })

    it('should create valid WAV header', () => {
      const samples = new Float32Array([0, 0.5, -0.5])
      const buffer = encodeWav(samples, 48000)
      const view = new DataView(buffer)
      
      // Check RIFF header
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      )
      expect(riff).toBe('RIFF')
      
      // Check WAVE header
      const wave = String.fromCharCode(
        view.getUint8(8),
        view.getUint8(9),
        view.getUint8(10),
        view.getUint8(11)
      )
      expect(wave).toBe('WAVE')
      
      // Check sample rate
      expect(view.getUint32(24, true)).toBe(48000)
    })

    it('should clamp values to [-1, 1]', () => {
      const samples = new Float32Array([2, -2, 0.5])
      const buffer = encodeWav(samples, 48000)
      
      // Should not throw and should create valid buffer
      expect(buffer.byteLength).toBe(44 + samples.length * 2)
    })

    it('should handle empty samples', () => {
      const samples = new Float32Array(0)
      const buffer = encodeWav(samples, 48000)
      
      expect(buffer.byteLength).toBe(44) // Just header
    })

    it('should convert samples to 16-bit PCM', () => {
      const samples = new Float32Array([1.0, -1.0, 0])
      const buffer = encodeWav(samples, 48000)
      const view = new DataView(buffer)
      
      // Check bits per sample in header
      expect(view.getUint16(34, true)).toBe(16)
      
      // Check first sample (1.0 should be 32767)
      const firstSample = view.getInt16(44, true)
      expect(firstSample).toBe(32767)
      
      // Check second sample (-1.0 should be -32768)
      const secondSample = view.getInt16(46, true)
      expect(secondSample).toBe(-32768)
    })
  })

  describe('decodeWav', () => {
    it('should decode WAV buffer to Float32Array', () => {
      // First encode, then decode
      const originalSamples = new Float32Array([0, 0.5, -0.5, 0.25])
      const sampleRate = 48000
      const buffer = encodeWav(originalSamples, sampleRate)
      
      const result = decodeWav(buffer)
      
      expect(result).not.toBeNull()
      expect(result!.samples).toBeInstanceOf(Float32Array)
      expect(result!.sampleRate).toBe(sampleRate)
      expect(result!.samples.length).toBe(originalSamples.length)
    })

    it('should restore values close to original', () => {
      const originalSamples = new Float32Array([0, 0.5, -0.5, 1, -1])
      const buffer = encodeWav(originalSamples, 48000)
      const result = decodeWav(buffer)
      
      expect(result).not.toBeNull()
      
      // Check values are close (some precision loss due to 16-bit encoding)
      for (let i = 0; i < originalSamples.length; i++) {
        expect(result!.samples[i]).toBeCloseTo(originalSamples[i], 4)
      }
    })

    it('should return null for invalid RIFF header', () => {
      const invalidBuffer = new ArrayBuffer(100)
      const view = new DataView(invalidBuffer)
      // Write invalid header
      view.setUint32(0, 0x12345678)
      
      const result = decodeWav(invalidBuffer)
      
      expect(result).toBeNull()
    })

    it('should return null for invalid WAVE header', () => {
      const invalidBuffer = new ArrayBuffer(100)
      const view = new DataView(invalidBuffer)
      // Write RIFF but invalid WAVE
      view.setUint32(0, 0x46464952) // 'RIFF'
      view.setUint32(8, 0x12345678) // Invalid WAVE
      
      const result = decodeWav(invalidBuffer)
      
      expect(result).toBeNull()
    })

    it('should handle different sample rates', () => {
      const samples = new Float32Array([0.1, 0.2, 0.3])
      const sampleRate = 44100
      const buffer = encodeWav(samples, sampleRate)
      
      const result = decodeWav(buffer)
      
      expect(result).not.toBeNull()
      expect(result!.sampleRate).toBe(sampleRate)
    })

    it('should round-trip encode/decode correctly', () => {
      const testCases = [
        new Float32Array([0]),
        new Float32Array([0, 0.5, -0.5]),
        new Float32Array([1, -1, 0.25, -0.25]),
        new Float32Array(100).map((_, i) => Math.sin(i * 0.1)),
      ]
      
      for (const samples of testCases) {
        const buffer = encodeWav(samples, 48000)
        const result = decodeWav(buffer)
        
        expect(result).not.toBeNull()
        expect(result!.samples.length).toBe(samples.length)
        
        for (let i = 0; i < samples.length; i++) {
          expect(result!.samples[i]).toBeCloseTo(samples[i], 4)
        }
      }
    })
  })
})
