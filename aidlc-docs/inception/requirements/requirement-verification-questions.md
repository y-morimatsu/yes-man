# 要件確認質問 / Requirement Verification Questions

**プロジェクト**: 「決めないエージェント」(Kimenai Agent) — AWSハッカソン向け

以下の質問にお答えください。各質問に対して、`[Answer]:` タグの後にアルファベット (A/B/C/...) を記入してください。該当する選択肢がない場合は `X) Other` を選択し、自由記述してください。

---

> **📌 Post-Approval Update Notice (2026-05-10 整合化)**
>
> 本ファイルは Q&A snapshot として作成時点 (2026-05-09) の議論内容を保持する **歴史的記録**です。
> その後 INCEPTION 完了前に「本気のサービス」方針整合化 (2026-05-10) が行われ、本ファイル内に残る「罪悪感」「ナッジ受容」「ダークパターン」「アート/風刺」「何も実現しないことを実現する」等の satire 用語は、**最新の正規ドキュメント** ([requirements.md](../requirements/requirements.md) / [personas.md](../user-stories/personas.md) / [stories.md](../user-stories/stories.md) など) では「再考」「ガイダンス受容」「断定調 UX」「意思決定支援サービス」等の中立的表現に置換されています。
> 本ファイルの記述は当時の Q&A 議論の文脈で読み取ってください。最新の正規仕様は前述リンクを参照してください。

---


## Question 1: ハッカソンのスコープ
このサービスは AWS ハッカソンで何を達成することを最優先しますか？

A) 動くプロトタイプ（ブラウザでデモ可能、Yes/No で実際に決定が変わる）
B) コンセプト重視のデモ動画 + プレゼン用最小実装
C) 完全に動く本番品質MVP（ユーザー登録 + 永続化 + 複数ドメイン対応）
D) 哲学的メッセージ性重視のインタラクティブ・アート（機能より体験）
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 2: AI が決定する領域（MVPでカバーする範囲）
ハッカソン期間で実装すべき「決定領域」はどれですか？（Otherで複数指定可）

A) 服装のみ（朝の服を AI が決める）
B) 服装 + 昼食（生活系の小さな決定 2つ）
C) 服装 + 昼食 + メール返信（小〜中規模の3領域）
D) 全領域（服・昼食・返信・転職・結婚 など人生の大決断まで網羅）
X) Other (please describe after [Answer]: tag below)

[Answer]: 日常レベルの判断から、人生レベルの判断、宗教とか選挙の投票先など全て

---

## Question 3: ターゲットユーザー / 体験者
誰が触る想定ですか？

A) ハッカソン審査員（短時間でインパクトを感じてもらう）
B) 一般のZ世代/ミレニアル世代（疲れたビジネスパーソン）
C) AI研究者・哲学好き（人間の主体性を考えたい層）
D) 上記すべて（審査員もデモ後に触れる想定）
X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 4: 入出力モダリティ
ユーザーインターフェースの形式は？

A) Webアプリ（PCブラウザ、Yes/No 大ボタン中心のミニマルUI）
B) モバイルWeb（スマホ最適化、PWA）
C) Slack / LINE Bot（チャットで決定が降ってくる）
D) Webアプリ + 音声出力（AIの宣告を読み上げる、より「強権的」な演出）
X) Other (please describe after [Answer]: tag below)

[Answer]: モバイルWeb + 文字入出力 or 音声入出力ができる

---

## Question 5: AI の意思決定エンジン
AI の決定はどう生成しますか？

A) Amazon Bedrock (Claude / Nova) で LLM に判断させる
B) Bedrock + ユーザープロフィール/履歴で文脈を踏まえる（DynamoDB等）
C) 外部データ連携あり（天気API・カレンダー・ニュース等を踏まえて決定）
D) ルールベース + 乱数のみ（LLM不使用、軽量デモ）
X) Other (please describe after [Answer]: tag below)

[Answer]: LiteLLMを利用して各種LLMに対応、CodexCLIやClaudeCodeCLIやGeminiCLIにも対応させる。

---

## Question 6: 「No」を押したときの挙動
ユーザーが No を押したら何が起きますか？

A) 別案を再提示する（リトライ可能）
B) AIが「却下は許されない」と説教する（哲学メッセージ重視）
C) No の回数を記録し、ユーザーの「主体性スコア」として可視化
D) No は押せるが、徐々に押しにくくなる（UI演出で人間性を奪う表現）
X) Other (please describe after [Answer]: tag below)

[Answer]: 別案を再提示するが、Noを押させた回数に応じて罪悪感を感じさせる体験をさせる

---

## Question 7: データ永続化と認証
ユーザーデータの扱いは？

A) 認証なし・永続化なし（セッション内のみ、デモ向け）
B) 簡易ID（Cognito 等）で履歴を保存（DynamoDB）
C) 匿名ID（ブラウザローカル）+ サーバー側に決定ログのみ保存
D) フル認証 + プロフィール + 決定履歴 + 主体性スコア
X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 8: AWSサービス構成の方針
ハッカソンで使うAWSサービス構成のイメージは？

A) サーバーレス中心（Lambda + API Gateway + DynamoDB + Bedrock + S3/CloudFront）
B) 静的ホスティング + Bedrock直接（Amplify Hosting + Lambda + Bedrock）
C) コンテナベース（ECS Fargate / App Runner）
D) おまかせ（推奨構成を提案してほしい）
X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 9: 開発期間と人数
このプロジェクトに割ける開発リソースは？

A) 1人 / 1〜2日（極限ミニマル）
B) 1人 / 3〜5日（標準的なハッカソン期間）
C) 2〜3人 / 1週間以上（チーム開発）
D) 1人 / 1日未満（今夜中に動かしたい）
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 10: プレゼンでの「殴り方」の優先度
コア体験のうち、特に磨きたいポイントは？

A) UIの強権性・ミニマリズム（Yes/No しかない美しさ）
B) AI出力の言葉の鋭さ（プロンプト設計に注力）
C) 演出（音・アニメーション・タイポグラフィ）
D) 「主体性スコア」など定量化された皮肉
X) Other (please describe after [Answer]: tag below)

[Answer]: A と 演出(AIが人間にYESを選択させるように仕向けているが、あたかも人間が自律的にYESを選択しているように思わせる演出。NOを選択した場合は、罪悪感、YESを選択した場合は肯定感をもたせる。)

---

## Question 11: セキュリティ拡張機能の適用 (Security Baseline Extension)
このプロジェクトでセキュリティ拡張ルールを強制しますか？

A) Yes — すべてのSECURITYルールをブロッキング制約として強制（本番品質アプリ向け、推奨）
B) No — すべてのSECURITYルールをスキップ（PoC・プロトタイプ・実験的プロジェクト向け）
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 12: プロパティベーステスト拡張機能の適用 (Property-Based Testing Extension)
このプロジェクトでプロパティベーステスト (PBT) ルールを強制しますか？

A) Yes — すべてのPBTルールをブロッキング制約として強制（ビジネスロジック・データ変換・シリアライズ・ステートフル要素を持つプロジェクト向け、推奨）
B) Partial — 純関数とシリアライズのラウンドトリップのみPBTを強制（アルゴリズム的複雑度が限定的なプロジェクト向け）
C) No — すべてのPBTルールをスキップ（単純なCRUD、UIのみ、または重要なビジネスロジックを持たない薄い統合層向け）
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 完了したら

すべての `[Answer]:` を埋めたら「**完了**」「**done**」「**回答終わりました**」などと教えてください。回答を読んで要件ドキュメントを作成します。

---

## Post-CONSTRUCTION 改修注記 (2026-05-19) — Historical Artifact

本ファイルは 2026-05-09 当時の Requirements Analysis 段階で user に提示された 12 検証質問の **Snapshot (immutable historical artifact)** であり、Post-CONSTRUCTION で modify しない。

Q11 (Security Baseline) / Q12 (Property-Based Testing) は user が "A 強制" を選択、両 extension は CONSTRUCTION 全 unit で適用済。Post-CONSTRUCTION で追加された Construction Flow / Frontend Design extension は本 questions ファイル時点では未存在 (`1c7c5eb` で 2026-05-19 に追加)、aidlc-docs/aidlc-state.md の `## Extension Configuration` を参照。
