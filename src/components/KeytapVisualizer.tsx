import { useEffect, useState, useCallback } from 'react'
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

type TabType = 'waveform' | 'analysis' | 'settings'

// 測定結果の型定義
interface MeasurementResult {
  id: number
  name: string
  timestamp: Date
  attackWaveform: Float32Array | null
  releaseWaveform: Float32Array | null
  combinedWaveform: Float32Array | null
  keyTapCount: number
  keyUpCount: number
  peakIntervalMs: number
}

export function KeytapVisualizer() {
  const [recordingDuration, setRecordingDuration] = useState(DEFAULT_RECORDING_DURATION)
  const [activeTab, setActiveTab] = useState<TabType>('waveform')
  const [measurementHistory, setMeasurementHistory] = useState<MeasurementResult[]>([])
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<number | null>(null)
  const [nextMeasurementId, setNextMeasurementId] = useState(1)
  
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

  // 測定IDを追跡（同じ録音セッションで重複追加を防ぐ）
  const [lastRecordedId, setLastRecordedId] = useState<string | null>(null)

  // 録音完了時に測定結果を履歴に追加
  useEffect(() => {
    // 録音完了かつ波形データが揃っている場合のみ
    if (status === 'completed' && averagedWaveform && combinedWaveform) {
      // 同じデータの重複追加を防ぐ（キー数+波形長+ピーク間隔で識別）
      const recordId = `${keyTapCount}-${keyUpCount}-${averagedWaveform.length}-${peakIntervalMs}`
      if (lastRecordedId === recordId) {
        return
      }
      
      // 既存の測定がある場合は更新、なければ新規追加
      const existingIndex = measurementHistory.findIndex(m => 
        m.keyTapCount === keyTapCount && 
        m.keyUpCount === keyUpCount && 
        m.attackWaveform?.length === averagedWaveform.length
      )
      
      if (existingIndex >= 0) {
        // 既存の測定を更新（ピーク間隔のみ変更された場合など）
        setMeasurementHistory(prev => prev.map((m, i) => 
          i === existingIndex 
            ? {
                ...m,
                combinedWaveform: new Float32Array(combinedWaveform),
                peakIntervalMs,
              }
            : m
        ))
      } else {
        // 新規測定を追加
        const newMeasurement: MeasurementResult = {
          id: nextMeasurementId,
          name: `測定 ${nextMeasurementId}`,
          timestamp: new Date(),
          attackWaveform: new Float32Array(averagedWaveform),
          releaseWaveform: releaseWaveform ? new Float32Array(releaseWaveform) : null,
          combinedWaveform: new Float32Array(combinedWaveform),
          keyTapCount,
          keyUpCount,
          peakIntervalMs,
        }
        setMeasurementHistory(prev => [...prev, newMeasurement])
        setSelectedMeasurementId(nextMeasurementId)
        setNextMeasurementId(prev => prev + 1)
      }
      setLastRecordedId(recordId)
    }
  }, [status, averagedWaveform, combinedWaveform, releaseWaveform, keyTapCount, keyUpCount, peakIntervalMs, nextMeasurementId, lastRecordedId, measurementHistory])

  // 選択中の測定結果を取得
  const selectedMeasurement = measurementHistory.find(m => m.id === selectedMeasurementId) || null

  // 測定結果を削除
  const handleDeleteMeasurement = useCallback((id: number) => {
    setMeasurementHistory(prev => prev.filter(m => m.id !== id))
    if (selectedMeasurementId === id) {
      const remaining = measurementHistory.filter(m => m.id !== id)
      setSelectedMeasurementId(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
    }
  }, [measurementHistory, selectedMeasurementId])

  // 測定結果の名前を変更
  const handleRenameMeasurement = useCallback((id: number, newName: string) => {
    setMeasurementHistory(prev => prev.map(m => 
      m.id === id ? { ...m, name: newName } : m
    ))
  }, [])

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

      {/* タブメニュー */}
      <div className={styles.tabContainer}>
        <div className={styles.tabList}>
          <button
            className={`${styles.tab} ${activeTab === 'waveform' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('waveform')}
          >
            ➕ 新規
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'analysis' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            📊 解析
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'settings' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ 設定
          </button>
        </div>

        {/* 新規タブ */}
        {activeTab === 'waveform' && (
          <div className={styles.tabPanel}>
            <div className={styles.newMeasurementPanel}>
              <h3>新規測定</h3>
              <p>キーボードを打鍵して音を録音します</p>
              <WaveformCanvas 
                recordingData={recordingData}
                isRecording={isRecording}
                progress={recordingProgress}
              />
            </div>
          </div>
        )}

        {/* 解析タブ */}
        {activeTab === 'analysis' && (
          <div className={styles.tabPanel}>
            {measurementHistory.length > 0 ? (
              <div className={styles.analysisContent}>
                {/* 測定履歴リスト */}
                <div className={styles.measurementList}>
                  <h4>測定履歴</h4>
                  {measurementHistory.map((m) => (
                    <div 
                      key={m.id} 
                      className={`${styles.measurementItem} ${selectedMeasurementId === m.id ? styles.measurementItemSelected : ''}`}
                      onClick={() => setSelectedMeasurementId(m.id)}
                    >
                      <input
                        type="text"
                        value={m.name}
                        onChange={(e) => handleRenameMeasurement(m.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={styles.measurementNameInput}
                      />
                      <span className={styles.measurementInfo}>
                        {m.timestamp.toLocaleTimeString()} | {m.keyTapCount}回
                      </span>
                      <button 
                        className={styles.measurementDeleteBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteMeasurement(m.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* 選択した測定の解析結果 */}
                {selectedMeasurement && (
                  <div className={styles.measurementAnalysis}>
                    <h3>{selectedMeasurement.name}</h3>
                    
                    {/* 波形表示 */}
                    {selectedMeasurement.attackWaveform && (
                      <AveragedWaveform 
                        waveformData={selectedMeasurement.attackWaveform}
                        keyTapCount={selectedMeasurement.keyTapCount}
                        windowOffsetMs={0}
                        peakAlignEnabled={true}
                        title="アタック音 (KeyDown → KeyUp)"
                      />
                    )}

                    {selectedMeasurement.releaseWaveform && (
                      <AveragedWaveform 
                        waveformData={selectedMeasurement.releaseWaveform}
                        keyTapCount={selectedMeasurement.keyUpCount}
                        windowOffsetMs={0}
                        peakAlignEnabled={true}
                        title="リリース音 (KeyUp → KeyDown)"
                      />
                    )}

                    {selectedMeasurement.combinedWaveform && (
                      <AveragedWaveform 
                        waveformData={selectedMeasurement.combinedWaveform}
                        keyTapCount={selectedMeasurement.keyTapCount}
                        windowOffsetMs={0}
                        peakAlignEnabled={true}
                        title={`測定用音声 (アタック→${selectedMeasurement.peakIntervalMs}ms→リリース)`}
                      />
                    )}

                    {/* 特徴量・スペクトル */}
                    {selectedMeasurement.combinedWaveform && (
                      <>
                        <AudioFeaturesDisplay 
                          waveformData={selectedMeasurement.combinedWaveform} 
                          title={`測定用音声の特徴量 (間隔: ${selectedMeasurement.peakIntervalMs}ms)`} 
                        />
                        <SpectrumDisplay 
                          waveformData={selectedMeasurement.combinedWaveform} 
                          title="測定用音声のスペクトル" 
                        />
                      </>
                    )}

                    {selectedMeasurement.attackWaveform && (
                      <>
                        <AudioFeaturesDisplay 
                          waveformData={selectedMeasurement.attackWaveform} 
                          title="アタック音の特徴量" 
                        />
                        <SpectrumDisplay 
                          waveformData={selectedMeasurement.attackWaveform} 
                          title="アタック音のスペクトル" 
                        />
                      </>
                    )}

                    {selectedMeasurement.releaseWaveform && (
                      <>
                        <AudioFeaturesDisplay 
                          waveformData={selectedMeasurement.releaseWaveform} 
                          title="リリース音の特徴量" 
                        />
                        <SpectrumDisplay 
                          waveformData={selectedMeasurement.releaseWaveform} 
                          title="リリース音のスペクトル" 
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
                録音を完了すると解析結果が表示されます
              </p>
            )}
          </div>
        )}

        {/* 設定タブ */}
        {activeTab === 'settings' && (
          <div className={styles.tabPanel}>
            <div className={styles.settingsGrid}>
              {/* 録音設定 */}
              <div className={styles.offsetControl}>
                <h4 className={styles.controlTitle}>録音設定</h4>
                <div className={styles.offsetRow}>
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
                    className={styles.offsetInput}
                  />
                  <span className={styles.offsetHint}>ms ({(recordingDuration / 1000).toFixed(1)}秒)</span>
                </div>
                <div className={styles.offsetRow}>
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
                    className={styles.offsetInput}
                  />
                  <span className={styles.offsetHint}>ms</span>
                  <button 
                    onClick={handleWaveformLengthApply}
                    disabled={isRecording || status !== 'completed'}
                    className={styles.applyButton}
                  >
                    適用
                  </button>
                </div>
              </div>

              {/* 測定用音声設定 */}
              {status === 'completed' && averagedWaveform && releaseWaveform && (
                <div className={styles.offsetControl}>
                  <h4 className={styles.controlTitle}>測定用音声設定</h4>
                  <div className={styles.offsetRow}>
                    <label htmlFor="peakIntervalInput">ピーク間隔:</label>
                    <input
                      id="peakIntervalInput"
                      type="number"
                      min="0"
                      max="500"
                      value={peakIntervalInput}
                      onChange={handlePeakIntervalChange}
                      className={styles.offsetInput}
                    />
                    <span className={styles.offsetHint}>ms</span>
                    <button 
                      onClick={handlePeakIntervalApply}
                      className={styles.applyButton}
                    >
                      再計算
                    </button>
                  </div>
                  <span className={styles.offsetHint}>
                    アタック音のピークから {peakIntervalInput}ms 後にリリース音のピークが来るように配置
                  </span>
                </div>
              )}

              {/* アタック音設定 */}
              {status === 'completed' && keyTapCount > 0 && (
                <div className={styles.offsetControl}>
                  <h4 className={styles.controlTitle}>アタック音設定</h4>
                  <div className={styles.offsetRow}>
                    <label htmlFor="offsetInput">ウィンドウオフセット:</label>
                    <input
                      id="offsetInput"
                      type="number"
                      min="0"
                      max="100"
                      value={offsetInput}
                      onChange={handleOffsetChange}
                      className={styles.offsetInput}
                    />
                    <span className={styles.offsetHint}>ms</span>
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
                      : `各キータップの -${offsetInput}ms からキーアップまで`}
                  </span>
                </div>
              )}

              {/* リリース音設定 */}
              {status === 'completed' && keyUpCount > 0 && (
                <div className={styles.offsetControl}>
                  <h4 className={styles.controlTitle}>リリース音設定</h4>
                  <div className={styles.offsetRow}>
                    <label htmlFor="releaseOffsetInput">ウィンドウオフセット:</label>
                    <input
                      id="releaseOffsetInput"
                      type="number"
                      min="0"
                      max="100"
                      value={releaseOffsetInput}
                      onChange={handleReleaseOffsetChange}
                      className={styles.offsetInput}
                    />
                    <span className={styles.offsetHint}>ms</span>
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
                    再計算
                  </button>
                  
                  <span className={styles.offsetHint}>
                    {releasePeakAlignInput 
                      ? 'ウィンドウ内のピーク（最大振幅）位置を基準に同期加算' 
                      : `各キーアップの -${releaseOffsetInput}ms から次のキータップまで`}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
