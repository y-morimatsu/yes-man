# 新規ユーザーの嗜好を性格×生活の Yes/No swipe で把握する

- **ADR ID**: `019e7363-3f09-75b8-9ec4-76c9c7e6b768` (UUID v7)
- **slug**: `onboarding-preference-capture`
- **日付**: 2026-05-23
- **ステータス**: Accepted
- **関連コミット**: `4312d5f`, `32f54b4`
- **関連 ADR**: [フロントを React + Vite + TanStack Query + useReducer で構成する](ADR-019e7363-0859-753b-a901-09cd0baabf0a-frontend-react-reducer-stack.md)

## コンテキスト

合議の質は嗜好プロファイルに依存する。新規ユーザーでも初回から的確な提案を出すための初期シグナルが要る。

## 決定

登録時に性格 + 生活面中心の Yes/No 質問 (約 50 問) をスワイプで答えてもらい、嗜好プロファイルを初期化する。onboarding 完了フラグは per-user 化する。

## 結果 (トレードオフ)

- cold-start 時でも嗜好を反映した合議ができる。
- 同一ブラウザで複数ユーザー登録に対応するため完了フラグをユーザー単位にした。
- 進捗バーの計算バグ等、UX の細かい調整が必要だった。
