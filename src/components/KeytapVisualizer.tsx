import { useEffect, useState, useCallback, useRef } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { AveragedWaveform } from './AveragedWaveform'
import { AudioFeaturesDisplay } from './AudioFeaturesDisplay'
import { SpectrumDisplay } from './SpectrumDisplay'
import { StatusMessage } from './StatusMessage'
import { RecordButton } from './RecordButton'
import { WindowsDebugView } from './WindowsDebugView'
import { CollapsibleSection } from './CollapsibleSection'
import { 
  encodeWav, 
  createPaxTar, 
  parseTar, 
  decodeWav, 
  parseTimestampsCsv,
  type MeasurementMetadata 
} from '../utils/audioExport'
import {
  calculateSyncAveragedWaveform,
  calculateCombinedWaveform,
  type WindowInfo
} from '../utils/waveformProcessing'
import styles from './KeytapVisualizer.module.css'

const SAMPLE_RATE = 48000

const DEFAULT_RECORDING_DURATION = 4000 // デフォルト4秒
const MIN_RECORDING_DURATION = 1000 // 最小1秒
const MAX_RECORDING_DURATION = 30000 // 最大30秒

type TabType = 'waveform' | 'analysis'

// 測定結果の型定義
interface MeasurementResult {
  id: number
  name: string
  timestamp: Date
  recordingData: Float32Array | null  // 同期加算前の録音データ
  attackWaveform: Float32Array | null
  releaseWaveform: Float32Array | null
  combinedWaveform: Float32Array | null
  keyTapCount: number
  keyUpCount: number
  keyDownTimestamps: number[]  // キーダウンのタイムスタンプ (ms)
  keyUpTimestamps: number[]    // キーアップのタイムスタンプ (ms)
  peakIntervalMs: number
  recordingDurationMs: number  // 録音時間 (ms)
  // 測定設定
  waveformLengthMs: number     // 波形長 (ms)
  attackOffsetMs: number       // アタック音オフセット (ms)
  attackPeakAlign: boolean     // アタック音ピーク同期
  releaseOffsetMs: number      // リリース音オフセット (ms)
  releasePeakAlign: boolean    // リリース音ピーク同期
  peakPositionMs: number       // ピーク位置オフセット (ms)
  useMinWindowLength: boolean  // 最小ウィンドウ長を使用
  // デバッグ用ウィンドウデータ
  attackWindows: WindowInfo[]  // アタック音の個別ウィンドウ
  releaseWindows: WindowInfo[] // リリース音の個別ウィンドウ
}

export function KeytapVisualizer() {
  const [recordingDuration, setRecordingDuration] = useState(DEFAULT_RECORDING_DURATION)
  const [activeTab, setActiveTab] = useState<TabType>('waveform')
  const [measurementHistory, setMeasurementHistory] = useState<MeasurementResult[]>([])
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<number | null>(null)
  const [nextMeasurementId, setNextMeasurementId] = useState(1)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 設定モーダル用の状態
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [editingMeasurementId, setEditingMeasurementId] = useState<number | null>(null)
  const [editWaveformLengthInput, setEditWaveformLengthInput] = useState(70)
  const [editPeakIntervalInput, setEditPeakIntervalInput] = useState(12)
  const [editAttackOffsetInput, setEditAttackOffsetInput] = useState(10)
  const [editAttackPeakAlignInput, setEditAttackPeakAlignInput] = useState(true)
  const [editReleaseOffsetInput, setEditReleaseOffsetInput] = useState(10)
  const [editReleasePeakAlignInput, setEditReleasePeakAlignInput] = useState(true)
  const [editPeakPositionInput, setEditPeakPositionInput] = useState(10)
  const [editUseMinWindowLengthInput, setEditUseMinWindowLengthInput] = useState(true) // 最小ウィンドウ長を使用
  
  const {
    status,
    statusMessage,
    finalRecordingData,
    isRecording,
    canRecord,
    keyTapCount,
    keyUpCount,
    keyDownTimestamps,
    keyUpTimestamps,
    averagedWaveform,
    releaseWaveform,
    combinedWaveform,
    windowOffsetMs,
    releaseOffsetMs,
    peakIntervalMs,
    peakAlignEnabled,
    waveformLengthMs,
    peakPositionMs,
    startRecording,
    initializeAudio,
    setPeakPositionMs,
  } = useAudioRecorder(recordingDuration)

  useEffect(() => {
    initializeAudio()
  }, [initializeAudio])

  // 録音セッションID（重複追加防止用）
  const recordingSessionRef = useRef(0)
  const lastProcessedSessionRef = useRef(0)

  // 録音完了時に測定結果を履歴に追加
  useEffect(() => {
    // 録音完了かつ波形データが揃っている場合のみ
    if (status === 'completed' && averagedWaveform && combinedWaveform && finalRecordingData) {
      // 同じ録音セッションでの重複追加を防ぐ
      if (lastProcessedSessionRef.current === recordingSessionRef.current) {
        return
      }
      lastProcessedSessionRef.current = recordingSessionRef.current
      
      // 新規測定を追加
      const newMeasurement: MeasurementResult = {
        id: nextMeasurementId,
        name: `測定 ${nextMeasurementId}`,
        timestamp: new Date(),
        recordingData: new Float32Array(finalRecordingData),
        attackWaveform: new Float32Array(averagedWaveform),
        releaseWaveform: releaseWaveform ? new Float32Array(releaseWaveform) : null,
        combinedWaveform: new Float32Array(combinedWaveform),
        attackWindows: [], // 初期録音時は空、設定変更時に計算
        releaseWindows: [], // 初期録音時は空、設定変更時に計算
        keyTapCount,
        keyUpCount,
        keyDownTimestamps: [...keyDownTimestamps],
        keyUpTimestamps: [...keyUpTimestamps],
        peakIntervalMs,
        recordingDurationMs: recordingDuration,
        // 測定設定（現在のフック設定を保存）
        waveformLengthMs,
        attackOffsetMs: windowOffsetMs,
        attackPeakAlign: peakAlignEnabled,
        releaseOffsetMs,
        releasePeakAlign: true, // デフォルトはtrue
        peakPositionMs,
        useMinWindowLength: true, // デフォルトで最小ウィンドウ長を使用
      }
      setMeasurementHistory(prev => [...prev, newMeasurement])
      setSelectedMeasurementId(nextMeasurementId)
      setNextMeasurementId(prev => prev + 1)
    }
  }, [status, averagedWaveform, combinedWaveform, releaseWaveform, finalRecordingData, keyTapCount, keyUpCount, keyDownTimestamps, keyUpTimestamps, peakIntervalMs, recordingDuration, waveformLengthMs, windowOffsetMs, peakAlignEnabled, releaseOffsetMs, peakPositionMs, nextMeasurementId])

  // 新規測定追加後、個別ウィンドウ情報を計算して追加
  useEffect(() => {
    if (measurementHistory.length > 0) {
      const latestMeasurement = measurementHistory[measurementHistory.length - 1]
      
      // 既にwindowsが計算されている場合はスキップ
      if (latestMeasurement.attackWindows.length > 0 || latestMeasurement.releaseWindows.length > 0) {
        return
      }

      // windowsが空の場合は計算
      if (!latestMeasurement.recordingData) {
        return
      }

      const attackResult = calculateMeasurementAttackWaveform(
        latestMeasurement.recordingData,
        latestMeasurement.keyDownTimestamps,
        latestMeasurement.attackOffsetMs,
        latestMeasurement.attackPeakAlign,
        latestMeasurement.waveformLengthMs,
        latestMeasurement.peakPositionMs,
        latestMeasurement.useMinWindowLength
      )

      const releaseResult = calculateMeasurementReleaseWaveform(
        latestMeasurement.recordingData,
        latestMeasurement.keyUpTimestamps,
        latestMeasurement.releaseOffsetMs,
        latestMeasurement.releasePeakAlign,
        latestMeasurement.waveformLengthMs,
        latestMeasurement.peakPositionMs,
        latestMeasurement.useMinWindowLength
      )

      // windowsを保存
      setMeasurementHistory(prev => prev.map((m, idx) =>
        idx === prev.length - 1
          ? {
              ...m,
              attackWindows: attackResult.windows,
              releaseWindows: releaseResult.windows,
            }
          : m
      ))
    }
  }, [measurementHistory.length])

  // 選択中の測定結果を取得
  const selectedMeasurement = measurementHistory.find(m => m.id === selectedMeasurementId) || null

  // デバッグ: measurementHistory の変更を監視
  useEffect(() => {
    if (selectedMeasurement) {
      console.log('[デバッグ] selectedMeasurement 更新:', {
        id: selectedMeasurement.id,
        waveformLengthMs: selectedMeasurement.waveformLengthMs,
        attackWaveformLength: selectedMeasurement.attackWaveform?.length,
        combinedWaveformLength: selectedMeasurement.combinedWaveform?.length,
      })
    }
  }, [selectedMeasurement])

  // アタック音の同期加算処理（測定データ用）
  const calculateMeasurementAttackWaveform = useCallback((
    audioData: Float32Array,
    keyDownTimestamps: number[],
    offsetMs: number,
    peakAlign: boolean,
    targetLengthMs: number,
    peakPosMs: number,
    useMinWinLength: boolean = false
  ): { waveform: Float32Array | null; windows: WindowInfo[] } => {
    if (keyDownTimestamps.length < 3) {
      return { waveform: null, windows: [] }
    }

    const trimmedDownTimestamps = keyDownTimestamps.slice(1, -1)
    
    const result = calculateSyncAveragedWaveform({
      audioData,
      timestamps: trimmedDownTimestamps,
      offsetMs,
      peakAlign,
      targetLengthMs,
      peakPositionMs: peakPosMs,
      sampleRate: SAMPLE_RATE,
      useMinWindowLength: useMinWinLength
    })

    return { waveform: result.waveform, windows: result.windows }
  }, [])

  // リリース音の同期加算処理（測定データ用）
  const calculateMeasurementReleaseWaveform = useCallback((
    audioData: Float32Array,
    keyUpTimestamps: number[],
    offsetMs: number,
    peakAlign: boolean,
    targetLengthMs: number,
    peakPosMs: number,
    useMinWinLength: boolean = false
  ): { waveform: Float32Array | null; windows: WindowInfo[] } => {
    if (keyUpTimestamps.length < 2) {
      return { waveform: null, windows: [] }
    }

    const trimmedUpTimestamps = keyUpTimestamps.length >= 3 
      ? keyUpTimestamps.slice(1, -1) 
      : keyUpTimestamps.slice(0, 1)

    const result = calculateSyncAveragedWaveform({
      audioData,
      timestamps: trimmedUpTimestamps,
      offsetMs,
      peakAlign,
      targetLengthMs,
      peakPositionMs: peakPosMs,
      sampleRate: SAMPLE_RATE,
      useMinWindowLength: useMinWinLength
    })

    return { waveform: result.waveform, windows: result.windows }
  }, [])

  // 測定データの合成波形を再計算するユーティリティ関数
  const calculateMeasurementCombinedWaveform = useCallback((
    attackWaveform: Float32Array,
    releaseWaveform: Float32Array,
    intervalMs: number
  ): Float32Array => {
    return calculateCombinedWaveform(attackWaveform, releaseWaveform, intervalMs, SAMPLE_RATE)
  }, [])

  // 測定データの設定を開く
  const handleOpenMeasurementSettings = useCallback((measurement: MeasurementResult) => {
    setEditingMeasurementId(measurement.id)
    setEditWaveformLengthInput(measurement.waveformLengthMs ?? 70)
    setEditPeakIntervalInput(measurement.peakIntervalMs)
    setEditAttackOffsetInput(measurement.attackOffsetMs ?? 10)
    setEditAttackPeakAlignInput(measurement.attackPeakAlign ?? true)
    setEditReleaseOffsetInput(measurement.releaseOffsetMs ?? 10)
    setEditReleasePeakAlignInput(measurement.releasePeakAlign ?? true)
    setEditPeakPositionInput(measurement.peakPositionMs ?? 10)
    setEditUseMinWindowLengthInput(measurement.useMinWindowLength ?? true)
    setSettingsModalOpen(true)
  }, [])

  // 測定データの設定を適用
  const handleApplyMeasurementSettings = useCallback(() => {
    console.log('[設定適用] 開始', { editingMeasurementId })
    if (editingMeasurementId === null) {
      console.log('[設定適用] editingMeasurementId が null')
      return
    }
    
    const measurement = measurementHistory.find(m => m.id === editingMeasurementId)
    console.log('[設定適用] measurement:', measurement)
    
    if (!measurement || !measurement.recordingData) {
      console.log('[設定適用] measurement または recordingData が null', {
        measurement: !!measurement,
        recordingData: !!measurement?.recordingData
      })
      setSettingsModalOpen(false)
      return
    }

    console.log('[設定適用] パラメータ:', {
      editWaveformLengthInput,
      editPeakIntervalInput,
      editAttackOffsetInput,
      editAttackPeakAlignInput,
      editReleaseOffsetInput,
      editReleasePeakAlignInput,
      editPeakPositionInput,
      keyDownTimestamps: measurement.keyDownTimestamps.length,
      keyUpTimestamps: measurement.keyUpTimestamps.length,
    })

    // アタック音を再計算
    const attackResult = calculateMeasurementAttackWaveform(
      measurement.recordingData,
      measurement.keyDownTimestamps,
      editAttackOffsetInput,
      editAttackPeakAlignInput,
      editWaveformLengthInput,
      editPeakPositionInput,
      editUseMinWindowLengthInput
    )
    const newAttackWaveform = attackResult.waveform
    const newAttackWindows = attackResult.windows
    console.log('[設定適用] newAttackWaveform:', newAttackWaveform?.length)

    // リリース音を再計算
    const releaseResult = calculateMeasurementReleaseWaveform(
      measurement.recordingData,
      measurement.keyUpTimestamps,
      editReleaseOffsetInput,
      editReleasePeakAlignInput,
      editWaveformLengthInput,
      editPeakPositionInput,
      editUseMinWindowLengthInput
    )
    const newReleaseWaveform = releaseResult.waveform
    const newReleaseWindows = releaseResult.windows
    console.log('[設定適用] newReleaseWaveform:', newReleaseWaveform?.length)

    // 合成波形を再計算
    let newCombinedWaveform: Float32Array | null = null
    if (newAttackWaveform && newReleaseWaveform) {
      newCombinedWaveform = calculateMeasurementCombinedWaveform(
        newAttackWaveform,
        newReleaseWaveform,
        editPeakIntervalInput
      )
    }
    console.log('[設定適用] newCombinedWaveform:', newCombinedWaveform?.length)

    // 測定データを更新
    console.log('[設定適用] setMeasurementHistory を呼び出し')
    setMeasurementHistory(prev => prev.map(m => 
      m.id === editingMeasurementId 
        ? { 
            ...m, 
            attackWaveform: newAttackWaveform,
            releaseWaveform: newReleaseWaveform,
            combinedWaveform: newCombinedWaveform,
            attackWindows: newAttackWindows,
            releaseWindows: newReleaseWindows,
            peakIntervalMs: editPeakIntervalInput,
            waveformLengthMs: editWaveformLengthInput,
            attackOffsetMs: editAttackOffsetInput,
            attackPeakAlign: editAttackPeakAlignInput,
            releaseOffsetMs: editReleaseOffsetInput,
            releasePeakAlign: editReleasePeakAlignInput,
            peakPositionMs: editPeakPositionInput,
            useMinWindowLength: editUseMinWindowLengthInput,
          } 
        : m
    ))

    setSettingsModalOpen(false)
    console.log('[設定適用] 完了')
  }, [editingMeasurementId, editWaveformLengthInput, editPeakIntervalInput, editAttackOffsetInput, editAttackPeakAlignInput, editReleaseOffsetInput, editReleasePeakAlignInput, editPeakPositionInput, editUseMinWindowLengthInput, measurementHistory, calculateMeasurementAttackWaveform, calculateMeasurementReleaseWaveform, calculateMeasurementCombinedWaveform])

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

  // 測定データをtarファイルとしてエクスポート
  const handleExportMeasurement = useCallback((measurement: MeasurementResult) => {
    const files: { name: string; data: ArrayBuffer | string }[] = []
    const baseName = measurement.name.replace(/[^a-zA-Z0-9_\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')
    
    // タイムスタンプCSVを生成（keydown/keyupのペア形式）
    const csvLines = ['timestamp_keydown,timestamp_keyup']
    const maxLength = Math.max(measurement.keyDownTimestamps.length, measurement.keyUpTimestamps.length)
    for (let i = 0; i < maxLength; i++) {
      const keydown = measurement.keyDownTimestamps[i] ?? ''
      const keyup = measurement.keyUpTimestamps[i] ?? ''
      csvLines.push(`${keydown},${keyup}`)
    }
    const timestampsCsv = csvLines.join('\n')
    
    // メタデータJSON
    const metadata: MeasurementMetadata = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      measurement: {
        id: measurement.id,
        name: measurement.name,
        timestamp: measurement.timestamp.toISOString(),
        keyTapCount: measurement.keyTapCount,
        keyUpCount: measurement.keyUpCount,
        peakIntervalMs: measurement.peakIntervalMs,
        useMinWindowLength: measurement.useMinWindowLength,
      },
      audio: {
        sampleRate: SAMPLE_RATE,
        waveformLengthMs: measurement.waveformLengthMs,
        peakPositionMs: measurement.peakPositionMs,
        recordingDurationMs: measurement.recordingDurationMs,
      },
      files: {
        metadata: 'metadata.json',
        recording: measurement.recordingData ? 'recording.wav' : '',
        combinedWaveform: measurement.combinedWaveform ? 'combined.wav' : null,
        timestamps: 'timestamps_keyevent.csv',
      },
    }
    
    files.push({
      name: 'metadata.json',
      data: JSON.stringify(metadata, null, 2),
    })
    
    // タイムスタンプCSV
    files.push({
      name: 'timestamps_keyevent.csv',
      data: timestampsCsv,
    })
    
    // 録音データWAV
    if (measurement.recordingData) {
      files.push({
        name: 'recording.wav',
        data: encodeWav(measurement.recordingData, SAMPLE_RATE),
      })
    }
    
    // 合成波形WAV
    if (measurement.combinedWaveform) {
      files.push({
        name: 'combined.wav',
        data: encodeWav(measurement.combinedWaveform, SAMPLE_RATE),
      })
    }
    
    // PAX形式のtarファイルを作成
    const tarBlob = createPaxTar(files)
    
    // ダウンロード
    const url = URL.createObjectURL(tarBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.keytapanalyzer.dat`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [waveformLengthMs])

  // 測定データをtarファイルからインポート
  const handleImportMeasurement = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const files = parseTar(buffer)
      
      // メタデータを探す
      const metadataFile = files.find(f => f.name === 'metadata.json')
      if (!metadataFile) {
        console.error('metadata.json not found in tar file')
        alert('無効なファイル形式です: metadata.json が見つかりません')
        return
      }
      
      const metadataText = new TextDecoder().decode(metadataFile.data)
      const metadata: MeasurementMetadata = JSON.parse(metadataText)
      
      // 録音データを読み込み
      let recordingData: Float32Array | null = null
      const recordingFile = files.find(f => f.name === 'recording.wav')
      if (recordingFile) {
        const decoded = decodeWav(recordingFile.data)
        if (decoded) {
          recordingData = decoded.samples
        }
      }
      
      // タイムスタンプを読み込み
      let keyDownTimestamps: number[] = []
      let keyUpTimestamps: number[] = []
      const timestampsFile = files.find(f => f.name === 'timestamps_keyevent.csv' || f.name === 'timestamps.csv')
      if (timestampsFile) {
        const csvText = new TextDecoder().decode(timestampsFile.data)
        const parsed = parseTimestampsCsv(csvText)
        keyDownTimestamps = parsed.keyDownTimestamps
        keyUpTimestamps = parsed.keyUpTimestamps
      }
      
      // 設定値を取得（メタデータから、なければデフォルト値）
      const waveformLengthMs = metadata.audio.waveformLengthMs || 70
      const peakPositionMs = metadata.audio.peakPositionMs || 10
      const peakIntervalMs = metadata.measurement.peakIntervalMs || 12
      const attackOffsetMs = 10
      const attackPeakAlign = true
      const releaseOffsetMs = 10
      const releasePeakAlign = true
      const useMinWindowLength = metadata.measurement.useMinWindowLength ?? true
      
      // 録音データとタイムスタンプから波形を再計算
      let attackWaveform: Float32Array | null = null
      let releaseWaveform: Float32Array | null = null
      let combinedWaveform: Float32Array | null = null
      let attackWindows: WindowInfo[] = []
      let releaseWindows: WindowInfo[] = []
      
      if (recordingData && keyDownTimestamps.length >= 3) {
        // アタック音を計算
        const attackResult = calculateMeasurementAttackWaveform(
          recordingData,
          keyDownTimestamps,
          attackOffsetMs,
          attackPeakAlign,
          waveformLengthMs,
          peakPositionMs,
          useMinWindowLength
        )
        attackWaveform = attackResult.waveform
        attackWindows = attackResult.windows
        
        // リリース音を計算
        if (keyUpTimestamps.length >= 2) {
          const releaseResult = calculateMeasurementReleaseWaveform(
            recordingData,
            keyUpTimestamps,
            releaseOffsetMs,
            releasePeakAlign,
            waveformLengthMs,
            peakPositionMs,
            useMinWindowLength
          )
          releaseWaveform = releaseResult.waveform
          releaseWindows = releaseResult.windows
        }
        
        // 合成波形を計算
        if (attackWaveform && releaseWaveform) {
          combinedWaveform = calculateMeasurementCombinedWaveform(
            attackWaveform,
            releaseWaveform,
            peakIntervalMs
          )
        }
      }
      
      // 測定結果を作成
      const newMeasurement: MeasurementResult = {
        id: nextMeasurementId,
        name: metadata.measurement.name || `インポート ${nextMeasurementId}`,
        timestamp: new Date(metadata.measurement.timestamp),
        recordingData,
        attackWaveform,
        releaseWaveform,
        combinedWaveform,
        attackWindows,
        releaseWindows,
        keyTapCount: metadata.measurement.keyTapCount,
        keyUpCount: metadata.measurement.keyUpCount,
        keyDownTimestamps,
        keyUpTimestamps,
        peakIntervalMs,
        recordingDurationMs: metadata.audio.recordingDurationMs || 4000,
        waveformLengthMs,
        attackOffsetMs,
        attackPeakAlign,
        releaseOffsetMs,
        releasePeakAlign,
        peakPositionMs,
        useMinWindowLength,
      }
      
      setMeasurementHistory(prev => [...prev, newMeasurement])
      setSelectedMeasurementId(nextMeasurementId)
      setNextMeasurementId(prev => prev + 1)
      setActiveTab('analysis')
      
      console.log('Measurement imported successfully:', newMeasurement.name)
    } catch (error) {
      console.error('Failed to import measurement:', error)
      alert('ファイルの読み込みに失敗しました')
    }
  }, [nextMeasurementId, calculateMeasurementAttackWaveform, calculateMeasurementReleaseWaveform, calculateMeasurementCombinedWaveform])

  // ファイル選択ハンドラー
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImportMeasurement(file)
    }
    // 同じファイルを再選択できるようにリセット
    e.target.value = ''
  }, [handleImportMeasurement])

  // インポートボタンクリックハンドラー
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleRecordClick = () => {
    if (!isRecording) {
      // 新規録音開始時はセッションIDをインクリメント
      recordingSessionRef.current += 1
      startRecording()
    }
  }

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value)) {
      const clampedValue = Math.max(MIN_RECORDING_DURATION, Math.min(MAX_RECORDING_DURATION, value))
      setRecordingDuration(clampedValue)
    }
  }

  return (
    <div className={styles.container}>
      <h1>Keytap Analyzer</h1>
      <p className={styles.description}>
        キーボードのタイプ音を測定するツール
      </p>

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
        </div>

        {/* 新規タブ */}
        {activeTab === 'waveform' && (
          <div className={styles.tabPanel}>
            <div className={styles.newMeasurementPanel}>
              <h3>新規測定</h3>
              <p>キーボードを打鍵して音を録音します</p>
              
              {/* 録音ボタンとステータス */}
              <div className={styles.recordingSection}>
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
              </div>
              
              {/* 録音設定 */}
              <div className={styles.settingsSection}>
                <h4 className={styles.controlTitle}>録音設定</h4>
                <div className={styles.settingsRow}>
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
                    className={styles.settingsInput}
                  />
                  <span className={styles.settingsHint}>ms ({(recordingDuration / 1000).toFixed(1)}秒)</span>
                </div>
                <div className={styles.settingsRow}>
                  <label htmlFor="peakPositionInput">ピーク位置:</label>
                  <input
                    id="peakPositionInput"
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={peakPositionMs}
                    onChange={(e) => setPeakPositionMs(parseInt(e.target.value, 10) || 10)}
                    disabled={isRecording}
                    className={styles.settingsInput}
                  />
                  <span className={styles.settingsHint}>ms (先頭からのオフセット)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 解析タブ */}
        {activeTab === 'analysis' && (
          <div className={styles.tabPanel}>
            {/* 隠しファイル入力 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".dat,.tar"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            {measurementHistory.length > 0 ? (
              <div className={styles.analysisContent}>
                {/* 測定履歴リスト */}
                <div className={styles.measurementList}>
                  <div className={styles.measurementListHeader}>
                    <h4>測定履歴</h4>
                    <button 
                      className={styles.importBtn}
                      onClick={handleImportClick}
                      title="測定データをインポート"
                    >
                      📂 読込
                    </button>
                  </div>
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
                      <div className={styles.measurementActions}>
                        <button 
                          className={styles.measurementSettingsBtn}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenMeasurementSettings(m)
                          }}
                          title="平均化した打鍵音設定"
                          disabled={!m.recordingData || m.keyDownTimestamps.length < 3}
                        >
                          ⚙️
                        </button>
                        <button 
                          className={styles.measurementExportBtn}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExportMeasurement(m)
                          }}
                          title="tarファイルとしてエクスポート"
                        >
                          💾
                        </button>
                        <button 
                          className={styles.measurementDeleteBtn}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteMeasurement(m.id)
                          }}
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 選択した測定の解析結果 */}
                {selectedMeasurement && (
                  <div className={styles.measurementAnalysis}>
                    <h3>{selectedMeasurement.name}</h3>
                    
                    {/* 元録音データ（スペクトル・特徴量・波形） */}
                    {selectedMeasurement.recordingData && (
                      <CollapsibleSection title={`📊 元録音データ (${(selectedMeasurement.recordingDurationMs / 1000).toFixed(1)}秒)`}>
                        <>
                          <SpectrumDisplay 
                            waveformData={selectedMeasurement.recordingData} 
                            title={`元録音データのスペクトル (${(selectedMeasurement.recordingDurationMs / 1000).toFixed(1)}秒)`}
                          />
                          <AudioFeaturesDisplay 
                            waveformData={selectedMeasurement.recordingData} 
                            title={`元録音データの特徴量 (${(selectedMeasurement.recordingDurationMs / 1000).toFixed(1)}秒)`}
                          />
                          <AveragedWaveform 
                            waveformData={selectedMeasurement.recordingData}
                            keyTapCount={selectedMeasurement.keyTapCount}
                            windowOffsetMs={0}
                            peakAlignEnabled={false}
                            title={`元録音データ (${(selectedMeasurement.recordingDurationMs / 1000).toFixed(1)}秒)`}
                            showKeyDownLine={false}
                            keyDownTimestamps={selectedMeasurement.keyDownTimestamps}
                            keyUpTimestamps={selectedMeasurement.keyUpTimestamps}
                            sampleRate={SAMPLE_RATE}
                          />
                        </>
                      </CollapsibleSection>
                    )}

                    {/* 平均化した打鍵音（スペクトル・特徴量・波形） */}
                    {selectedMeasurement.combinedWaveform && (
                      <CollapsibleSection title={`🎵 平均化した打鍵音 (間隔: ${selectedMeasurement.peakIntervalMs}ms)`} defaultExpanded={true}>
                        <>
                          <SpectrumDisplay 
                            waveformData={selectedMeasurement.combinedWaveform} 
                            title="平均化した打鍵音のスペクトル" 
                          />
                          <AudioFeaturesDisplay 
                            waveformData={selectedMeasurement.combinedWaveform} 
                            title={`平均化した打鍵音の特徴量 (間隔: ${selectedMeasurement.peakIntervalMs}ms)`} 
                          />
                          <AveragedWaveform 
                            waveformData={selectedMeasurement.combinedWaveform}
                            keyTapCount={selectedMeasurement.keyTapCount}
                            windowOffsetMs={0}
                            peakAlignEnabled={true}
                            title={`平均化した打鍵音 (アタック→${selectedMeasurement.peakIntervalMs}ms→リリース)`}
                            sampleRate={SAMPLE_RATE}
                          />
                        </>
                      </CollapsibleSection>
                    )}

                    {/* アタック音（スペクトル・特徴量・波形） */}
                    {selectedMeasurement.attackWaveform && (
                      <CollapsibleSection title="📈 アタック音" defaultExpanded={false}>
                        <>
                          <SpectrumDisplay 
                            waveformData={selectedMeasurement.attackWaveform} 
                            title="アタック音のスペクトル" 
                          />
                          <AudioFeaturesDisplay 
                            waveformData={selectedMeasurement.attackWaveform} 
                            title="アタック音の特徴量" 
                          />
                          <AveragedWaveform 
                            waveformData={selectedMeasurement.attackWaveform}
                            keyTapCount={selectedMeasurement.keyTapCount}
                            windowOffsetMs={0}
                            peakAlignEnabled={true}
                            title="アタック音 (KeyDown → KeyUp)"
                            sampleRate={SAMPLE_RATE}
                          />
                          {selectedMeasurement.attackWindows.length > 0 && (
                            <WindowsDebugView
                              windows={selectedMeasurement.attackWindows}
                              title="アタック音 - 個別ウィンドウ"
                              sampleRate={SAMPLE_RATE}
                            />
                          )}
                        </>
                      </CollapsibleSection>
                    )}

                    {/* リリース音（スペクトル・特徴量・波形） */}
                    {selectedMeasurement.releaseWaveform && (
                      <CollapsibleSection title="📉 リリース音" defaultExpanded={false}>
                        <>
                          <SpectrumDisplay 
                            waveformData={selectedMeasurement.releaseWaveform} 
                            title="リリース音のスペクトル" 
                          />
                          <AudioFeaturesDisplay 
                            waveformData={selectedMeasurement.releaseWaveform} 
                            title="リリース音の特徴量" 
                          />
                          <AveragedWaveform 
                            waveformData={selectedMeasurement.releaseWaveform}
                            keyTapCount={selectedMeasurement.keyUpCount}
                            windowOffsetMs={0}
                            peakAlignEnabled={true}
                            title="リリース音 (KeyUp → KeyDown)"
                            sampleRate={SAMPLE_RATE}
                          />
                          {selectedMeasurement.releaseWindows.length > 0 && (
                            <WindowsDebugView
                              windows={selectedMeasurement.releaseWindows}
                              title="リリース音 - 個別ウィンドウ"
                              sampleRate={SAMPLE_RATE}
                            />
                          )}
                        </>
                      </CollapsibleSection>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.emptyAnalysis}>
                <p>録音を完了するか、既存のデータを読み込んでください</p>
                <button 
                  className={styles.importBtnLarge}
                  onClick={handleImportClick}
                >
                  📂 測定データを読み込む
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* 測定データ設定モーダル */}
      {settingsModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setSettingsModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>平均化した打鍵音設定</h3>
              <button 
                className={styles.modalCloseBtn}
                onClick={() => setSettingsModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              {/* 波形長設定 */}
              <div className={styles.modalSettingsGroup}>
                <h4>出力波形設定</h4>
                <div className={styles.settingsRow}>
                  <label htmlFor="editUseMinWindowLengthInput">
                    <input
                      id="editUseMinWindowLengthInput"
                      type="checkbox"
                      checked={editUseMinWindowLengthInput}
                      onChange={(e) => setEditUseMinWindowLengthInput(e.target.checked)}
                    />
                    最小ウィンドウ長を使用
                  </label>
                  <span className={styles.settingsHint}>(チェック時は波形長設定を無視)</span>
                </div>
                <div className={styles.settingsRow}>
                  <label htmlFor="editWaveformLengthInput">波形長:</label>
                  <input
                    id="editWaveformLengthInput"
                    type="number"
                    min={10}
                    max={500}
                    step={10}
                    value={editWaveformLengthInput}
                    onChange={(e) => setEditWaveformLengthInput(parseInt(e.target.value, 10) || 100)}
                    className={styles.settingsInput}
                    disabled={editUseMinWindowLengthInput}
                  />
                  <span className={styles.settingsHint}>ms</span>
                </div>
                <div className={styles.settingsRow}>
                  <label htmlFor="editPeakPositionInput">ピーク位置:</label>
                  <input
                    id="editPeakPositionInput"
                    type="number"
                    min="1"
                    max="50"
                    value={editPeakPositionInput}
                    onChange={(e) => setEditPeakPositionInput(parseInt(e.target.value, 10) || 10)}
                    className={styles.settingsInput}
                  />
                  <span className={styles.settingsHint}>ms (先頭からのオフセット)</span>
                </div>
                <div className={styles.settingsRow}>
                  <label htmlFor="editPeakIntervalInput">ピーク間隔:</label>
                  <input
                    id="editPeakIntervalInput"
                    type="number"
                    min="0"
                    max="500"
                    value={editPeakIntervalInput}
                    onChange={(e) => setEditPeakIntervalInput(parseInt(e.target.value, 10) || 0)}
                    className={styles.settingsInput}
                  />
                  <span className={styles.settingsHint}>ms</span>
                </div>
              </div>

              {/* アタック音設定 */}
              <div className={styles.modalSettingsGroup}>
                <h4>アタック音設定</h4>
                <div className={styles.settingsRow}>
                  <label htmlFor="editAttackOffsetInput">ウィンドウオフセット:</label>
                  <input
                    id="editAttackOffsetInput"
                    type="number"
                    min="0"
                    max="100"
                    value={editAttackOffsetInput}
                    onChange={(e) => setEditAttackOffsetInput(parseInt(e.target.value, 10) || 0)}
                    className={styles.settingsInput}
                  />
                  <span className={styles.settingsHint}>ms</span>
                </div>
                <div className={styles.settingsRow}>
                  <label htmlFor="editAttackPeakAlign" className={styles.checkboxLabel}>
                    <input
                      id="editAttackPeakAlign"
                      type="checkbox"
                      checked={editAttackPeakAlignInput}
                      onChange={(e) => setEditAttackPeakAlignInput(e.target.checked)}
                      className={styles.checkbox}
                    />
                    ピーク同期モード
                  </label>
                </div>
              </div>

              {/* リリース音設定 */}
              <div className={styles.modalSettingsGroup}>
                <h4>リリース音設定</h4>
                <div className={styles.settingsRow}>
                  <label htmlFor="editReleaseOffsetInput">ウィンドウオフセット:</label>
                  <input
                    id="editReleaseOffsetInput"
                    type="number"
                    min="0"
                    max="100"
                    value={editReleaseOffsetInput}
                    onChange={(e) => setEditReleaseOffsetInput(parseInt(e.target.value, 10) || 0)}
                    className={styles.settingsInput}
                  />
                  <span className={styles.settingsHint}>ms</span>
                </div>
                <div className={styles.settingsRow}>
                  <label htmlFor="editReleasePeakAlign" className={styles.checkboxLabel}>
                    <input
                      id="editReleasePeakAlign"
                      type="checkbox"
                      checked={editReleasePeakAlignInput}
                      onChange={(e) => setEditReleasePeakAlignInput(e.target.checked)}
                      className={styles.checkbox}
                    />
                    ピーク同期モード
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button 
                className={styles.modalCancelBtn}
                onClick={() => setSettingsModalOpen(false)}
              >
                キャンセル
              </button>
              <button 
                className={styles.applyButton}
                onClick={handleApplyMeasurementSettings}
              >
                適用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
