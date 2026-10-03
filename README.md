# packing-demo

商品・数量・単位から段ボールの候補と分箱プランを確認し、発送看板の画像を作成するアプリです。Vite、TypeScript、React を使用しています。

<https://kai987.github.io/packing-demo/>

## プロジェクト内容

- 複数商品の検索・数量入力と、PDF に基づく段ボールの照合
- 箱数を抑え、数量をできるだけ均等に分ける分箱プラン
- 実数量と箱判定用の換算数量を分離して管理
- 実測重量と容積重量を区別した発送看板
- 全商品の名前・数量を表示し、画像としてコピーできる看板
- 箱ごとの編集内容と作業途中の下書きを端末に自動保存・復元
- 日本語・中国語・英語への切り替え
- デスクトップとモバイルの両方に対応したレスポンシブレイアウト

下書きはブラウザのローカルストレージに保存します。同じ端末・ブラウザ・URL で復元でき、「フォームをリセット」で入力内容を消去できます。保存を許可しないブラウザでは保存できない旨を表示します。

## 起動方法

```bash
npm ci
npm run dev
```

## ビルドと確認

```bash
npm run build
npm run lint
npm test
npm run benchmark
```

Node.js 22 の最新版以降を使用してください。商品数量は 1〜100,000 の整数に対応しています。

## 主なファイル

- `src/App.tsx`: 画面構成とフォーム操作
- `src/catalog.ts`: PDF に基づく商品・段ボールデータ
- `src/packing.ts`: 数量換算、箱の照合、分箱計算
- `src/packing.worker.ts`: バックグラウンドでの分箱計算
- `src/boardState.ts`: 箱ごとの編集内容の管理
- `src/boardDrawing.ts`: 発送看板の描画
- `src/draft.ts`: 下書きの検証・保存・復元
- `src/i18n.ts`: 日本語・中国語・英語の文言
- `src/App.css`: コンポーネント単位のレイアウトとビジュアルスタイル
- `src/index.css`: グローバル変数、背景、タイポグラフィの基本スタイル
- `tests/`: 分箱、数量換算、看板、下書きの回帰テスト

## 公開

`main` への push で GitHub Actions がビルド・lint・テストを実行し、成功後に `dist` を GitHub Pages へ公開します。

公開 URL: https://kai987.github.io/packing-demo/

## リポジトリについて

元のリモートリポジトリには最小限の `README.md` と `LICENSE` だけが含まれていました。現在の版では Apache 2.0 ライセンスを維持したまま、その上にすぐ実行できる React + TypeScript のフロントエンド構成を整えています。
