import { useState, useRef, useCallback, useEffect } from 'react'

export type RecordingStatus = 'idle' | 'recording' | 'completed' | 'error'

// 同期加算の設定
const DEFAULT_WINDOW_OFFSET_MS = 5   // デフォルトのキータップ前オフセット (ms)
const DEFAULT_RELEASE_OFFSET_MS = 5  // デフォルトのリリース音前オフセット (ms)
const DEFAULT_PEAK_INTERVAL_MS = 20  // アタック音ピークからリリース音ピークまでのデフォルト間隔 (ms)
const DEFAULT_WAVEFORM_LENGTH_MS = 100 // デフォルトの波形長 (ms)
const SAMPLE_RATE = 48000    // サンプルレート (Hz)
const PEAK_SEARCH_WINDOW_MS = 50  // ピーク検出用の検索範囲 (ms)

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
  combinedWaveform: Float32Array | null // 合成された測定用音声
  windowOffsetMs: number // ウィンドウオフセット (ms)
  releaseOffsetMs: number // リリース音のウィンドウオフセット (ms)
  peakIntervalMs: number // アタック音ピークからリリース音ピークまでの間隔 (ms)
  peakAlignEnabled: boolean // ピーク同期モード
  waveformLengthMs: number // 波形長 (ms)
  startRecording: () => Promise<void>
  initializeAudio: () => Promise<void>
  recalculateAveragedWaveform: (offsetMs: number, peakAlign: boolean) => void
  recalculateReleaseWaveform: (offsetMs: number, peakAlign: boolean) => void
  recalculateCombinedWaveform: (intervalMs: number) => void
  setWaveformLengthMs: (lengthMs: number) => void
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

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const keyTimestampsRef = useRef<number[]>([])
  const keyUpTimestampsRef = useRef<number[]>([])
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

    // アタック音の同期加算処理を実行（デフォルトはピーク同期OFF）
    calculateAveragedWaveform(combinedData, keyTimestampsRef.current, keyUpTimestampsRef.current, windowOffsetMs, false, waveformLengthMs)
    // リリース音の同期加算処理を実行
    calculateReleaseWaveform(combinedData, keyUpTimestampsRef.current, keyTimestampsRef.current, releaseOffsetMs, false, waveformLengthMs)
  }, [windowOffsetMs, releaseOffsetMs, waveformLengthMs])

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

  // アタック音の同期加算処理を行う関数（keydown から keyup まで）
  const calculateAveragedWaveform = useCallback((
    audioData: Float32Array,
    keyDownTimestamps: number[],
    _keyUpTimestamps: number[],
    offsetMs: number,
    peakAlign: boolean,
    targetLengthMs: number
  ) => {
    // 最初と最後のウィンドウを除外するため、3つ以上のキータップが必要
    if (keyDownTimestamps.length < 3) {
      setStatus('completed')
      setStatusMessage('録音完了！同期加算には3回以上のキータップが必要です。')
      return
    }

    // 最初と最後を除外したタイムスタンプ
    const trimmedDownTimestamps = keyDownTimestamps.slice(1, -1)
    console.log(`[アタック音] 元のキータップ数: ${keyDownTimestamps.length}, 使用するキータップ数: ${trimmedDownTimestamps.length} (最初と最後を除外)`)

    // サンプルレートを取得
    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    const windowOffsetSamples = Math.floor((offsetMs / 1000) * sampleRate)
    const peakSearchSamples = Math.floor((PEAK_SEARCH_WINDOW_MS / 1000) * sampleRate)
    const targetLengthSamples = Math.floor((targetLengthMs / 1000) * sampleRate)

    // 固定長ウィンドウを使用（十分な長さを確保）
    const rawWindowSize = targetLengthSamples + windowOffsetSamples + peakSearchSamples

    console.log(`[アタック音] オフセット: ${offsetMs}ms, ピーク同期: ${peakAlign}, 目標長: ${targetLengthMs}ms`)

    if (peakAlign) {
      // ピーク同期モード
      // まず各ウィンドウを切り出し、ピーク位置を検出
      const windows: { data: Float32Array; peakIndex: number }[] = []
      
      for (let i = 0; i < trimmedDownTimestamps.length; i++) {
        const timestamp = trimmedDownTimestamps[i]
        const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
        const windowStart = sampleIndex - windowOffsetSamples
        const windowEnd = Math.min(windowStart + rawWindowSize, audioData.length)

        if (windowStart >= 0 && windowEnd > windowStart) {
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

      // ピーク位置を10%の位置に配置し、残りを90%に
      const peakPositionInOutput = Math.floor(targetLengthSamples * 0.1)
      const outputWindowSize = targetLengthSamples

      console.log(`ピーク同期: 出力長 ${outputWindowSize} サンプル (${targetLengthMs}ms), ピーク位置 ${peakPositionInOutput}`)

      // ピーク位置を揃えて同期加算
      const summedWaveform = new Float32Array(outputWindowSize)
      
      for (const window of windows) {
        // ピークが出力の peakPositionInOutput に来るようにシフト
        const shift = peakPositionInOutput - window.peakIndex
        for (let j = 0; j < outputWindowSize; j++) {
          const sourceIndex = j - shift
          if (sourceIndex >= 0 && sourceIndex < window.data.length) {
            summedWaveform[j] += window.data[sourceIndex]
          }
        }
      }

      // 平均化
      for (let i = 0; i < outputWindowSize; i++) {
        summedWaveform[i] /= windows.length
      }

      setAveragedWaveform(summedWaveform)
      setWindowOffsetMs(offsetMs)
      setPeakAlignEnabled(true)
      setStatus('completed')
      setStatusMessage(`録音完了！アタック: ${windows.length}回をピーク同期で加算 (${targetLengthMs}ms)`)
    } else {
      // 従来の同期加算モード（キーイベント基準）
      const outputWindowSize = targetLengthSamples
      const summedWaveform = new Float32Array(outputWindowSize)
      let validWindowCount = 0

      for (let i = 0; i < trimmedDownTimestamps.length; i++) {
        const timestamp = trimmedDownTimestamps[i]
        const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
        const windowStart = sampleIndex - windowOffsetSamples

        if (windowStart >= 0) {
          for (let j = 0; j < outputWindowSize; j++) {
            const sourceIndex = windowStart + j
            if (sourceIndex < audioData.length) {
              summedWaveform[j] += audioData[sourceIndex]
            }
          }
          validWindowCount++
        }
      }

      if (validWindowCount > 0) {
        for (let i = 0; i < outputWindowSize; i++) {
          summedWaveform[i] /= validWindowCount
        }
        setAveragedWaveform(summedWaveform)
        setWindowOffsetMs(offsetMs)
        setPeakAlignEnabled(false)
        setStatus('completed')
        setStatusMessage(`録音完了！アタック: ${validWindowCount}回を同期加算 (オフセット: -${offsetMs}ms, ${targetLengthMs}ms)`)
      } else {
        setStatus('completed')
        setStatusMessage('録音完了！有効なアタック音ウィンドウがありませんでした。')
      }
    }
  }, [findPeakIndex])

  // リリース音の同期加算処理を行う関数（keyup から keydown まで）
  const calculateReleaseWaveform = useCallback((
    audioData: Float32Array,
    keyUpTimestamps: number[],
    _keyDownTimestamps: number[],
    offsetMs: number,
    peakAlign: boolean,
    targetLengthMs: number
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

    // サンプルレートを取得
    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    const windowOffsetSamples = Math.floor((offsetMs / 1000) * sampleRate)
    const peakSearchSamples = Math.floor((PEAK_SEARCH_WINDOW_MS / 1000) * sampleRate)
    const targetLengthSamples = Math.floor((targetLengthMs / 1000) * sampleRate)

    // 固定長ウィンドウを使用
    const rawWindowSize = targetLengthSamples + windowOffsetSamples + peakSearchSamples

    console.log(`[リリース音] オフセット: ${offsetMs}ms, ピーク同期: ${peakAlign}, 目標長: ${targetLengthMs}ms`)

    if (peakAlign) {
      // ピーク同期モード
      const windows: { data: Float32Array; peakIndex: number }[] = []
      
      for (const timestamp of trimmedUpTimestamps) {
        const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
        const windowStart = sampleIndex - windowOffsetSamples
        const windowEnd = Math.min(windowStart + rawWindowSize, audioData.length)

        if (windowStart >= 0 && windowEnd > windowStart) {
          const windowData = audioData.slice(windowStart, windowEnd)
          const peakIndex = findPeakIndex(windowData, peakSearchSamples)
          windows.push({ data: windowData, peakIndex })
        }
      }

      if (windows.length === 0) {
        console.log('[リリース音] 有効なウィンドウがありませんでした')
        return
      }

      // ピーク位置を10%の位置に配置
      const peakPositionInOutput = Math.floor(targetLengthSamples * 0.1)
      const outputWindowSize = targetLengthSamples

      // ピーク位置を揃えて同期加算
      const summedWaveform = new Float32Array(outputWindowSize)
      
      for (const window of windows) {
        const shift = peakPositionInOutput - window.peakIndex
        for (let j = 0; j < outputWindowSize; j++) {
          const sourceIndex = j - shift
          if (sourceIndex >= 0 && sourceIndex < window.data.length) {
            summedWaveform[j] += window.data[sourceIndex]
          }
        }
      }

      // 平均化
      for (let i = 0; i < outputWindowSize; i++) {
        summedWaveform[i] /= windows.length
      }

      setReleaseWaveform(summedWaveform)
      setReleaseOffsetMs(offsetMs)
      console.log(`[リリース音] ${windows.length}回をピーク同期で加算 (${targetLengthMs}ms)`)
    } else {
      // 従来の同期加算モード（キーイベント基準）
      const outputWindowSize = targetLengthSamples
      const summedWaveform = new Float32Array(outputWindowSize)
      let validWindowCount = 0

      for (const timestamp of trimmedUpTimestamps) {
        const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
        const windowStart = sampleIndex - windowOffsetSamples

        if (windowStart >= 0) {
          for (let j = 0; j < outputWindowSize; j++) {
            const sourceIndex = windowStart + j
            if (sourceIndex < audioData.length) {
              summedWaveform[j] += audioData[sourceIndex]
            }
          }
          validWindowCount++
        }
      }

      if (validWindowCount > 0) {
        for (let i = 0; i < outputWindowSize; i++) {
          summedWaveform[i] /= validWindowCount
        }
        setReleaseWaveform(summedWaveform)
        setReleaseOffsetMs(offsetMs)
        console.log(`[リリース音] ${validWindowCount}回を同期加算 (オフセット: -${offsetMs}ms, ${targetLengthMs}ms)`)
      }
    }
  }, [findPeakIndex])

  // 合成波形を計算する関数（アタック音のピークからintervalMs後にリリース音のピークが来るように配置）
  const calculateCombinedWaveform = useCallback((
    attackWaveform: Float32Array,
    releaseWaveformData: Float32Array,
    intervalMs: number
  ) => {
    if (!attackWaveform || !releaseWaveformData) {
      console.log('[合成波形] アタック音またはリリース音がありません')
      return null
    }

    const sampleRate = audioContextRef.current?.sampleRate || SAMPLE_RATE
    const intervalSamples = Math.floor((intervalMs / 1000) * sampleRate)

    // 各波形のピーク位置を検出
    const findPeak = (waveform: Float32Array): number => {
      let maxValue = 0
      let peakIndex = 0
      for (let i = 0; i < waveform.length; i++) {
        const absValue = Math.abs(waveform[i])
        if (absValue > maxValue) {
          maxValue = absValue
          peakIndex = i
        }
      }
      return peakIndex
    }

    const attackPeakIndex = findPeak(attackWaveform)
    const releasePeakIndex = findPeak(releaseWaveformData)

    console.log(`[合成波形] アタックピーク: ${attackPeakIndex} (${((attackPeakIndex / sampleRate) * 1000).toFixed(1)}ms)`)
    console.log(`[合成波形] リリースピーク: ${releasePeakIndex} (${((releasePeakIndex / sampleRate) * 1000).toFixed(1)}ms)`)
    console.log(`[合成波形] ピーク間隔: ${intervalMs}ms (${intervalSamples} samples)`)

    // 合成波形のサイズを計算
    // アタック音のピーク位置をそのまま維持し、リリース音のピークがその後intervalSamples後に来るように配置
    // リリース音の開始位置 = アタックピーク位置 + intervalSamples - リリースピーク位置
    const releaseStartOffset = attackPeakIndex + intervalSamples - releasePeakIndex
    
    // 合成波形の全長を計算
    const attackEnd = attackWaveform.length
    const releaseEnd = releaseStartOffset + releaseWaveformData.length
    const combinedLength = Math.max(attackEnd, releaseEnd)

    console.log(`[合成波形] リリース開始オフセット: ${releaseStartOffset} (${((releaseStartOffset / sampleRate) * 1000).toFixed(1)}ms)`)
    console.log(`[合成波形] 合成波形長: ${combinedLength} (${((combinedLength / sampleRate) * 1000).toFixed(1)}ms)`)

    // 合成波形を作成
    const combined = new Float32Array(combinedLength)

    // アタック音をコピー
    for (let i = 0; i < attackWaveform.length; i++) {
      combined[i] = attackWaveform[i]
    }

    // リリース音を加算
    for (let i = 0; i < releaseWaveformData.length; i++) {
      const targetIndex = releaseStartOffset + i
      if (targetIndex >= 0 && targetIndex < combinedLength) {
        combined[targetIndex] += releaseWaveformData[i]
      }
    }

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
    
    calculateAveragedWaveform(audioData, keyDownTimestamps, keyUpTimestamps, offsetMs, peakAlign, waveformLengthMs)
  }, [calculateAveragedWaveform, waveformLengthMs])

  // リリース音のオフセットを変更した時に再計算する関数
  const recalculateReleaseWaveform = useCallback((offsetMs: number, peakAlign: boolean) => {
    const audioData = finalRecordingDataRef.current
    const keyDownTimestamps = keyTimestampsRef.current
    const keyUpTimestamps = keyUpTimestampsRef.current
    
    if (!audioData || keyUpTimestamps.length === 0) {
      return
    }
    
    calculateReleaseWaveform(audioData, keyUpTimestamps, keyDownTimestamps, offsetMs, peakAlign, waveformLengthMs)
  }, [calculateReleaseWaveform, waveformLengthMs])

  // 合成波形を再計算する関数
  const recalculateCombinedWaveform = useCallback((intervalMs: number) => {
    setPeakIntervalMs(intervalMs)
    
    if (!averagedWaveform || !releaseWaveform) {
      console.log('[合成波形] アタック音またはリリース音がありません')
      setCombinedWaveform(null)
      return
    }

    const combined = calculateCombinedWaveform(averagedWaveform, releaseWaveform, intervalMs)
    setCombinedWaveform(combined)
  }, [averagedWaveform, releaseWaveform, calculateCombinedWaveform])

  // アタック音またはリリース音が変更されたら合成波形を再計算
  useEffect(() => {
    if (averagedWaveform && releaseWaveform) {
      const combined = calculateCombinedWaveform(averagedWaveform, releaseWaveform, peakIntervalMs)
      setCombinedWaveform(combined)
    } else {
      setCombinedWaveform(null)
    }
  }, [averagedWaveform, releaseWaveform, peakIntervalMs, calculateCombinedWaveform])

  // keydownイベントリスナー
  useEffect(() => {
    const handleKeyDown = (_event: KeyboardEvent) => {
      if (!isRecording) return
      
      // 録音開始からの経過時間を記録
      const elapsed = Date.now() - recordingStartTimeRef.current
      keyTimestampsRef.current.push(elapsed)
      setKeyTapCount(keyTimestampsRef.current.length)
      
      console.log(`KeyDown detected at ${elapsed}ms`)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isRecording])

  // keyupイベントリスナー
  useEffect(() => {
    const handleKeyUp = (_event: KeyboardEvent) => {
      if (!isRecording) return
      
      // 録音開始からの経過時間を記録
      const elapsed = Date.now() - recordingStartTimeRef.current
      keyUpTimestampsRef.current.push(elapsed)
      setKeyUpCount(keyUpTimestampsRef.current.length)
      
      console.log(`KeyUp detected at ${elapsed}ms`)
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
    startRecording,
    initializeAudio,
    recalculateAveragedWaveform,
    recalculateReleaseWaveform,
    recalculateCombinedWaveform,
    setWaveformLengthMs,
  }
}