import type { RecordingStatus } from '../hooks/useAudioRecorder'
import styles from './StatusMessage.module.css'

interface StatusMessageProps {
  status: RecordingStatus
  message: string
}

export function StatusMessage({ status, message }: StatusMessageProps) {
  if (!message) {
    return null
  }

  const getStatusClassName = () => {
    switch (status) {
      case 'recording':
        return styles.info
      case 'completed':
        return styles.success
      case 'error':
        return styles.error
      default:
        return ''
    }
  }

  return (
    <div className={`${styles.status} ${getStatusClassName()}`}>
      {message}
    </div>
  )
}
