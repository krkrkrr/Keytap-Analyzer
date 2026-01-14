import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Cleanup after each test case
afterEach(() => {
  cleanup()
})

// Mock Web Audio API
global.AudioContext = vi.fn().mockImplementation(() => ({
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 2048,
    frequencyBinCount: 1024,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn(),
    getByteFrequencyData: vi.fn(),
  }),
  createGain: vi.fn().mockReturnValue({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  createMediaStreamSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  createScriptProcessor: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  }),
  createBufferSource: vi.fn().mockReturnValue({
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }),
  createBuffer: vi.fn(),
  decodeAudioData: vi.fn(),
  sampleRate: 48000,
  destination: {},
  state: 'running',
  close: vi.fn(),
  resume: vi.fn(),
  suspend: vi.fn(),
})) as any

// Mock MediaStream
class MockMediaStream {
  getTracks = vi.fn().mockReturnValue([])
  getAudioTracks = vi.fn().mockReturnValue([])
  getVideoTracks = vi.fn().mockReturnValue([])
  addTrack = vi.fn()
  removeTrack = vi.fn()
  active = true
}

global.MediaStream = MockMediaStream as any

// Mock navigator.mediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
    enumerateDevices: vi.fn().mockResolvedValue([]),
  },
})

// Mock HTMLMediaElement
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load = vi.fn()

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  callback(0)
  return 0
})

global.cancelAnimationFrame = vi.fn()
