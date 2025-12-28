import { useMemo } from 'react'
import Meyda from 'meyda'

// Meydaで抽出する特徴量のリスト
const FEATURE_LIST = [
  'rms',
  'zcr',
  'energy',
  'spectralCentroid',
  'spectralFlatness',
  'spectralSlope',
  'spectralRolloff',
  'spectralSpread',
  'spectralSkewness',
  'spectralKurtosis',
  'spectralCrest',
  'perceptualSpread',
  'perceptualSharpness',
] as const

export type FeatureName = typeof FEATURE_LIST[number]

export interface AudioFeatures {
  // Time-domain features
  rms: number | null
  zcr: number | null
  energy: number | null
  // Spectral features
  spectralCentroid: number | null
  spectralFlatness: number | null
  spectralSlope: number | null
  spectralRolloff: number | null
  spectralSpread: number | null
  spectralSkewness: number | null
  spectralKurtosis: number | null
  spectralCrest: number | null
  // Perceptual features
  perceptualSpread: number | null
  perceptualSharpness: number | null
  // Additional features
  loudness: { total: number; specific: Float32Array } | null
  mfcc: number[] | null
  chroma: number[] | null
}

export interface FeatureDescription {
  name: string
  japaneseName: string
  description: string
  range: string
}

export const FEATURE_DESCRIPTIONS: Record<FeatureName, FeatureDescription> = {
  rms: {
    name: 'RMS',
    japaneseName: '二乗平均平方根',
    description: '波形の音量（ラウドネス）を示す指標',
    range: '0.0 〜 1.0',
  },
  zcr: {
    name: 'Zero Crossing Rate',
    japaneseName: 'ゼロ交差率',
    description: 'バッファ内でゼロを交差する回数。打楽器音とピッチのある音の区別に使用',
    range: '0 〜 バッファサイズ/2',
  },
  energy: {
    name: 'Energy',
    japaneseName: 'エネルギー',
    description: '信号の二乗の無限積分。音量の別指標',
    range: '0 〜 バッファサイズ',
  },
  spectralCentroid: {
    name: 'Spectral Centroid',
    japaneseName: 'スペクトル重心',
    description: '音の「明るさ」を示す指標。スペクトルの重心周波数',
    range: '0 〜 FFTサイズ/2',
  },
  spectralFlatness: {
    name: 'Spectral Flatness',
    japaneseName: 'スペクトル平坦度',
    description: 'スペクトルの平坦さ。ノイズ性を示す（0=トーン的、1=ノイズ的）',
    range: '0.0 〜 1.0',
  },
  spectralSlope: {
    name: 'Spectral Slope',
    japaneseName: 'スペクトル傾斜',
    description: 'スペクトルの傾き具合。音声品質の分類に使用',
    range: '0.0 〜 1.0',
  },
  spectralRolloff: {
    name: 'Spectral Rolloff',
    japaneseName: 'スペクトルロールオフ',
    description: 'エネルギーの99%が含まれる周波数。最大周波数の近似',
    range: '0 〜 サンプルレート/2 Hz',
  },
  spectralSpread: {
    name: 'Spectral Spread',
    japaneseName: 'スペクトル広がり',
    description: '周波数成分の広がり具合。帯域幅に相当',
    range: '0 〜 FFTサイズ/2',
  },
  spectralSkewness: {
    name: 'Spectral Skewness',
    japaneseName: 'スペクトル歪度',
    description: 'スペクトルが平均に対してどちらに偏っているか',
    range: '負〜0〜正',
  },
  spectralKurtosis: {
    name: 'Spectral Kurtosis',
    japaneseName: 'スペクトル尖度',
    description: 'スペクトルの尖り具合。トーン性/ピッチ性の指標',
    range: '0.0 〜 1.0',
  },
  spectralCrest: {
    name: 'Spectral Crest',
    japaneseName: 'スペクトルクレスト',
    description: '最大マグニチュードとRMSの比率。ピークの鋭さを示す',
    range: '任意（大きいほどピークが顕著）',
  },
  perceptualSpread: {
    name: 'Perceptual Spread',
    japaneseName: '知覚的広がり',
    description: 'Barkスケール上のラウドネス係数の広がり。「豊かさ」の指標',
    range: '0.0 〜 1.0',
  },
  perceptualSharpness: {
    name: 'Perceptual Sharpness',
    japaneseName: '知覚的シャープネス',
    description: '音の「鋭さ」の知覚。スネアとバスドラムの区別などに使用',
    range: '0.0 〜 1.0',
  },
}

// バッファサイズを2のべき乗に調整する
function nearestPowerOfTwo(n: number): number {
  // 対数を取って最も近い2のべき乗を計算
  const power = Math.round(Math.log2(n))
  return Math.pow(2, Math.max(9, Math.min(power, 14))) // 512〜16384の範囲
}

export function useAudioFeatures(waveformData: Float32Array | null, sampleRate = 48000): AudioFeatures {
  return useMemo(() => {
    const nullFeatures: AudioFeatures = {
      rms: null,
      zcr: null,
      energy: null,
      spectralCentroid: null,
      spectralFlatness: null,
      spectralSlope: null,
      spectralRolloff: null,
      spectralSpread: null,
      spectralSkewness: null,
      spectralKurtosis: null,
      spectralCrest: null,
      perceptualSpread: null,
      perceptualSharpness: null,
      loudness: null,
      mfcc: null,
      chroma: null,
    }

    if (!waveformData || waveformData.length === 0) {
      return nullFeatures
    }

    try {
      // バッファサイズを2のべき乗に調整
      const bufferSize = nearestPowerOfTwo(waveformData.length)
      
      // 入力データをバッファサイズに合わせる（パディングまたはトリミング）
      let adjustedData: Float32Array
      if (waveformData.length >= bufferSize) {
        // 中央部分を使用
        const start = Math.floor((waveformData.length - bufferSize) / 2)
        adjustedData = waveformData.slice(start, start + bufferSize)
      } else {
        // ゼロパディング
        adjustedData = new Float32Array(bufferSize)
        const start = Math.floor((bufferSize - waveformData.length) / 2)
        adjustedData.set(waveformData, start)
      }

      // Meydaの設定
      Meyda.sampleRate = sampleRate
      Meyda.bufferSize = bufferSize
      Meyda.windowingFunction = 'hanning'
      Meyda.numberOfMFCCCoefficients = 13

      // 特徴量を抽出
      const features = Meyda.extract(
        [...FEATURE_LIST, 'loudness', 'mfcc', 'chroma'],
        adjustedData
      )

      if (!features) {
        return nullFeatures
      }

      return {
        rms: typeof features.rms === 'number' ? features.rms : null,
        zcr: typeof features.zcr === 'number' ? features.zcr : null,
        energy: typeof features.energy === 'number' ? features.energy : null,
        spectralCentroid: typeof features.spectralCentroid === 'number' ? features.spectralCentroid : null,
        spectralFlatness: typeof features.spectralFlatness === 'number' ? features.spectralFlatness : null,
        spectralSlope: typeof features.spectralSlope === 'number' ? features.spectralSlope : null,
        spectralRolloff: typeof features.spectralRolloff === 'number' ? features.spectralRolloff : null,
        spectralSpread: typeof features.spectralSpread === 'number' ? features.spectralSpread : null,
        spectralSkewness: typeof features.spectralSkewness === 'number' ? features.spectralSkewness : null,
        spectralKurtosis: typeof features.spectralKurtosis === 'number' ? features.spectralKurtosis : null,
        spectralCrest: typeof features.spectralCrest === 'number' ? features.spectralCrest : null,
        perceptualSpread: typeof features.perceptualSpread === 'number' ? features.perceptualSpread : null,
        perceptualSharpness: typeof features.perceptualSharpness === 'number' ? features.perceptualSharpness : null,
        loudness: features.loudness as { total: number; specific: Float32Array } | null,
        mfcc: features.mfcc as number[] | null,
        chroma: features.chroma as number[] | null,
      }
    } catch (error) {
      console.error('Feature extraction error:', error)
      return nullFeatures
    }
  }, [waveformData, sampleRate])
}

// 特徴量を表示用にフォーマットする関数
export function formatFeatureValue(value: number | null, decimals = 4): string {
  if (value === null) return '-'
  if (!isFinite(value)) return '-'
  return value.toFixed(decimals)
}
