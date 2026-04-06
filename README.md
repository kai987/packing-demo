# packing-demo

Vite をベースにした TypeScript + React のフロントエンドプロジェクトです。空のテンプレートから、インタラクティブに操作できる `Packing Demo` のシングルページアプリへ作り替えています。

## プロジェクト内容

- 3 つのパッキングシナリオを切り替え可能: `48h Weekender`、`Creator Sprint`、`Overland Escape`
- 検索・絞り込み・チェックに対応したパッキングリスト
- 重量、容量、重要アイテムの完了状況をリアルタイムで表示
- デスクトップとモバイルの両方に対応したレスポンシブレイアウト

## 起動方法

```bash
npm install
npm run dev
```

## ビルドと確認

```bash
npm run build
npm run lint
```

## 主なファイル

- `src/App.tsx`: 画面構成、インタラクションロジック、サンプルデータ
- `src/App.css`: コンポーネント単位のレイアウトとビジュアルスタイル
- `src/index.css`: グローバル変数、背景、タイポグラフィの基本スタイル

## リポジトリについて

元のリモートリポジトリには最小限の `README.md` と `LICENSE` だけが含まれていました。現在の版では Apache 2.0 ライセンスを維持したまま、その上にすぐ実行できる React + TypeScript のフロントエンド構成を整えています。
