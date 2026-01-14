import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusMessage } from '../../src/components/StatusMessage'
import type { RecordingStatus } from '../../src/hooks/useAudioRecorder'

describe('StatusMessage', () => {
  describe('表示制御', () => {
    it('should not render when message is empty', () => {
      const { container } = render(
        <StatusMessage status="idle" message="" />
      )

      expect(container.firstChild).toBeNull()
    })

    it('should render when message is provided', () => {
      render(
        <StatusMessage status="idle" message="テストメッセージ" />
      )

      expect(screen.getByText('テストメッセージ')).toBeInTheDocument()
    })
  })

  describe('ステータスごとの表示', () => {
    it('should display idle status message', () => {
      render(
        <StatusMessage status="idle" message="待機中" />
      )

      expect(screen.getByText('待機中')).toBeInTheDocument()
    })

    it('should display recording status message', () => {
      render(
        <StatusMessage status="recording" message="録音中..." />
      )

      expect(screen.getByText('録音中...')).toBeInTheDocument()
    })

    it('should display completed status message', () => {
      render(
        <StatusMessage status="completed" message="録音完了" />
      )

      expect(screen.getByText('録音完了')).toBeInTheDocument()
    })

    it('should display error status message', () => {
      render(
        <StatusMessage status="error" message="エラーが発生しました" />
      )

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument()
    })
  })

  describe('スタイルクラス', () => {
    it('should apply info class for recording status', () => {
      const { container } = render(
        <StatusMessage status="recording" message="録音中" />
      )

      const statusDiv = container.querySelector('div')
      expect(statusDiv?.className).toContain('info')
    })

    it('should apply success class for completed status', () => {
      const { container } = render(
        <StatusMessage status="completed" message="完了" />
      )

      const statusDiv = container.querySelector('div')
      expect(statusDiv?.className).toContain('success')
    })

    it('should apply error class for error status', () => {
      const { container } = render(
        <StatusMessage status="error" message="エラー" />
      )

      const statusDiv = container.querySelector('div')
      expect(statusDiv?.className).toContain('error')
    })

    it('should not apply specific class for idle status', () => {
      const { container } = render(
        <StatusMessage status="idle" message="待機" />
      )

      const statusDiv = container.querySelector('div')
      expect(statusDiv?.className).not.toContain('info')
      expect(statusDiv?.className).not.toContain('success')
      expect(statusDiv?.className).not.toContain('error')
    })
  })

  describe('メッセージ内容', () => {
    it('should display long messages', () => {
      const longMessage = 'これは非常に長いメッセージです。エラーの詳細情報を表示しています。'
      
      render(
        <StatusMessage status="error" message={longMessage} />
      )

      expect(screen.getByText(longMessage)).toBeInTheDocument()
    })

    it('should display messages with special characters', () => {
      const specialMessage = 'エラー: ファイル "test.wav" の読み込みに失敗しました'
      
      render(
        <StatusMessage status="error" message={specialMessage} />
      )

      expect(screen.getByText(specialMessage)).toBeInTheDocument()
    })

    it('should handle multiple status changes', () => {
      const { rerender } = render(
        <StatusMessage status="idle" message="待機中" />
      )

      expect(screen.getByText('待機中')).toBeInTheDocument()

      rerender(<StatusMessage status="recording" message="録音開始" />)
      expect(screen.getByText('録音開始')).toBeInTheDocument()

      rerender(<StatusMessage status="completed" message="完了しました" />)
      expect(screen.getByText('完了しました')).toBeInTheDocument()
    })
  })

  describe('エッジケース', () => {
    it('should handle whitespace-only message', () => {
      const { container } = render(
        <StatusMessage status="idle" message="   " />
      )

      // Whitespace-only should still render (it's truthy)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('should handle single character message', () => {
      render(
        <StatusMessage status="error" message="!" />
      )

      expect(screen.getByText('!')).toBeInTheDocument()
    })
  })
})
