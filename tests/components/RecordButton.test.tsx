import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecordButton } from '../../src/components/RecordButton'

describe('RecordButton', () => {
  describe('表示', () => {
    it('should render with default state', () => {
      render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={() => {}}
          recordingDuration={10000}
        />
      )

      expect(screen.getByRole('button')).toBeInTheDocument()
      expect(screen.getByText('録音開始 (10秒)')).toBeInTheDocument()
    })

    it('should show recording state when isRecording is true', () => {
      render(
        <RecordButton
          isRecording={true}
          disabled={false}
          onClick={() => {}}
          recordingDuration={10000}
        />
      )

      expect(screen.getByText('録音中...')).toBeInTheDocument()
    })

    it('should display recording duration in seconds', () => {
      render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={() => {}}
          recordingDuration={5000}
        />
      )

      expect(screen.getByText('録音開始 (5秒)')).toBeInTheDocument()
    })

    it('should handle fractional seconds', () => {
      render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={() => {}}
          recordingDuration={2500}
        />
      )

      expect(screen.getByText('録音開始 (2.5秒)')).toBeInTheDocument()
    })
  })

  describe('無効化状態', () => {
    it('should be disabled when disabled prop is true', () => {
      render(
        <RecordButton
          isRecording={false}
          disabled={true}
          onClick={() => {}}
          recordingDuration={10000}
        />
      )

      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('should be enabled when disabled prop is false', () => {
      render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={() => {}}
          recordingDuration={10000}
        />
      )

      expect(screen.getByRole('button')).not.toBeDisabled()
    })

    it('should not call onClick when disabled', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(
        <RecordButton
          isRecording={false}
          disabled={true}
          onClick={handleClick}
          recordingDuration={10000}
        />
      )

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('クリックイベント', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={handleClick}
          recordingDuration={10000}
        />
      )

      await user.click(screen.getByRole('button'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should call onClick multiple times', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()

      render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={handleClick}
          recordingDuration={10000}
        />
      )

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByRole('button'))

      expect(handleClick).toHaveBeenCalledTimes(2)
    })
  })

  describe('スタイル', () => {
    it('should apply recording class when isRecording is true', () => {
      const { container } = render(
        <RecordButton
          isRecording={true}
          disabled={false}
          onClick={() => {}}
          recordingDuration={10000}
        />
      )

      const button = container.querySelector('button')
      expect(button?.className).toContain('recording')
    })

    it('should not apply recording class when isRecording is false', () => {
      const { container } = render(
        <RecordButton
          isRecording={false}
          disabled={false}
          onClick={() => {}}
          recordingDuration={10000}
        />
      )

      const button = container.querySelector('button')
      expect(button?.className).not.toContain('recording')
    })
  })
})
