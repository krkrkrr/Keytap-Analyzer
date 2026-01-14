Feature: 配列統計計算ユーティリティ
  # description
  大規模な配列でもスタックオーバーフローを起こさずに
  統計値を計算できる

  Scenario: 配列の最小値を取得する
    Given: 数値配列 [3, 1, 4, 1, 5] がある
    When: 最小値を計算する
    Then: 結果は 1 である

  Scenario: 負の数を含む配列の最小値
    Given: 数値配列 [-5, -1, -10, 0, 3] がある
    When: 最小値を計算する
    Then: 結果は -10 である

  Scenario: 空の配列の最小値
    Given: 空の配列がある
    When: 最小値を計算する
    Then: 結果は NaN である

  Scenario: 大規模配列でスタックオーバーフローを起こさない
    Given: 100万要素の配列がある
    And: 500000番目の要素が 0.5 である
    And: 他の要素は全て 1 である
    When: 最小値を計算する
    Then: 結果は 0.5 である
    And: スタックオーバーフローエラーが発生しない

  Scenario: 配列の最大値を取得する
    Given: 数値配列 [3, 1, 4, 1, 5] がある
    When: 最大値を計算する
    Then: 結果は 5 である

  Scenario: 絶対値の最大値を取得する
    Given: 数値配列 [3, -5, 4, 1, 2] がある
    When: 絶対値の最大値を計算する
    Then: 結果は 5 である

  Scenario: 配列の合計を計算する
    Given: 数値配列 [1, 2, 3, 4, 5] がある
    When: 合計を計算する
    Then: 結果は 15 である

  Scenario: 配列の平均を計算する
    Given: 数値配列 [1, 2, 3, 4, 5] がある
    When: 平均を計算する
    Then: 結果は 3 である

  Scenario: RMS（二乗平均平方根）を計算する
    Given: 数値配列 [1, -1, 2, -2] がある
    When: RMSを計算する
    Then: 結果は約 1.5811 である

  Scenario: 全てゼロの配列のRMS
    Given: 数値配列 [0, 0, 0, 0] がある
    When: RMSを計算する
    Then: 結果は 0 である

  Scenario: 波形統計情報を一度に計算する
    Given: 数値配列 [1, -2, 3, -4, 5] がある
    When: 波形統計を計算する
    Then: 統計情報には以下が含まれる
      | 項目      | 値    |
      | length    | 5     |
      | min       | -4    |
      | max       | 5     |
      | absMax    | 5     |
      | peakIndex | 4     |
      | mean      | 0.6   |
