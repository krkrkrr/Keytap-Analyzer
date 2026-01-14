Feature: ステータスメッセージコンポーネント
  # description
  アプリケーションの状態をユーザーに伝える
  色分けされたメッセージを表示する

  Scenario: メッセージが空の場合は表示しない
    Given: statusが "idle" である
    And: messageが "" である
    When: コンポーネントをレンダリングする
    Then: 何も表示されない

  Scenario: メッセージがある場合は表示する
    Given: statusが "idle" である
    And: messageが "テストメッセージ" である
    When: コンポーネントをレンダリングする
    Then: "テストメッセージ" が表示される

  Scenario: Idleステータスのメッセージを表示する
    Given: statusが "idle" である
    And: messageが "待機中" である
    When: コンポーネントをレンダリングする
    Then: "待機中" が表示される

  Scenario: 録音中ステータスのメッセージを表示する
    Given: statusが "recording" である
    And: messageが "録音中..." である
    When: コンポーネントをレンダリングする
    Then: "録音中..." が表示される

  Scenario: 完了ステータスのメッセージを表示する
    Given: statusが "completed" である
    And: messageが "録音完了" である
    When: コンポーネントをレンダリングする
    Then: "録音完了" が表示される

  Scenario: エラーステータスのメッセージを表示する
    Given: statusが "error" である
    And: messageが "エラーが発生しました" である
    When: コンポーネントをレンダリングする
    Then: "エラーが発生しました" が表示される

  Scenario: 録音中ステータスにinfoクラスを適用する
    Given: statusが "recording" である
    And: messageが "録音中" である
    When: コンポーネントをレンダリングする
    Then: "info" クラスが適用されている

  Scenario: 完了ステータスにsuccessクラスを適用する
    Given: statusが "completed" である
    And: messageが "完了" である
    When: コンポーネントをレンダリングする
    Then: "success" クラスが適用されている

  Scenario: エラーステータスにerrorクラスを適用する
    Given: statusが "error" である
    And: messageが "エラー" である
    When: コンポーネントをレンダリングする
    Then: "error" クラスが適用されている

  Scenario: Idleステータスに特定クラスを適用しない
    Given: statusが "idle" である
    And: messageが "待機" である
    When: コンポーネントをレンダリングする
    Then: "info" クラスが適用されていない
    And: "success" クラスが適用されていない
    And: "error" クラスが適用されていない

  Scenario: 長いメッセージを表示する
    Given: messageが "これは非常に長いメッセージです。エラーの詳細情報を表示しています。" である
    When: コンポーネントをレンダリングする
    Then: メッセージ全体が表示される

  Scenario: 特殊文字を含むメッセージを表示する
    Given: messageが "エラー: ファイル \"test.wav\" の読み込みに失敗しました" である
    When: コンポーネントをレンダリングする
    Then: メッセージ全体が表示される

  Scenario: 複数回のステータス変更を処理する
    Given: 最初にstatusが "idle"、messageが "待機中" である
    When: コンポーネントをレンダリングする
    Then: "待機中" が表示される
    When: statusを "recording"、messageを "録音開始" に変更する
    Then: "録音開始" が表示される
    When: statusを "completed"、messageを "完了しました" に変更する
    Then: "完了しました" が表示される

  Scenario: 空白のみのメッセージを処理する
    Given: messageが "   " である
    When: コンポーネントをレンダリングする
    Then: コンポーネントが表示される（空白は真値）

  Scenario: 単一文字のメッセージを表示する
    Given: statusが "error" である
    And: messageが "!" である
    When: コンポーネントをレンダリングする
    Then: "!" が表示される
