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
    keyUpCount,
    averagedWaveform,
    releaseWaveform,
    combinedWaveform,
    windowOffsetMs,
    releaseOffsetMs,
    peakIntervalMs,
    peakAlignEnabled,
    waveformLengthMs,
    startRecording,
    initializeAudio,
    recalculateAveragedWaveform,
    recalculateReleaseWaveform,
    recalculateCombinedWaveform,
    setWaveformLengthMs,
  } = useAudioRecorder(recordingDuration)

  const [offsetInput, setOffsetInput] = useState(windowOffsetMs)
  const [releaseOffsetInput, setReleaseOffsetInput] = useState(releaseOffsetMs)
  const [peakAlignInput, setPeakAlignInput] = useState(peakAlignEnabled)
  const [releasePeakAlignInput, setReleasePeakAlignInput] = useState(false)
  const [peakIntervalInput, setPeakIntervalInput] = useState(peakIntervalMs)
  const [waveformLengthInput, setWaveformLengthInput] = useState(waveformLengthMs)

  useEffect(() => {
    initializeAudio()
  }, [initializeAudio])

  // windowOffsetMsが変更されたらinputも更新
  useEffect(() => {
    setOffsetInput(windowOffsetMs)
  }, [windowOffsetMs])

  // releaseOffsetMsが変更されたらinputも更新
  useEffect(() => {
    setReleaseOffsetInput(releaseOffsetMs)
  }, [releaseOffsetMs])

  // peakAlignEnabledが変更されたらinputも更新
  useEffect(() => {
    setPeakAlignInput(peakAlignEnabled)
  }, [peakAlignEnabled])

  // peakIntervalMsが変更されたらinputも更新
  useEffect(() => {
    setPeakIntervalInput(peakIntervalMs)
  }, [peakIntervalMs])

  // waveformLengthMsが変更されたらinputも更新
  useEffect(() => {
    setWaveformLengthInput(waveformLengthMs)
  }, [waveformLengthMs])

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

  const handleReleaseOffsetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value >= 0) {
      setReleaseOffsetInput(value)
    }
  }

  const handleReleasePeakAlignChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReleasePeakAlignInput(e.target.checked)
  }

  const handlePeakIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value >= 0) {
      setPeakIntervalInput(value)
    }
  }

  const handlePeakIntervalApply = () => {
    recalculateCombinedWaveform(peakIntervalInput)
  }

  const handleWaveformLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value >= 10 && value <= 500) {
      setWaveformLengthInput(value)
    }
  }

  const handleWaveformLengthApply = () => {
    setWaveformLengthMs(waveformLengthInput)
    // 波形長を変更したら再計算
    recalculateAveragedWaveform(offsetInput, peakAlignInput)
    recalculateReleaseWaveform(releaseOffsetInput, releasePeakAlignInput)
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

  const handleReleaseOffsetApply = () => {
    recalculateReleaseWaveform(releaseOffsetInput, releasePeakAlignInput)
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

      <div className={styles.recordingSettings}>
        <label htmlFor="waveformLengthInput">波形長:</label>
        <input
          id="waveformLengthInput"
          type="number"
          min={10}
          max={500}
          step={10}
          value={waveformLengthInput}
          onChange={handleWaveformLengthChange}
          disabled={isRecording}
          className={styles.durationInput}
        />
        <span className={styles.durationUnit}>ms</span>
        <button 
          onClick={handleWaveformLengthApply}
          disabled={isRecording || status !== 'completed'}
          className={styles.applyButton}
        >
          適用
        </button>
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
            キータップ検出: {keyTapCount} 回 / キーアップ: {keyUpCount} 回
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
        title="アタック音 (KeyDown → KeyUp)"
      />

      {/* リリース音の波形 */}
      <AveragedWaveform 
        waveformData={releaseWaveform}
        keyTapCount={keyUpCount}
        windowOffsetMs={releaseOffsetMs}
        peakAlignEnabled={releasePeakAlignInput}
        title="リリース音 (KeyUp → KeyDown)"
      />

      {/* 合成波形 (測定用音声) */}
      {combinedWaveform && (
        <AveragedWaveform 
          waveformData={combinedWaveform}
          keyTapCount={keyTapCount}
          windowOffsetMs={0}
          peakAlignEnabled={true}
          title={`測定用音声 (アタック→${peakIntervalMs}ms→リリース)`}
        />
      )}

      {/* 合成波形設定 */}
      {status === 'completed' && averagedWaveform && releaseWaveform && (
        <div className={styles.offsetControl}>
          <h4 className={styles.controlTitle}>測定用音声設定</h4>
          <div className={styles.offsetRow}>
            <label htmlFor="peakIntervalInput">ピーク間隔 (ms):</label>
            <input
              id="peakIntervalInput"
              type="number"
              min="0"
              max="500"
              value={peakIntervalInput}
              onChange={handlePeakIntervalChange}
              className={styles.offsetInput}
            />
          </div>

          <button 
            onClick={handlePeakIntervalApply}
            className={styles.applyButton}
          >
            合成波形再計算
          </button>
          
          <span className={styles.offsetHint}>
            アタック音のピークから {peakIntervalInput}ms 後にリリース音のピークが来るように配置
          </span>
        </div>
      )}

      {/* 合成波形の音声特徴量 */}
      {status === 'completed' && combinedWaveform && (
        <AudioFeaturesDisplay waveformData={combinedWaveform} title="測定用音声の特徴量" />
      )}

      {/* 合成波形のFFTスペクトル解析 */}
      {status === 'completed' && combinedWaveform && (
        <SpectrumDisplay waveformData={combinedWaveform} title="測定用音声のスペクトル" />
      )}

      {/* アタック音の音声特徴量 */}
      {status === 'completed' && averagedWaveform && (
        <AudioFeaturesDisplay waveformData={averagedWaveform} title="アタック音の特徴量" />
      )}

      {/* アタック音のFFTスペクトル解析 */}
      {status === 'completed' && averagedWaveform && (
        <SpectrumDisplay waveformData={averagedWaveform} title="アタック音のスペクトル" />
      )}

      {status === 'completed' && keyTapCount > 0 && (
        <div className={styles.offsetControl}>
          <h4 className={styles.controlTitle}>アタック音設定</h4>
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
            アタック音再計算
          </button>
          
          <span className={styles.offsetHint}>
            {peakAlignInput 
              ? 'ウィンドウ内のピーク（最大振幅）位置を基準に同期加算' 
              : `各キータップの -${offsetInput}ms からキーアップまで`}
          </span>
        </div>
      )}

      {status === 'completed' && keyUpCount > 0 && (
        <div className={styles.offsetControl}>
          <h4 className={styles.controlTitle}>リリース音設定</h4>
          <div className={styles.offsetRow}>
            <label htmlFor="releaseOffsetInput">ウィンドウオフセット (ms):</label>
            <input
              id="releaseOffsetInput"
              type="number"
              min="0"
              max="100"
              value={releaseOffsetInput}
              onChange={handleReleaseOffsetChange}
              className={styles.offsetInput}
            />
          </div>
          
          <div className={styles.offsetRow}>
            <label htmlFor="releasePeakAlign" className={styles.checkboxLabel}>
              <input
                id="releasePeakAlign"
                type="checkbox"
                checked={releasePeakAlignInput}
                onChange={handleReleasePeakAlignChange}
                className={styles.checkbox}
              />
              ピーク同期モード（リリース位置を揃える）
            </label>
          </div>

          <button 
            onClick={handleReleaseOffsetApply}
            className={styles.applyButton}
          >
            リリース音再計算
          </button>
          
          <span className={styles.offsetHint}>
            {releasePeakAlignInput 
              ? 'ウィンドウ内のピーク（最大振幅）位置を基準に同期加算' 
              : `各キーアップの -${releaseOffsetInput}ms から次のキータップまで`}
          </span>
        </div>
      )}
    </div>
  )
}
