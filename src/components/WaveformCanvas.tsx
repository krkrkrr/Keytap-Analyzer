import { useRef, useEffect, useCallback, useState } from 'react'
import styles from './WaveformCanvas.module.css'

interface WaveformCanvasProps {
  recordingData: Float32Array | null
  isRecording?: boolean
  progress?: number // 0-1の録音進捗
}

export function WaveformCanvas({ recordingData, isRecording = false, progress = 1 }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const drawEmptyCanvas = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#fafafa'
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
      '録音ボタンを押すと音声波形が表示されます',
      canvas.width / 2,
      canvas.height / 2 - 10
    )
  }, [])

  const drawWaveform = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, data: Float32Array, currentProgress: number) => {
    // キャンバスをクリア
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 中心線を描画（背景として先に描画）
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()

    // 波形を描画
    // 録音中は進捗に応じた幅で描画、完了後は全体を使用
    const drawWidth = canvas.width * currentProgress
    const sliceWidth = drawWidth / data.length
    
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 2
    ctx.beginPath()

    let x = 0

    for (let i = 0; i < data.length; i++) {
      const y = ((data[i] + 1) * canvas.height) / 2

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }

      x += sliceWidth
    }

    ctx.stroke()
  }, [])

  // 波形を再生する関数
  const playWaveform = useCallback(async () => {
    if (!recordingData || recordingData.length === 0) {
      console.log('再生データがありません')
      return
    }

    console.log('再生開始:', recordingData.length, 'サンプル')

    // 既に再生中なら停止
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop()
      } catch (e) {
        // already stopped
      }
      sourceNodeRef.current = null
    }

    try {
      // AudioContextを作成（または再利用）
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }

      const audioContext = audioContextRef.current

      // AudioContextがsuspendedなら再開
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // 実際のサンプルレートを使用
      const sampleRate = audioContext.sampleRate
      console.log('サンプルレート:', sampleRate)

      // AudioBufferを作成
      const audioBuffer = audioContext.createBuffer(1, recordingData.length, sampleRate)
      const channelData = audioBuffer.getChannelData(0)
      
      // 波形データをコピー（音量を調整）
      const maxAmplitude = Math.max(...Array.from(recordingData).map(Math.abs))
      const gain = maxAmplitude > 0 ? 0.8 / maxAmplitude : 1
      console.log('最大振幅:', maxAmplitude, 'ゲイン:', gain)
      
      for (let i = 0; i < recordingData.length; i++) {
        channelData[i] = recordingData[i] * gain
      }

      // AudioBufferSourceNodeを作成して再生
      const sourceNode = audioContext.createBufferSource()
      sourceNode.buffer = audioBuffer
      sourceNode.connect(audioContext.destination)
      
      sourceNode.onended = () => {
        console.log('再生終了')
        setIsPlaying(false)
        sourceNodeRef.current = null
      }

      sourceNodeRef.current = sourceNode
      setIsPlaying(true)
      sourceNode.start(0)
      console.log('再生中...')
    } catch (error) {
      console.error('再生エラー:', error)
      setIsPlaying(false)
    }
  }, [recordingData])

  // 再生停止
  const stopWaveform = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop()
      } catch (e) {
        // already stopped
      }
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

    if (recordingData && recordingData.length > 0) {
      // 録音中は進捗を使用、完了後は1（全体表示）
      const currentProgress = isRecording ? progress : 1
      drawWaveform(canvas, ctx, recordingData, currentProgress)
    } else {
      drawEmptyCanvas(canvas, ctx)
    }
  }, [recordingData, isRecording, progress, drawEmptyCanvas, drawWaveform])

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
        <h3 style={{ margin: 0, color: '#2196F3' }}>🎙️ 録音データ</h3>
        {recordingData && recordingData.length > 0 && !isRecording && (
          <button 
            onClick={isPlaying ? stopWaveform : playWaveform}
            className={styles.playButton}
            style={{ backgroundColor: '#2196F3' }}
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
