# 要件クラリフィケーション質問 / Requirement Clarification Questions

**プロジェクト**: 「決めないエージェント」(Kimenai Agent)

回答を読みました。いくつか **矛盾の可能性** と **曖昧な部分** があるため、追加で確認させてください。各質問の `[Answer]:` の後にアルファベットを記入してください。

---

> **📌 Post-Approval Update Notice (2026-05-10 整合化)**
>
> 本ファイルは Q&A snapshot として作成時点 (2026-05-09) の議論内容を保持する **歴史的記録**です。
> その後 INCEPTION 完了前に「本気のサービス」方針整合化 (2026-05-10) が行われ、本ファイル内に残る「罪悪感」「ナッジ受容」「ダークパターン」「アート/風刺」「何も実現しないことを実現する」等の satire 用語は、**最新の正規ドキュメント** ([requirements.md](../requirements/requirements.md) / [personas.md](../user-stories/personas.md) / [stories.md](../user-stories/stories.md) など) では「再考」「ガイダンス受容」「断定調 UX」「意思決定支援サービス」等の中立的表現に置換されています。
> 本ファイルの記述は当時の Q&A 議論の文脈で読み取ってください。最新の正規仕様は前述リンクを参照してください。

---


## ⚠️ 矛盾1: スコープ規模 vs 決定領域の広さ

- **Q1の回答**: C「完全に動く本番品質MVP」
- **Q2の回答**: 日常〜人生・宗教・選挙投票先など **全領域**
- **Q9の回答**: 2〜3人 / 1週間以上

「全領域を本番品質で1週間」は規模的に厳しい可能性があります。実装のコアと、後で増やせる領域を分けたいです。

### Clarification Question 1
ハッカソンのデモ時点 (1週間程度) で **本番品質で完成させる「コア決定領域」** はどれにしますか？（Otherで自由指定可）

A) 服装・昼食・SNS返信 (3領域・日常レベル中心)
B) 服装・昼食・転職・結婚 (4領域・日常〜人生を縦断、哲学性◎)
C) 服装・昼食・宗教・選挙 (4領域・最大インパクト、倫理的議論を呼ぶ)
D) **拡張可能なドメイン抽象化** + 標準で5〜7領域をプリセット (アーキテクチャ重視、新領域は設定追加で増やせる)
X) Other (please describe after [Answer]: tag below)

[Answer]: 日常生活・仕事・学校・重大な決断(結婚、進学、離婚、就活、終活)などの領域

---

## ⚠️ 曖昧1: LiteLLM + 複数CLIアダプタの位置づけ

- **Q5の回答**: 「LiteLLMを利用して各種LLMに対応、CodexCLI / ClaudeCodeCLI / GeminiCLIにも対応させる」

LiteLLMは多LLM抽象化レイヤーですが、**CLIアダプタ** (Codex CLI / Claude Code CLI / Gemini CLI) はサーバーサイドから子プロセス起動する形になります。意図を確認させてください。

### Clarification Question 2
LiteLLM と各種CLIの役割は？

A) LiteLLM 経由で API ベース (Bedrock / OpenAI / Anthropic / Google) に統一。CLIは使わない
B) LiteLLM をプライマリにしつつ、CLI は **「AIエージェント同士で意思決定を相談させる」演出** のためのオプション機能
C) ユーザー設定で **LLM切替可能**。CLI は開発者・パワーユーザー向けに設定可能なバックエンドとして用意
D) すべて並列に呼び出して **多数決 or 議論で決定** させる (AIエージェントの合議を演出)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## ⚠️ 曖昧2: 「宗教」「選挙投票先」の扱い

- **Q2の回答**: 宗教・選挙投票先まで含める

これらは **倫理的・法的に極めてセンシティブ** な領域です。実装方針を明確化したいです。

### Clarification Question 3
「宗教」「選挙投票先」のドメインの扱いは？

A) **パロディ・風刺枠**として実装。「AIが本気で投票先を決定して提示」する不条理を演出。免責表示あり
B) **デモ専用ダミーデータ**で動く。本番では無効化されるフラグで制御
C) 真面目に実装。プロフィール (思想傾向・信条) を入力させ、その人にとって整合的な選択肢を提案
D) 実装しない。**メニューに項目だけ並べて「選択不能 / 沈黙」で哲学的演出** (= 何も実現しないことを実現する)
X) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## ⚠️ 曖昧3: 「主体性スコア」の算出ロジック

- **Q7の回答**: D 「フル認証 + プロフィール + 決定履歴 + **主体性スコア**」
- **Q6の回答**: 別案再提示 + Noの回数に応じて罪悪感を感じさせる

主体性スコアの定義を決めたいです。

### Clarification Question 4
主体性スコアの算出と表示は？

A) **No回数 / 総決定回数** をシンプルに％表示 (高いほど主体性あり)
B) 上記に加え、Yesまでの **思考時間** やNo連打パターンを反映した複合指標
C) 主体性スコアは **逆説的に「低い方が良い」** とAIが言ってくる (依存度を褒める設計)
D) スコアは表示せず、 **「あなたは○○日連続でYesを押しました」** など行動履歴のみ通知
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## ⚠️ 曖昧4: 音声入出力のAWSサービス

- **Q4の回答**: モバイルWeb + 文字入出力 or 音声入出力

音声を扱うAWSサービス選択を確認したいです。

### Clarification Question 5
音声入出力の実装方針は？

A) Amazon Polly (TTS) + Amazon Transcribe (STT) を組み合わせる
B) ブラウザ標準のWeb Speech API (オンデバイス) のみ。AWS音声サービスは使わない
C) Polly のみ採用 (AIの宣告を読み上げる側を重視。入力は文字)
D) 音声機能はオプション扱いで、MVPではテキストのみ
X) Other (please describe after [Answer]: tag below)

[Answer]: "Amazon Polly (TTS) + Amazon Transcribe (STT) を組み合わせ" と"ブラウザ標準のWeb Speech API"を設定ファイルで切替られるようにする。

---

## ⚠️ 曖昧5: 「Yesに誘導する演出」の具体像

- **Q10の回答**: A (Yes/Noのみのミニマル) + AIがYESを選択させるよう仕向ける演出 / NOで罪悪感、YESで肯定感

ダークパターンに近い設計のため、具体性を確認します。

### Clarification Question 6
「Yesに誘導する演出」の具体的な実装は？（複数該当する場合はOther）

A) **視覚的非対称**: Yesボタンが大きい / 色が温かい、Noは小さい / 色が冷たい
B) **タイミング**: AI回答後にYesボタンが先に活性化、Noは数秒遅れて押せるようになる
C) **言葉の重み**: AIの提案文が「あなたに最適化された結論です」と断定調。Noを選ぶと「本当に？」と問い返す
D) **微小な不快感**: Noを押すと画面が一瞬暗転 / 振動 / 効果音が冷たい音に変化
X) Other (please describe after [Answer]: tag below) ← 複数選びたい場合はここに「A,B,C,D」など

[Answer]: "YesとNoの選択はボタンでなく、スワイプライトで左右でYESNo選択させる","Noが続くと本当に？のようなメッセージを表示"

---

## ⚠️ 曖昧6: チーム構成と役割分担

- **Q9の回答**: 2〜3人 / 1週間以上

チーム編成によって、並列開発できるユニット分割が変わります。

### Clarification Question 7
チームメンバーの想定スキル構成は？

A) 全員フルスタック (フロント・バックエンド・AWS両方できる)
B) フロントエンド専任 + バックエンド/AWS専任 + デザイン/プレゼン専任 の役割分担
C) 1人がリードでフルスタック、他は部分的に手伝う形
D) 未定 / 流動的 (とりあえず動くものを作りながら決める)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## ⚠️ 曖昧7: ハッカソンの提出物・締切

提出形式が決定的に効いてきます。

### Clarification Question 8
最終提出物の形式は？

A) デプロイ済URL (公開) + プレゼン資料 + デモ動画
B) デプロイ済URL (限定共有) + プレゼン資料
C) ローカル実行可能なリポジトリ + プレゼン資料 + デモ動画
D) その他 (締切日も含めて記入してください)
X) Other (please describe after [Answer]: tag below)

[Answer]: 器にしなくてOK

---

## 完了したら

すべての `[Answer]:` を埋めたら「**完了**」「**done**」「**回答終わりました**」などと教えてください。これらの回答を踏まえて要件ドキュメント (`requirements.md`) を作成します。

---

## Post-CONSTRUCTION 改修注記 (2026-05-19) — Historical Artifact

本ファイルは 2026-05-09 当時の Requirements Analysis 段階で発生した user-AI clarification 対話の **Snapshot (immutable historical artifact)** であり、Post-CONSTRUCTION で modify しない。

要件 (`requirements.md`) 本体への post-approval addition (FR-PERSONA / FR-CV) および Post-CONSTRUCTION での解釈変更 (委任度スコア / Voice toggle / Dynamic Persona Routing) は `requirements.md` 末尾の「Post-CONSTRUCTION 改修注記」参照。
