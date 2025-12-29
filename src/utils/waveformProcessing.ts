/**
 * 波形同期加算処理のユーティリティ関数
 */

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
 * 同期加算処理のパラメータ（動的ウィンドウ計算対応）
 */
export interface SyncAverageParams {
  audioData: Float32Array
  timestamps: number[]              // 基準となるタイムスタンプ（KeyDown or KeyUp）
  endTimestamps: number[]           // 各ウィンドウの終端タイムスタンプ
  offsetMs: number                  // ウィンドウ開始位置の前方オフセット
  peakAlign: boolean                // ピーク同期モード
  peakPositionMs: number            // 出力波形内のピーク位置
  sampleRate: number
}

/**
 * 個別ウィンドウの情報
 */
export interface WindowInfo {
  data: Float32Array
  peakIndex: number
  timestampMs: number
  windowLengthMs: number  // このウィンドウの長さ（ms）
}

/**
 * 同期加算処理の結果
 */
export interface SyncAverageResult {
  waveform: Float32Array | null
  windowCount: number
  windows: WindowInfo[]
  outputLengthMs: number  // 出力波形の長さ（ms）
}

/**
 * キーイベント間隔に基づいてウィンドウ終端を計算する
 * @param timestamps 基準タイムスタンプ（例：keyDown）
 * @param alternateTimestamps 別種のタイムスタンプ（例：keyUp）
 * @returns 各タイムスタンプに対するウィンドウ終端タイムスタンプ
 */
export function calculateWindowEndTimestamps(
  timestamps: number[],
  alternateTimestamps: number[]
): number[] {
  const endTimestamps: number[] = []
  
  for (let i = 0; i < timestamps.length; i++) {
    const currentTime = timestamps[i]
    const nextSameTime = timestamps[i + 1] ?? Infinity
    
    // alternateTimestamps から currentTime より後の最初のタイムスタンプを探す
    let nextAlternateTime = Infinity
    for (const altTime of alternateTimestamps) {
      if (altTime > currentTime) {
        nextAlternateTime = altTime
        break
      }
    }
    
    // 次のイベント（同種または別種）の早い方をウィンドウ終端とする
    const endTime = Math.min(nextSameTime, nextAlternateTime)
    endTimestamps.push(endTime === Infinity ? currentTime + 100 : endTime) // フォールバック: 100ms
  }
  
  return endTimestamps
}

/**
 * 同期加算処理を実行する（動的ウィンドウ長対応）
 * @param params 同期加算のパラメータ
 * @returns 同期加算された波形と有効ウィンドウ数
 */
export function calculateSyncAveragedWaveform(params: SyncAverageParams): SyncAverageResult {
  const {
    audioData,
    timestamps,
    endTimestamps,
    offsetMs,
    peakAlign,
    peakPositionMs,
    sampleRate,
  } = params

  if (timestamps.length === 0) {
    return { waveform: null, windowCount: 0, windows: [], outputLengthMs: 0 }
  }

  const windowOffsetSamples = Math.floor((offsetMs / 1000) * sampleRate)

  // 個別ウィンドウを収集（各ウィンドウは動的な長さ）
  const windowInfos: WindowInfo[] = []
  
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i]
    const endTimestamp = endTimestamps[i] ?? timestamp + 100 // フォールバック
    
    const sampleIndex = Math.floor((timestamp / 1000) * sampleRate)
    const endSampleIndex = Math.floor((endTimestamp / 1000) * sampleRate)
    
    const windowStart = sampleIndex - windowOffsetSamples
    const windowEnd = Math.min(endSampleIndex + windowOffsetSamples, audioData.length)
    const windowLengthMs = (endTimestamp - timestamp) + offsetMs * 2

    if (windowStart >= 0 && windowEnd > windowStart) {
      const windowData = audioData.slice(windowStart, windowEnd)
      // ウィンドウ全体でピークを検索
      const peakIndex = findPeakIndex(windowData)
      windowInfos.push({ 
        data: windowData, 
        peakIndex, 
        timestampMs: timestamp,
        windowLengthMs 
      })
    }
  }

  if (windowInfos.length === 0) {
    return { waveform: null, windowCount: 0, windows: [], outputLengthMs: 0 }
  }

  // ピーク同期後の有効範囲を計算
  const peakPositionInOutput = Math.floor((peakPositionMs / 1000) * sampleRate)
  
  // 各ウィンドウについて、ピーク位置を peakPositionInOutput に揃えたときの
  // 有効範囲（全ウィンドウがデータを持っている範囲）を計算
  let minStartOffset = 0  // ピーク位置より前の最小サンプル数
  let minEndOffset = Infinity  // ピーク位置より後の最小サンプル数
  
  for (const window of windowInfos) {
    const beforePeak = window.peakIndex  // ピーク位置より前のサンプル数
    const afterPeak = window.data.length - window.peakIndex - 1  // ピーク位置より後のサンプル数
    
    minStartOffset = Math.max(minStartOffset, peakPositionInOutput - beforePeak)
    minEndOffset = Math.min(minEndOffset, afterPeak)
  }
  
  // 出力サイズ: ピーク位置 + ピーク後の最小サンプル数 + 1
  const outputWindowSize = peakPositionInOutput + minEndOffset + 1
  const outputLengthMs = (outputWindowSize / sampleRate) * 1000
  
  console.log(`[同期加算] ウィンドウ数: ${windowInfos.length}, 出力サイズ: ${outputWindowSize}サンプル (${outputLengthMs.toFixed(1)}ms)`)

  if (peakAlign) {
    // ピーク同期モード
    const summedWaveform = new Float32Array(outputWindowSize)
    const sampleCounts = new Float32Array(outputWindowSize) // 各サンプル位置の有効ウィンドウ数
    
    // ピーク位置を揃えて同期加算
    for (const window of windowInfos) {
      const shift = peakPositionInOutput - window.peakIndex
      for (let j = 0; j < outputWindowSize; j++) {
        const sourceIndex = j - shift
        if (sourceIndex >= 0 && sourceIndex < window.data.length) {
          summedWaveform[j] += window.data[sourceIndex]
          sampleCounts[j] += 1
        }
      }
    }

    // 平均化（各サンプル位置で有効なウィンドウ数で割る）
    for (let i = 0; i < outputWindowSize; i++) {
      if (sampleCounts[i] > 0) {
        summedWaveform[i] /= sampleCounts[i]
      }
    }

    return { waveform: summedWaveform, windowCount: windowInfos.length, windows: windowInfos, outputLengthMs }
  } else {
    // 従来の同期加算モード（キーイベント基準）
    const summedWaveform = new Float32Array(outputWindowSize)
    const sampleCounts = new Float32Array(outputWindowSize)

    for (const window of windowInfos) {
      for (let j = 0; j < outputWindowSize; j++) {
        if (j < window.data.length) {
          summedWaveform[j] += window.data[j]
          sampleCounts[j] += 1
        }
      }
    }

    for (let i = 0; i < outputWindowSize; i++) {
      if (sampleCounts[i] > 0) {
        summedWaveform[i] /= sampleCounts[i]
      }
    }
    
    return { waveform: summedWaveform, windowCount: windowInfos.length, windows: windowInfos, outputLengthMs }
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
