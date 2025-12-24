import { useEffect, useState } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { WaveformCanvas } from './WaveformCanvas'
import { AveragedWaveform } from './AveragedWaveform'
import { AudioFeaturesDisplay } from './AudioFeaturesDisplay'
import { SpectrumDisplay } from './SpectrumDisplay'
import { StatusMessage } from './StatusMessage'
import { RecordButton } from './RecordButton'
import styles from './KeytapVisualizer.module.css'

const DEFAULT_RECORDING_DURATION = 4000 // デフォルト4秒
const MIN_RECORDING_DURATION = 1000 // 最小1秒
const MAX_RECORDING_DURATION = 30000 // 最大30秒

export function KeytapVisualizer() {
  const [recordingDuration, setRecordingDuration] = useState(DEFAULT_RECORDING_DURATION)
  
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
  } = useAudioRecorder(recordingDuration)

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

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value)) {
      const clampedValue = Math.max(MIN_RECORDING_DURATION, Math.min(MAX_RECORDING_DURATION, value))
      setRecordingDuration(clampedValue)
    }
  }

  const handleOffsetApply = () => {
    recalculateAveragedWaveform(offsetInput, peakAlignInput)
  }

  return (
    <div className={styles.container}>
      <h1>Keytap Analyzer</h1>
      <p className={styles.description}>
        キーボードのタイプ音を測定するツール
      </p>

      <div className={styles.recordingSettings}>
        <label htmlFor="durationInput">録音時間:</label>
        <input
          id="durationInput"
          type="number"
          min={MIN_RECORDING_DURATION}
          max={MAX_RECORDING_DURATION}
          step={500}
          value={recordingDuration}
          onChange={handleDurationChange}
          disabled={isRecording}
          className={styles.durationInput}
        />
        <span className={styles.durationUnit}>ms ({(recordingDuration / 1000).toFixed(1)}秒)</span>
      </div>

      <div className={styles.controlGroup}>
        <RecordButton
          isRecording={isRecording}
          disabled={!canRecord || isRecording}
          onClick={handleRecordClick}
          recordingDuration={recordingDuration}
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

      {/* 音声特徴量の表示 */}
      {status === 'completed' && averagedWaveform && (
        <AudioFeaturesDisplay waveformData={averagedWaveform} />
      )}

      {/* FFTスペクトル解析 */}
      {status === 'completed' && averagedWaveform && (
        <SpectrumDisplay waveformData={averagedWaveform} />
      )}

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
