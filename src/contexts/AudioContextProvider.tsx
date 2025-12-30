import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// デフォルト値（AudioContextが取得できない場合のフォールバック）
const DEFAULT_SAMPLE_RATE = 44100

interface AudioContextState {
  sampleRate: number
  isInitialized: boolean
}

const AudioContextStateContext = createContext<AudioContextState>({
  sampleRate: DEFAULT_SAMPLE_RATE,
  isInitialized: false,
})

export function useAudioContextState() {
  return useContext(AudioContextStateContext)
}

export function AudioContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AudioContextState>({
    sampleRate: DEFAULT_SAMPLE_RATE,
    isInitialized: false,
  })

  useEffect(() => {
    // AudioContextを作成してブラウザのデフォルトサンプルレートを取得
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      const tempContext = new AudioContextClass()
      const browserSampleRate = tempContext.sampleRate
      console.log(`[AudioContextProvider] ブラウザのデフォルトサンプルレート: ${browserSampleRate}Hz`)
      
      setState({
        sampleRate: browserSampleRate,
        isInitialized: true,
      })
      
      // 一時的なAudioContextを閉じる
      tempContext.close()
    } else {
      console.warn('[AudioContextProvider] AudioContext not supported, using default sample rate')
      setState({
        sampleRate: DEFAULT_SAMPLE_RATE,
        isInitialized: true,
      })
    }
  }, [])

  return (
    <AudioContextStateContext.Provider value={state}>
      {children}
    </AudioContextStateContext.Provider>
  )
}

// デフォルトサンプルレートをエクスポート（フォールバック用）
export { DEFAULT_SAMPLE_RATE }
