import { useRef, useEffect, useCallback } from 'react'
import styles from './WaveformCanvas.module.css'

interface WaveformCanvasProps {
  recordingData: Float32Array | null
}

export function WaveformCanvas({ recordingData }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  const drawWaveform = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, data: Float32Array) => {
    // キャンバスをクリア
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 波形を描画
    ctx.strokeStyle = '#2196F3'
    ctx.lineWidth = 2
    ctx.beginPath()

    const sliceWidth = canvas.width / data.length
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

    // 中心線を描画
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, canvas.height / 2)
    ctx.lineTo(canvas.width, canvas.height / 2)
    ctx.stroke()
  }, [])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    if (recordingData && recordingData.length > 0) {
      drawWaveform(canvas, ctx, recordingData)
    } else {
      drawEmptyCanvas(canvas, ctx)
    }
  }, [recordingData, drawEmptyCanvas, drawWaveform])

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
      <canvas ref={canvasRef} className={styles.waveformCanvas} />
    </div>
  )
}
