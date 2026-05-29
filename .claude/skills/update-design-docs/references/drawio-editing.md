# drawio 編集ガイド (yesman-aws-arch)

`docs/architecture/yesman-aws-arch.drawio` は draw.io 形式の mxGraph XML。壊すと図が開けなくなる。以下の原則で編集する。

## ⚠️ 最重要: 2 層の仕分け

`yesman-aws-arch.drawio` は **フルスタック構想 (将来の完全版)** を描いている。実際にデプロイされている MVP とは別物:

| | drawio が描く構想 | 実デプロイ MVP |
|---|---|---|
| API | API Gateway (HTTP + WebSocket) | CloudFront `/api/*` → Lambda Function URL |
| 計算 | AgentCore Runtime / 多数の Lambda | FastAPI on Lambda Web Adapter (1 関数) |
| LLM | Bedrock AgentCore + Guardrail + Claude | Bedrock Gemma 3 12B (`InvokeModelWithResponseStream`) |
| 認証 | Cognito (OAuth + MFA + Google IdP) | mock 認証 (`mock-user:` トークン) |
| DB | Aurora DSQL / DynamoDB | MockStore + S3 pickle |
| 音声 | Transcribe / Polly / Nova Sonic | mock (フロントは Web Speech API) |

**変更を反映する前に、それがどちらの層の話かを必ず判定する**:
- インフラ MVP の変更 (例: Bedrock モデルを Gemma に変更) → 設計書 04 §4.2 と 01 §1.6 が一次。drawio (構想図) は必ずしも追随不要。追随する場合も「構想」の表現を壊さない。
- 構想レベルの変更 (例: AgentCore に新コンポーネント) → drawio が一次。
- 判断に迷う場合はユーザーに「これは MVP 図 / 構想図 のどちらに反映しますか?」と確認する。
- 簡易図 `yesman-aws-architecture-simple.drawio.svg` がどちらを描いているかは、編集前に中身を見て判断する。

## ファイル構造

```xml
<mxfile host="...">
  <diagram name="yesman-aws-arch" id="yesman-aws-arch">
    <mxGraphModel ...>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="<node-id>" value="..." style="..." parent="1" vertex="1">
          <mxGeometry x="..." y="..." width="..." height="..." as="geometry"/>
        </mxCell>
        <mxCell id="<edge-id>" value="..." style="endArrow=...;" parent="1" edge="1" source="<a>" target="<b>">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- `id="0"` / `id="1"` は予約。触らない。
- `vertex="1"` = ボックス、`edge="1"` = 矢印。
- value 内の改行は `&#10;`、`&` は `&amp;` でエスケープ済み。**この XML エスケープを壊さないこと**。

## id 命名規則 (このファイル)

調査の結果、以下のパターン:
- `title` / `subtitle` — 図タイトル
- `<group>-group` — グルーピング枠 (例: `edge-group`, `auth-group`, `api-gw-group`, `lambda-group`, `agentcore-group`)
- `<component>` — 個別リソース (例: `cloudfront`, `waf`, `s3-web`, `cognito-up`, `http-api`, `ws-api`, `rest-lambda`, `agent-runtime`, `bedrock-guardrail`, `bedrock-claude`, `aurora-dsql`)
- `<component>-ip` — IAM ポリシー注記 (例: `cognito-ip`, `rum-ip`)
- エッジは `value` に経路説明 (例: `HTTPS (Browser → CloudFront → HTTP API)`)

新規 id はこの規則に沿い、既存と衝突しないこと (`grep 'id="<new-id>"' <file>` が 0 件)。

## 編集パターン

### A: テキスト変更のみ (最低リスク)

既存ボックスのラベルを変える (例: `Bedrock Models&#10;(Claude Haiku ...)` → `(Gemma 3 12B ...)`):
1. 該当 mxCell の `value=` の値だけ `Edit`。
2. `style` / `x` / `y` / `width` / `height` / `id` は触らない。
3. 改行 `&#10;`・`&amp;` のエスケープを保つ。

### B: ボックス追加 (中リスク)

1. 同系統 (同じ色/グループ) の既存 mxCell 全体 (mxGeometry 含む) をコピー。
2. id を命名規則に沿った一意値に変える。衝突しないか grep で確認。
3. `value=` を新ラベルに。改行は `&#10;`。
4. `x` / `y` を近傍から 40-200px ずらす。幅高はコピー元のまま可。
5. 必要なら入出力エッジを追加 (パターン C)。
6. 保存後に mxCell 総数が期待通り +N か確認 (`grep -c '<mxCell' <file>`)。

### C: エッジ追加

1. 既存エッジを 1 つコピー。
2. id を一意に。`source` / `target` を接続先 id に。
3. `value` (経路説明) を更新。style はコピー元のまま。

### D: 大規模レイアウト変更 (高リスク・非推奨)

グループ丸ごと追加・多数の位置調整など:
- XML を無理に直編集しない。
- `docs/architecture/update-needed.md` (なければ新規) に「drawio を手動更新せよ。反映内容: ...」を箇条書きで残す。
- この方針はユーザーに確認する。

## PNG の扱い

`yesman-aws-arch.png` は draw.io からのエクスポート成果物。**XML を直編集しても PNG は自動更新されない**。
- drawio-desktop CLI が使えるなら: `drawio -x -f png -o yesman-aws-arch.png yesman-aws-arch.drawio` で再エクスポート。
- 使えない/不明なら、報告に「PNG は手動再エクスポートが必要」と明記する。PNG と drawio の不一致を黙って放置しない。

## 編集後チェックリスト

- [ ] XML 妥当性: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('docs/architecture/yesman-aws-arch.drawio')"` がエラーなし
- [ ] (SVG を触ったら) `... ET.parse('docs/architecture/yesman-aws-architecture-simple.drawio.svg')` もエラーなし
- [ ] 新 `id=` が既存と衝突していない
- [ ] 追加 mxCell に `parent=` がある / vertex は `vertex="1"` / edge は `edge="1"`
- [ ] value 内の `&#10;` `&amp;` エスケープが壊れていない
- [ ] ファイル末尾が `</mxfile>` で終わる
- [ ] mxCell 総数が想定通り変化

## 迷ったら

- 文言変更で済むなら追加より変更 (低リスク)。
- パターン D 該当 → 手動更新指示に切替をユーザー確認。
- レイアウト崩れは許容 (ユーザーが draw.io で調整可)。**座標の正確さより XML 妥当性を優先**。
- どの層 (MVP/構想) に反映するか不明 → ユーザー確認。
