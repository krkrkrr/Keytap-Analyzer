import { useMemo } from 'react'
import Meyda from 'meyda'
import { arrayAbsMax } from '../utils/arrayStats'
import { DEFAULT_SAMPLE_RATE } from '../contexts/AudioContextProvider'

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
  chroma: number[] | null
}

export interface FeatureDescription {
  name: string
  japaneseName: string
  description: string
  range: string
  unit: string
}

export const FEATURE_DESCRIPTIONS: Record<FeatureName, FeatureDescription> = {
  rms: {
    name: 'RMS',
    japaneseName: '二乗平均平方根',
    description: '波形の音量（ラウドネス）を示す指標',
    range: '0.0 〜 1.0',
    unit: '',
  },
  zcr: {
    name: 'Zero Crossing Rate',
    japaneseName: 'ゼロ交差率',
    description: 'バッファ内でゼロを交差する回数。打楽器音とピッチのある音の区別に使用',
    range: '0 〜 バッファサイズ/2',
    unit: '回',
  },
  energy: {
    name: 'Energy',
    japaneseName: 'エネルギー',
    description: '信号の二乗の無限積分。音量の別指標',
    range: '0 〜 バッファサイズ',
    unit: '',
  },
  spectralCentroid: {
    name: 'Spectral Centroid',
    japaneseName: 'スペクトル重心',
    description: '音の「明るさ」を示す指標。スペクトルの重心周波数',
    range: '0 〜 24000',
    unit: 'Hz',
  },
  spectralFlatness: {
    name: 'Spectral Flatness',
    japaneseName: 'スペクトル平坦度',
    description: 'スペクトルの平坦さ。ノイズ性を示す（0=トーン的、1=ノイズ的）',
    range: '0.0 〜 1.0',
    unit: '',
  },
  spectralSlope: {
    name: 'Spectral Slope',
    japaneseName: 'スペクトル傾斜',
    description: 'スペクトルの傾き具合。音声品質の分類に使用',
    range: '-∞ 〜 +∞',
    unit: '',
  },
  spectralRolloff: {
    name: 'Spectral Rolloff',
    japaneseName: 'スペクトルロールオフ',
    description: 'エネルギーの99%が含まれる周波数。最大周波数の近似',
    range: '0 〜 24000',
    unit: 'Hz',
  },
  spectralSpread: {
    name: 'Spectral Spread',
    japaneseName: 'スペクトル広がり',
    description: '周波数成分の広がり具合。帯域幅に相当',
    range: '0 〜 24000',
    unit: 'Hz',
  },
  spectralSkewness: {
    name: 'Spectral Skewness',
    japaneseName: 'スペクトル歪度',
    description: 'スペクトルが平均に対してどちらに偏っているか',
    range: '-∞ 〜 +∞',
    unit: '',
  },
  spectralKurtosis: {
    name: 'Spectral Kurtosis',
    japaneseName: 'スペクトル尖度',
    description: 'スペクトルの尖り具合。トーン性/ピッチ性の指標',
    range: '0 〜 +∞',
    unit: '',
  },
  spectralCrest: {
    name: 'Spectral Crest',
    japaneseName: 'スペクトルクレスト',
    description: '最大マグニチュードとRMSの比率。ピークの鋭さを示す',
    range: '1 〜 +∞',
    unit: '',
  },
  perceptualSpread: {
    name: 'Perceptual Spread',
    japaneseName: '知覚的広がり',
    description: 'Barkスケール上のラウドネス係数の広がり。「豊かさ」の指標',
    range: '0.0 〜 1.0',
    unit: '',
  },
  perceptualSharpness: {
    name: 'Perceptual Sharpness',
    japaneseName: '知覚的シャープネス',
    description: '音の「鋭さ」の知覚。スネアとバスドラムの区別などに使用',
    range: '0.0 〜 1.0',
    unit: 'acum',
  },
}

// バッファサイズを2のべき乗に調整する
function nearestPowerOfTwo(n: number): number {
  // 対数を取って最も近い2のべき乗を計算
  const power = Math.round(Math.log2(n))
  return Math.pow(2, Math.max(9, Math.min(power, 14))) // 512〜16384の範囲
}

export function useAudioFeatures(waveformData: Float32Array | null, sampleRate = DEFAULT_SAMPLE_RATE): AudioFeatures {
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
        // 先頭部分を使用（ピークが先頭付近にあるため）
        adjustedData = waveformData.slice(0, bufferSize)
      } else {
        // ゼロパディング（後ろにパディング）
        adjustedData = new Float32Array(bufferSize)
        adjustedData.set(waveformData, 0)
      }

      // デバッグ: 入力データの情報を出力
      const inputMax = arrayAbsMax(waveformData)
      const adjustedMax = arrayAbsMax(adjustedData)
      console.log('[Meyda] 入力データ:', {
        originalLength: waveformData.length,
        bufferSize,
        inputMaxAbs: inputMax.toExponential(4),
        adjustedMaxAbs: adjustedMax.toExponential(4),
      })

      // Meydaの設定
      Meyda.sampleRate = sampleRate
      Meyda.bufferSize = bufferSize
      Meyda.windowingFunction = 'hanning'

      // 特徴量を抽出
      const features = Meyda.extract(
        [...FEATURE_LIST, 'loudness', 'chroma'],
        adjustedData
      )

      if (!features) {
        return nullFeatures
      }

      // bin インデックスを Hz に変換する係数
      const binToHz = sampleRate / bufferSize

      // スペクトル重心を Hz に変換
      const spectralCentroidHz = typeof features.spectralCentroid === 'number' 
        ? features.spectralCentroid * binToHz 
        : null

      // スペクトル広がりを Hz に変換
      const spectralSpreadHz = typeof features.spectralSpread === 'number'
        ? features.spectralSpread * binToHz
        : null

      // スペクトルロールオフ（Meydaはbin単位で返すので変換）
      const spectralRolloffHz = typeof features.spectralRolloff === 'number'
        ? features.spectralRolloff * binToHz
        : null

      console.log('[Meyda] 特徴量変換:', {
        binToHz,
        spectralCentroidBin: features.spectralCentroid,
        spectralCentroidHz,
        spectralSpreadBin: features.spectralSpread,
        spectralSpreadHz,
        spectralRolloffBin: features.spectralRolloff,
        spectralRolloffHz,
      })

      return {
        rms: typeof features.rms === 'number' ? features.rms : null,
        zcr: typeof features.zcr === 'number' ? features.zcr : null,
        energy: typeof features.energy === 'number' ? features.energy : null,
        spectralCentroid: spectralCentroidHz,
        spectralFlatness: typeof features.spectralFlatness === 'number' ? features.spectralFlatness : null,
        spectralSlope: typeof features.spectralSlope === 'number' ? features.spectralSlope : null,
        spectralRolloff: spectralRolloffHz,
        spectralSpread: spectralSpreadHz,
        spectralSkewness: typeof features.spectralSkewness === 'number' ? features.spectralSkewness : null,
        spectralKurtosis: typeof features.spectralKurtosis === 'number' ? features.spectralKurtosis : null,
        spectralCrest: typeof features.spectralCrest === 'number' ? features.spectralCrest : null,
        perceptualSpread: typeof features.perceptualSpread === 'number' ? features.perceptualSpread : null,
        perceptualSharpness: typeof features.perceptualSharpness === 'number' ? features.perceptualSharpness : null,
        loudness: features.loudness as { total: number; specific: Float32Array } | null,
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
