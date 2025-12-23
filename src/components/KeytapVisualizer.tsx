import { useEffect, useState } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { WaveformCanvas } from './WaveformCanvas'
import { AveragedWaveform } from './AveragedWaveform'
import { StatusMessage } from './StatusMessage'
import { RecordButton } from './RecordButton'
import styles from './KeytapVisualizer.module.css'

const RECORDING_DURATION = 4000 // 4秒

export function KeytapVisualizer() {
  const {
    status,
    statusMessage,
    recordingData,
    recordingProgress,
    isRecording,
    canRecord,
    keyTapCount,
    averagedWaveform,
    windowOffsetMs,
    peakAlignEnabled,
    startRecording,
    initializeAudio,
    recalculateAveragedWaveform,
  } = useAudioRecorder(RECORDING_DURATION)

  const [offsetInput, setOffsetInput] = useState(windowOffsetMs)
  const [peakAlignInput, setPeakAlignInput] = useState(peakAlignEnabled)

  useEffect(() => {
    initializeAudio()
  }, [initializeAudio])

  // windowOffsetMsが変更されたらinputも更新
  useEffect(() => {
    setOffsetInput(windowOffsetMs)
  }, [windowOffsetMs])

  // peakAlignEnabledが変更されたらinputも更新
  useEffect(() => {
    setPeakAlignInput(peakAlignEnabled)
  }, [peakAlignEnabled])

  const handleRecordClick = () => {
    if (!isRecording) {
      startRecording()
    }
  }

  const handleOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value >= 0) {
      setOffsetInput(value)
    }
  }

  const handlePeakAlignChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPeakAlignInput(e.target.checked)
  }

  const handleOffsetApply = () => {
    recalculateAveragedWaveform(offsetInput, peakAlignInput)
  }

  return (
    <div className={styles.container}>
      <h1>🎹 Keytap Visualizer</h1>
      <p className={styles.description}>
        キーボードのタイプ音を可視化するWebアプリケーション
      </p>

      <div className={styles.controlGroup}>
        <RecordButton
          isRecording={isRecording}
          disabled={!canRecord || isRecording}
          onClick={handleRecordClick}
          recordingDuration={RECORDING_DURATION}
        />
        {isRecording && (
          <span className={styles.keyTapCounter}>
            キータップ検出: {keyTapCount} 回
          </span>
        )}
      </div>

      <StatusMessage status={status} message={statusMessage} />

      <WaveformCanvas 
        recordingData={recordingData}
        isRecording={isRecording}
        progress={recordingProgress}
      />

      <AveragedWaveform 
        waveformData={averagedWaveform}
        keyTapCount={keyTapCount}
        windowOffsetMs={windowOffsetMs}
        peakAlignEnabled={peakAlignEnabled}
      />

      {status === 'completed' && keyTapCount > 0 && (
        <div className={styles.offsetControl}>
          <div className={styles.offsetRow}>
            <label htmlFor="offsetInput">ウィンドウオフセット (ms):</label>
            <input
              id="offsetInput"
              type="number"
              min="0"
              max="100"
              value={offsetInput}
              onChange={handleOffsetChange}
              className={styles.offsetInput}
            />
          </div>
          
          <div className={styles.offsetRow}>
            <label htmlFor="peakAlign" className={styles.checkboxLabel}>
              <input
                id="peakAlign"
                type="checkbox"
                checked={peakAlignInput}
                onChange={handlePeakAlignChange}
                className={styles.checkbox}
              />
              ピーク同期モード（アタック位置を揃える）
            </label>
          </div>

          <button 
            onClick={handleOffsetApply}
            className={styles.applyButton}
          >
            再計算
          </button>
          
          <span className={styles.offsetHint}>
            {peakAlignInput 
              ? 'ウィンドウ内のピーク（最大振幅）位置を基準に同期加算' 
              : `各キータップの -${offsetInput}ms から次のキータップの -${offsetInput}ms まで`}
          </span>
        </div>
      )}
    </div>
  )
}
