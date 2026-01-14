Feature: 折りたたみ可能セクションコンポーネント
  # description
  コンテンツを表示・非表示に切り替えられる
  セクションを提供する

  Scenario: タイトルと子要素を表示する
    Given: titleが "テストセクション" である
    And: 子要素として "コンテンツ" がある
    When: コンポーネントをレンダリングする
    Then: "テストセクション" が表示される
    And: "コンテンツ" が表示される

  Scenario: 複数の子要素を表示する
    Given: titleが "セクション" である
    And: 子要素として "最初の子要素" と "2番目の子要素" がある
    When: コンポーネントをレンダリングする
    Then: "最初の子要素" が表示される
    And: "2番目の子要素" が表示される

  Scenario: デフォルトで展開状態
    Given: defaultExpandedが true である
    And: 子要素として "表示されるコンテンツ" がある
    When: コンポーネントをレンダリングする
    Then: "表示されるコンテンツ" が表示される

  Scenario: デフォルトで折りたたみ状態
    Given: defaultExpandedが false である
    And: 子要素として "非表示コンテンツ" がある
    When: コンポーネントをレンダリングする
    Then: "非表示コンテンツ" が非表示である
    # または display: none が適用されている

  Scenario: ヘッダークリックで状態をトグルする
    Given: defaultExpandedが true である
    And: titleが "トグル可能セクション" である
    And: 子要素として "トグル対象のコンテンツ" がある
    When: コンポーネントをレンダリングする
    Then: "トグル対象のコンテンツ" が表示される
    When: ヘッダーをクリックする
    Then: "トグル対象のコンテンツ" が非表示になる
    # または親要素に display: none が適用される

  Scenario: ヘッダーがクリック可能
    Given: titleが "クリック可能" である
    When: コンポーネントをレンダリングする
    Then: ヘッダーをクリックできる
    And: エラーが発生しない

  Scenario: 複数回トグルする
    Given: defaultExpandedが true である
    And: titleが "複数回トグル" である
    And: 子要素として "コンテンツ" がある
    When: コンポーネントをレンダリングする
    Then: "コンテンツ" が表示される
    When: ヘッダーを3回クリックする
    Then: ヘッダーが存在する
    # 実装により状態が異なるが、エラーは発生しない

  Scenario: 複雑な子要素を表示する
    Given: titleが "複雑なコンテンツ" である
    And: 子要素として以下がある
      | 要素         |
      | サブタイトル |
      | 段落テキスト |
      | リスト項目1  |
      | リスト項目2  |
    When: コンポーネントをレンダリングする
    Then: 全ての子要素が表示される

  Scenario: 子要素なしで表示する
    Given: titleが "空のセクション" である
    And: 子要素がない
    When: コンポーネントをレンダリングする
    Then: "空のセクション" が表示される

  Scenario: 適切な見出し構造を持つ
    Given: titleが "アクセシブルなセクション" である
    When: コンポーネントをレンダリングする
    Then: タイトルが表示される
    And: アクセシビリティが確保されている
