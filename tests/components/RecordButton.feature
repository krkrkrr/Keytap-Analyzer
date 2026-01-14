Feature: 録音ボタンコンポーネント
  # description
  ユーザーが録音を開始するためのボタンを表示し、
  録音状態を視覚的に示す

  Scenario: デフォルト状態で表示する
    Given: isRecordingが false である
    And: disabledが false である
    And: recordingDurationが 10000 である
    When: コンポーネントをレンダリングする
    Then: ボタンが表示される
    And: ボタンのテキストは "録音開始 (10秒)" である

  Scenario: 録音中状態を表示する
    Given: isRecordingが true である
    When: コンポーネントをレンダリングする
    Then: ボタンのテキストは "録音中..." である

  Scenario: 録音時間を秒単位で表示する
    Given: recordingDurationが 5000 である
    When: コンポーネントをレンダリングする
    Then: ボタンのテキストは "録音開始 (5秒)" である

  Scenario: 小数点以下の秒を処理する
    Given: recordingDurationが 2500 である
    When: コンポーネントをレンダリングする
    Then: ボタンのテキストは "録音開始 (2.5秒)" である

  Scenario: 無効化されたボタンを表示する
    Given: disabledが true である
    When: コンポーネントをレンダリングする
    Then: ボタンが無効化されている

  Scenario: 有効なボタンを表示する
    Given: disabledが false である
    When: コンポーネントをレンダリングする
    Then: ボタンが有効である

  Scenario: 無効化時はクリックイベントを発火しない
    Given: disabledが true である
    And: onClickハンドラーが設定されている
    When: ボタンをクリックする
    Then: onClickは呼び出されない

  Scenario: 有効時はクリックイベントを発火する
    Given: disabledが false である
    And: onClickハンドラーが設定されている
    When: ボタンをクリックする
    Then: onClickが 1回 呼び出される

  Scenario: 複数回のクリックを処理する
    Given: disabledが false である
    And: onClickハンドラーが設定されている
    When: ボタンを2回クリックする
    Then: onClickが 2回 呼び出される

  Scenario: 録音中のスタイルを適用する
    Given: isRecordingが true である
    When: コンポーネントをレンダリングする
    Then: ボタンに "recording" クラスが適用されている

  Scenario: 録音中でない時のスタイル
    Given: isRecordingが false である
    When: コンポーネントをレンダリングする
    Then: ボタンに "recording" クラスが適用されていない
