Feature: WAVファイルエンコード・デコード
  # description
  Float32Array形式の音声データとWAVファイル形式を
  相互に変換する

  Scenario: Float32ArrayをWAV形式にエンコードする
    Given: Float32Array [0, 0.5, -0.5, 1, -1] がある
    And: サンプルレートが 48000 である
    When: WAVにエンコードする
    Then: ArrayBufferが返される
    And: バッファサイズは44バイト以上である

  Scenario: 有効なWAVヘッダーを作成する
    Given: Float32Array [0, 0.5, -0.5] がある
    When: WAVにエンコードする
    Then: RIFFヘッダーが "RIFF" である
    And: WAVEヘッダーが "WAVE" である
    And: サンプルレートが 48000 である
    And: ビット深度が 16 である

  Scenario: 範囲外の値をクランプする
    Given: Float32Array [2, -2, 0.5] がある
    When: WAVにエンコードする
    Then: エラーが発生しない
    And: 有効なWAVバッファが生成される

  Scenario: 空のサンプル配列を処理する
    Given: 空のFloat32Arrayがある
    When: WAVにエンコードする
    Then: バッファサイズは44バイトである（ヘッダーのみ）

  Scenario: サンプルを16bit PCMに変換する
    Given: Float32Array [1.0, -1.0, 0] がある
    When: WAVにエンコードする
    Then: 1.0は32767に変換される
    And: -1.0は-32768に変換される
    And: 0は0に変換される

  Scenario: WAVバッファをFloat32Arrayにデコードする
    Given: Float32Array [0, 0.5, -0.5, 0.25] がある
    And: サンプルレートが 48000 である
    And: WAVにエンコード済みである
    When: WAVをデコードする
    Then: Float32Arrayが返される
    And: サンプルレートは 48000 である
    And: サンプル数は元の配列と同じである

  Scenario: 値が元の値に近いことを確認する
    Given: Float32Array [0, 0.5, -0.5, 1, -1] がある
    And: WAVにエンコード済みである
    When: WAVをデコードする
    Then: 各値は元の値と近似している（誤差 < 0.0001）

  Scenario: 不正なRIFFヘッダーを拒否する
    Given: 不正なRIFFヘッダーを持つバッファがある
    When: WAVをデコードする
    Then: nullが返される

  Scenario: 不正なWAVEヘッダーを拒否する
    Given: RIFFヘッダーは正しいが、WAVEヘッダーが不正なバッファがある
    When: WAVをデコードする
    Then: nullが返される

  Scenario: 異なるサンプルレートを処理する
    Given: Float32Array [0.1, 0.2, 0.3] がある
    And: サンプルレートが 44100 である
    When: WAVにエンコードしてデコードする
    Then: サンプルレートは 44100 である

  Scenario Outline: エンコード/デコードのラウンドトリップ
    Given: <データ> がある
    When: WAVにエンコードしてデコードする
    Then: 元のデータと近似している

    Examples:
      | データ                                  |
      | [0]                                     |
      | [0, 0.5, -0.5]                          |
      | [1, -1, 0.25, -0.25]                    |
      | 100サンプルの正弦波                      |
