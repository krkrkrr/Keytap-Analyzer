import styles from './RecordButton.module.css'

interface RecordButtonProps {
  isRecording: boolean
  disabled: boolean
  onClick: () => void
  recordingDuration: number
}

export function RecordButton({ isRecording, disabled, onClick, recordingDuration }: RecordButtonProps) {
  return (
    <button
      className={`${styles.recordBtn} ${isRecording ? styles.recording : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {isRecording ? '録音中...' : `録音開始 (${recordingDuration / 1000}秒)`}
    </button>
  )
}
