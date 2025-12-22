import { useState, useRef, useCallback } from 'react'

export type RecordingStatus = 'idle' | 'recording' | 'completed' | 'error'

export interface UseAudioRecorderReturn {
  status: RecordingStatus
  statusMessage: string
  recordingData: Float32Array | null
  isRecording: boolean
  canRecord: boolean
  startRecording: () => Promise<void>
  initializeAudio: () => Promise<void>
}

export function useAudioRecorder(recordingDuration = 1000): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [recordingData, setRecordingData] = useState<Float32Array | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [canRecord, setCanRecord] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioInputRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

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
    setStatusMessage(`録音中... (${recordingDuration / 1000}秒)`)

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

    // 音声データを収集
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer
      const inputData = inputBuffer.getChannelData(0)
      // データをコピー
      recordingChunks.push(new Float32Array(inputData))
    }

    // オーディオグラフを接続
    audioInputRef.current.connect(analyserRef.current)
    analyserRef.current.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

    // 指定時間後に録音を停止
    setTimeout(() => {
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
    setStatus('completed')
    setStatusMessage('録音完了！波形を表示しました。')
  }, [])

  return {
    status,
    statusMessage,
    recordingData,
    isRecording,
    canRecord,
    startRecording,
    initializeAudio,
  }
}
