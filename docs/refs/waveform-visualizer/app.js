// グローバル変数
let audioContext = null
let mediaStream = null
let audioInput = null
let analyser = null
let recordingData = []
let isRecording = false
let deviceId = null

// DOM要素
const audioInputSelect = document.getElementById('audioInput')
const recordBtn = document.getElementById('recordBtn')
const statusDiv = document.getElementById('status')
const canvas = document.getElementById('waveformCanvas')
const canvasContext = canvas.getContext('2d')

// 初期化
window.addEventListener('load', () => {
    setupCanvas()
    enumerateDevices()
})

// キャンバスのサイズを設定
function setupCanvas() {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // 初期状態のキャンバスを描画
    drawEmptyCanvas()
}

// 空のキャンバスを描画
function drawEmptyCanvas() {
    canvasContext.fillStyle = '#fafafa'
    canvasContext.fillRect(0, 0, canvas.width, canvas.height)

    // 中心線を描画
    canvasContext.strokeStyle = '#ddd'
    canvasContext.lineWidth = 1
    canvasContext.beginPath()
    canvasContext.moveTo(0, canvas.height / 2)
    canvasContext.lineTo(canvas.width, canvas.height / 2)
    canvasContext.stroke()

    // テキストを表示
    canvasContext.fillStyle = '#999'
    canvasContext.font = '16px sans-serif'
    canvasContext.textAlign = 'center'
    canvasContext.fillText(
        '録音ボタンを押すと音声波形が表示されます',
        canvas.width / 2,
        canvas.height / 2 - 10
    )
}

// 音声入力デバイスを列挙
async function enumerateDevices() {
    try {
        // まずマイクアクセスを要求
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        recordBtn.disabled = false

        console.log('マイクアクセス許可取得成功')
        console.log(mediaStream)
    } catch (error) {
        console.error('デバイス取得エラー:', error)
        showStatus('マイクへのアクセスが拒否されました。', 'error')
    }
}

// 録音ボタンがクリックされたとき
recordBtn.addEventListener('click', () => {
    if (isRecording) {
        return
    }

    startRecording()
})

// 録音開始
async function startRecording() {
    if (!mediaStream) {
        showStatus('音声デバイスが選択されていません。', 'error')
        return
    }

    isRecording = true
    recordBtn.disabled = true
    recordBtn.textContent = '録音中...'
    recordBtn.classList.add('recording')
    showStatus('録音中... (1秒)', 'info')

    // AudioContextを初期化
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
    }

    // AudioContextを再開（ユーザージェスチャーが必要な場合）
    if (audioContext.state === 'suspended') {
        await audioContext.resume()
    }

    // 音声入力ソースを作成
    audioInput = audioContext.createMediaStreamSource(mediaStream)

    // アナライザーを作成
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048

    // スクリプトプロセッサーを作成（音声データを取得するため）
    const bufferSize = 4096
    const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1)

    recordingData = []

    // 音声データを収集
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const inputBuffer = audioProcessingEvent.inputBuffer
        const inputData = inputBuffer.getChannelData(0)

        // データをコピー
        recordingData.push(new Float32Array(inputData))
    }

    // オーディオグラフを接続
    audioInput.connect(analyser)
    analyser.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

    // 1秒後に録音を停止
    setTimeout(() => {
        stopRecording(scriptProcessor)
    }, 1000)
}

// 録音停止
function stopRecording(scriptProcessor) {
    isRecording = false

    // 接続を切断
    if (audioInput) {
        audioInput.disconnect()
    }
    if (analyser) {
        analyser.disconnect()
    }
    if (scriptProcessor) {
        scriptProcessor.disconnect()
    }

    // ボタンを元に戻す
    recordBtn.disabled = false
    recordBtn.textContent = '録音開始 (1秒)'
    recordBtn.classList.remove('recording')

    // 波形を描画
    drawWaveform()

    showStatus('録音完了！波形を表示しました。', 'success')
}

// 波形を描画
function drawWaveform() {
    if (recordingData.length === 0) {
        showStatus('録音データがありません。', 'error')
        return
    }

    // すべてのデータを1つの配列に結合
    const totalLength = recordingData.reduce(
        (sum, chunk) => sum + chunk.length,
        0
    )
    const combinedData = new Float32Array(totalLength)
    let offset = 0

    for (const chunk of recordingData) {
        combinedData.set(chunk, offset)
        offset += chunk.length
    }

    // キャンバスをクリア
    canvasContext.fillStyle = '#fafafa'
    canvasContext.fillRect(0, 0, canvas.width, canvas.height)

    // 波形を描画
    canvasContext.strokeStyle = '#2196F3'
    canvasContext.lineWidth = 2
    canvasContext.beginPath()

    const sliceWidth = canvas.width / combinedData.length
    let x = 0

    for (let i = 0; i < combinedData.length; i++) {
        const y = ((combinedData[i] + 1) * canvas.height) / 2

        if (i === 0) {
            canvasContext.moveTo(x, y)
        } else {
            canvasContext.lineTo(x, y)
        }

        x += sliceWidth
    }

    canvasContext.stroke()

    // 中心線を描画
    canvasContext.strokeStyle = '#ddd'
    canvasContext.lineWidth = 1
    canvasContext.beginPath()
    canvasContext.moveTo(0, canvas.height / 2)
    canvasContext.lineTo(canvas.width, canvas.height / 2)
    canvasContext.stroke()
}

// ステータスメッセージを表示
function showStatus(message, type) {
    statusDiv.textContent = message
    statusDiv.className = 'status ' + type
    statusDiv.style.display = 'block'
}

// ウィンドウのリサイズに対応
window.addEventListener('resize', () => {
    setupCanvas()
    if (recordingData.length > 0) {
        drawWaveform()
    }
})
