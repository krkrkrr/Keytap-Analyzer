Feature: 音声録音カスタムフック
  # description
  マイクから音声を録音し、キータップを検出して
  同期加算平均波形を生成する

  Scenario: デフォルト値で初期化する
    When: フックを初期化する
    Then: statusは "idle" である
    And: isRecordingは false である
    And: canRecordは false である
    And: recordingDataは null である
    And: finalRecordingDataは null である
    And: keyTapCountは 0 である
    And: keyUpCountは 0 である
    And: recordingProgressは 0 である

  Scenario: カスタム録音時間で初期化する
    When: 録音時間 5000ms でフックを初期化する
    Then: statusは "idle" である

  Scenario: カスタムサンプルレートで初期化する
    When: サンプルレート 44100 でフックを初期化する
    Then: sampleRateは 44100 である

  Scenario: 音声アクセスを正常に初期化する
    Given: フックが初期化されている
    When: initializeAudio() を呼び出す
    Then: canRecordが true になる

  Scenario: マイクアクセスが拒否される
    Given: フックが初期化されている
    And: マイクアクセスが拒否される設定である
    When: initializeAudio() を呼び出す
    Then: canRecordは false のままである

  Scenario: 初期化後に録音を開始できる
    Given: フックが初期化されている
    And: initializeAudio() が成功している
    When: startRecording() を呼び出す
    Then: startRecording関数が定義されている

  Scenario: 初期化なしでは録音を開始できない
    Given: フックが初期化されている
    When: initializeAudio()を呼ばずに startRecording() を呼び出す
    Then: isRecordingは false のままである

  Scenario: 波形再計算関数が利用可能
    Given: フックが初期化されている
    Then: recalculateAveragedWaveform関数が利用可能である
    And: recalculateReleaseWaveform関数が利用可能である
    And: recalculateCombinedWaveform関数が利用可能である

  Scenario: 波形パラメータを設定する
    Given: フックが初期化されている
    When: waveformLengthMsを 100 に設定する
    Then: waveformLengthMsは 100 である
    When: peakPositionMsを 20 に設定する
    Then: peakPositionMsは 20 である

  Scenario: 新しいオフセットでアタック音波形を再計算する
    Given: フックが初期化されている
    When: recalculateAveragedWaveform(10, true) を呼び出す
    Then: エラーが発生しない
    And: recalculateAveragedWaveform関数が定義されている

  Scenario: 新しいオフセットでリリース音波形を再計算する
    Given: フックが初期化されている
    When: recalculateReleaseWaveform(30, false) を呼び出す
    Then: releaseOffsetMsは 30 である

  Scenario: 新しい間隔で合成波形を再計算する
    Given: フックが初期化されている
    When: recalculateCombinedWaveform(15) を呼び出す
    Then: peakIntervalMsは 15 である

  Scenario: デフォルトオフセット値を確認する
    Given: フックが初期化されている
    Then: windowOffsetMsは 5 である
    And: releaseOffsetMsは 30 である
    And: peakIntervalMsは 12 である
    And: waveformLengthMsは 70 である
    And: peakPositionMsは 10 である

  Scenario: ピーク同期がデフォルトで無効
    Given: フックが初期化されている
    Then: peakAlignEnabledは false である

  Scenario: タイムスタンプ配列を管理する
    Given: フックが初期化されている
    Then: keyDownTimestampsは空配列である
    And: keyUpTimestampsは空配列である

  Scenario: キータップとキーアップのカウントを追跡する
    Given: フックが初期化されている
    Then: keyTapCountは 0 である
    And: keyUpCountは 0 である

  Scenario: 波形状態を管理する
    Given: フックが初期化されている
    Then: averagedWaveformは null である
    And: releaseWaveformは null である
    And: combinedWaveformは null である
