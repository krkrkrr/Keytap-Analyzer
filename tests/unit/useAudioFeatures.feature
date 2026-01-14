Feature: 音声特徴量抽出カスタムフック
  # description
  Meydaライブラリを使用して波形データから
  各種音声特徴量を抽出する

  Scenario: データなしで全特徴量がnull
    When: データなしでフックを初期化する
    Then: rmsは null である
    And: zcrは null である
    And: energyは null である
    And: spectralCentroidは null である
    And: spectralFlatnessは null である
    And: chromaは null である
    And: loudnessは null である

  Scenario: 空のFloat32Arrayで全特徴量がnull
    Given: 空のFloat32Arrayがある
    When: 特徴量を抽出する
    Then: rmsは null である
    And: energyは null である

  Scenario: 有効な波形データから特徴量を計算する
    Given: 48000Hzのサンプルレートがある
    And: 440Hz（A4音）の0.1秒の正弦波がある
    When: 特徴量を抽出する
    Then: rmsは null ではない
    And: rmsは 0より大きい
    And: rmsは 1未満である
    And: energyは 0より大きい
    And: zcrは 0より大きい

  Scenario: スペクトル特徴量を計算する
    Given: 48000Hzのサンプルレートがある
    And: 1000Hzの正弦波の4096サンプルがある
    When: 特徴量を抽出する
    Then: spectralCentroidは null ではない
    And: spectralFlatnessは null ではない
    And: spectralRolloffは null ではない
    And: spectralSpreadは null ではない

  Scenario: Chroma特徴量を計算する
    Given: 48000Hzのサンプルレートがある
    And: 440Hzの正弦波の4096サンプルがある
    When: 特徴量を抽出する
    Then: chromaは null ではない
    And: chromaは 12要素を持つ（12の半音）

  Scenario: Loudness特徴量を計算する
    Given: 48000Hzのサンプルレートがある
    And: ランダムな4096サンプルがある
    When: 特徴量を抽出する
    Then: loudnessは null ではない
    And: loudness.totalは 0より大きい
    And: loudness.specificは Float32Array である

  Scenario: 非常に短い波形を処理する
    Given: 100サンプルの短い波形がある
    When: 特徴量を抽出する
    Then: rmsは null ではない
    # 短いバッファでも一部の特徴量は計算可能

  Scenario: 全てゼロの波形を処理する
    Given: 全てゼロの2048サンプルの波形がある
    When: 特徴量を抽出する
    Then: rmsは 0 である
    And: energyは 0 である
    And: zcrは 0 である

  Scenario: 単一の非ゼロ値を持つ波形を処理する
    Given: 2048サンプルの波形がある
    And: インデックス1024の値のみが 1.0 である
    When: 特徴量を抽出する
    Then: rmsは 0より大きい
    And: energyは 0より大きい

  Scenario: 波形が変更されたら再計算する
    Given: 全て0.5の2048サンプルの波形がある
    When: 特徴量を抽出する
    Then: 最初のRMS値を記録する
    When: 波形を全て0.3に変更する
    Then: RMS値は最初と異なる

  Scenario: サンプルレートが変更されたら再計算する
    Given: 1000Hzの正弦波の2048サンプルがある
    And: サンプルレートが 48000 である
    When: 特徴量を抽出する
    Then: 最初のスペクトル重心を記録する
    When: サンプルレートを 44100 に変更する
    Then: スペクトル重心は最初と異なる（またはnullではない）

  Scenario: RMSが有効な範囲にある
    Given: 正弦波の2048サンプルがある
    When: 特徴量を抽出する
    Then: rmsは 0以上 である
    And: rmsは 1以下 である

  Scenario: スペクトル平坦度が[0,1]の範囲にある
    Given: ランダムな2048サンプルがある
    When: 特徴量を抽出する
    Then: spectralFlatnessが null でない場合
    And: spectralFlatnessは 0以上 である
    And: spectralFlatnessは 1以下 である

  Scenario: ZCRが非負である
    Given: 正弦波の2048サンプルがある
    When: 特徴量を抽出する
    Then: zcrは 0以上 である

  Scenario: スペクトル重心がナイキスト周波数以内
    Given: 48000Hzのサンプルレートがある
    And: 5000Hzの正弦波の2048サンプルがある
    When: 特徴量を抽出する
    Then: spectralCentroidが null でない場合
    And: spectralCentroidは 0より大きい
    And: spectralCentroidは 24000以下 である（ナイキスト周波数）
