import { useEffect, useRef, useMemo, useState } from 'react'
import styles from './SpectrumDisplay.module.css'

const SAMPLE_RATE = 48000

interface SpectrumDisplayProps {
  waveformData: Float32Array | null
  title?: string
}

// FFT実装（Cooley-Tukey algorithm）
function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length
  if (n <= 1) return

  // ビットリバース並び替え
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]]
    }
    let k = n >> 1
    while (k <= j) {
      j -= k
      k >>= 1
    }
    j += k
  }

  // バタフライ演算
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1
    const angle = -2 * Math.PI / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const theta = angle * k
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        const idx1 = i + k
        const idx2 = i + k + halfLen
        const tReal = real[idx2] * cos - imag[idx2] * sin
        const tImag = real[idx2] * sin + imag[idx2] * cos
        real[idx2] = real[idx1] - tReal
        imag[idx2] = imag[idx1] - tImag
        real[idx1] += tReal
        imag[idx1] += tImag
      }
    }
  }
}

// 2のべき乗に切り上げ
function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

// ハニング窓
function hanningWindow(data: Float32Array): Float32Array {
  const n = data.length
  const windowed = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const multiplier = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)))
    windowed[i] = data[i] * multiplier
  }
  return windowed
}

// パワースペクトル計算
function computePowerSpectrum(data: Float32Array, fftSize: number): Float64Array {
  const paddedSize = Math.max(fftSize, nextPowerOf2(data.length))
  const real = new Float64Array(paddedSize)
  const imag = new Float64Array(paddedSize)

  // 窓関数適用
  const windowed = hanningWindow(data)
  for (let i = 0; i < windowed.length; i++) {
    real[i] = windowed[i]
  }

  fft(real, imag)

  // パワースペクトル（片側）
  const spectrum = new Float64Array(paddedSize / 2)
  for (let i = 0; i < spectrum.length; i++) {
    spectrum[i] = (real[i] * real[i] + imag[i] * imag[i]) / paddedSize
  }

  return spectrum
}

// STFT（短時間フーリエ変換）でスペクトログラム計算
function computeSpectrogram(
  data: Float32Array,
  fftSize: number,
  hopSize: number
): { spectrogram: Float64Array[]; timeSteps: number; freqBins: number } {
  const frames: Float64Array[] = []
  const freqBins = fftSize / 2

  for (let start = 0; start + fftSize <= data.length; start += hopSize) {
    const frame = data.slice(start, start + fftSize)
    const spectrum = computePowerSpectrum(frame, fftSize)
    frames.push(spectrum)
  }

  return {
    spectrogram: frames,
    timeSteps: frames.length,
    freqBins,
  }
}

// dB変換
function toDB(value: number, minDB: number = -100): number {
  if (value <= 0) return minDB
  const db = 10 * Math.log10(value)
  return Math.max(db, minDB)
}

// カラーマップ（Viridis風）
function getColor(value: number, min: number, max: number): string {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)))
  
  // Viridis-like colormap
  const r = Math.round(68 + normalized * (253 - 68))
  const g = Math.round(1 + normalized * (231 - 1) * Math.sin(normalized * Math.PI * 0.9))
  const b = Math.round(84 + (1 - normalized) * (150))
  
  return `rgb(${r}, ${g}, ${b})`
}

export function SpectrumDisplay({ waveformData, title = 'FFT解析' }: SpectrumDisplayProps) {
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null)
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null)
  const [fftSize, setFftSize] = useState(2048)
  const [maxFreq, setMaxFreq] = useState(20000)
  const [freqScale, setFreqScale] = useState<'log' | 'linear'>('log')

  // パワースペクトル計算
  const powerSpectrum = useMemo(() => {
    if (!waveformData || waveformData.length === 0) return null
    return computePowerSpectrum(waveformData, fftSize)
  }, [waveformData, fftSize])

  // スペクトログラム計算
  const spectrogramData = useMemo(() => {
    if (!waveformData || waveformData.length === 0) return null
    const hopSize = fftSize / 4
    return computeSpectrogram(waveformData, fftSize, hopSize)
  }, [waveformData, fftSize])

  // パワースペクトル描画
  useEffect(() => {
    const canvas = spectrumCanvasRef.current
    if (!canvas || !powerSpectrum) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const margin = { top: 20, right: 20, bottom: 40, left: 60 }
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom

    // クリア
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)

    // 周波数分解能
    const freqResolution = SAMPLE_RATE / (powerSpectrum.length * 2)
    const maxBin = Math.min(Math.ceil(maxFreq / freqResolution), powerSpectrum.length)
    const minFreq = 20 // 対数スケールの最小周波数 (20Hz)

    // スケール変換関数
    const freqToX = (freq: number): number => {
      if (freqScale === 'log') {
        if (freq <= minFreq) return margin.left
        const logMin = Math.log10(minFreq)
        const logMax = Math.log10(maxFreq)
        const logFreq = Math.log10(freq)
        return margin.left + ((logFreq - logMin) / (logMax - logMin)) * plotWidth
      } else {
        return margin.left + (freq / maxFreq) * plotWidth
      }
    }

    // dB変換してmin/max取得
    let maxDBValue = -Infinity
    for (let i = 0; i < maxBin; i++) {
      const db = toDB(powerSpectrum[i])
      if (db > maxDBValue) maxDBValue = db
    }
    const minDB = -100
    const maxDB = Math.max(maxDBValue, -20)

    // グリッド描画
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1

    // 周波数グリッド
    const freqStepsLog = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    const freqStepsLinear = [1000, 2000, 5000, 10000, 15000, 20000]
    const freqSteps = freqScale === 'log' ? freqStepsLog : freqStepsLinear
    ctx.font = '11px monospace'
    ctx.fillStyle = '#888'
    ctx.textAlign = 'center'
    
    for (const freq of freqSteps) {
      if (freq > maxFreq) continue
      if (freqScale === 'log' && freq < minFreq) continue
      const x = freqToX(freq)
      ctx.beginPath()
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, margin.top + plotHeight)
      ctx.stroke()
      ctx.fillText(`${freq >= 1000 ? freq / 1000 + 'k' : freq}`, x, height - 10)
    }

    // dBグリッド
    ctx.textAlign = 'right'
    for (let db = -100; db <= 0; db += 20) {
      if (db < minDB) continue
      const y = margin.top + plotHeight - ((db - minDB) / (maxDB - minDB)) * plotHeight
      ctx.beginPath()
      ctx.moveTo(margin.left, y)
      ctx.lineTo(margin.left + plotWidth, y)
      ctx.stroke()
      ctx.fillText(`${db} dB`, margin.left - 5, y + 4)
    }

    // スペクトル描画
    ctx.strokeStyle = '#00ff88'
    ctx.lineWidth = 1.5
    ctx.beginPath()

    let isFirstPoint = true
    const startBin = freqScale === 'log' ? 1 : 0 // 対数の場合はDC成分スキップ
    for (let i = startBin; i < maxBin; i++) {
      const freq = i * freqResolution
      if (freqScale === 'log' && freq < minFreq) continue
      
      const x = freqToX(freq)
      const db = toDB(powerSpectrum[i])
      const y = margin.top + plotHeight - ((db - minDB) / (maxDB - minDB)) * plotHeight

      if (isFirstPoint) {
        ctx.moveTo(x, y)
        isFirstPoint = false
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // 軸ラベル
    ctx.fillStyle = '#ccc'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`周波数 (Hz) - ${freqScale === 'log' ? '対数' : '線形'}スケール`, margin.left + plotWidth / 2, height - 5)
    
    ctx.save()
    ctx.translate(15, margin.top + plotHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('パワー (dB)', 0, 0)
    ctx.restore()

  }, [powerSpectrum, maxFreq, freqScale])

  // スペクトログラム描画
  useEffect(() => {
    const canvas = spectrogramCanvasRef.current
    if (!canvas || !spectrogramData || !waveformData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const margin = { top: 20, right: 70, bottom: 40, left: 60 }
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom

    // クリア
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)

    const { spectrogram, timeSteps, freqBins } = spectrogramData
    if (timeSteps === 0) return

    // 周波数分解能
    const freqResolution = SAMPLE_RATE / (freqBins * 2)
    const maxBin = Math.min(Math.ceil(maxFreq / freqResolution), freqBins)

    // dB変換してmin/max取得
    let minDB = -100
    let maxDB = -100
    for (const frame of spectrogram) {
      for (let i = 0; i < maxBin; i++) {
        const db = toDB(frame[i])
        if (db > maxDB) maxDB = db
      }
    }
    maxDB = Math.max(maxDB, -20)

    // スペクトログラム描画
    const cellWidth = plotWidth / timeSteps
    const cellHeight = plotHeight / maxBin

    for (let t = 0; t < timeSteps; t++) {
      for (let f = 0; f < maxBin; f++) {
        const db = toDB(spectrogram[t][f])
        const color = getColor(db, minDB, maxDB)
        ctx.fillStyle = color
        const x = margin.left + t * cellWidth
        const y = margin.top + plotHeight - (f + 1) * cellHeight
        ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1)
      }
    }

    // グリッド描画
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1

    // 時間グリッド
    const totalDuration = waveformData.length / SAMPLE_RATE * 1000
    const timeStepMs = 10
    ctx.font = '11px monospace'
    ctx.fillStyle = '#888'
    ctx.textAlign = 'center'

    for (let ms = 0; ms <= totalDuration; ms += timeStepMs) {
      const x = margin.left + (ms / totalDuration) * plotWidth
      ctx.beginPath()
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, margin.top + plotHeight)
      ctx.stroke()
      if (ms % 20 === 0) {
        ctx.fillText(`${ms}`, x, height - 10)
      }
    }

    // 周波数グリッド
    const freqSteps = [1000, 2000, 5000, 10000]
    ctx.textAlign = 'right'
    for (const freq of freqSteps) {
      if (freq > maxFreq) continue
      const y = margin.top + plotHeight - (freq / maxFreq) * plotHeight
      ctx.beginPath()
      ctx.moveTo(margin.left, y)
      ctx.lineTo(margin.left + plotWidth, y)
      ctx.stroke()
      ctx.fillText(`${freq >= 1000 ? freq / 1000 + 'k' : freq}`, margin.left - 5, y + 4)
    }

    // 軸ラベル
    ctx.fillStyle = '#ccc'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('時間 (ms)', margin.left + plotWidth / 2, height - 5)

    ctx.save()
    ctx.translate(15, margin.top + plotHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('周波数 (Hz)', 0, 0)
    ctx.restore()

    // カラーバー
    const barWidth = 15
    const barX = width - margin.right + 20
    const barHeight = plotHeight

    for (let i = 0; i < barHeight; i++) {
      const db = minDB + (1 - i / barHeight) * (maxDB - minDB)
      ctx.fillStyle = getColor(db, minDB, maxDB)
      ctx.fillRect(barX, margin.top + i, barWidth, 1)
    }

    ctx.strokeStyle = '#888'
    ctx.strokeRect(barX, margin.top, barWidth, barHeight)

    // カラーバーラベル
    ctx.fillStyle = '#888'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${maxDB.toFixed(0)}dB`, barX + barWidth + 3, margin.top + 10)
    ctx.fillText(`${minDB.toFixed(0)}dB`, barX + barWidth + 3, margin.top + barHeight)

  }, [spectrogramData, waveformData, maxFreq])

  if (!waveformData) return null

  return (
    <div className={styles.container}>
      <h3>{title}</h3>
      
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label htmlFor="fftSize">FFTサイズ:</label>
          <select
            id="fftSize"
            value={fftSize}
            onChange={(e) => setFftSize(Number(e.target.value))}
            className={styles.select}
          >
            <option value={512}>512</option>
            <option value={1024}>1024</option>
            <option value={2048}>2048</option>
            <option value={4096}>4096</option>
            <option value={8192}>8192</option>
          </select>
          <span className={styles.hint}>
            (分解能: {(SAMPLE_RATE / fftSize).toFixed(1)} Hz)
          </span>
        </div>
        
        <div className={styles.controlGroup}>
          <label htmlFor="maxFreq">最大周波数:</label>
          <select
            id="maxFreq"
            value={maxFreq}
            onChange={(e) => setMaxFreq(Number(e.target.value))}
            className={styles.select}
          >
            <option value={5000}>5 kHz</option>
            <option value={10000}>10 kHz</option>
            <option value={15000}>15 kHz</option>
            <option value={20000}>20 kHz</option>
            <option value={24000}>24 kHz</option>
          </select>
        </div>

        <div className={styles.controlGroup}>
          <label htmlFor="freqScale">周波数軸:</label>
          <select
            id="freqScale"
            value={freqScale}
            onChange={(e) => setFreqScale(e.target.value as 'log' | 'linear')}
            className={styles.select}
          >
            <option value="log">対数</option>
            <option value="linear">線形</option>
          </select>
        </div>
      </div>

      <div className={styles.section}>
        <h4>パワースペクトル</h4>
        <canvas
          ref={spectrumCanvasRef}
          width={800}
          height={300}
          className={styles.canvas}
        />
      </div>

      <div className={styles.section}>
        <h4>スペクトログラム</h4>
        <canvas
          ref={spectrogramCanvasRef}
          width={800}
          height={350}
          className={styles.canvas}
        />
      </div>
    </div>
  )
}
