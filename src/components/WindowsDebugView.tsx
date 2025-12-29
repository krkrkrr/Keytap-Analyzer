import { useState, useRef, useEffect } from 'react'
import type { WindowInfo } from '../utils/waveformProcessing'
import styles from './WindowsDebugView.module.css'

interface WindowsDebugViewProps {
  title: string
  windows: WindowInfo[]
  sampleRate: number
}

export function WindowsDebugView({ title, windows, sampleRate }: WindowsDebugViewProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (windows.length === 0) {
    return null
  }

  return (
    <div className={styles.container}>
      <button 
        className={styles.toggleButton}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={styles.toggleIcon}>{isExpanded ? '▼' : '▶'}</span>
        {title} ({windows.length}個のウィンドウ)
      </button>
      
      {isExpanded && (
        <div className={styles.windowsContainer}>
          {windows.map((window, index) => (
            <WindowCanvas 
              key={index}
              window={window}
              index={index}
              sampleRate={sampleRate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface WindowCanvasProps {
  window: WindowInfo
  index: number
  sampleRate: number
}

function WindowCanvas({ window, index, sampleRate }: WindowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = canvas.width
    const height = canvas.height
    
    // 背景をクリア
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)
    
    // 波形を描画
    const data = window.data
    const samplesPerPixel = data.length / width
    
    // 最大振幅を計算
    let maxAmp = 0
    for (let i = 0; i < data.length; i++) {
      const absVal = Math.abs(data[i])
      if (absVal > maxAmp) maxAmp = absVal
    }
    if (maxAmp === 0) maxAmp = 1
    
    // 波形描画
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 1
    ctx.beginPath()
    
    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor(x * samplesPerPixel)
      const sample = data[sampleIndex] || 0
      const y = height / 2 - (sample / maxAmp) * (height / 2 - 5)
      
      if (x === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
    
    // ピーク位置を描画（赤い縦線）
    const peakX = (window.peakIndex / data.length) * width
    ctx.strokeStyle = '#ff4444'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(peakX, 0)
    ctx.lineTo(peakX, height)
    ctx.stroke()
    
    // ピーク位置のラベル
    const peakMs = (window.peakIndex / sampleRate) * 1000
    ctx.fillStyle = '#ff4444'
    ctx.font = '10px sans-serif'
    ctx.fillText(`Peak: ${peakMs.toFixed(1)}ms`, peakX + 3, 12)
    
  }, [window, sampleRate])
  
  const durationMs = (window.data.length / sampleRate) * 1000
  const peakMs = (window.peakIndex / sampleRate) * 1000
  
  return (
    <div className={styles.windowItem}>
      <div className={styles.windowHeader}>
        <span className={styles.windowIndex}>#{index + 1}</span>
        <span className={styles.windowInfo}>
          タイムスタンプ: {window.timestampMs.toFixed(0)}ms | 
          ピーク: {peakMs.toFixed(1)}ms | 
          長さ: {durationMs.toFixed(1)}ms
        </span>
      </div>
      <canvas 
        ref={canvasRef}
        width={400}
        height={60}
        className={styles.windowCanvas}
      />
    </div>
  )
}
