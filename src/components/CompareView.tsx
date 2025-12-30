import { useEffect, useRef, useMemo, useState } from 'react'
import { MdBarChart } from 'react-icons/md'
import styles from './CompareView.module.css'
import { DEFAULT_SAMPLE_RATE } from '../contexts/AudioContextProvider'

// 波形タイプ
type WaveformType = 'combined' | 'attack' | 'release' | 'recording'

interface MeasurementData {
  id: number
  name: string
  combinedWaveform: Float32Array | null
  attackWaveform: Float32Array | null
  releaseWaveform: Float32Array | null
  recordingData: Float32Array | null
  sampleRate?: number
}

interface CompareViewProps {
  measurements: MeasurementData[]
  onClose?: () => void
  defaultSampleRate?: number
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

// dB変換
function toDB(value: number, minDB: number = -100): number {
  if (value <= 0) return minDB
  const db = 10 * Math.log10(value)
  return Math.max(db, minDB)
}

// 比較用カラーパレット
const COLORS = [
  '#4CAF50', // 緑
  '#2196F3', // 青
  '#FF9800', // オレンジ
  '#E91E63', // ピンク
  '#9C27B0', // 紫
  '#00BCD4', // シアン
]

export function CompareView({ measurements, onClose, defaultSampleRate = DEFAULT_SAMPLE_RATE }: CompareViewProps) {
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null)
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null)
  const [fftSize, setFftSize] = useState(2048)
  const [maxFreq, setMaxFreq] = useState(20000)
  const [freqScale, setFreqScale] = useState<'log' | 'linear'>('log')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [waveformType, setWaveformType] = useState<WaveformType>('combined')

  // 選択した波形タイプに応じてデータを取得
  const getWaveformData = (m: MeasurementData): Float32Array | null => {
    switch (waveformType) {
      case 'combined': return m.combinedWaveform
      case 'attack': return m.attackWaveform
      case 'release': return m.releaseWaveform
      case 'recording': return m.recordingData
      default: return m.combinedWaveform
    }
  }
  
  // 測定データのサンプルレートを取得
  const getSampleRate = (m: MeasurementData): number => {
    return m.sampleRate || defaultSampleRate
  }

  // 選択された測定のデータ（波形・スペクトル共通）
  const selectedData = useMemo(() => {
    return measurements
      .filter(m => selectedIds.includes(m.id) && getWaveformData(m))
      .map((m, index) => ({
        id: m.id,
        name: m.name,
        waveform: getWaveformData(m)!,
        spectrum: computePowerSpectrum(getWaveformData(m)!, fftSize),
        color: COLORS[index % COLORS.length],
        sampleRate: getSampleRate(m),
      }))
  }, [measurements, selectedIds, fftSize, waveformType])
  
  // 選択された測定の代表サンプルレート（最初の選択を使用）
  const selectedSampleRate = useMemo(() => {
    if (selectedData.length === 0) return defaultSampleRate
    return selectedData[0].sampleRate
  }, [selectedData, defaultSampleRate])

  // スペクトル描画
  useEffect(() => {
    const canvas = spectrumCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const margin = { top: 30, right: 20, bottom: 50, left: 70 }
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom

    // クリア
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)

    if (selectedData.length === 0) {
      // 選択がない場合のメッセージ
      ctx.fillStyle = '#666'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('比較する測定を2つ選択してください', width / 2, height / 2)
      return
    }

    // 周波数分解能
    const freqResolution = selectedSampleRate / fftSize
    const maxBin = Math.min(Math.ceil(maxFreq / freqResolution), fftSize / 2)
    const minFreq = 20

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

    // 全スペクトルのdB範囲を計算
    let globalMinDB = 0
    let globalMaxDB = -Infinity
    for (const data of selectedData) {
      for (let i = 0; i < maxBin; i++) {
        const db = toDB(data.spectrum[i])
        if (db > globalMaxDB) globalMaxDB = db
      }
    }
    globalMinDB = -100
    globalMaxDB = Math.max(globalMaxDB, -20)

    // グリッド描画
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1

    // 周波数グリッド（対数スケール用）
    const gridFreqs = freqScale === 'log' 
      ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      : [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]
    
    ctx.beginPath()
    for (const freq of gridFreqs) {
      if (freq <= maxFreq) {
        const x = freqToX(freq)
        ctx.moveTo(x, margin.top)
        ctx.lineTo(x, height - margin.bottom)
      }
    }
    ctx.stroke()

    // dBグリッド
    ctx.beginPath()
    for (let db = -100; db <= 0; db += 20) {
      const y = margin.top + ((globalMaxDB - db) / (globalMaxDB - globalMinDB)) * plotHeight
      ctx.moveTo(margin.left, y)
      ctx.lineTo(width - margin.right, y)
    }
    ctx.stroke()

    // 各スペクトルを描画
    for (const data of selectedData) {
      ctx.strokeStyle = data.color
      ctx.lineWidth = 2
      ctx.beginPath()

      let firstPoint = true
      for (let i = 1; i < maxBin; i++) {
        const freq = i * freqResolution
        if (freq < minFreq && freqScale === 'log') continue
        if (freq > maxFreq) break

        const db = toDB(data.spectrum[i])
        const x = freqToX(freq)
        const y = margin.top + ((globalMaxDB - db) / (globalMaxDB - globalMinDB)) * plotHeight

        if (firstPoint) {
          ctx.moveTo(x, y)
          firstPoint = false
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }

    // 軸ラベル
    ctx.fillStyle = '#888'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'

    // 周波数ラベル
    for (const freq of gridFreqs) {
      if (freq <= maxFreq) {
        const x = freqToX(freq)
        let label: string
        if (freq >= 1000) {
          label = `${freq / 1000}k`
        } else {
          label = `${freq}`
        }
        ctx.fillText(label, x, height - margin.bottom + 20)
      }
    }

    // X軸タイトル
    ctx.fillText('周波数 (Hz)', width / 2, height - 10)

    // dBラベル
    ctx.textAlign = 'right'
    for (let db = -100; db <= 0; db += 20) {
      const y = margin.top + ((globalMaxDB - db) / (globalMaxDB - globalMinDB)) * plotHeight
      ctx.fillText(`${db}`, margin.left - 10, y + 4)
    }

    // Y軸タイトル
    ctx.save()
    ctx.translate(15, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('パワー (dB)', 0, 0)
    ctx.restore()

    // 凡例
    const legendX = width - margin.right - 150
    const legendY = margin.top + 10
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    
    selectedData.forEach((data, index) => {
      const y = legendY + index * 20
      ctx.fillStyle = data.color
      ctx.fillRect(legendX, y - 8, 16, 3)
      ctx.fillStyle = '#ccc'
      ctx.fillText(data.name, legendX + 22, y)
    })

  }, [selectedData, fftSize, maxFreq, freqScale])

  // 波形描画
  useEffect(() => {
    const canvas = waveformCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const margin = { top: 30, right: 20, bottom: 50, left: 70 }
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom

    // クリア
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)

    if (selectedData.length === 0) {
      ctx.fillStyle = '#666'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('比較する測定を2つ選択してください', width / 2, height / 2)
      return
    }

    // 最大サンプル数を取得（最も短い波形に合わせる）
    const maxSamples = Math.min(...selectedData.map(d => d.waveform.length))
    const durationMs = (maxSamples / selectedSampleRate) * 1000

    // 振幅の最大値を計算
    let maxAmplitude = 0
    for (const data of selectedData) {
      for (let i = 0; i < maxSamples; i++) {
        const absValue = Math.abs(data.waveform[i])
        if (absValue > maxAmplitude) maxAmplitude = absValue
      }
    }
    maxAmplitude = Math.max(maxAmplitude, 0.01) // 最小値を設定

    // グリッド描画
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1

    // 時間グリッド
    const timeGridIntervals = durationMs <= 50 ? 5 : durationMs <= 100 ? 10 : durationMs <= 500 ? 50 : 100
    ctx.beginPath()
    for (let t = 0; t <= durationMs; t += timeGridIntervals) {
      const x = margin.left + (t / durationMs) * plotWidth
      ctx.moveTo(x, margin.top)
      ctx.lineTo(x, height - margin.bottom)
    }
    ctx.stroke()

    // 振幅グリッド（中央線含む）
    ctx.beginPath()
    const ampGridValues = [-1, -0.5, 0, 0.5, 1]
    for (const amp of ampGridValues) {
      const y = margin.top + ((1 - amp) / 2) * plotHeight
      ctx.moveTo(margin.left, y)
      ctx.lineTo(width - margin.right, y)
    }
    ctx.stroke()

    // 中央線を強調
    ctx.strokeStyle = '#555'
    ctx.beginPath()
    const centerY = margin.top + plotHeight / 2
    ctx.moveTo(margin.left, centerY)
    ctx.lineTo(width - margin.right, centerY)
    ctx.stroke()

    // 各波形を描画
    for (const data of selectedData) {
      ctx.strokeStyle = data.color
      ctx.lineWidth = 1.5
      ctx.beginPath()

      // サンプル間引き（描画効率化）
      const step = Math.max(1, Math.floor(maxSamples / plotWidth))
      
      for (let i = 0; i < maxSamples; i += step) {
        const x = margin.left + (i / maxSamples) * plotWidth
        const normalizedValue = data.waveform[i] / maxAmplitude
        const y = margin.top + ((1 - normalizedValue) / 2) * plotHeight

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }

    // 軸ラベル
    ctx.fillStyle = '#888'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'

    // 時間ラベル
    for (let t = 0; t <= durationMs; t += timeGridIntervals) {
      const x = margin.left + (t / durationMs) * plotWidth
      ctx.fillText(`${t}`, x, height - margin.bottom + 20)
    }

    // X軸タイトル
    ctx.fillText('時間 (ms)', width / 2, height - 10)

    // 振幅ラベル
    ctx.textAlign = 'right'
    for (const amp of ampGridValues) {
      const y = margin.top + ((1 - amp) / 2) * plotHeight
      ctx.fillText(`${amp.toFixed(1)}`, margin.left - 10, y + 4)
    }

    // Y軸タイトル
    ctx.save()
    ctx.translate(15, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('振幅 (正規化)', 0, 0)
    ctx.restore()

    // 凡例
    const legendX = width - margin.right - 150
    const legendY = margin.top + 10
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'
    
    selectedData.forEach((data, index) => {
      const y = legendY + index * 20
      ctx.fillStyle = data.color
      ctx.fillRect(legendX, y - 8, 16, 3)
      ctx.fillStyle = '#ccc'
      ctx.fillText(data.name, legendX + 22, y)
    })

  }, [selectedData])

  // 測定選択トグル
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id)
      } else {
        // 最大2つまで
        if (prev.length >= 2) {
          return [...prev.slice(1), id]
        }
        return [...prev, id]
      }
    })
  }

  // 選択した波形タイプに対応するデータがある測定のみ表示
  const validMeasurements = measurements.filter(m => getWaveformData(m))

  // 波形タイプのラベル
  const waveformTypeLabels: Record<WaveformType, string> = {
    combined: '合成波形',
    attack: 'アタック音',
    release: 'リリース音',
    recording: '元の録音',
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>波形比較</h3>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className={styles.content}>
        {/* 測定選択リスト */}
        <div className={styles.selectionPanel}>
          <div className={styles.waveformTypeSelector}>
            <label>波形タイプ:</label>
            <select 
              value={waveformType} 
              onChange={(e) => {
                setWaveformType(e.target.value as WaveformType)
                setSelectedIds([]) // 波形タイプ変更時に選択をリセット
              }}
            >
              <option value="combined">合成波形</option>
              <option value="attack">アタック音</option>
              <option value="release">リリース音</option>
              <option value="recording">元の録音</option>
            </select>
          </div>
          <h4>測定を選択 (最大2つ)</h4>
          <div className={styles.measurementList}>
            {validMeasurements.length === 0 ? (
              <p className={styles.emptyMessage}>{waveformTypeLabels[waveformType]}のある測定がありません</p>
            ) : (
              validMeasurements.map((m) => (
                <label 
                  key={m.id} 
                  className={`${styles.measurementItem} ${selectedIds.includes(m.id) ? styles.selected : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(m.id)}
                    onChange={() => toggleSelection(m.id)}
                  />
                  <span 
                    className={styles.colorDot}
                    style={{ 
                      backgroundColor: selectedIds.includes(m.id) 
                        ? COLORS[selectedIds.indexOf(m.id) % COLORS.length] 
                        : '#666' 
                    }}
                  />
                  <span className={styles.measurementName}>{m.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* グラフ表示 */}
        <div className={styles.spectrumPanel}>
          {/* FFTスペクトル表示 */}
          <div className={styles.chartSection}>
            <h4 className={styles.chartTitle}><MdBarChart style={{ verticalAlign: 'middle', marginRight: 4 }} /> FFTスペクトル</h4>
            <div className={styles.controls}>
              <div className={styles.controlItem}>
                <label>FFTサイズ:</label>
                <select 
                  value={fftSize} 
                  onChange={(e) => setFftSize(Number(e.target.value))}
                >
                  <option value={512}>512</option>
                  <option value={1024}>1024</option>
                  <option value={2048}>2048</option>
                  <option value={4096}>4096</option>
                  <option value={8192}>8192</option>
                </select>
              </div>
              <div className={styles.controlItem}>
                <label>最大周波数:</label>
                <select 
                  value={maxFreq} 
                  onChange={(e) => setMaxFreq(Number(e.target.value))}
                >
                  <option value={5000}>5 kHz</option>
                  <option value={10000}>10 kHz</option>
                  <option value={20000}>20 kHz</option>
                </select>
              </div>
              <div className={styles.controlItem}>
                <label>周波数スケール:</label>
                <select 
                  value={freqScale} 
                  onChange={(e) => setFreqScale(e.target.value as 'log' | 'linear')}
                >
                  <option value="log">対数</option>
                  <option value="linear">線形</option>
                </select>
              </div>
            </div>
            <canvas 
              ref={spectrumCanvasRef} 
              width={800} 
              height={350}
              className={styles.canvas}
            />
          </div>

          {/* 波形表示 */}
          <div className={styles.chartSection}>
            <h4 className={styles.chartTitle}>〜 波形</h4>
            <canvas 
              ref={waveformCanvasRef} 
              width={800} 
              height={300}
              className={styles.canvas}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
