# Keytap Analyzer - テストガイド

## 概要

このプロジェクトでは**Vitest**を使用してユニットテストとコンポーネントテストを実装しています。

## テストの実行

### 基本的なテスト実行

```bash
# 全テストを実行
npm test

# テストを1回だけ実行（CI用）
npm run test:run

# UIモードでテストを実行
npm run test:ui

# カバレッジ付きでテストを実行
npm run test:coverage
```

### ウォッチモード

開発中は`npm test`を実行すると、ファイル変更を監視して自動的にテストが再実行されます。

### UI モード

```bash
npm run test:ui
```

Vitest UIをブラウザで開き、テスト結果を視覚的に確認できます。

## テスト構造

```
tests/
├── setup.ts              # テスト環境のセットアップ
├── unit/                 # ユニットテスト
│   ├── arrayStats.test.ts
│   ├── audioExport.test.ts
│   ├── waveformProcessing.test.ts
│   ├── useAudioFeatures.test.ts
│   └── useAudioRecorder.test.ts
└── components/           # コンポーネントテスト
    ├── RecordButton.test.tsx
    ├── StatusMessage.test.tsx
    └── CollapsibleSection.test.tsx
```

## テストカバレッジ

### ユーティリティ関数（`src/utils/`）

- **arrayStats.ts**: 配列統計計算（23テスト）
  - 最小値・最大値・合計・平均・RMS
  - 大規模配列の処理
  - エッジケース（空配列、負の値）

- **audioExport.ts**: WAVエンコード/デコード（11テスト）
  - WAVファイルのエンコーディング
  - WAVファイルのデコーディング
  - 不正なデータの処理

- **waveformProcessing.ts**: 波形同期加算処理（15テスト）
  - ピーク検出
  - ウィンドウ終端計算
  - 同期加算平均化
  - ピーク同期モード

### カスタムフック（`src/hooks/`）

- **useAudioRecorder**: 録音機能（17テスト）
  - 初期状態
  - マイクアクセス初期化
  - 録音開始・停止
  - 波形再計算
  - パラメータ設定

- **useAudioFeatures**: 音声特徴量抽出（15テスト）
  - RMS、ZCR、エネルギー
  - スペクトル特徴量（重心、平坦度、ロールオフ等）
  - Chroma、Loudness
  - エッジケース処理

### Reactコンポーネント（`src/components/`）

- **RecordButton**: 録音ボタン（11テスト）
  - 表示状態
  - クリックイベント
  - 無効化状態
  - スタイル

- **StatusMessage**: ステータスメッセージ（15テスト）
  - 表示制御
  - ステータスごとの表示
  - スタイルクラス
  - エッジケース

- **CollapsibleSection**: 折りたたみセクション（10テスト）
  - 展開・折りたたみ
  - トグル機能
  - 複雑なコンテンツ

## モック

テスト環境では以下のAPIがモックされています：

- **Web Audio API**: `AudioContext`, `AnalyserNode`, etc.
- **MediaStream API**: `navigator.mediaDevices.getUserMedia()`
- **HTMLMediaElement**: `play()`, `pause()`, `load()`

詳細は [`tests/setup.ts`](tests/setup.ts) を参照してください。

## テストの書き方

### ユニットテストの例

```typescript
import { describe, it, expect } from 'vitest'
import { arrayMin } from '../../src/utils/arrayStats'

describe('arrayMin', () => {
  it('should return the minimum value', () => {
    expect(arrayMin([3, 1, 4, 1, 5])).toBe(1)
  })

  it('should return NaN for empty array', () => {
    expect(arrayMin([])).toBeNaN()
  })
})
```

### コンポーネントテストの例

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecordButton } from '../../src/components/RecordButton'

describe('RecordButton', () => {
  it('should render correctly', () => {
    render(
      <RecordButton
        isRecording={false}
        disabled={false}
        onClick={() => {}}
        recordingDuration={10000}
      />
    )
    
    expect(screen.getByText('録音開始 (10秒)')).toBeInTheDocument()
  })
})
```

## テスト統計

- **合計テストファイル**: 8
- **合計テストケース**: 117
- **成功率**: 100%

## CI/CD

GitHub Actionsでテストを自動実行する場合：

```yaml
- name: Run tests
  run: npm run test:run
  
- name: Generate coverage
  run: npm run test:coverage
```

## トラブルシューティング

### テストが失敗する場合

1. 依存関係が最新であることを確認: `npm install`
2. キャッシュをクリア: `rm -rf node_modules/.vite`
3. 詳細モードで実行: `npm test -- --reporter=verbose`

### モックの問題

Web Audio APIやMediaStream APIを使用するテストが失敗する場合、[`tests/setup.ts`](tests/setup.ts)のモック定義を確認してください。

## 参考リンク

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Jest DOM matchers](https://github.com/testing-library/jest-dom)
