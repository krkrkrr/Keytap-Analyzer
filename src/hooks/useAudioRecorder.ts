import { useState, useRef, useCallback, useEffect } from 'react'

export type RecordingStatus = 'idle' | 'recording' | 'completed' | 'error'

// 同期加算の設定
const DEFAULT_WINDOW_OFFSET_MS = 5   // デフォルトのキータップ前オフセット (ms)
const SAMPLE_RATE = 44100    // サンプルレート (Hz)
const PEAK_SEARCH_WINDOW_MS = 50  // ピーク検出用の検索範囲 (ms)
const MEASUREMENT_AUDIO_PEAK_OFFSET_MS = 10 // ピーク同期時のピークオフセット (ms)
const MEASUREMENT_AUDIO_PERIOD_MS = 100 // ピーク同期時の周期 (ms)

export interface UseAudioRecorderReturn {
  status: RecordingStatus
  statusMessage: string
  recordingData: Float32Array | null
  recordingProgress: number // 0-1の録音進捗
  isRecording: boolean
  canRecord: boolean
  keyTapCount: number // 検出されたキータップ数
  averagedWaveform: Float32Array | null // 同期加算平均波形
  windowOffsetMs: number // ウィンドウオフセット (ms)
  peakAlignEnabled: boolean // ピーク同期モード
  startRecording: () => Promise<void>
  initializeAudio: () => Promise<void>
  recalculateAveragedWaveform: (offsetMs: number, peakAlign: boolean) => void
}

export function useAudioRecorder(recordingDuration = 1000): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [recordingData, setRecordingData] = useState<Float32Array | null>(null)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [canRecord, setCanRecord] = useState(false)
  const [keyTapCount, setKeyTapCount] = useState(0)
  const [averagedWaveform, setAveragedWaveform] = useState<Float32Array | null>(null)
  const [windowOffsetMs, setWindowOffsetMs] = useState(DEFAULT_WINDOW_OFFSET_MS)
  const [peakAlignEnabled, setPeakAlignEnabled] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const keyTimestampsRef = useRef<number[]>([])
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
    setAveragedWaveform(null)
    keyTimestampsRef.current = []

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

    // チャンクを結合してFloat32Arrayを作成するヘルパー関数
    const combineChunks = (chunks: Float32Array[]): Float32Array => {
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Float32Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      return combined
    }

    // 音声データを収集
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer
      const inputData = inputBuffer.getChannelData(0)
      // データをコピー
      recordingChunks.push(new Float32Array(inputData))

      // リアルタイムで波形を更新
      setRecordingData(combineChunks(recordingChunks))
    }

    // オーディオグラフを接続
    audioInputRef.current.connect(analyserRef.current)
    analyserRef.current.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

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

    // 同期加算処理を実行（デフォルトはピーク同期OFF）
    calculateAveragedWaveform(combinedData, keyTimestampsRef.current, windowOffsetMs, false)
  }, [windowOffsetMs])

  // ウィンドウ内のピーク位置を検出する関数
  const findPeakIndex = useCallback((windowData: Float32Array, searchRangeSamples: number): number => {
    let maxValue = 0
    let peakIndex = 0
    
    // 検索範囲内でピークを探す
    const searchEnd = Math.min(searchRangeSamples, windowData.length)
    for (let i = 0; i < searchEnd; i++) {
      const absValue = Math.abs(windowData[i])
      if (absValue > maxValue) {
        maxValue = absValue
        peakIndex = i
      }
    }
    
    return peakIndex
  }, [])

  // 同期加算処理を行う関数（再計算可能）
  const calculateAveragedWaveform = useCallback((
    audioData: Float32Array,
    timestamps: number[],
    offsetMs: number,
    peakAlign: boolean
  ) => {
    // 最初と最後のウィンドウを除外するため、3つ以上のキータップが必要
    if (timestamps.length < 3) {
      setStatus('completed')
      setStatusMessage('録音完了！同期加算には3回以上のキータップが必要です。')
      return
    }

    // 最初と最後を除外したタイムスタンプ
    const trimmedTimestamps = timestamps.slice(1, -1)
    console.log(`元のキータップ数: ${timestamps.length}, 使用するキータップ数: ${trimmedTimestamps.length} (最初と最後を除外)`)

    // サンプルレートを取得
    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    const windowOffsetSamples = Math.floor((offsetMs / 1000) * sampleRate)
    const peakSearchSamples = Math.floor((PEAK_SEARCH_WINDOW_MS / 1000) * sampleRate)

    // 各キータップ間の間隔を計算（-X msから次のキータップの-X msまで）
    // trimmedTimestampsの各要素に対して、元のtimestampsの次の要素との間隔を使用
    const intervals: number[] = []
    for (let i = 1; i < timestamps.length - 1; i++) {
      const interval = timestamps[i + 1] - timestamps[i]
      intervals.push(interval)
    }

    // 最短の間隔を基準にウィンドウサイズを決定
    const minInterval = Math.min(...intervals)
    const rawWindowSize = Math.floor((minInterval / 1000) * sampleRate)

    console.log(`オフセット: ${offsetMs}ms, ピーク同期: ${peakAlign}`)
    console.log(`キータップ間隔: ${intervals.map(i => i.toFixed(0) + 'ms').join(', ')}`)
    console.log(`最短間隔: ${minInterval.toFixed(0)}ms`)

    if (peakAlign) {
      // ピーク同期モード
      // まず各ウィンドウを切り出し、ピーク位置を検出
      const windows: { data: Float32Array; peakIndex: number }[] = []
      
      for (let i = 0; i < trimmedTimestamps.length; i++) {
        const timestamp = trimmedTimestamps[i]
        const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
        const windowStart = sampleIndex - windowOffsetSamples
        const windowEnd = windowStart + rawWindowSize

        if (windowStart >= 0 && windowEnd <= audioData.length) {
          const windowData = audioData.slice(windowStart, windowEnd)
          const peakIndex = findPeakIndex(windowData, peakSearchSamples)
          windows.push({ data: windowData, peakIndex })
          console.log(`Window ${i + 1}: ピーク位置 ${peakIndex} サンプル (${((peakIndex / sampleRate) * 1000).toFixed(1)}ms)`)
        }
      }

      if (windows.length === 0) {
        setStatus('completed')
        setStatusMessage('録音完了！有効なウィンドウがありませんでした。')
        return
      }

      // ピーク位置の最大値を基準にウィンドウサイズを調整
      const maxPeakIndex = Math.max(...windows.map(w => w.peakIndex))
      const minRemainingAfterPeak = Math.min(...windows.map(w => w.data.length - w.peakIndex))
      
      // ピーク前後の余裕を確保した新しいウィンドウサイズ
      const peakBeforeSamples = maxPeakIndex
      const peakAfterSamples = minRemainingAfterPeak
      const alignedWindowSize = peakBeforeSamples + peakAfterSamples

      console.log(`ピーク同期: 前 ${peakBeforeSamples} サンプル, 後 ${peakAfterSamples} サンプル, 合計 ${alignedWindowSize} サンプル`)

      // ピーク位置を揃えて同期加算
      const summedWaveform = new Float32Array(alignedWindowSize)
      
      for (const window of windows) {
        const shift = maxPeakIndex - window.peakIndex
        for (let j = 0; j < alignedWindowSize; j++) {
          const sourceIndex = j - shift
          if (sourceIndex >= 0 && sourceIndex < window.data.length) {
            summedWaveform[j] += window.data[sourceIndex]
          }
        }
      }

      // 平均化
      for (let i = 0; i < alignedWindowSize; i++) {
        summedWaveform[i] /= windows.length
      }

      const slicedWaveform = sliceWaveform(summedWaveform, MEASUREMENT_AUDIO_PEAK_OFFSET_MS, MEASUREMENT_AUDIO_PERIOD_MS)

      setAveragedWaveform(slicedWaveform)
      setWindowOffsetMs(offsetMs)
      setPeakAlignEnabled(true)
      setStatus('completed')
      setStatusMessage(`録音完了！${windows.length}回のキータップをピーク同期で加算しました。(ウィンドウ: ${((alignedWindowSize / sampleRate) * 1000).toFixed(0)}ms)`)
    } else {
      // 従来の同期加算モード（キーイベント基準）
      const windowSize = rawWindowSize
      const summedWaveform = new Float32Array(windowSize)
      let validWindowCount = 0

      for (let i = 0; i < trimmedTimestamps.length; i++) {
        const timestamp = trimmedTimestamps[i]
        const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
        const windowStart = sampleIndex - windowOffsetSamples
        const windowEnd = windowStart + windowSize

        if (windowStart >= 0 && windowEnd <= audioData.length) {
          for (let j = 0; j < windowSize; j++) {
            summedWaveform[j] += audioData[windowStart + j]
          }
          validWindowCount++
        }
      }

      if (validWindowCount > 0) {
        for (let i = 0; i < windowSize; i++) {
          summedWaveform[i] /= validWindowCount
        }
        setAveragedWaveform(summedWaveform)
        setWindowOffsetMs(offsetMs)
        setPeakAlignEnabled(false)
        setStatus('completed')
        setStatusMessage(`録音完了！${validWindowCount}回のキータップを同期加算しました。(オフセット: -${offsetMs}ms, ウィンドウ: ${minInterval.toFixed(0)}ms)`)
      } else {
        setStatus('completed')
        setStatusMessage('録音完了！有効なウィンドウがありませんでした。')
      }
    }
  }, [findPeakIndex])

  // ユーザーがオフセットを変更した時に再計算する関数
  const recalculateAveragedWaveform = useCallback((offsetMs: number, peakAlign: boolean) => {
    const audioData = finalRecordingDataRef.current
    const timestamps = keyTimestampsRef.current
    
    if (!audioData || timestamps.length === 0) {
      return
    }
    
    calculateAveragedWaveform(audioData, timestamps, offsetMs, peakAlign)
  }, [calculateAveragedWaveform])

  // keydownイベントリスナー
  useEffect(() => {
    const handleKeyDown = (_event: KeyboardEvent) => {
      if (!isRecording) return
      
      // 録音開始からの経過時間を記録
      const elapsed = Date.now() - recordingStartTimeRef.current
      keyTimestampsRef.current.push(elapsed)
      setKeyTapCount(keyTimestampsRef.current.length)
      
      console.log(`KeyTap detected at ${elapsed}ms`)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRecording])

  return {
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
  }
}

function sliceWaveform(wave: Float32Array, peakOffsetMs: number, periodMs: number): Float32Array {
  const sampleRate = SAMPLE_RATE
  const peakOffsetSamples = Math.floor(peakOffsetMs * (sampleRate / 1000))
  const periodSamples = Math.floor(periodMs * (sampleRate / 1000))
  const getPeakIndex = (_wave: Float32Array) => {
    let maxValue = 0
    let peakIndex = 0
    for (let i = 0; i < _wave.length; i++) {
      const absValue = Math.abs(_wave[i])
      if (absValue > maxValue) {
        maxValue = absValue
        peakIndex = i
      }
    }
    return peakIndex
  }
  const currentPeakSamples = getPeakIndex(wave)
  return wave.slice(
    Math.max(0, currentPeakSamples - peakOffsetSamples),
    Math.min(wave.length, currentPeakSamples - peakOffsetSamples + periodSamples)
  )
}