import { DEFAULT_SAMPLE_RATE } from '../contexts/AudioContextProvider'

/**
 * 音声データをWAV形式にエンコードする
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const bufferSize = 44 + dataSize

  const buffer = new ArrayBuffer(bufferSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, bufferSize - 8, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // サンプルデータ（16bit PCM）
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    view.setInt16(offset, intSample, true)
    offset += 2
  }

  return buffer
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/**
 * WAVファイルをデコードしてFloat32Arrayに変換する
 */
export function decodeWav(buffer: ArrayBuffer): { samples: Float32Array; sampleRate: number } | null {
  const view = new DataView(buffer)
  
  // RIFFヘッダーチェック
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') {
    console.error('Invalid WAV: missing RIFF header')
    return null
  }
  
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))
  if (wave !== 'WAVE') {
    console.error('Invalid WAV: missing WAVE header')
    return null
  }
  
  // チャンクを探す
  let offset = 12
  let sampleRate = DEFAULT_SAMPLE_RATE
  let bitsPerSample = 16
  let numChannels = 1
  let dataOffset = 0
  let dataSize = 0
  
  while (offset < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3)
    )
    const chunkSize = view.getUint32(offset + 4, true)
    
    if (chunkId === 'fmt ') {
      numChannels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
      bitsPerSample = view.getUint16(offset + 22, true)
    } else if (chunkId === 'data') {
      dataOffset = offset + 8
      dataSize = chunkSize
      break
    }
    
    offset += 8 + chunkSize
    // 偶数境界に揃える
    if (chunkSize % 2 !== 0) offset++
  }
  
  if (dataOffset === 0 || dataSize === 0) {
    console.error('Invalid WAV: missing data chunk')
    return null
  }
  
  // サンプルデータをFloat32Arrayに変換
  const bytesPerSample = bitsPerSample / 8
  const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels))
  const samples = new Float32Array(numSamples)
  
  for (let i = 0; i < numSamples; i++) {
    const sampleOffset = dataOffset + i * bytesPerSample * numChannels
    if (bitsPerSample === 16) {
      const intSample = view.getInt16(sampleOffset, true)
      samples[i] = intSample < 0 ? intSample / 0x8000 : intSample / 0x7FFF
    } else if (bitsPerSample === 8) {
      samples[i] = (view.getUint8(sampleOffset) - 128) / 128
    }
  }
  
  return { samples, sampleRate }
}

/**
 * tarファイルをパースしてファイル一覧を取得する
 */
export function parseTar(buffer: ArrayBuffer): { name: string; data: ArrayBuffer }[] {
  const files: { name: string; data: ArrayBuffer }[] = []
  const view = new Uint8Array(buffer)
  let offset = 0
  let paxPath: string | null = null
  
  while (offset < buffer.byteLength - 512) {
    // 終端チェック（空のブロック）
    let isEmpty = true
    for (let i = 0; i < 512; i++) {
      if (view[offset + i] !== 0) {
        isEmpty = false
        break
      }
    }
    if (isEmpty) break
    
    // ヘッダーを読み取る
    const header = new DataView(buffer, offset, 512)
    
    // ファイル名（100バイト）
    let name = ''
    for (let i = 0; i < 100; i++) {
      const byte = header.getUint8(i)
      if (byte === 0) break
      name += String.fromCharCode(byte)
    }
    
    // ファイルサイズ（8進数、12バイト）
    let sizeStr = ''
    for (let i = 124; i < 136; i++) {
      const byte = header.getUint8(i)
      if (byte === 0 || byte === 0x20) break
      sizeStr += String.fromCharCode(byte)
    }
    const fileSize = parseInt(sizeStr, 8) || 0
    
    // タイプフラグ
    const typeflag = String.fromCharCode(header.getUint8(156))
    
    offset += 512 // ヘッダー分進める
    
    if (typeflag === 'x' || typeflag === 'g') {
      // PAX拡張ヘッダー
      const paxData = new Uint8Array(buffer, offset, fileSize)
      const paxContent = new TextDecoder().decode(paxData)
      
      // path属性を探す
      const pathMatch = paxContent.match(/\d+ path=(.+)\n/)
      if (pathMatch) {
        paxPath = pathMatch[1]
      }
    } else if (typeflag === '0' || typeflag === '' || typeflag === '\0') {
      // 通常ファイル
      const actualName = paxPath || name
      paxPath = null
      
      if (fileSize > 0 && actualName) {
        const fileData = buffer.slice(offset, offset + fileSize)
        files.push({ name: actualName, data: fileData })
      }
    }
    
    // 次のブロックへ（512バイト境界に揃える）
    offset += Math.ceil(fileSize / 512) * 512
  }
  
  return files
}

/**
 * タイムスタンプCSVをパースする
 */
export function parseTimestampsCsv(csvContent: string): { keyDownTimestamps: number[]; keyUpTimestamps: number[] } {
  const lines = csvContent.trim().split('\n')
  const keyDownTimestamps: number[] = []
  const keyUpTimestamps: number[] = []
  
  // ヘッダー行をスキップ
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length >= 2) {
      const keydown = parts[0].trim()
      const keyup = parts[1].trim()
      if (keydown !== '') keyDownTimestamps.push(parseInt(keydown, 10))
      if (keyup !== '') keyUpTimestamps.push(parseInt(keyup, 10))
    }
  }
  
  return { keyDownTimestamps, keyUpTimestamps }
}

/**
 * 測定データのメタ情報
 */
export interface MeasurementMetadata {
  version: string
  exportedAt: string
  measurement: {
    id: number
    name: string
    timestamp: string
    keyTapCount: number
    keyUpCount: number
    peakIntervalMs: number
  }
  audio: {
    sampleRate: number
    peakPositionMs?: number
    recordingDurationMs: number
  }
  files: {
    metadata: string
    recording: string
    combinedWaveform: string | null
    timestamps: string
  }
}

/**
 * PAX形式のtarファイルを作成する
 */
export function createPaxTar(files: { name: string; data: ArrayBuffer | string }[]): Blob {
  const blocks: ArrayBuffer[] = []

  for (const file of files) {
    const data = typeof file.data === 'string' 
      ? new TextEncoder().encode(file.data) 
      : new Uint8Array(file.data)
    
    // PAX拡張ヘッダー（長いファイル名やUnicode対応）
    const paxHeader = createPaxExtendedHeader(file.name, data.length)
    if (paxHeader) {
      blocks.push(paxHeader.buffer as ArrayBuffer)
    }

    // UStar ヘッダー
    const header = createUstarHeader(file.name, data.length)
    blocks.push(header.buffer as ArrayBuffer)

    // ファイルデータ
    blocks.push(data.buffer as ArrayBuffer)

    // パディング（512バイト境界に揃える）
    const padding = (512 - (data.length % 512)) % 512
    if (padding > 0) {
      blocks.push(new ArrayBuffer(padding))
    }
  }

  // 終端マーカー（2つの空ブロック）
  blocks.push(new ArrayBuffer(512))
  blocks.push(new ArrayBuffer(512))

  return new Blob(blocks, { type: 'application/x-tar' })
}

/**
 * PAX拡張ヘッダーを作成（長いファイル名やUnicode対応）
 */
function createPaxExtendedHeader(filename: string, _fileSize: number): Uint8Array | null {
  // ファイル名が100バイトを超える場合、またはASCII以外の文字が含まれる場合
  const encoder = new TextEncoder()
  const encodedName = encoder.encode(filename)
  
  if (encodedName.length <= 100 && /^[\x00-\x7F]*$/.test(filename)) {
    return null // PAX拡張不要
  }

  // PAX拡張属性を作成
  const pathAttr = createPaxAttribute('path', filename)
  const paxData = encoder.encode(pathAttr)
  
  // PAX拡張ヘッダーのUStarヘッダー
  const paxHeaderName = 'PaxHeader/' + filename.substring(0, 80)
  const header = createUstarHeader(paxHeaderName, paxData.length, 'x') // 'x' = PAX extended header
  
  // ヘッダー + データ + パディング
  const padding = (512 - (paxData.length % 512)) % 512
  const result = new Uint8Array(512 + paxData.length + padding)
  result.set(header, 0)
  result.set(paxData, 512)
  
  return result
}

/**
 * PAX属性文字列を作成
 */
function createPaxAttribute(key: string, value: string): string {
  // 形式: "length key=value\n"
  // lengthは自身を含む全体の長さ
  const content = ` ${key}=${value}\n`
  let length = content.length + 1 // 最小は1桁
  
  // 桁数を正確に計算
  while (true) {
    const fullLength = length.toString().length + content.length
    if (fullLength === length) break
    length = fullLength
  }
  
  return `${length}${content}`
}

/**
 * UStarヘッダーを作成
 */
function createUstarHeader(filename: string, fileSize: number, typeflag: string = '0'): Uint8Array {
  const header = new Uint8Array(512)
  const encoder = new TextEncoder()
  
  // ファイル名（100バイト、切り詰め）
  const nameBytes = encoder.encode(filename.substring(0, 100))
  header.set(nameBytes, 0)
  
  // ファイルモード（8バイト、8進数）
  writeOctal(header, 100, 0o644, 8)
  
  // UID（8バイト）
  writeOctal(header, 108, 0, 8)
  
  // GID（8バイト）
  writeOctal(header, 116, 0, 8)
  
  // ファイルサイズ（12バイト、8進数）
  writeOctal(header, 124, fileSize, 12)
  
  // 修正時刻（12バイト、Unix時間、8進数）
  writeOctal(header, 136, Math.floor(Date.now() / 1000), 12)
  
  // チェックサム用の空白（8バイト）
  for (let i = 148; i < 156; i++) {
    header[i] = 0x20 // space
  }
  
  // タイプフラグ（1バイト）- '0'=通常ファイル, 'x'=PAX拡張ヘッダー
  header[156] = typeflag.charCodeAt(0)
  
  // リンク名（100バイト、空）
  // 148-255は既に0
  
  // UStarマジック（6バイト）
  const magic = encoder.encode('ustar')
  header.set(magic, 257)
  header[262] = 0x00
  
  // UStarバージョン（2バイト）
  header[263] = 0x30 // '0'
  header[264] = 0x30 // '0'
  
  // ユーザー名（32バイト）
  const uname = encoder.encode('user')
  header.set(uname, 265)
  
  // グループ名（32バイト）
  const gname = encoder.encode('user')
  header.set(gname, 297)
  
  // チェックサムを計算
  let checksum = 0
  for (let i = 0; i < 512; i++) {
    checksum += header[i]
  }
  
  // チェックサムを書き込み（6バイト8進数 + null + space）
  const checksumStr = checksum.toString(8).padStart(6, '0')
  for (let i = 0; i < 6; i++) {
    header[148 + i] = checksumStr.charCodeAt(i)
  }
  header[154] = 0x00
  header[155] = 0x20
  
  return header
}

/**
 * 8進数を書き込む
 */
function writeOctal(buffer: Uint8Array, offset: number, value: number, length: number): void {
  const str = value.toString(8).padStart(length - 1, '0')
  for (let i = 0; i < str.length && i < length - 1; i++) {
    buffer[offset + i] = str.charCodeAt(i)
  }
  buffer[offset + length - 1] = 0x00
}
