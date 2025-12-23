import { useEffect } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { WaveformCanvas } from './WaveformCanvas'
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
    startRecording,
    initializeAudio,
  } = useAudioRecorder(RECORDING_DURATION)

  useEffect(() => {
    initializeAudio()
  }, [initializeAudio])

  const handleRecordClick = () => {
    if (!isRecording) {
      startRecording()
    }
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
      </div>

      <StatusMessage status={status} message={statusMessage} />

      <WaveformCanvas 
        recordingData={recordingData}
        isRecording={isRecording}
        progress={recordingProgress}
      />
    </div>
  )
}
