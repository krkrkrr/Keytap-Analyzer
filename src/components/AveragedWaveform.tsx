import { useRef, useEffect, useCallback, useState } from 'react'
import styles from './WaveformCanvas.module.css'
import { DEFAULT_SAMPLE_RATE } from '../contexts/AudioContextProvider'
const MARGIN = { top: 30, right: 20, bottom: 40, left: 50 }

type ScaleType = 'linear' | 'dB'

interface AveragedWaveformProps {
  waveformData: Float32Array | null
  keyTapCount: number
  windowOffsetMs?: number
  peakAlignEnabled?: boolean
  title?: string
  showKeyDownLine?: boolean
  keyDownTimestamps?: number[]
  keyUpTimestamps?: number[]
  sampleRate?: number
}

// リニア値をdBに変換（0を避けるため最小値を設定）
function linearToDb(value: number, minDb: number = -60): number {
  const absValue = Math.abs(value)
  if (absValue < 1e-10) return minDb
  const db = 20 * Math.log10(absValue)
  return Math.max(db, minDb)
}

export function AveragedWaveform({ waveformData, keyTapCount, windowOffsetMs = 5, peakAlignEnabled = false, title = '同期加算平均波形', showKeyDownLine = true, keyDownTimestamps = [], keyUpTimestamps = [], sampleRate = DEFAULT_SAMPLE_RATE }: AveragedWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [scaleType, setScaleType] = useState<ScaleType>('linear')
  
  // 横軸ズーム用の状態
  const [zoomStartMs, setZoomStartMs] = useState<number>(0)
  const [zoomEndMs, setZoomEndMs] = useState<number | null>(null) // nullの場合は全体表示
  const [isZoomed, setIsZoomed] = useState(false)

  const drawEmptyCanvas = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#f0f8ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const plotWidth = canvas.width - MARGIN.left - MARGIN.right
    const plotHeight = canvas.height - MARGIN.top - MARGIN.bottom

    // 中心線を描画
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MARGIN.left, MARGIN.top + plotHeight / 2)
    ctx.lineTo(MARGIN.left + plotWidth, MARGIN.top + plotHeight / 2)
    ctx.stroke()

    // テキストを表示
    ctx.fillStyle = '#999'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      '録音中にキーを押すと同期加算波形が表示されます',
      canvas.width / 2,
      canvas.height / 2 - 10
    )
  }, [])

  const drawWaveform = useCallback((
    canvas: HTMLCanvasElement, 
    ctx: CanvasRenderingContext2D, 
    data: Float32Array, 
    offsetMs: number, 
    isPeakAligned: boolean,
    scale: ScaleType,
    viewStartMs: number = 0,
    viewEndMs: number | null = null
  ) => {
    const plotWidth = canvas.width - MARGIN.left - MARGIN.right
    const plotHeight = canvas.height - MARGIN.top - MARGIN.bottom
    const totalDurationMs = (data.length / sampleRate) * 1000
    
    // ズーム範囲を計算
    const startMs = Math.max(0, viewStartMs)
    const endMs = viewEndMs !== null ? Math.min(viewEndMs, totalDurationMs) : totalDurationMs
    const viewDurationMs = endMs - startMs
    
    // サンプルインデックスの範囲
    const startSample = Math.floor((startMs / 1000) * sampleRate)
    const endSample = Math.ceil((endMs / 1000) * sampleRate)

    // キャンバスをクリア
    ctx.fillStyle = '#f0f8ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // プロット領域の背景
    ctx.fillStyle = '#fff'
    ctx.fillRect(MARGIN.left, MARGIN.top, plotWidth, plotHeight)

    // グリッド線を描画
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 1

    // 横軸グリッド（時間）
    const timeStep = getTimeStep(viewDurationMs)
    for (let t = Math.ceil(startMs / timeStep) * timeStep; t <= endMs; t += timeStep) {
      const x = MARGIN.left + ((t - startMs) / viewDurationMs) * plotWidth
      ctx.beginPath()
      ctx.moveTo(x, MARGIN.top)
      ctx.lineTo(x, MARGIN.top + plotHeight)
      ctx.stroke()
    }

    // 縦軸グリッド
    if (scale === 'linear') {
      // リニアスケール: -1, -0.5, 0, 0.5, 1
      const linearSteps = [-1, -0.5, 0, 0.5, 1]
      for (const v of linearSteps) {
        const y = MARGIN.top + ((1 - v) / 2) * plotHeight
        ctx.beginPath()
        ctx.moveTo(MARGIN.left, y)
        ctx.lineTo(MARGIN.left + plotWidth, y)
        ctx.stroke()
      }
    } else {
      // dBスケール: 上端と下端が0dB、中心が-∞dB
      // 上半分: 0dB → -∞dB（正の振幅）
      // 下半分: -∞dB → 0dB（負の振幅）
      const minDb = -60
      const dbSteps = [0, -10, -20, -30, -40, -50, -60]
      // 上半分（正の振幅）
      for (const db of dbSteps) {
        const normalizedDb = (db - minDb) / (0 - minDb) // 0dB=1, -60dB=0
        const y = MARGIN.top + (1 - normalizedDb) * (plotHeight / 2)
        ctx.beginPath()
        ctx.moveTo(MARGIN.left, y)
        ctx.lineTo(MARGIN.left + plotWidth, y)
        ctx.stroke()
      }
      // 下半分（負の振幅）
      for (const db of dbSteps) {
        if (db === -60) continue // 中心線は上半分で描画済み
        const normalizedDb = (db - minDb) / (0 - minDb)
        const y = MARGIN.top + plotHeight / 2 + normalizedDb * (plotHeight / 2)
        ctx.beginPath()
        ctx.moveTo(MARGIN.left, y)
        ctx.lineTo(MARGIN.left + plotWidth, y)
        ctx.stroke()
      }
    }

    // 軸ラベル
    ctx.fillStyle = '#666'
    ctx.font = '11px sans-serif'

    // 横軸ラベル（時間）
    ctx.textAlign = 'center'
    for (let t = Math.ceil(startMs / timeStep) * timeStep; t <= endMs; t += timeStep) {
      const x = MARGIN.left + ((t - startMs) / viewDurationMs) * plotWidth
      ctx.fillText(`${t.toFixed(0)}`, x, canvas.height - 10)
    }
    ctx.fillText('Time (ms)', MARGIN.left + plotWidth / 2, canvas.height - 2)

    // 縦軸ラベル
    ctx.textAlign = 'right'
    if (scale === 'linear') {
      const linearSteps = [-1, -0.5, 0, 0.5, 1]
      for (const v of linearSteps) {
        const y = MARGIN.top + ((1 - v) / 2) * plotHeight
        ctx.fillText(v.toFixed(1), MARGIN.left - 5, y + 4)
      }
    } else {
      const minDb = -60
      const dbSteps = [0, -10, -20, -30, -40, -50, -60]
      // 上半分（正の振幅）のラベル
      for (const db of dbSteps) {
        const normalizedDb = (db - minDb) / (0 - minDb)
        const y = MARGIN.top + (1 - normalizedDb) * (plotHeight / 2)
        const label = db === -60 ? '-∞' : `${db}`
        ctx.fillText(label, MARGIN.left - 5, y + 4)
      }
      // 下半分（負の振幅）のラベル - 符号を反転して表示
      for (const db of dbSteps) {
        if (db === -60) continue // 中心は上半分で描画済み
        const normalizedDb = (db - minDb) / (0 - minDb)
        const y = MARGIN.top + plotHeight / 2 + normalizedDb * (plotHeight / 2)
        ctx.fillText(`${db}`, MARGIN.left - 5, y + 4)
      }
      // dBラベル
      ctx.save()
      ctx.translate(12, MARGIN.top + plotHeight / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText('dB', 0, 0)
      ctx.restore()
    }

    // ピーク位置またはキーダウン位置のマーカー
    if (isPeakAligned) {
      let peakIndex = 0
      let maxValue = 0
      for (let i = 0; i < data.length; i++) {
        const absValue = Math.abs(data[i])
        if (absValue > maxValue) {
          maxValue = absValue
          peakIndex = i
        }
      }
      const peakTimeMs = (peakIndex / sampleRate) * 1000
      
      // ピークが表示範囲内にある場合のみ描画
      if (peakTimeMs >= startMs && peakTimeMs <= endMs) {
        const peakX = MARGIN.left + ((peakTimeMs - startMs) / viewDurationMs) * plotWidth
        
        ctx.strokeStyle = '#ff6b6b'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(peakX, MARGIN.top)
        ctx.lineTo(peakX, MARGIN.top + plotHeight)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = '#ff6b6b'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Peak', peakX, MARGIN.top - 5)
      }
    } else {
      if (showKeyDownLine) {
        const keyDownTimeMs = offsetMs
        
        // キーダウンが表示範囲内にある場合のみ描画
        if (keyDownTimeMs >= startMs && keyDownTimeMs <= endMs) {
          const triggerX = MARGIN.left + ((keyDownTimeMs - startMs) / viewDurationMs) * plotWidth
          
          ctx.strokeStyle = '#ff6b6b'
          ctx.lineWidth = 2
          ctx.setLineDash([5, 5])
          ctx.beginPath()
          ctx.moveTo(triggerX, MARGIN.top)
          ctx.lineTo(triggerX, MARGIN.top + plotHeight)
          ctx.stroke()
          ctx.setLineDash([])

          ctx.fillStyle = '#ff6b6b'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(`KeyDown`, triggerX, MARGIN.top - 5)
        }
      }
    }

    // キーイベントのタイムスタンプを描画（元録音データ用）
    
    // KeyDownタイムスタンプを描画（青色）
    if (keyDownTimestamps.length > 0) {
      ctx.strokeStyle = '#2196F3'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      
      keyDownTimestamps.forEach((timestamp, _index) => {
        if (timestamp >= startMs && timestamp <= endMs) {
          const x = MARGIN.left + ((timestamp - startMs) / viewDurationMs) * plotWidth
          ctx.beginPath()
          ctx.moveTo(x, MARGIN.top)
          ctx.lineTo(x, MARGIN.top + plotHeight)
          ctx.stroke()
        }
      })
      ctx.setLineDash([])
    }

    // KeyUpタイムスタンプを描画（オレンジ色）
    if (keyUpTimestamps.length > 0) {
      ctx.strokeStyle = '#FF9800'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      
      keyUpTimestamps.forEach((timestamp, _index) => {
        if (timestamp >= startMs && timestamp <= endMs) {
          const x = MARGIN.left + ((timestamp - startMs) / viewDurationMs) * plotWidth
          ctx.beginPath()
          ctx.moveTo(x, MARGIN.top)
          ctx.lineTo(x, MARGIN.top + plotHeight)
          ctx.stroke()
        }
      })
      ctx.setLineDash([])
    }

    // 波形を描画
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 1.5
    ctx.beginPath()

    // 最大振幅を計算（表示範囲のみ）
    let maxAmplitude = 0
    for (let i = startSample; i < Math.min(endSample, data.length); i++) {
      const absValue = Math.abs(data[i])
      if (absValue > maxAmplitude) maxAmplitude = absValue
    }
    const minDb = -60

    // 表示範囲のサンプルのみ描画
    const drawStartSample = Math.max(0, startSample)
    const drawEndSample = Math.min(data.length, endSample)
    let isFirst = true
    
    for (let i = drawStartSample; i < drawEndSample; i++) {
      const sampleTimeMs = (i / sampleRate) * 1000
      const x = MARGIN.left + ((sampleTimeMs - startMs) / viewDurationMs) * plotWidth
      let y: number

      if (scale === 'linear') {
        // リニアスケール（振幅を正規化）
        const normalizedValue = maxAmplitude > 0 ? data[i] / maxAmplitude : data[i]
        y = MARGIN.top + ((1 - normalizedValue) / 2) * plotHeight
      } else {
        // dBスケール: 上端=0dB(+), 中心=-∞dB, 下端=0dB(-)
        const db = linearToDb(data[i], minDb)
        const normalizedDb = (db - minDb) / (0 - minDb) // 0dB=1, -60dB=0
        
        if (data[i] >= 0) {
          // 正の振幅: 上半分（0dBが上端、-∞dBが中心）
          y = MARGIN.top + (1 - normalizedDb) * (plotHeight / 2)
        } else {
          // 負の振幅: 下半分（-∞dBが中心、0dBが下端）
          y = MARGIN.top + plotHeight / 2 + normalizedDb * (plotHeight / 2)
        }
      }

      if (isFirst) {
        ctx.moveTo(x, y)
        isFirst = false
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // キータップ数を表示
    ctx.fillStyle = '#333'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`同期加算: ${keyTapCount}回`, canvas.width - MARGIN.right, MARGIN.top - 5)
    
    // ズーム情報を表示
    if (viewStartMs > 0 || viewEndMs !== null) {
      ctx.fillStyle = '#666'
      ctx.textAlign = 'left'
      ctx.fillText(`表示範囲: ${startMs.toFixed(0)}-${endMs.toFixed(0)}ms`, MARGIN.left, MARGIN.top - 5)
    }
  }, [keyTapCount, showKeyDownLine, keyDownTimestamps, keyUpTimestamps, sampleRate])

  // 時間軸の目盛り間隔を計算
  function getTimeStep(durationMs: number): number {
    if (durationMs <= 50) return 10
    if (durationMs <= 100) return 20
    if (durationMs <= 200) return 50
    if (durationMs <= 500) return 100
    if (durationMs <= 1000) return 200
    return 500
  }

  // 波形を再生する関数
  const playWaveform = useCallback(() => {
    if (!waveformData || waveformData.length === 0) return

    // 既に再生中なら停止
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop()
      sourceNodeRef.current = null
    }

    // AudioContextを作成（または再利用）
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }

    const audioContext = audioContextRef.current

    // AudioContextがsuspendedなら再開
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    // AudioBufferを作成
    const audioBuffer = audioContext.createBuffer(1, waveformData.length, sampleRate)
    const channelData = audioBuffer.getChannelData(0)
    
    // 波形データをコピー（音量を調整）
    let maxAmplitude = 0
    for (let i = 0; i < waveformData.length; i++) {
      const absValue = Math.abs(waveformData[i])
      if (absValue > maxAmplitude) maxAmplitude = absValue
    }
    const gain = maxAmplitude > 0 ? 0.8 / maxAmplitude : 1
    for (let i = 0; i < waveformData.length; i++) {
      channelData[i] = waveformData[i] * gain
    }

    // AudioBufferSourceNodeを作成して再生
    const sourceNode = audioContext.createBufferSource()
    sourceNode.buffer = audioBuffer
    sourceNode.connect(audioContext.destination)
    
    sourceNode.onended = () => {
      setIsPlaying(false)
      sourceNodeRef.current = null
    }

    sourceNodeRef.current = sourceNode
    setIsPlaying(true)
    sourceNode.start()
  }, [waveformData])

  // 再生停止
  const stopWaveform = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop()
      sourceNodeRef.current = null
      setIsPlaying(false)
    }
  }, [])

  // コンポーネントのクリーンアップ
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    if (waveformData && waveformData.length > 0) {
      drawWaveform(canvas, ctx, waveformData, windowOffsetMs, peakAlignEnabled, scaleType, zoomStartMs, isZoomed ? zoomEndMs : null)
    } else {
      drawEmptyCanvas(canvas, ctx)
    }
  }, [waveformData, windowOffsetMs, peakAlignEnabled, scaleType, zoomStartMs, zoomEndMs, isZoomed, drawEmptyCanvas, drawWaveform])

  useEffect(() => {
    setupCanvas()
  }, [setupCanvas])

  useEffect(() => {
    const handleResize = () => {
      setupCanvas()
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [setupCanvas])

  // 波形の全体時間
  const totalDurationMs = waveformData ? (waveformData.length / sampleRate) * 1000 : 0

  // ズームリセット
  const resetZoom = useCallback(() => {
    setZoomStartMs(0)
    setZoomEndMs(null)
    setIsZoomed(false)
  }, [])

  // ズーム適用
  const applyZoom = useCallback(() => {
    if (zoomEndMs !== null && zoomEndMs > zoomStartMs) {
      setIsZoomed(true)
    }
  }, [zoomStartMs, zoomEndMs])

  return (
    <div className={styles.canvasContainer}>
      <div className={styles.canvasHeader}>
        <h3 style={{ margin: 0, color: '#4CAF50' }}>📊 {title}</h3>
        <div className={styles.headerControls}>
          <div className={styles.scaleToggle}>
            <span className={styles.scaleLabel}>縦軸:</span>
            <button
              className={`${styles.scaleButton} ${scaleType === 'linear' ? styles.scaleButtonActive : ''}`}
              onClick={() => setScaleType('linear')}
            >
              Linear
            </button>
            <button
              className={`${styles.scaleButton} ${scaleType === 'dB' ? styles.scaleButtonActive : ''}`}
              onClick={() => setScaleType('dB')}
            >
              dB
            </button>
          </div>
          {waveformData && waveformData.length > 0 && (
            <button 
              onClick={isPlaying ? stopWaveform : playWaveform}
              className={styles.playButton}
              title={isPlaying ? '停止' : '再生'}
            >
              {isPlaying ? '⏹️ 停止' : '▶️ 再生'}
            </button>
          )}
        </div>
      </div>
      
      {/* ズームコントロール */}
      {waveformData && waveformData.length > 0 && (
        <div className={styles.zoomControls}>
          <span className={styles.zoomLabel}>横軸ズーム:</span>
          <input
            type="number"
            value={zoomStartMs}
            onChange={(e) => setZoomStartMs(Math.max(0, Number(e.target.value)))}
            min={0}
            max={totalDurationMs}
            step={1}
            className={styles.zoomInput}
            title="開始時間 (ms)"
          />
          <span>-</span>
          <input
            type="number"
            value={zoomEndMs ?? totalDurationMs}
            onChange={(e) => setZoomEndMs(Math.min(totalDurationMs, Number(e.target.value)))}
            min={0}
            max={totalDurationMs}
            step={1}
            className={styles.zoomInput}
            title="終了時間 (ms)"
          />
          <span>ms</span>
          <button
            onClick={applyZoom}
            className={styles.zoomButton}
            title="ズーム適用"
          >
            🔍 適用
          </button>
          {isZoomed && (
            <button
              onClick={resetZoom}
              className={styles.zoomButton}
              title="全体表示に戻す"
            >
              ↩️ リセット
            </button>
          )}
        </div>
      )}
      
      <canvas ref={canvasRef} className={styles.waveformCanvas} />
    </div>
  )
}
