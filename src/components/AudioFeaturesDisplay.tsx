import { useMemo } from 'react'
import { useAudioFeatures, FEATURE_DESCRIPTIONS, formatFeatureValue, type FeatureName } from '../hooks/useAudioFeatures'
import { calculateWaveformStats } from '../utils/arrayStats'
import styles from './AudioFeatures.module.css'

interface AudioFeaturesDisplayProps {
  waveformData: Float32Array | null
  title?: string
}

const CHROMA_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const SAMPLE_RATE = 48000

// dB変換関数
function linearToDb(value: number): number {
  const absValue = Math.abs(value)
  if (absValue < 1e-10) return -Infinity
  return 20 * Math.log10(absValue)
}

export function AudioFeaturesDisplay({ waveformData, title = '音声特徴量' }: AudioFeaturesDisplayProps) {
  const features = useAudioFeatures(waveformData)

  // 波形データの統計情報を計算
  const waveformStats = useMemo(() => {
    if (!waveformData) return null
    const stats = calculateWaveformStats(waveformData)
    if (!stats) return null

    const peakTimeMs = (stats.peakIndex / SAMPLE_RATE) * 1000
    const durationMs = (stats.length / SAMPLE_RATE) * 1000

    return {
      ...stats,
      durationMs,
      peakTimeMs,
      minDb: linearToDb(stats.min),
      maxDb: linearToDb(stats.max),
      absMaxDb: linearToDb(stats.absMax),
      rmsDb: linearToDb(stats.rms),
    }
  }, [waveformData])

  // サンプルデータ（等間隔で10個 + ピーク周辺）
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

  // 非推奨（確からしくない）特徴量
  const deprecatedFeatures: FeatureName[] = [
    'rms',
    'zcr',
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
      <h3 className={styles.title}>{title} (Meyda)</h3>

      {/* 波形データ統計情報と基本特徴量を統合 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>📊 波形統計と基本特徴量</h4>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>項目</th>
              <th>値</th>
              <th>単位</th>
              <th>説明</th>
            </tr>
          </thead>
          <tbody>
            {/* 波形統計セクション */}
            {waveformStats && (
              <>
                <tr className={styles.sectionRow}>
                  <td colSpan={4} className={styles.sectionHeader}>波形統計</td>
                </tr>
                <tr>
                  <td>サンプル数</td>
                  <td>{waveformStats.length.toLocaleString()}</td>
                  <td>samples</td>
                  <td>波形の総サンプル数</td>
                </tr>
                <tr>
                  <td>長さ</td>
                  <td>{waveformStats.durationMs.toFixed(2)}</td>
                  <td>ms</td>
                  <td>波形の時間長</td>
                </tr>
                <tr>
                  <td>最小値</td>
                  <td>{waveformStats.min.toExponential(4)} ({isFinite(waveformStats.minDb) ? waveformStats.minDb.toFixed(2) : '-∞'} dB)</td>
                  <td>Linear/dB</td>
                  <td>最小振幅値</td>
                </tr>
                <tr>
                  <td>最大値</td>
                  <td>{waveformStats.max.toExponential(4)} ({isFinite(waveformStats.maxDb) ? waveformStats.maxDb.toFixed(2) : '-∞'} dB)</td>
                  <td>Linear/dB</td>
                  <td>最大振幅値</td>
                </tr>
                <tr>
                  <td>ピーク (Peak)</td>
                  <td>{waveformStats.absMax.toExponential(4)} ({isFinite(waveformStats.absMaxDb) ? waveformStats.absMaxDb.toFixed(2) : '-∞'} dB)</td>
                  <td>Linear/dB</td>
                  <td>絶対値最大</td>
                </tr>
                <tr>
                  <td>平均値</td>
                  <td>{waveformStats.mean.toExponential(4)}</td>
                  <td>Linear</td>
                  <td>平均振幅</td>
                </tr>
                <tr>
                  <td>RMS</td>
                  <td>{waveformStats.rms.toExponential(4)} ({isFinite(waveformStats.rmsDb) ? waveformStats.rmsDb.toFixed(2) : '-∞'} dB)</td>
                  <td>Linear/dB</td>
                  <td>二乗平均平方根</td>
                </tr>
                <tr>
                  <td>ピーク位置</td>
                  <td>{waveformStats.peakTimeMs.toFixed(2)}</td>
                  <td>ms</td>
                  <td>ピークの時間位置 (Index: {waveformStats.peakIndex})</td>
                </tr>
                <tr className={styles.sectionRow}>
                  <td colSpan={4} className={styles.sectionHeader}>基本特徴量</td>
                </tr>
              </>
            )}
            {scalarFeatures.map((key) => {
              const desc = FEATURE_DESCRIPTIONS[key]
              const value = features[key]
              const isDeprecated = deprecatedFeatures.includes(key)
              return (
                <tr key={key} className={isDeprecated ? styles.deprecatedFeature : ''}>
                  <td className={styles.featureName}>
                    {desc.japaneseName}
                    {isDeprecated && <span className={styles.deprecatedBadge}>（非推奨）</span>}
                  </td>
                  <td className={styles.featureValue}>{formatFeatureValue(value)}</td>
                  <td className={styles.featureUnit}>{desc.unit}</td>
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
