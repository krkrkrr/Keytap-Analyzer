/**
 * 波形同期加算処理のユーティリティ関数
 */

// ピーク検索ウィンドウ（ms）
export const PEAK_SEARCH_WINDOW_MS = 50

/**
 * ウィンドウ内のピーク位置を検出する
 * @param data 波形データ
 * @param searchStartSamples 検索開始位置（サンプル）
 * @param searchRangeSamples 検索範囲（サンプル）
 * @returns ピーク位置のインデックス
 */
export function findPeakIndex(
  data: Float32Array, 
  searchStartSamples?: number, 
  searchRangeSamples?: number
): number {
  let maxValue = 0
  const start = searchStartSamples ?? 0
  let peakIndex = start
  const searchEnd = searchRangeSamples 
    ? Math.min(start + searchRangeSamples, data.length) 
    : data.length
  
  for (let i = start; i < searchEnd; i++) {
    const absValue = Math.abs(data[i])
    if (absValue > maxValue) {
      maxValue = absValue
      peakIndex = i
    }
  }
  return peakIndex
}

/**
 * 同期加算処理のパラメータ
 */
export interface SyncAverageParams {
  audioData: Float32Array
  timestamps: number[]
  offsetMs: number
  peakAlign: boolean
  targetLengthMs: number
  peakPositionMs: number
  sampleRate: number
  useMinWindowLength?: boolean  // trueの場合、最小ウィンドウ長に合わせる
}

/**
 * 個別ウィンドウの情報
 */
export interface WindowInfo {
  data: Float32Array
  peakIndex: number
  timestampMs: number
}

/**
 * 同期加算処理の結果
 */
export interface SyncAverageResult {
  waveform: Float32Array | null
  windowCount: number
  windows: WindowInfo[]  // 個別ウィンドウのデータ
}

/**
 * 同期加算処理を実行する共通関数
 * @param params 同期加算のパラメータ
 * @returns 同期加算された波形と有効ウィンドウ数
 */
export function calculateSyncAveragedWaveform(params: SyncAverageParams): SyncAverageResult {
  const {
    audioData,
    timestamps,
    offsetMs,
    peakAlign,
    targetLengthMs,
    peakPositionMs,
    sampleRate,
    useMinWindowLength = false
  } = params

  if (timestamps.length === 0) {
    return { waveform: null, windowCount: 0, windows: [] }
  }

  const windowOffsetSamples = Math.floor((offsetMs / 1000) * sampleRate)
  const peakSearchSamples = Math.floor((PEAK_SEARCH_WINDOW_MS / 1000) * sampleRate)
  const targetLengthSamples = Math.floor((targetLengthMs / 1000) * sampleRate)
  const rawWindowSize = targetLengthSamples + windowOffsetSamples + peakSearchSamples

  // 個別ウィンドウを収集
  const windowInfos: WindowInfo[] = []
  
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i]
    const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
    const windowStart = sampleIndex - windowOffsetSamples
    const windowEnd = Math.min(windowStart + rawWindowSize, audioData.length)

    if (windowStart >= 0 && windowEnd > windowStart) {
      const windowData = audioData.slice(windowStart, windowEnd)
      // タイムスタンプ位置（windowOffsetSamples）周辺でピークを検索
      const peakIndex = findPeakIndex(windowData, windowOffsetSamples, peakSearchSamples)
      windowInfos.push({ data: windowData, peakIndex, timestampMs: timestamp })
    }
  }

  if (windowInfos.length === 0) {
    return { waveform: null, windowCount: 0, windows: [] }
  }

  // 最小ウィンドウ長を使用する場合は、全ウィンドウの最小長を計算
  let effectiveOutputSize = targetLengthSamples
  if (useMinWindowLength) {
    const minWindowLength = Math.min(...windowInfos.map(w => w.data.length))
    effectiveOutputSize = Math.min(minWindowLength, targetLengthSamples)
    console.log(`[最小ウィンドウ長] 使用: ${effectiveOutputSize}サンプル (${(effectiveOutputSize / sampleRate * 1000).toFixed(1)}ms)`)
  }

  if (peakAlign) {
    // ピーク同期モード
    // ピーク位置を peakPositionMs の位置に配置
    const peakPositionInOutput = Math.floor((peakPositionMs / 1000) * sampleRate)
    const outputWindowSize = effectiveOutputSize
    const summedWaveform = new Float32Array(outputWindowSize)
    
    // ピーク位置を揃えて同期加算
    for (const window of windowInfos) {
      const shift = peakPositionInOutput - window.peakIndex
      for (let j = 0; j < outputWindowSize; j++) {
        const sourceIndex = j - shift
        if (sourceIndex >= 0 && sourceIndex < window.data.length) {
          summedWaveform[j] += window.data[sourceIndex]
        }
      }
    }

    // 平均化
    for (let i = 0; i < outputWindowSize; i++) {
      summedWaveform[i] /= windowInfos.length
    }

    return { waveform: summedWaveform, windowCount: windowInfos.length, windows: windowInfos }
  } else {
    // 従来の同期加算モード（キーイベント基準）
    const outputWindowSize = effectiveOutputSize
    const summedWaveform = new Float32Array(outputWindowSize)

    for (const window of windowInfos) {
      for (let j = 0; j < outputWindowSize; j++) {
        if (j < window.data.length) {
          summedWaveform[j] += window.data[j]
        }
      }
    }

    for (let i = 0; i < outputWindowSize; i++) {
      summedWaveform[i] /= windowInfos.length
    }
    
    return { waveform: summedWaveform, windowCount: windowInfos.length, windows: windowInfos }
  }
}

/**
 * 合成波形を計算する（アタック音のピークからintervalMs後にリリース音のピークが来るように配置）
 * @param attackWaveform アタック音の波形
 * @param releaseWaveform リリース音の波形
 * @param intervalMs アタック音ピークからリリース音ピークまでの間隔（ms）
 * @param sampleRate サンプルレート
 * @returns 合成波形
 */
export function calculateCombinedWaveform(
  attackWaveform: Float32Array,
  releaseWaveform: Float32Array,
  intervalMs: number,
  sampleRate: number
): Float32Array {
  const attackPeakIndex = findPeakIndex(attackWaveform)
  const releasePeakIndex = findPeakIndex(releaseWaveform)
  
  const intervalSamples = Math.floor((intervalMs / 1000) * sampleRate)
  
  const releaseStartOffset = attackPeakIndex + intervalSamples - releasePeakIndex
  const combinedLength = Math.max(
    attackWaveform.length,
    releaseStartOffset + releaseWaveform.length
  )
  
  const combined = new Float32Array(combinedLength)
  
  // アタック音をコピー
  for (let i = 0; i < attackWaveform.length; i++) {
    combined[i] = attackWaveform[i]
  }
  
  // リリース音を加算
  for (let i = 0; i < releaseWaveform.length; i++) {
    const targetIndex = releaseStartOffset + i
    if (targetIndex >= 0 && targetIndex < combinedLength) {
      combined[targetIndex] += releaseWaveform[i]
    }
  }
  
  return combined
}
