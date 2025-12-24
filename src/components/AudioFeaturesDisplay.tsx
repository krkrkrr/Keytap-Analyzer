import { useAudioFeatures, FEATURE_DESCRIPTIONS, formatFeatureValue, type FeatureName } from '../hooks/useAudioFeatures'
import styles from './AudioFeatures.module.css'

interface AudioFeaturesDisplayProps {
  waveformData: Float32Array | null
}

const CHROMA_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export function AudioFeaturesDisplay({ waveformData }: AudioFeaturesDisplayProps) {
  const features = useAudioFeatures(waveformData)

  if (!waveformData) {
    return null
  }

  const scalarFeatures: FeatureName[] = [
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
  ]

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>音声特徴量 (Meyda)</h3>
      
      {/* スカラー特徴量テーブル */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>基本特徴量</h4>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>特徴量</th>
              <th>値</th>
              <th>説明</th>
            </tr>
          </thead>
          <tbody>
            {scalarFeatures.map((key) => {
              const desc = FEATURE_DESCRIPTIONS[key]
              const value = features[key]
              return (
                <tr key={key}>
                  <td className={styles.featureName}>
                    <span className={styles.englishName}>{desc.name}</span>
                    <span className={styles.japaneseName}>{desc.japaneseName}</span>
                  </td>
                  <td className={styles.featureValue}>
                    {formatFeatureValue(value)}
                  </td>
                  <td className={styles.featureDesc}>{desc.description}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Loudness */}
      {features.loudness && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Loudness (Bark Scale)</h4>
          <div className={styles.loudnessContainer}>
            <div className={styles.loudnessTotal}>
              <span className={styles.label}>Total Loudness:</span>
              <span className={styles.value}>{formatFeatureValue(features.loudness.total)}</span>
            </div>
            <div className={styles.barkBands}>
              <span className={styles.label}>Bark Bands (24):</span>
              <div className={styles.barChart}>
                {Array.from(features.loudness.specific).map((value, i) => {
                  const maxValue = Math.max(...Array.from(features.loudness!.specific))
                  const height = maxValue > 0 ? (value / maxValue) * 100 : 0
                  return (
                    <div
                      key={i}
                      className={styles.bar}
                      style={{ height: `${height}%` }}
                      title={`Band ${i + 1}: ${value.toFixed(4)}`}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MFCC */}
      {features.mfcc && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>MFCC (Mel-Frequency Cepstral Coefficients)</h4>
          <div className={styles.mfccContainer}>
            <div className={styles.barChart}>
              {features.mfcc.map((value, i) => {
                const maxAbs = Math.max(...features.mfcc!.map(v => Math.abs(v)))
                const normalizedHeight = maxAbs > 0 ? (value / maxAbs) * 50 + 50 : 50
                return (
                  <div
                    key={i}
                    className={styles.mfccBar}
                    style={{ 
                      height: `${Math.abs(normalizedHeight - 50) * 2}%`,
                      bottom: value >= 0 ? '50%' : `${50 - Math.abs(normalizedHeight - 50) * 2}%`,
                      backgroundColor: value >= 0 ? '#4CAF50' : '#ff6b6b'
                    }}
                    title={`MFCC ${i + 1}: ${value.toFixed(4)}`}
                  />
                )
              })}
            </div>
            <div className={styles.mfccLabels}>
              {features.mfcc.map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chroma */}
      {features.chroma && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Chroma (Pitch Class Profile)</h4>
          <div className={styles.chromaContainer}>
            <div className={styles.chromaChart}>
              {features.chroma.map((value, i) => {
                const maxValue = Math.max(...features.chroma!)
                const height = maxValue > 0 ? (value / maxValue) * 100 : 0
                return (
                  <div key={i} className={styles.chromaBarContainer}>
                    <div
                      className={styles.chromaBar}
                      style={{ height: `${height}%` }}
                      title={`${CHROMA_LABELS[i]}: ${value.toFixed(4)}`}
                    />
                    <span className={styles.chromaLabel}>{CHROMA_LABELS[i]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
