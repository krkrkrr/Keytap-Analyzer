/**
 * 大きな配列に対応した統計計算ユーティリティ
 * Math.max(...array) などはスタックオーバーフローを起こすため、
 * forループを使用して安全に計算する
 */

/**
 * 配列の最小値を取得
 */
export function arrayMin(arr: Float32Array | number[]): number {
  if (arr.length === 0) return NaN
  let min = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) min = arr[i]
  }
  return min
}

/**
 * 配列の最大値を取得
 */
export function arrayMax(arr: Float32Array | number[]): number {
  if (arr.length === 0) return NaN
  let max = arr[0]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i]
  }
  return max
}

/**
 * 配列の絶対値の最大値を取得
 */
export function arrayAbsMax(arr: Float32Array | number[]): number {
  if (arr.length === 0) return NaN
  let absMax = Math.abs(arr[0])
  for (let i = 1; i < arr.length; i++) {
    const absVal = Math.abs(arr[i])
    if (absVal > absMax) absMax = absVal
  }
  return absMax
}

/**
 * 配列の合計を取得
 */
export function arraySum(arr: Float32Array | number[]): number {
  let sum = 0
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]
  }
  return sum
}

/**
 * 配列の平均を取得
 */
export function arrayMean(arr: Float32Array | number[]): number {
  if (arr.length === 0) return NaN
  return arraySum(arr) / arr.length
}

/**
 * 配列のRMS（二乗平均平方根）を取得
 */
export function arrayRms(arr: Float32Array | number[]): number {
  if (arr.length === 0) return NaN
  let sumSq = 0
  for (let i = 0; i < arr.length; i++) {
    sumSq += arr[i] * arr[i]
  }
  return Math.sqrt(sumSq / arr.length)
}

/**
 * 配列のピーク（絶対値最大）のインデックスを取得
 */
export function findPeakIndex(arr: Float32Array | number[]): number {
  if (arr.length === 0) return -1
  let peakIndex = 0
  let absMax = Math.abs(arr[0])
  for (let i = 1; i < arr.length; i++) {
    const absVal = Math.abs(arr[i])
    if (absVal > absMax) {
      absMax = absVal
      peakIndex = i
    }
  }
  return peakIndex
}

/**
 * 波形データの統計情報を一度に計算（効率的）
 */
export interface WaveformStats {
  length: number
  min: number
  max: number
  absMax: number
  mean: number
  rms: number
  peakIndex: number
}

export function calculateWaveformStats(arr: Float32Array | number[]): WaveformStats | null {
  if (!arr || arr.length === 0) return null

  let min = arr[0]
  let max = arr[0]
  let absMax = Math.abs(arr[0])
  let sum = 0
  let sumSq = 0
  let peakIndex = 0

  for (let i = 0; i < arr.length; i++) {
    const val = arr[i]
    const absVal = Math.abs(val)

    if (val < min) min = val
    if (val > max) max = val
    if (absVal > absMax) {
      absMax = absVal
      peakIndex = i
    }
    sum += val
    sumSq += val * val
  }

  return {
    length: arr.length,
    min,
    max,
    absMax,
    mean: sum / arr.length,
    rms: Math.sqrt(sumSq / arr.length),
    peakIndex,
  }
}
