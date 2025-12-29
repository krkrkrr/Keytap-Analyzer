import { useState, useRef, useCallback, useEffect } from 'react'
import { 
  calculateSyncAveragedWaveform, 
  calculateCombinedWaveform as calcCombined,
  findPeakIndex,
  calculateWindowEndTimestamps
} from '../utils/waveformProcessing'

export type RecordingStatus = 'idle' | 'recording' | 'completed' | 'error'

// 同期加算の設定
const DEFAULT_WINDOW_OFFSET_MS = 5   // デフォルトのキータップ前オフセット (ms)
const DEFAULT_RELEASE_OFFSET_MS = 30 // デフォルトのリリース音前オフセット (ms) ※リリース音はKeyUp前に発生
const DEFAULT_PEAK_INTERVAL_MS = 12  // アタック音ピークからリリース音ピークまでのデフォルト間隔 (ms)
const DEFAULT_WAVEFORM_LENGTH_MS = 70 // デフォルトの波形長 (ms)
const DEFAULT_PEAK_POSITION_MS = 10  // デフォルトのピーク位置オフセット (ms)
const SAMPLE_RATE = 48000    // サンプルレート (Hz)

export interface UseAudioRecorderReturn {
  status: RecordingStatus
  statusMessage: string
  recordingData: Float32Array | null
  finalRecordingData: Float32Array | null // 録音完了時の最終データ
  recordingProgress: number // 0-1の録音進捗
  isRecording: boolean
  canRecord: boolean
  keyTapCount: number // 検出されたキータップ数
  keyUpCount: number // 検出されたキーアップ数
  keyDownTimestamps: number[] // キーダウンのタイムスタンプ (ms)
  keyUpTimestamps: number[] // キーアップのタイムスタンプ (ms)
  averagedWaveform: Float32Array | null // アタック音の同期加算平均波形
  releaseWaveform: Float32Array | null // リリース音の同期加算平均波形
  combinedWaveform: Float32Array | null // 合成された平均化した打鍵音
  windowOffsetMs: number // ウィンドウオフセット (ms)
  releaseOffsetMs: number // リリース音のウィンドウオフセット (ms)
  peakIntervalMs: number // アタック音ピークからリリース音ピークまでの間隔 (ms)
  peakAlignEnabled: boolean // ピーク同期モード
  waveformLengthMs: number // 波形長 (ms)
  peakPositionMs: number // ピーク位置オフセット (ms)
  sampleRate: number // サンプルレート (Hz)
  startRecording: () => Promise<void>
  initializeAudio: () => Promise<void>
  recalculateAveragedWaveform: (offsetMs: number, peakAlign: boolean) => void
  recalculateReleaseWaveform: (offsetMs: number, peakAlign: boolean) => void
  recalculateCombinedWaveform: (intervalMs: number) => void
  setWaveformLengthMs: (lengthMs: number) => void
  setPeakPositionMs: (positionMs: number) => void
}

export function useAudioRecorder(recordingDuration = 1000): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [recordingData, setRecordingData] = useState<Float32Array | null>(null)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [canRecord, setCanRecord] = useState(false)
  const [keyTapCount, setKeyTapCount] = useState(0)
  const [keyUpCount, setKeyUpCount] = useState(0)
  const [averagedWaveform, setAveragedWaveform] = useState<Float32Array | null>(null)
  const [releaseWaveform, setReleaseWaveform] = useState<Float32Array | null>(null)
  const [combinedWaveform, setCombinedWaveform] = useState<Float32Array | null>(null)
  const [windowOffsetMs, setWindowOffsetMs] = useState(DEFAULT_WINDOW_OFFSET_MS)
  const [releaseOffsetMs, setReleaseOffsetMs] = useState(DEFAULT_RELEASE_OFFSET_MS)
  const [peakIntervalMs, setPeakIntervalMs] = useState(DEFAULT_PEAK_INTERVAL_MS)
  const [peakAlignEnabled, setPeakAlignEnabled] = useState(false)
  const [waveformLengthMs, setWaveformLengthMs] = useState(DEFAULT_WAVEFORM_LENGTH_MS)
  const [peakPositionMs, setPeakPositionMs] = useState(DEFAULT_PEAK_POSITION_MS)
  const [actualSampleRate, setActualSampleRate] = useState(SAMPLE_RATE) // 実際のサンプルレート

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const audioContextStartTimeRef = useRef<number>(0) // 録音開始時のAudioContext.currentTime (秒)
  const firstChunkReceivedRef = useRef<boolean>(false) // 最初のオーディオチャンクを受信したかどうか
  const pendingKeyDownTimestampsRef = useRef<number[]>([]) // 最初のチャンク前のキーダウンイベント（AudioContext.currentTime）
  const pendingKeyUpTimestampsRef = useRef<number[]>([]) // 最初のチャンク前のキーアップイベント（AudioContext.currentTime）
  const keyTimestampsRef = useRef<number[]>([])
  const keyUpTimestampsRef = useRef<number[]>([])
  // 累積サンプル数とplaybackTimeのマッピングを保持（同期補正用）
  const sampleTimeMapRef = useRef<{ samples: number; playbackTime: number }[]>([])
  const finalRecordingDataRef = useRef<Float32Array | null>(null)

  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      setCanRecord(true)
      setStatusMessage('')
      console.log('マイクアクセス許可取得成功')
    } catch (error) {
      console.error('デバイス取得エラー:', error)
      setStatus('error')
      setStatusMessage('マイクへのアクセスが拒否されました。')
      setCanRecord(false)
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (!mediaStreamRef.current) {
      setStatus('error')
      setStatusMessage('音声デバイスが初期化されていません。')
      return
    }

    if (isRecording) {
      return
    }

    setIsRecording(true)
    setStatus('recording')
    setStatusMessage(`録音中... (任意のキーを押してください)`)
    setRecordingProgress(0)
    setKeyTapCount(0)
    setKeyUpCount(0)
    setAveragedWaveform(null)
    setReleaseWaveform(null)
    keyTimestampsRef.current = []
    keyUpTimestampsRef.current = []

    // 進捗更新用のタイマー
    const startTime = Date.now()
    recordingStartTimeRef.current = startTime
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / recordingDuration, 1)
      setRecordingProgress(progress)
    }, 50) // 50msごとに更新

    // AudioContextを初期化
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }

    const audioContext = audioContextRef.current
    
    // 実際のサンプルレートを取得して保存
    const realSampleRate = audioContext.sampleRate
    setActualSampleRate(realSampleRate)
    console.log(`AudioContext サンプルレート: ${realSampleRate}Hz`)

    // AudioContextを再開（ユーザージェスチャーが必要な場合）
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    // 音声入力ソースを作成
    audioInputRef.current = audioContext.createMediaStreamSource(mediaStreamRef.current)

    // アナライザーを作成
    analyserRef.current = audioContext.createAnalyser()
    analyserRef.current.fftSize = 2048

    // スクリプトプロセッサーを作成（音声データを取得するため）
    const bufferSize = 4096
    const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1)

    const recordingChunks: Float32Array[] = []

    // 録音されたサンプル数をトラッキング（累積で正確なタイムスタンプを計算）
    let totalSamplesRecorded = 0

    // 最初のチャンク前フラグをリセット
    firstChunkReceivedRef.current = false
    pendingKeyDownTimestampsRef.current = []
    pendingKeyUpTimestampsRef.current = []
    sampleTimeMapRef.current = []

    // 音声データを収集
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer
      const inputData = inputBuffer.getChannelData(0)
      
      // playbackTime: このバッファの「出力」が再生される予定の時刻（秒）
      // 注意: これは入力データの録音時刻ではなく、出力の再生時刻
      // 入力データの録音時刻 = playbackTime - bufferDuration（入出力間の遅延）
      const playbackTime = audioProcessingEvent.playbackTime
      const bufferDurationSec = bufferSize / realSampleRate
      
      // 最初のチャンクが来た時点で、録音開始時刻を調整
      // 入力データの録音時刻を推定: playbackTime - bufferDuration
      if (!firstChunkReceivedRef.current) {
        // playbackTimeは出力時刻なので、入力データの開始時刻はバッファ分だけ前
        // これにより、キーイベントのタイムスタンプとオーディオデータが正しく同期する
        const inputStartTime = playbackTime - bufferDurationSec
        audioContextStartTimeRef.current = inputStartTime
        console.log(`最初のオーディオチャンク受信: playbackTime=${playbackTime.toFixed(3)}s, 入力開始時刻=${inputStartTime.toFixed(3)}s, AudioContext.currentTime=${audioContext.currentTime.toFixed(3)}s, バッファ時間=${bufferDurationSec.toFixed(3)}s`)
        
        // 最初のチャンク前に発生したキーイベントを正しいタイムスタンプで再計算
        for (const audioTime of pendingKeyDownTimestampsRef.current) {
          const elapsedMs = (audioTime - audioContextStartTimeRef.current) * 1000
          keyTimestampsRef.current.push(elapsedMs)
          console.log(`[遅延処理] KeyDown at ${elapsedMs.toFixed(1)}ms (原AudioContext.currentTime=${audioTime.toFixed(3)}s)`)
        }
        for (const audioTime of pendingKeyUpTimestampsRef.current) {
          const elapsedMs = (audioTime - audioContextStartTimeRef.current) * 1000
          keyUpTimestampsRef.current.push(elapsedMs)
          console.log(`[遅延処理] KeyUp at ${elapsedMs.toFixed(1)}ms (原AudioContext.currentTime=${audioTime.toFixed(3)}s)`)
        }
        setKeyTapCount(keyTimestampsRef.current.length)
        setKeyUpCount(keyUpTimestampsRef.current.length)
        
        pendingKeyDownTimestampsRef.current = []
        pendingKeyUpTimestampsRef.current = []
        firstChunkReceivedRef.current = true
      }
      
      // サンプル数と入力時刻のマッピングを保存（補正計算用）
      // 入力データの時刻 = playbackTime - bufferDuration
      // このチャンクの終了時点でのマッピングを記録
      const inputEndTime = playbackTime  // このチャンクの入力終了時刻（= 次のチャンクの入力開始時刻）
      sampleTimeMapRef.current.push({
        samples: totalSamplesRecorded + inputData.length,
        playbackTime: inputEndTime  // 入力データの終了時刻
      })
      // メモリ節約のため、古いエントリを削除（直近30秒分だけ保持）
      const maxEntries = Math.ceil(30 * realSampleRate / bufferSize)
      if (sampleTimeMapRef.current.length > maxEntries) {
        sampleTimeMapRef.current.shift()
      }
      
      // データをコピー
      recordingChunks.push(new Float32Array(inputData))
      totalSamplesRecorded += inputData.length
      
      // デバッグ: 蓄積サンプル数と時刻の整合性をチェック（1秒ごと）
      const expectedTimeMs = (totalSamplesRecorded / realSampleRate) * 1000
      const actualTimeMs = (inputEndTime - audioContextStartTimeRef.current) * 1000
      if (Math.floor(totalSamplesRecorded / realSampleRate) > Math.floor((totalSamplesRecorded - inputData.length) / realSampleRate)) {
        console.log(`[同期チェック] ${Math.floor(totalSamplesRecorded / realSampleRate)}秒経過: サンプル数ベース=${expectedTimeMs.toFixed(1)}ms, 入力時刻ベース=${actualTimeMs.toFixed(1)}ms, 差=${(actualTimeMs - expectedTimeMs).toFixed(1)}ms`)
      }

      // リアルタイム波形表示は無効化（処理負荷軽減のため）
      // updateCounter++
      // if (updateCounter % 5 === 0) {
      //   setRecordingData(combineChunks(recordingChunks))
      // }
    }

    // オーディオグラフを接続
    audioInputRef.current.connect(analyserRef.current)
    analyserRef.current.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)
    
    // 初期値として接続時点のAudioContext.currentTimeを記録（最初のチャンクで補正される）
    audioContextStartTimeRef.current = audioContext.currentTime
    console.log(`オーディオグラフ接続: AudioContext.currentTime = ${audioContextStartTimeRef.current.toFixed(3)}秒`)

    // 指定時間後に録音を停止
    setTimeout(() => {
      clearInterval(progressInterval)
      setRecordingProgress(1)
      stopRecording(scriptProcessor, recordingChunks)
    }, recordingDuration)
  }, [isRecording, recordingDuration])

  const stopRecording = useCallback((
    scriptProcessor: ScriptProcessorNode,
    recordingChunks: Float32Array[]
  ) => {
    setIsRecording(false)

    // 接続を切断
    if (audioInputRef.current) {
      audioInputRef.current.disconnect()
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
    }
    if (scriptProcessor) {
      scriptProcessor.disconnect()
    }

    // すべてのデータを1つの配列に結合
    if (recordingChunks.length === 0) {
      setStatus('error')
      setStatusMessage('録音データがありません。')
      return
    }

    // 最終的なデータを設定
    const totalLength = recordingChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0
    )
    const combinedData = new Float32Array(totalLength)
    let offset = 0

    for (const chunk of recordingChunks) {
      combinedData.set(chunk, offset)
      offset += chunk.length
    }

    setRecordingData(combinedData)
    finalRecordingDataRef.current = combinedData

    // アタック音の同期加算処理を実行（デフォルトはピーク同期ON）
    calculateAveragedWaveform(combinedData, keyTimestampsRef.current, keyUpTimestampsRef.current, windowOffsetMs, true, peakPositionMs)
    // リリース音の同期加算処理を実行（デフォルトはピーク同期ON）
    calculateReleaseWaveform(combinedData, keyUpTimestampsRef.current, keyTimestampsRef.current, releaseOffsetMs, true, peakPositionMs)
  }, [windowOffsetMs, releaseOffsetMs, peakPositionMs])

  // アタック音の同期加算処理を行う関数（keydown から keyup まで）
  const calculateAveragedWaveform = useCallback((
    audioData: Float32Array,
    keyDownTimestamps: number[],
    keyUpTimestamps: number[],
    offsetMs: number,
    peakAlign: boolean,
    peakPosMs: number  // ピーク位置オフセット (ms)
  ) => {
    // 最初と最後のウィンドウを除外するため、3つ以上のキータップが必要
    if (keyDownTimestamps.length < 3) {
      setStatus('completed')
      setStatusMessage('録音完了！同期加算には3回以上のキータップが必要です。')
      return
    }

    // 最初と最後を除外したタイムスタンプ
    const trimmedDownTimestamps = keyDownTimestamps.slice(1, -1)
    const trimmedUpTimestamps = keyUpTimestamps.slice(1, -1)
    console.log(`[アタック音] 元のキータップ数: ${keyDownTimestamps.length}, 使用するキータップ数: ${trimmedDownTimestamps.length} (最初と最後を除外)`)

    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    console.log(`[アタック音] オフセット: ${offsetMs}ms, ピーク同期: ${peakAlign}`)
    
    // 動的ウィンドウ終端を計算
    const endTimestamps = calculateWindowEndTimestamps(trimmedDownTimestamps, trimmedUpTimestamps)

    const result = calculateSyncAveragedWaveform({
      audioData,
      timestamps: trimmedDownTimestamps,
      endTimestamps,
      offsetMs,
      peakAlign,
      peakPositionMs: peakPosMs,
      sampleRate
    })

    if (result.waveform) {
      setAveragedWaveform(result.waveform)
      setWindowOffsetMs(offsetMs)
      setPeakAlignEnabled(peakAlign)
      setStatus('completed')
      const modeText = peakAlign ? 'ピーク同期で加算' : '同期加算'
      setStatusMessage(`録音完了！アタック: ${result.windowCount}回を${modeText} (${result.outputLengthMs.toFixed(0)}ms)`)
    } else {
      setStatus('completed')
      setStatusMessage('録音完了！有効なアタック音ウィンドウがありませんでした。')
    }
  }, [])

  // リリース音の同期加算処理を行う関数（keyup から keydown まで）
  const calculateReleaseWaveform = useCallback((
    audioData: Float32Array,
    keyUpTimestamps: number[],
    keyDownTimestamps: number[],
    offsetMs: number,
    peakAlign: boolean,
    peakPosMs: number  // ピーク位置オフセット (ms)
  ) => {
    // keyupが2つ以上必要
    if (keyUpTimestamps.length < 2) {
      console.log('[リリース音] キーアップが2回未満のため計算をスキップ')
      return
    }

    // 最初と最後を除外（1つしかない場合は除外しない）
    const trimmedUpTimestamps = keyUpTimestamps.length >= 3 
      ? keyUpTimestamps.slice(1, -1) 
      : keyUpTimestamps.slice(0, 1)
    console.log(`[リリース音] 元のキーアップ数: ${keyUpTimestamps.length}, 使用するキーアップ数: ${trimmedUpTimestamps.length}`)

    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    console.log(`[リリース音] オフセット: ${offsetMs}ms, ピーク同期: ${peakAlign}`)

    // 動的ウィンドウ終端を計算（リリース音の場合は keyUp → 次のkeyDown または keyUp の早い方）
    const allTimestamps = [...keyDownTimestamps, ...keyUpTimestamps].sort((a, b) => a - b)
    const endTimestamps = calculateWindowEndTimestamps(trimmedUpTimestamps, allTimestamps)

    const result = calculateSyncAveragedWaveform({
      audioData,
      timestamps: trimmedUpTimestamps,
      endTimestamps,
      offsetMs,
      peakAlign,
      peakPositionMs: peakPosMs,
      sampleRate
    })

    if (result.waveform) {
      setReleaseWaveform(result.waveform)
      setReleaseOffsetMs(offsetMs)
      const modeText = peakAlign ? 'ピーク同期で加算' : '同期加算'
      console.log(`[リリース音] ${result.windowCount}回を${modeText} (${result.outputLengthMs.toFixed(0)}ms)`)
    } else {
      console.log('[リリース音] 有効なウィンドウがありませんでした')
    }
  }, [])

  // 合成波形を計算する関数（アタック音のピークからintervalMs後にリリース音のピークが来るように配置）
  const calculateCombinedWaveformLocal = useCallback((
    attackWaveform: Float32Array,
    releaseWaveformData: Float32Array,
    intervalMs: number
  ) => {
    if (!attackWaveform || !releaseWaveformData) {
      console.log('[合成波形] アタック音またはリリース音がありません')
      return null
    }

    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    
    console.log(`[合成波形] アタックピーク: ${findPeakIndex(attackWaveform)} (${((findPeakIndex(attackWaveform) / sampleRate) * 1000).toFixed(1)}ms)`)
    console.log(`[合成波形] リリースピーク: ${findPeakIndex(releaseWaveformData)} (${((findPeakIndex(releaseWaveformData) / sampleRate) * 1000).toFixed(1)}ms)`)
    console.log(`[合成波形] ピーク間隔: ${intervalMs}ms`)

    const combined = calcCombined(attackWaveform, releaseWaveformData, intervalMs, sampleRate)
    
    console.log(`[合成波形] 合成波形長: ${combined.length} (${((combined.length / sampleRate) * 1000).toFixed(1)}ms)`)

    return combined
  }, [])

  // ユーザーがオフセットを変更した時に再計算する関数
  const recalculateAveragedWaveform = useCallback((offsetMs: number, peakAlign: boolean) => {
    const audioData = finalRecordingDataRef.current
    const keyDownTimestamps = keyTimestampsRef.current
    const keyUpTimestamps = keyUpTimestampsRef.current
    
    if (!audioData || keyDownTimestamps.length === 0) {
      return
    }
    
    calculateAveragedWaveform(audioData, keyDownTimestamps, keyUpTimestamps, offsetMs, peakAlign, peakPositionMs)
  }, [calculateAveragedWaveform, peakPositionMs])

  // リリース音のオフセットを変更した時に再計算する関数
  const recalculateReleaseWaveform = useCallback((offsetMs: number, peakAlign: boolean) => {
    const audioData = finalRecordingDataRef.current
    const keyDownTimestamps = keyTimestampsRef.current
    const keyUpTimestamps = keyUpTimestampsRef.current
    
    if (!audioData || keyUpTimestamps.length === 0) {
      return
    }
    
    calculateReleaseWaveform(audioData, keyUpTimestamps, keyDownTimestamps, offsetMs, peakAlign, peakPositionMs)
  }, [calculateReleaseWaveform, peakPositionMs])

  // 合成波形を再計算する関数
  const recalculateCombinedWaveform = useCallback((intervalMs: number) => {
    setPeakIntervalMs(intervalMs)
    
    if (!averagedWaveform || !releaseWaveform) {
      console.log('[合成波形] アタック音またはリリース音がありません')
      setCombinedWaveform(null)
      return
    }

    const combined = calculateCombinedWaveformLocal(averagedWaveform, releaseWaveform, intervalMs)
    setCombinedWaveform(combined)
  }, [averagedWaveform, releaseWaveform, calculateCombinedWaveformLocal])

  // アタック音またはリリース音が変更されたら合成波形を再計算
  useEffect(() => {
    if (averagedWaveform && releaseWaveform) {
      const combined = calculateCombinedWaveformLocal(averagedWaveform, releaseWaveform, peakIntervalMs)
      setCombinedWaveform(combined)
    } else {
      setCombinedWaveform(null)
    }
  }, [averagedWaveform, releaseWaveform, peakIntervalMs, calculateCombinedWaveformLocal])

  // AudioContext.currentTimeからサンプル数ベースのタイムスタンプ（ms）を計算する
  // sampleTimeMapを使用して、playbackTimeとサンプル数の対応関係から補正を行う
  const audioTimeToSampleBasedMs = useCallback((audioTime: number): number => {
    const map = sampleTimeMapRef.current
    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    
    // マップが空の場合は単純計算
    if (map.length === 0) {
      return (audioTime - audioContextStartTimeRef.current) * 1000
    }
    
    // audioTimeに最も近いエントリを探す（線形補間）
    let prevEntry = map[0]
    let nextEntry = map[map.length - 1]
    
    for (let i = 0; i < map.length; i++) {
      if (map[i].playbackTime <= audioTime) {
        prevEntry = map[i]
      }
      if (map[i].playbackTime >= audioTime && (nextEntry.playbackTime > audioTime || i === map.length - 1)) {
        nextEntry = map[i]
        break
      }
    }
    
    // prevEntryとnextEntryの間で線形補間
    if (prevEntry === nextEntry || prevEntry.playbackTime === nextEntry.playbackTime) {
      // サンプル数ベースで計算
      const deltaTime = audioTime - prevEntry.playbackTime
      const deltaSamples = deltaTime * sampleRate
      const totalSamples = prevEntry.samples + deltaSamples
      return (totalSamples / sampleRate) * 1000
    }
    
    // 線形補間で正確なサンプル位置を推定
    const timeFraction = (audioTime - prevEntry.playbackTime) / (nextEntry.playbackTime - prevEntry.playbackTime)
    const interpolatedSamples = prevEntry.samples + (nextEntry.samples - prevEntry.samples) * timeFraction
    return (interpolatedSamples / sampleRate) * 1000
  }, [])

  // keydownイベントリスナー
  useEffect(() => {
    const handleKeyDown = (_event: KeyboardEvent) => {
      if (!isRecording) return
      if (!audioContextRef.current) return
      
      // AudioContext.currentTimeを取得
      const currentAudioTime = audioContextRef.current.currentTime
      
      // 最初のオーディオチャンクがまだ来ていない場合は、タイムスタンプを保留
      if (!firstChunkReceivedRef.current) {
        pendingKeyDownTimestampsRef.current.push(currentAudioTime)
        console.log(`KeyDown detected (pending) AudioContext.currentTime=${currentAudioTime.toFixed(3)}s`)
        return
      }
      
      // サンプル数ベースで正確なタイムスタンプを計算
      const elapsedMs = audioTimeToSampleBasedMs(currentAudioTime)
      
      // 旧方式（比較用）
      const oldElapsedMs = (currentAudioTime - audioContextStartTimeRef.current) * 1000
      
      keyTimestampsRef.current.push(elapsedMs)
      setKeyTapCount(keyTimestampsRef.current.length)
      
      console.log(`KeyDown detected at ${elapsedMs.toFixed(1)}ms (旧方式: ${oldElapsedMs.toFixed(1)}ms, 差: ${(elapsedMs - oldElapsedMs).toFixed(1)}ms)`)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRecording, audioTimeToSampleBasedMs])

  // keyupイベントリスナー
  useEffect(() => {
    const handleKeyUp = (_event: KeyboardEvent) => {
      if (!isRecording) return
      if (!audioContextRef.current) return
      
      // AudioContext.currentTimeを取得
      const currentAudioTime = audioContextRef.current.currentTime
      
      // 最初のオーディオチャンクがまだ来ていない場合は、タイムスタンプを保留
      if (!firstChunkReceivedRef.current) {
        pendingKeyUpTimestampsRef.current.push(currentAudioTime)
        console.log(`KeyUp detected (pending) AudioContext.currentTime=${currentAudioTime.toFixed(3)}s`)
        return
      }
      
      // サンプル数ベースで正確なタイムスタンプを計算
      const elapsedMs = audioTimeToSampleBasedMs(currentAudioTime)
      
      // 旧方式（比較用）
      const oldElapsedMs = (currentAudioTime - audioContextStartTimeRef.current) * 1000
      
      keyUpTimestampsRef.current.push(elapsedMs)
      setKeyUpCount(keyUpTimestampsRef.current.length)
      
      console.log(`KeyUp detected at ${elapsedMs.toFixed(1)}ms (旧方式: ${oldElapsedMs.toFixed(1)}ms, 差: ${(elapsedMs - oldElapsedMs).toFixed(1)}ms)`)
    }

    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isRecording])

  return {
    status,
    statusMessage,
    recordingData,
    finalRecordingData: finalRecordingDataRef.current,
    recordingProgress,
    isRecording,
    canRecord,
    keyTapCount,
    keyUpCount,
    keyDownTimestamps: keyTimestampsRef.current,
    keyUpTimestamps: keyUpTimestampsRef.current,
    averagedWaveform,
    releaseWaveform,
    combinedWaveform,
    windowOffsetMs,
    releaseOffsetMs,
    peakIntervalMs,
    peakAlignEnabled,
    waveformLengthMs,
    peakPositionMs,
    sampleRate: actualSampleRate,
    startRecording,
    initializeAudio,
    recalculateAveragedWaveform,
    recalculateReleaseWaveform,
    recalculateCombinedWaveform,
    setWaveformLengthMs,
    setPeakPositionMs,
  }
}