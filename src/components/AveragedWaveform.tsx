import { useRef, useEffect, useCallback, useState } from 'react'
import styles from './WaveformCanvas.module.css'

const SAMPLE_RATE = 44100

interface AveragedWaveformProps {
  waveformData: Float32Array | null
  keyTapCount: number
  windowOffsetMs?: number
  peakAlignEnabled?: boolean
}

export function AveragedWaveform({ waveformData, keyTapCount, windowOffsetMs = 5, peakAlignEnabled = false }: AveragedWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const drawEmptyCanvas = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#f0f8ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 中心線を描画
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
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

  const drawWaveform = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, data: Float32Array, offsetMs: number, isPeakAligned: boolean) => {
    // キャンバスをクリア
    ctx.fillStyle = '#f0f8ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 中心線を描画（背景として先に描画）
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()

    if (isPeakAligned) {
      // ピーク同期モード：ピーク位置を検出して表示
      let peakIndex = 0
      let maxValue = 0
      for (let i = 0; i < data.length; i++) {
        const absValue = Math.abs(data[i])
        if (absValue > maxValue) {
          maxValue = absValue
          peakIndex = i
        }
      }
      const peakX = (peakIndex / data.length) * canvas.width
      
      ctx.strokeStyle = '#ff6b6b'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(peakX, 0)
      ctx.lineTo(peakX, canvas.height)
      ctx.stroke()
      ctx.setLineDash([])

      // ピークラベル
      ctx.fillStyle = '#ff6b6b'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Peak (同期基準)', peakX, 15)
    } else {
      // 従来モード：キーダウン位置を表示
      const sampleRate = 44100
      const windowOffsetSamples = Math.floor((offsetMs / 1000) * sampleRate)
      const triggerX = (windowOffsetSamples / data.length) * canvas.width
      
      ctx.strokeStyle = '#ff6b6b'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(triggerX, 0)
      ctx.lineTo(triggerX, canvas.height)
      ctx.stroke()
      ctx.setLineDash([])

      // トリガーラベル
      ctx.fillStyle = '#ff6b6b'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`KeyDown (-${offsetMs}ms)`, triggerX + 40, 15)
    }

    // 波形を描画
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 2
    ctx.beginPath()

    const sliceWidth = canvas.width / data.length
    let x = 0

    // 波形の振幅を調整（見やすくするため）
    const maxAmplitude = Math.max(...Array.from(data).map(Math.abs))
    const scale = maxAmplitude > 0 ? 0.8 / maxAmplitude : 1

    for (let i = 0; i < data.length; i++) {
      const normalizedValue = data[i] * scale
      const y = ((normalizedValue + 1) * canvas.height) / 2

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }

      x += sliceWidth
    }

    ctx.stroke()

    // キータップ数を表示
    ctx.fillStyle = '#333'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`同期加算回数: ${keyTapCount}`, canvas.width - 10, 20)
  }, [keyTapCount])

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
    const audioBuffer = audioContext.createBuffer(1, waveformData.length, SAMPLE_RATE)
    const channelData = audioBuffer.getChannelData(0)
    
    // 波形データをコピー（音量を調整）
    const maxAmplitude = Math.max(...Array.from(waveformData).map(Math.abs))
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
      drawWaveform(canvas, ctx, waveformData, windowOffsetMs, peakAlignEnabled)
    } else {
      drawEmptyCanvas(canvas, ctx)
    }
  }, [waveformData, windowOffsetMs, peakAlignEnabled, drawEmptyCanvas, drawWaveform])

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

  return (
    <div className={styles.canvasContainer}>
      <div className={styles.canvasHeader}>
        <h3 style={{ margin: 0, color: '#4CAF50' }}>📊 同期加算平均波形</h3>
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
      <canvas ref={canvasRef} className={styles.waveformCanvas} />
    </div>
  )
}
