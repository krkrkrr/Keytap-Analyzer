import { useMemo } from 'react'
import { useAudioFeatures, FEATURE_DESCRIPTIONS, formatFeatureValue, type FeatureName } from '../hooks/useAudioFeatures'
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
    if (!waveformData || waveformData.length === 0) return null

    const values = Array.from(waveformData)
    const absValues = values.map(Math.abs)
    
    const min = Math.min(...values)
    const max = Math.max(...values)
    const absMax = Math.max(...absValues)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const rms = Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length)
    
    // ピーク位置を見つける
    let peakIndex = 0
    for (let i = 0; i < absValues.length; i++) {
      if (absValues[i] === absMax) {
        peakIndex = i
        break
      }
    }
    const peakTimeMs = (peakIndex / SAMPLE_RATE) * 1000
    const durationMs = (waveformData.length / SAMPLE_RATE) * 1000

    return {
      length: waveformData.length,
      durationMs,
      min,
      max,
      absMax,
      mean,
      rms,
      peakIndex,
      peakTimeMs,
      minDb: linearToDb(min),
      maxDb: linearToDb(max),
      absMaxDb: linearToDb(absMax),
      rmsDb: linearToDb(rms),
    }
  }, [waveformData])

  // サンプルデータ（等間隔で10個 + ピーク周辺）
  const sampleData = useMemo(() => {
    if (!waveformData || waveformData.length === 0 || !waveformStats) return []

    const samples: { index: number; timeMs: number; value: number; dB: number; label: string }[] = []
    const step = Math.floor(waveformData.length / 10)
    
    // 等間隔サンプル
    for (let i = 0; i < 10; i++) {
      const index = i * step
      if (index < waveformData.length) {
        const value = waveformData[index]
        samples.push({
          index,
          timeMs: (index / SAMPLE_RATE) * 1000,
          value,
          dB: linearToDb(value),
          label: `Sample ${i + 1}`,
        })
      }
    }

    // ピーク位置
    const peakValue = waveformData[waveformStats.peakIndex]
    samples.push({
      index: waveformStats.peakIndex,
      timeMs: waveformStats.peakTimeMs,
      value: peakValue,
      dB: linearToDb(peakValue),
      label: '⭐ Peak',
    })

    // 最後のサンプル
    const lastIndex = waveformData.length - 1
    samples.push({
      index: lastIndex,
      timeMs: (lastIndex / SAMPLE_RATE) * 1000,
      value: waveformData[lastIndex],
      dB: linearToDb(waveformData[lastIndex]),
      label: 'Last',
    })

    return samples.sort((a, b) => a.index - b.index)
  }, [waveformData, waveformStats])

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
      <h3 className={styles.title}>{title} (Meyda)</h3>

      {/* 波形データ統計情報 */}
      {waveformStats && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>📊 波形データ統計 (averagedWaveform)</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>項目</th>
                <th>値 (Linear)</th>
                <th>値 (dB)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>サンプル数</td>
                <td>{waveformStats.length.toLocaleString()}</td>
                <td>-</td>
              </tr>
              <tr>
                <td>長さ</td>
                <td>{waveformStats.durationMs.toFixed(2)} ms</td>
                <td>-</td>
              </tr>
              <tr>
                <td>最小値</td>
                <td>{waveformStats.min.toExponential(4)}</td>
                <td>{isFinite(waveformStats.minDb) ? waveformStats.minDb.toFixed(2) : '-∞'} dB</td>
              </tr>
              <tr>
                <td>最大値</td>
                <td>{waveformStats.max.toExponential(4)}</td>
                <td>{isFinite(waveformStats.maxDb) ? waveformStats.maxDb.toFixed(2) : '-∞'} dB</td>
              </tr>
              <tr>
                <td>絶対値最大 (Peak)</td>
                <td>{waveformStats.absMax.toExponential(4)}</td>
                <td>{isFinite(waveformStats.absMaxDb) ? waveformStats.absMaxDb.toFixed(2) : '-∞'} dB</td>
              </tr>
              <tr>
                <td>平均値</td>
                <td>{waveformStats.mean.toExponential(4)}</td>
                <td>-</td>
              </tr>
              <tr>
                <td>RMS</td>
                <td>{waveformStats.rms.toExponential(4)}</td>
                <td>{isFinite(waveformStats.rmsDb) ? waveformStats.rmsDb.toFixed(2) : '-∞'} dB</td>
              </tr>
              <tr>
                <td>ピーク位置</td>
                <td>Index: {waveformStats.peakIndex}</td>
                <td>{waveformStats.peakTimeMs.toFixed(2)} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* サンプルデータ表 */}
      {sampleData.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>📋 サンプルデータ</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ラベル</th>
                <th>Index</th>
                <th>Time (ms)</th>
                <th>Value (Linear)</th>
                <th>Value (dB)</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((sample, i) => (
                <tr key={i} style={sample.label.includes('Peak') ? { backgroundColor: '#fff3cd' } : undefined}>
                  <td>{sample.label}</td>
                  <td>{sample.index.toLocaleString()}</td>
                  <td>{sample.timeMs.toFixed(2)}</td>
                  <td className={styles.featureValue}>{sample.value.toExponential(4)}</td>
                  <td className={styles.featureValue}>
                    {isFinite(sample.dB) ? sample.dB.toFixed(2) : '-∞'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
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
