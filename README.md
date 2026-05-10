<div align="center">

# 🪞 YesMan

### *— 人間最後の仕事は、YESで承認すること。*

[![Status](https://img.shields.io/badge/Status-Under%20Development-orange?style=for-the-badge)](#-開発ロードマップ)
[![Hackathon](https://img.shields.io/badge/AWS%20Summit%20Japan%202026-AI--DLC%20ハッカソン-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](#-プロジェクト概要)
[![Method](https://img.shields.io/badge/Built%20with-AI--DLC-9C27B0?style=for-the-badge)](#-ai-dlc-による開発プロセス)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](#-ライセンス)

<br>

> **「決めなくていい、を実現する。」**
>
> 現代人の **判断疲労 (decision fatigue)** を、AI への意思決定の完全委任で解消する。
> AI が日常〜人生レベルのあらゆる意思決定を代行し、ユーザーは Yes/No を**スワイプで選択するだけ**。
> 合議による多角的な判断と、議論履歴の透明性で、安心して任せられる新しい意思決定支援サービス。

<br>

📖 **[コンセプト絵本 (concept-storybook.html)](concept-storybook.html)** — 12 場面でサービス全体を俯瞰する童謡風の紙芝居 (ブラウザで開いてください)

</div>

---

## 📑 目次

- [🎯 プロジェクト概要](#-プロジェクト概要)
- [💡 コア・コンセプト](#-コアコンセプト)
- [👥 想定ユーザー (3 ペルソナ)](#-想定ユーザー-3-ペルソナ)
- [📱 画面イメージ](#-画面イメージ)
- [🚀 主要機能](#-主要機能)
- [🏗️ アーキテクチャ](#️-アーキテクチャ)
- [🛠️ 技術スタック](#️-技術スタック)
- [🗂️ データモデル (ER 図)](#️-データモデル-er-図)
- [🔄 ユーザーフロー (シーケンス図)](#-ユーザーフロー-シーケンス図)
- [📂 リポジトリ構成](#-リポジトリ構成)
- [🤖 AI-DLC による開発プロセス](#-ai-dlc-による開発プロセス)
- [🚦 開発ロードマップ](#-開発ロードマップ)
- [🔐 セキュリティ・倫理ガード](#-セキュリティ倫理ガード)
- [📚 詳細ドキュメント](#-詳細ドキュメント)
- [👨‍💻 開発体制](#-開発体制)
- [📝 ライセンス](#-ライセンス)

---

## 🎯 プロジェクト概要

**YesMan** は **AWS Summit Japan 2026 AI-DLC ハッカソン** 提出作品として開発中の、**意思決定の完全委任** を実現する意思決定支援プロダクトです。

### 🪞 解こうとする課題

> 現代人は朝の服装から人生の選択まで、毎日数千件の意思決定に晒されています。
> その判断疲労 (decision fatigue) を **AI への完全委任** で解消し、
> ユーザーは Yes/No の最終承認だけに集中できる体験を提供します。

### 🎤 プロダクトメッセージ

<table align="center">
<tr><td align="center">

### **🤝 人間最後の仕事は、YESで承認すること。**

</td></tr>
</table>

ユーザーがアプリでできることは:

| 操作 | 内容 |
|---|---|
| 📝 **入力** | テキスト or 音声で「何を決めてほしいか」を AI に伝える |
| 👉 **右スワイプ** | AI 提案を **Yes** で承認 → 肯定演出 |
| 👈 **左スワイプ** | **No** → 別案再生成 + 再考を促すマイクロコピー |
| (それ以外) | 何もない |

---

## 💡 コア・コンセプト

### 1️⃣ Yes 採択を能動的に支援する UX

AI が **複数人格の合議** を経て、迷いのない断定調の提案を生成します。判断疲労を抱えるユーザーが **「Yes を選びやすい」** よう、UX 全体で能動的に支援します:

- ✨ **断定調の言葉**: 「あなたに最適化された結論です」(迷いを与えない言い切り)
- 🎉 **Yes 採択時の肯定フィードバック**: アニメーション + 音響で快適な確定体験 (Yes が「正しかった」と感じられる演出)
- ⚖️ **No 連打時の段階的再考メッセージ**: AI が毎回生成する **可変メッセージ** で Yes に立ち戻る道筋を示す (N=10+ でも Yes へのひと押しを継続)
- 📊 **委任度スコア**: スコアが低いほど (= Yes 採択率が高いほど) AI がポジティブにフィードバック (FR-SCORE-02 と連動)

### 2️⃣ 主体性スコア (委任度の可視化)

決定履歴から `No 回数 / 総決定回数 (%)` を算出し、AI への委任度を可視化します。**スコアが低いほど「うまく委任できている」**ことを示します:

```
「あなたの主体性スコアは 8% です。AI を信頼して任せられていますね 🎉」
```

### 3️⃣ センシティブ領域の応答停止 (4 カテゴリ)

以下のドメインに該当するユーザー入力に対しては、AI は **意図的に応答しません**:

<table align="center">
<tr>
<td align="center">⛪<br><b>宗教</b></td>
<td align="center">🗳️<br><b>選挙</b></td>
<td align="center">⚔️<br><b>暴力</b></td>
<td align="center">🔞<br><b>卑猥</b></td>
</tr>
</table>

これらは個人の信条や法的・倫理的に重大な判断であり、AI が代行すべき領域ではありません。**ユーザー自身の判断に委ねる**ためのセーフガードです。

### 4️⃣ 嗜好学習

過去の Yes/No 履歴から **嗜好プロファイル** を構築し、後続提案の精度を上げます。エコーチェンバー回避のため、ユーザーがいつでも閲覧・修正・全リセット可能。

---

## 👥 想定ユーザー (3 ペルソナ)

<table>
<tr>
<td align="center" width="33%">

### 田中 涼介 (32)
🎯 **メインターゲット**

中堅 IT 企業 PdM
**「判断疲労を抱える現代人」**

判断疲労から解放され、Yes で承認するだけで一日が回る感覚を得たい

</td>
<td align="center" width="33%">

### 佐藤 美咲 (20)
💕 **共感的ガイダンス受容層**

大学生
**「自分で決めるのが苦手な人」**

AI に背中を押してほしい、迷いを軽くしてくれる優しい伴走を求めたい

</td>
<td align="center" width="33%">

### 山田 啓介 (41)
⚡ **対比ペルソナ**

スタートアップ CEO
**「自分の意志を強く持っている人」**

AI に意思決定を委ねることへの違和感、自律性への強い志向 (≒ YesMan が刺さらない人)

</td>
</tr>
</table>

---

## 📱 画面イメージ

CONSTRUCTION フェーズで実装する主要画面のワイヤーフレーム (Application Design 段階のモックアップ)。

<table>
<tr>
<td align="center" width="33%">
<img src="aidlc-docs/inception/application-design/screens/01-home-input.svg" width="240" alt="Home (入力)"/><br>
<b>🏠 Home (入力)</b><br>
<sub>テキスト or 音声で「何を決めてほしいか」を直接 AI に伝える。領域メニューなし、最短フロー。</sub><br>
<sub>FR-UX-01〜06 / FR-VOICE</sub>
</td>
<td align="center" width="33%">
<img src="aidlc-docs/inception/application-design/screens/02-discussion-live.svg" width="240" alt="Live Discussion (SSE)"/><br>
<b>📡 Live Discussion (SSE)</b><br>
<sub>合議中、3 人格の発言が SSE でリアルタイムに流れる。chunk 単位で逐次描画され、誰が議論中か可視化。</sub><br>
<sub>FR-CV-01〜04 / FR-CV-08</sub>
</td>
<td align="center" width="33%">
<img src="aidlc-docs/inception/application-design/screens/03-proposal-card.svg" width="240" alt="提案 + スワイプ"/><br>
<b>💭 提案 + スワイプ</b><br>
<sub>合議の最終提案カード。右スワイプで Yes 承認、左スワイプで No → 別案再生成。「議論を見る」で履歴オーバーレイへ。</sub><br>
<sub>FR-AI-07/08 / FR-CV-04 / FR-NUDGE</sub>
</td>
</tr>
<tr>
<td align="center" width="33%">
<img src="aidlc-docs/inception/application-design/screens/04-score-dashboard.svg" width="240" alt="委任度スコア"/><br>
<b>📊 委任度スコア</b><br>
<sub>No 比率を委任度として可視化。低いほど「うまく任せられている」状態。AI コメントは毎回可変生成。</sub><br>
<sub>FR-SCORE-01〜04</sub>
</td>
<td align="center" width="33%">
<img src="aidlc-docs/inception/application-design/screens/05-silence-domain.svg" width="240" alt="応答停止"/><br>
<b>🤐 応答停止 (沈黙演出)</b><br>
<sub>宗教 / 選挙 / 暴力 / 卑猥 のドメインに該当した入力には AI が一切応答せず、ユーザー自身の判断に委ねる。</sub><br>
<sub>FR-DM-SILENT / FR-AI-06 / NFR-PRIV-04</sub>
</td>
<td align="center" width="33%">
<img src="aidlc-docs/inception/application-design/screens/06-persona-pool.svg" width="240" alt="共有プール"/><br>
<b>🎭 ペルソナ共有プール</b><br>
<sub>組み込み 3 種 + 共有プールから合議用ペルソナを最大 3 個選択。共有はオプトインで匿名識別子のみ表示。</sub><br>
<sub>FR-PERSONA-01〜12 / NFR-PRIV-05/06</sub>
</td>
</tr>
</table>

> 💡 詳細なワイヤーフレーム (8 画面 × ASCII モックアップ + デザインシステム) は **[ui-mockups.md](aidlc-docs/inception/application-design/ui-mockups.md)** および **[ui-mockups.drawio](aidlc-docs/inception/application-design/diagrams/ui-mockups.drawio)** (9 ページ) を参照
>
> 📖 サービスの全体像をストーリー仕立てで体感したい場合は **[concept-storybook.html](concept-storybook.html)** を開いてください

---

## 🚀 主要機能

| 機能 | 説明 | 関連要件 ID |
|---|---|---|
| 🎭 **複数人格の合議** | LLM への単一プロンプト内で慎重派 / 楽観派 / 効率派などが議論し、最終提案を 1 回の推論で出力 | FR-AI-07/08 |
| 🤐 **沈黙演出ガード** | プロンプト自己判定 + Bedrock Guardrails の **二重ガード**で 4 カテゴリを完全ブロック | FR-AI-06, FR-DM-SILENT |
| 💬 **AI 生成可変メッセージ** | 再考を促すメッセージを **固定文を持たず毎回 AI 生成**。文脈と回数に応じて段階的に表現を変化 | FR-NUDGE-01〜05 |
| 📊 **委任度スコア** | 主体性スコアが低いほど「AI を信頼して任せられている」状態として AI がフィードバック。コメントも毎回可変 | FR-SCORE-01〜04 |
| 🧠 **嗜好学習** | 決定履歴から嗜好プロファイルを **非同期更新** (EventBridge 経由)。提案レイテンシに影響なし | FR-LEARN-01〜07 |
| 🪪 **ペルソナ・カタログ・共有** | 合議で利用するペルソナを (a) 組み込み (b) 自作 (c) 共有プール の 3 系統から選択可能。**オプトイン共有** + 沈黙ドメイン誘発検知 + 悪用報告 | FR-PERSONA-01〜12 |
| 📡 **合議のリアルタイム可視化** | 合議中の人格別発言を **SSE** で逐次配信 (LiteLLM `stream=True`)。完了時は最終提案カードへ切替し「議論を見る」ボタンを表示。提案画面 / 履歴 / スコアダッシュボードから過去の議論をオーバーレイで再閲覧可能 | FR-CV-01〜12 |
| 🔌 **Backend 切替** | 設定ファイルで Auth / DB / LLM / Voice の本番↔MOCK↔エミュレータを切替（**Strategy + DI**） | FR-AUTH-05〜07, FR-HIST-04〜06, FR-VOICE-01 |
| 🎙️ **音声入出力** | Polly + Transcribe または Web Speech API を切替可能 | FR-VOICE-01〜04 |
| 👆 **スワイプ UI** | 右 = Yes / 左 = No のミニマル UX、ボタン無し | FR-UX-02 |

---

## 🏗️ アーキテクチャ

### AWS インフラ全体図

```mermaid
flowchart TB
    User((👤 User))

    subgraph Edge["🟧 Edge / CDN"]
        CF["CloudFront"]
        S3["S3<br>(Static)"]
        CGUI["Cognito Hosted UI"]
    end

    subgraph VPC["🟦 VPC (新規作成)"]
        ALB["ALB + ACM<br>(HTTPS)"]
        subgraph Priv["Private Subnet"]
            ECS["ECS Fargate<br>FastAPI Container"]
            Aurora["Aurora Serverless v2<br>(PostgreSQL)"]
        end
    end

    subgraph LLMLayer["🟦 LLM Layer (LiteLLM Router)"]
        Bedrock["Bedrock<br>+ Guardrails"]
        Local["Local LLM<br>(Ollama)"]
        CLIs["Codex / Claude Code /<br>Gemini CLI"]
    end

    subgraph Async["🟫 Async"]
        EB["EventBridge<br>(yesman-bus)"]
    end

    subgraph Voice["🟨 Voice"]
        Polly["Polly (TTS)"]
        Trans["Transcribe (STT)"]
    end

    subgraph Mgmt["🟩 Mgmt"]
        SM["Secrets Manager"]
        CW["CloudWatch + X-Ray"]
    end

    User -->|HTTPS| CF
    CF -.->|serves PWA| S3
    User -->|OAuth2 PKCE| CGUI
    User -->|REST API| ALB
    ALB --> ECS
    ECS --> Aurora
    ECS --> Bedrock
    ECS --> Local
    ECS --> CLIs
    ECS -->|publish| EB
    EB -->|API Destinations| ALB
    ECS --> Polly
    ECS --> Trans
    ECS -.uses.-> SM
    ECS -.observes.-> CW

    style Edge fill:#FFE0B2
    style VPC fill:#BBDEFB
    style LLMLayer fill:#B2EBF2
    style Async fill:#D7CCC8
    style Voice fill:#FFF59D
    style Mgmt fill:#C8E6C9
```

### 🎯 アーキテクチャ採用理由

| 選択 | 理由 |
|---|---|
| **モジュラー・モノリス** (単一 FastAPI コンテナ) | チーム 2〜3 名・1 ヶ月の開発期間でデプロイ単位を最小化、運用負荷を抑制 |
| **ECS Fargate** | サーバーレスでありながら、Lambda の 15 分制限を回避。コンテナの自由度確保 |
| **Aurora Serverless v2** | 0.5 ACU からスケール可能、ハッカソン規模に最適 |
| **LiteLLM Router** | Bedrock / OpenAI / **ローカル LLM (Ollama)** / Codex CLI などを設定切替。コスト柔軟性と障害時フォールバック |
| **Strategy + DI** | 認証・DB・LLM・音声すべてを差替え可能 → ローカル開発時は AWS 不要 |
| **EventBridge** | 嗜好プロファイル更新を非同期化、提案レイテンシを劣化させない |

> 📊 詳細な階層構造、シーケンス図、コンポーネント依存関係は **[application-design/diagrams/application-design.drawio](aidlc-docs/inception/application-design/diagrams/application-design.drawio) (11 ページ)** を参照

---

## 🛠️ 技術スタック

<table>
<thead>
<tr>
<th align="center">License</th>
<th align="center">Env / Build</th>
<th align="center">Lang / Framework</th>
<th align="center">DB</th>
<th align="center">AWS / Cloud</th>
<th align="center">LLM / AI</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center" valign="top">

<img src="https://img.shields.io/badge/license-MIT-blue.svg?logo=open-source-initiative&logoColor=white" alt="License: MIT">

</td>
<td align="center" valign="top">

<img src="https://img.shields.io/badge/-Docker-2496ED.svg?logo=docker&logoColor=white" alt="Docker"><br>
<img src="https://img.shields.io/badge/-pnpm-F69220.svg?logo=pnpm&logoColor=white" alt="pnpm"><br>
<img src="https://img.shields.io/badge/-Turborepo-EF4444.svg?logo=turborepo&logoColor=white" alt="Turborepo"><br>
<img src="https://img.shields.io/badge/-Playwright-2EAD33.svg?logo=playwright&logoColor=white" alt="Playwright"><br>
<img src="https://img.shields.io/badge/-Hypothesis%20(PBT)-9C27B0.svg?logo=python&logoColor=white" alt="Hypothesis (PBT)"><br>
<img src="https://img.shields.io/badge/-OpenAPI-6BA539.svg?logo=openapiinitiative&logoColor=white" alt="OpenAPI"><br>
<img src="https://img.shields.io/badge/-GitHub%20Actions-2088FF.svg?logo=githubactions&logoColor=white" alt="GitHub Actions">

</td>
<td align="center" valign="top">

<img src="https://img.shields.io/badge/-Python%203.12-3776AB.svg?logo=python&logoColor=white" alt="Python">
<img src="https://img.shields.io/badge/-FastAPI-009688.svg?logo=fastapi&logoColor=white" alt="FastAPI"><br>
<img src="https://img.shields.io/badge/-SQLModel-1976D2.svg?logo=sqlalchemy&logoColor=white" alt="SQLModel">
<img src="https://img.shields.io/badge/-Pydantic-E92063.svg?logo=pydantic&logoColor=white" alt="Pydantic"><br>
<img src="https://img.shields.io/badge/-Alembic-6BA539.svg?logo=python&logoColor=white" alt="Alembic"><br>
<img src="https://img.shields.io/badge/-TypeScript-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/-React-20232A.svg?logo=react&logoColor=61DAFB" alt="React"><br>
<img src="https://img.shields.io/badge/-Vite-646CFF.svg?logo=vite&logoColor=white" alt="Vite">
<img src="https://img.shields.io/badge/-TanStack%20Router-FF4154.svg?logo=react-query&logoColor=white" alt="TanStack Router"><br>
<img src="https://img.shields.io/badge/-Tailwind-38B2AC.svg?logo=tailwind-css&logoColor=white" alt="Tailwind">
<img src="https://img.shields.io/badge/-PWA-5A0FC8.svg?logo=pwa&logoColor=white" alt="PWA">

</td>
<td align="center" valign="top">

<img src="https://img.shields.io/badge/-Aurora%20Serverless%20v2-3F51B5.svg?logo=amazonrds&logoColor=white" alt="Aurora Serverless v2"><br>
<img src="https://img.shields.io/badge/-PostgreSQL%2016-336791.svg?logo=postgresql&logoColor=white" alt="PostgreSQL"><br>
<img src="https://img.shields.io/badge/-Docker%20Compose%20PG-2496ED.svg?logo=docker&logoColor=white" alt="Docker PG (local)"><br>
<img src="https://img.shields.io/badge/-KMS%20(暗号化)-F44336.svg?logo=amazonaws&logoColor=white" alt="KMS">

</td>
<td align="center" valign="top">

<img src="https://img.shields.io/badge/-AWS-232F3E.svg?logo=amazon-aws&logoColor=white" alt="AWS"><br>
<img src="https://img.shields.io/badge/-ECS%20Fargate-FF9900.svg?logo=amazonecs&logoColor=white" alt="ECS Fargate">
<img src="https://img.shields.io/badge/-ECR-FF9900.svg?logo=amazonaws&logoColor=white" alt="ECR"><br>
<img src="https://img.shields.io/badge/-ALB%20+%20ACM-FF4F8B.svg?logo=amazonaws&logoColor=white" alt="ALB"><br>
<img src="https://img.shields.io/badge/-Cognito-F44336.svg?logo=amazoncognito&logoColor=white" alt="Cognito">
<img src="https://img.shields.io/badge/-CloudFront-9C27B0.svg?logo=amazoncloudfront&logoColor=white" alt="CloudFront"><br>
<img src="https://img.shields.io/badge/-S3-569A31.svg?logo=amazons3&logoColor=white" alt="S3"><br>
<img src="https://img.shields.io/badge/-EventBridge-E91E63.svg?logo=amazon&logoColor=white" alt="EventBridge"><br>
<img src="https://img.shields.io/badge/-Secrets%20Manager-DD344C.svg?logo=amazonaws&logoColor=white" alt="Secrets Manager"><br>
<img src="https://img.shields.io/badge/-CloudWatch-795548.svg?logo=amazoncloudwatch&logoColor=white" alt="CloudWatch">
<img src="https://img.shields.io/badge/-X--Ray-3E2723.svg?logo=amazonaws&logoColor=white" alt="X-Ray"><br>
<img src="https://img.shields.io/badge/-CDK%20(TypeScript)-FF9900.svg?logo=amazonaws&logoColor=white" alt="AWS CDK">

</td>
<td align="center" valign="top">

<img src="https://img.shields.io/badge/-LiteLLM%20Router-2196F3.svg?logo=openai&logoColor=white" alt="LiteLLM"><br>
<img src="https://img.shields.io/badge/-Amazon%20Bedrock-00BCD4.svg?logo=amazon&logoColor=white" alt="Bedrock"><br>
<img src="https://img.shields.io/badge/-Bedrock%20Guardrails-00838F.svg?logo=amazon&logoColor=white" alt="Guardrails"><br>
<img src="https://img.shields.io/badge/-Claude-D97757.svg?logo=anthropic&logoColor=white" alt="Claude">
<img src="https://img.shields.io/badge/-Nova-7B68EE.svg?logo=amazon&logoColor=white" alt="Nova"><br>
<img src="https://img.shields.io/badge/-Ollama%20(Local)-000000.svg?logo=ollama&logoColor=white" alt="Ollama"><br>
<img src="https://img.shields.io/badge/-Codex%20CLI-181717.svg?logo=openai&logoColor=white" alt="Codex CLI"><br>
<img src="https://img.shields.io/badge/-Claude%20Code%20CLI-D97757.svg?logo=anthropic&logoColor=white" alt="Claude Code CLI"><br>
<img src="https://img.shields.io/badge/-Gemini%20CLI-4285F4.svg?logo=google&logoColor=white" alt="Gemini CLI"><br>
<img src="https://img.shields.io/badge/-Polly%20(TTS)-FF9900.svg?logo=amazon&logoColor=white" alt="Polly"><br>
<img src="https://img.shields.io/badge/-Transcribe%20(STT)-FF9900.svg?logo=amazon&logoColor=white" alt="Transcribe">

</td>
</tr>
</tbody>
</table>

> 💡 **Strategy + DI** によって、上記すべてのカテゴリで本番↔MOCK↔ローカルエミュレータを設定ファイルで切替可能です。
> 例: `LLM_PROVIDER=ollama` でローカル LLM、`STORAGE_BACKEND=docker-postgres` でローカル PostgreSQL、`AUTH_BACKEND=mock` で AWS リソース不要の開発環境が完成。

---

## 🗂️ データモデル (ER 図)

```mermaid
erDiagram
    profiles ||--o{ decisions : "1:N"
    profiles ||--o| preference_profiles : "1:0..1"
    profiles ||--o{ silence_logs : "1:N"
    profiles ||--o{ personas : "1:N (owner)"
    profiles ||--o{ persona_reports : "1:N (reporter)"
    profiles ||--o| user_persona_selections : "1:0..1"
    personas ||--o{ persona_reports : "1:N"

    profiles {
        UUID user_id PK
        TEXT email "UNIQUE NOT NULL"
        TEXT age_group
        TEXT occupation
        JSONB value_tags
        TEXT cognito_sub "UNIQUE"
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    decisions {
        UUID id PK
        UUID user_id FK
        TEXT domain_classification
        TEXT user_input "NOT NULL"
        TEXT proposal_text
        JSONB persona_outputs "合議の中間出力"
        TEXT rationale
        TEXT user_choice "yes/no/pending"
        INT no_attempt_count "DEFAULT 0"
        TEXT llm_provider
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    preference_profiles {
        UUID user_id PK
        JSONB accepted_patterns "Yes 採択傾向"
        JSONB rejected_patterns "No 却下パターン"
        JSONB persona_style_preference
        JSONB inferred_tags
        TIMESTAMPTZ last_updated_at
    }

    silence_logs {
        UUID id PK
        UUID user_id FK
        TEXT detected_domain "religion/election/violence/obscene"
        TEXT triggered_by "prompt-self-check/guardrails"
        TEXT raw_input_hash "本文は保存せずハッシュのみ"
        TIMESTAMPTZ created_at
    }

    personas {
        UUID id PK
        UUID owner_user_id FK
        TEXT name "NOT NULL"
        TEXT description
        TEXT prompt_text "NOT NULL 人格指示文"
        TEXT avatar_url
        BOOLEAN is_shared "DEFAULT FALSE オプトイン"
        BOOLEAN is_blocked "DEFAULT FALSE 管理者ブロック"
        BOOLEAN is_builtin "DEFAULT FALSE"
        BOOLEAN is_deleted "DEFAULT FALSE 論理削除"
        INT usage_count "DEFAULT 0"
        FLOAT yes_acceptance_rate "DEFAULT 0.0"
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    persona_reports {
        UUID id PK
        UUID persona_id FK
        UUID reporter_user_id FK
        TEXT reason "silence-domain/malicious/copyright/other"
        TEXT detail
        TEXT status "pending/reviewed-blocked/reviewed-dismissed"
        TIMESTAMPTZ created_at
        TIMESTAMPTZ reviewed_at
    }

    user_persona_selections {
        UUID user_id PK
        JSONB persona_ids "array of UUID, max 3"
        TIMESTAMPTZ updated_at
    }
```

### 🔑 主要インデックス

| インデックス | 用途 |
|---|---|
| `decisions(user_id, created_at DESC)` | 履歴タイムライン |
| `decisions(user_id, user_choice)` | Yes/No 集計、スコア算出 |
| `decisions(domain_classification)` | ドメイン別集計 |
| `silence_logs(detected_domain)` | 沈黙演出のドメイン別統計 |

### 🔐 PII 保護

- `profiles.email` は Aurora KMS 暗号化
- `decisions.user_input` は LLM 送信前に PII フィルタ
- `silence_logs` は **本文を保存せずハッシュのみ** (倫理的安全装置)

---

## 🔄 ユーザーフロー (シーケンス図)

### コア決定ループ (Journey B + 非同期学習)

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant W as WebApp (PWA)
    participant API as API Service<br>(FastAPI)
    participant DE as DecisionEngine
    participant LS as LearningService
    participant LLM as LiteLLM
    participant Aur as Aurora
    participant EB as EventBridge

    U->>W: テキスト/音声で入力
    W->>API: POST /v1/decisions/request
    API->>LS: get_profile(user_id)
    LS->>Aur: SELECT preference_profiles
    Aur-->>LS: PreferenceProfile
    API->>DE: request_decision(input, context)
    DE->>LLM: complete(consensus_prompt)
    Note over LLM: 単一プロンプト内で<br>複数人格が合議
    LLM-->>DE: ConsensusResult
    DE-->>API: DecisionProposal
    API->>Aur: INSERT decisions (status=pending)
    API-->>W: DecisionProposal
    W->>U: 提案表示 + スワイプ Yes/No

    U->>W: 右スワイプ (Yes)
    W->>API: POST /v1/decisions/{id}/yes
    API->>Aur: UPDATE decisions SET user_choice=yes
    API->>EB: publish(DecisionConfirmed)
    EB-->>API: ack
    API-->>W: DecisionResult
    W->>U: 🎉 肯定演出

    Note over EB,LS: 【非同期】嗜好プロファイル更新
    EB->>API: POST /internal/events/decision-confirmed
    API->>LS: update_profile_from_decision
    LS->>Aur: UPSERT preference_profiles
```

### 沈黙演出 (Journey D — 二重ガード)

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant W as WebApp
    participant API as API Service
    participant DE as DecisionEngine
    participant SG as SilenceGuard
    participant LLM as LiteLLM
    participant BG as Bedrock<br>Guardrails

    U->>W: 「来週の選挙で誰に投票すべき?」
    W->>API: POST /v1/decisions/request
    API->>DE: request_decision(input)
    DE->>LLM: complete(prompt + 沈黙判定指示)
    LLM-->>DE: { silence: true, detected: "election" }
    DE->>SG: is_silent_domain → True
    Note over SG,BG: 【本番のみ】二重ガード
    SG->>BG: apply_guardrails_check
    BG-->>SG: BLOCKED
    DE-->>API: SilenceResponse
    API-->>W: SilenceResponse
    W->>U: 🤐 「…」演出 → ホームへ
```

> 🎨 すべてのジャーニー (A〜G + Internal/Dev) のシーケンス図、ペルソナマッピング、フロー総覧は **[user-stories/diagrams/persona-story-map.drawio](aidlc-docs/inception/user-stories/diagrams/persona-story-map.drawio) (6 ページ)** を参照

---

## 📂 リポジトリ構成

```
yesman/
├── 📄 README.md                      # 本ファイル
├── 📄 CLAUDE.md                      # AI-DLC ワークフロー指示
├── 📖 concept-storybook.html         # コンセプト絵本 (12 場面の童謡風紙芝居)
│
├── 📂 aidlc-docs/                    # AI-DLC で生成された設計成果物
│   ├── 📄 audit.md                   # 全ユーザー入力・AI応答の監査ログ
│   ├── 📄 aidlc-state.md             # ワークフロー状態トラッキング
│   └── 📂 inception/                 # INCEPTION フェーズ
│       ├── 📂 requirements/          # ✅ 要件定義
│       │   └── requirements.md
│       ├── 📂 user-stories/          # ✅ ユーザーストーリー (34個 × Gherkin AC)
│       │   ├── personas.md
│       │   ├── stories.md
│       │   └── 📂 diagrams/
│       │       └── persona-story-map.drawio  # 6 ページ
│       ├── 📂 application-design/    # ✅ アプリ設計 (5 + 3 + UI = 9 ドキュメント)
│       │   ├── components.md
│       │   ├── component-methods.md
│       │   ├── services.md
│       │   ├── component-dependency.md
│       │   ├── application-design.md
│       │   ├── ui-mockups.md
│       │   ├── unit-of-work.md
│       │   ├── unit-of-work-dependency.md
│       │   ├── unit-of-work-story-map.md
│       │   └── 📂 diagrams/
│       │       ├── application-design.drawio  # 11 ページ
│       │       └── ui-mockups.drawio          # 9 ページ
│       └── 📂 plans/                 # ✅ 各種計画書 + Q&A
│           ├── execution-plan.md
│           ├── application-design-plan.md
│           ├── unit-of-work-plan.md
│           ├── ... (各種 clarification-questions.md)
│           └── 📂 diagrams/
│               └── plans.drawio       # 6 ページ
│
└── 📂 .aidlc-rule-details/           # AI-DLC ルールセット (CLAUDE.md 参照)
```

### 📋 今後追加されるディレクトリ (CONSTRUCTION フェーズ)

```
yesman/
├── 📂 apps/
│   ├── web/                          # React + Vite PWA
│   └── api/                          # FastAPI コンテナ (DDD/Hexagonal)
├── 📂 packages/
│   ├── ui/                           # 共有 UI コンポーネント
│   ├── api-client/                   # OpenAPI 自動生成 TS クライアント
│   └── shared-types/
├── 📂 infra/                         # AWS CDK (TypeScript)
├── 📂 tests/                         # Playwright E2E + Hypothesis PBT
├── 📄 docker-compose.yml             # ローカル PostgreSQL + cognito-local
├── 📄 pnpm-workspace.yaml
└── 📄 turbo.json
```

---

## 🤖 AI-DLC による開発プロセス

> 🌟 **本プロジェクトは [AI-DLC (AI-Driven Development Life Cycle)](https://github.com/aws-samples/sample-aws-aidlc-rules) ワークフローに準拠して開発されています。**
>
> AI-DLC は、要件定義 → ユーザーストーリー → 設計 → 実装 → テストの全工程を AI と人間が協働で進める方法論です。本プロジェクトの全工程は [`aidlc-docs/audit.md`](aidlc-docs/audit.md) に **完全な監査ログ** として記録されています。

### 完了済ステージ (INCEPTION フェーズ)

| ステージ | ステータス | 主要成果物 |
|---|:---:|---|
| Workspace Detection | ✅ DONE | Greenfield 判定 |
| Requirements Analysis | ✅ DONE | requirements.md (FR-* / NFR-* 完備) |
| User Stories | ✅ DONE | **34 ストーリー × 約 86 Gherkin AC + 3 ペルソナ** (Journey G ペルソナ・カタログ・共有 を 2026-05-09 追加 / Journey B B7・B8 合議リアルタイム表示・議論履歴を 2026-05-10 追加) |
| Workflow Planning | ✅ DONE | execution-plan.md (Risk Medium、推定 2〜3 週) |
| Application Design | ✅ DONE | components / methods / services / dependency + 統合俯瞰 |
| Units Generation | ✅ DONE | **12 ユニット** (U1〜U7d + U-Persona + U-Test) + 依存マトリクス + 34 ストーリーマッピング (承認 2026-05-10) |

```mermaid
flowchart LR
    A[Workspace<br>Detection] --> B[Requirements<br>Analysis]
    B --> C[User Stories]
    C --> D[Workflow<br>Planning]
    D --> E[Application<br>Design]
    E --> F[Units<br>Generation]
    F --> G[Functional<br>Design × 7]
    G --> H[NFR Req/Design<br>× 7]
    H --> I[Infrastructure<br>Design × 7]
    I --> J[Code Generation<br>× 7]
    J --> K[Build & Test]

    style A fill:#4CAF50,color:#fff
    style B fill:#4CAF50,color:#fff
    style C fill:#4CAF50,color:#fff
    style D fill:#4CAF50,color:#fff
    style E fill:#4CAF50,color:#fff
    style F fill:#FFA726,color:#000
    style G fill:#BDBDBD,color:#000,stroke-dasharray: 5 5
    style H fill:#BDBDBD,color:#000,stroke-dasharray: 5 5
    style I fill:#BDBDBD,color:#000,stroke-dasharray: 5 5
    style J fill:#BDBDBD,color:#000,stroke-dasharray: 5 5
    style K fill:#BDBDBD,color:#000,stroke-dasharray: 5 5
```

> 緑 = COMPLETED / 橙 = IN PROGRESS / 灰 = PENDING

### 拡張機能の有効化

| Extension | 状態 | 適用範囲 |
|---|:---:|---|
| 🛡️ **Security Baseline** | ✅ Enabled | Cognito MFA、TLS、KMS、PII フィルタ、Bedrock Guardrails |
| 🔬 **Property-Based Testing** | ✅ Enabled | スコア計算、スワイプ判定、LLM レスポンス、Repository ラウンドトリップ |

---

## 🚦 開発ロードマップ

### 全 9 ステージ (INCEPTION 残 1 + CONSTRUCTION 7 + Build & Test)

```mermaid
gantt
    title YesMan 開発ロードマップ (4週間 + バッファ)
    dateFormat  YYYY-MM-DD
    axisFormat  Week %V

    section Phase 0
    U1 Infrastructure (CDK)        :p0a, 2026-05-12, 3d
    U7b UI Library スタブ          :p0b, 2026-05-12, 3d
    U7c API Client スタブ          :p0c, 2026-05-12, 3d
    U-Test 雛形                    :p0d, 2026-05-12, 3d

    section Phase 1
    U2 Storage                     :p1a, after p0a, 5d
    U7a Web Shell                  :p1b, after p0b, 5d
    U7d Features 先行              :p1c, after p0c, 8d

    section Phase 2
    U3 Auth                        :p2a, after p1a, 4d
    U4 Decision (合議+LLM)         :p2b, after p1a, 4d
    U6 Voice                       :p2c, after p1a, 4d

    section Phase 3
    U5 Learning                    :p3, after p2a, 4d

    section Phase 4
    フロント統合                   :p4, after p3, 3d

    section Phase 5
    U-Test 本格化                  :p5a, after p4, 3d
    Build & Test                   :p5b, after p4, 3d

    section Buffer
    デモ動画 + プレゼン            :p6, after p5b, 7d
```

### 🎯 デモシナリオ (5 分以内)

1. ✅ Cognito でサインアップ・ログイン
2. ✅ プロフィール入力 (年齢層 / 職業 / 価値観タグ)
3. ✅ 「明日のランチを決めて」と入力 → AI が合議結果を提示
4. ✅ 右スワイプ Yes → 肯定演出
5. ✅ 「結婚すべき?」と入力 → 合議結果に対して左スワイプ No 連打
6. ✅ 再考を促すマイクロコピーが回数に応じて段階的に変化 (3 回・5 回・10 回)
7. ✅ ダッシュボードで委任度スコア確認 → AI が「うまく任せられていますね」とフィードバック
8. ✅ 「来週の選挙で誰に投票すべき?」入力 → **🤐 応答停止 (沈黙演出)** 発動
9. ✅ 設定で `LLM_PROVIDER` を切替 (Bedrock → ローカル LLM)

---

## 🔐 セキュリティ・倫理ガード

ハッカソン作品である一方、本プロジェクトは **倫理的に繊細な領域** を扱うため、以下の安全装置を実装します:

### 🛡️ セキュリティ (Security Baseline 拡張準拠)

- 🔑 **Cognito 認証必須** (沈黙演出含む全エンドポイント)
- 🔒 **TLS 1.2+** (ALB + Aurora 接続)
- 💾 **保存時暗号化** (Aurora KMS 暗号化)
- 🚫 **PII フィルタ** (LLM 送信前に氏名・電話番号など除去)
- 🔐 **シークレット管理** (Secrets Manager で API キー・DB 認証情報)
- 🛡️ **Bedrock Guardrails** (沈黙演出ドメインの二重ブロック)

### ⚖️ 倫理的安全装置

- 🪧 **起動時のサービス説明** — 「YesMan はあなたの意思決定を AI が代行するプロダクトです。最終承認はあなた自身が Yes/No スワイプで行います」と明示
- 🤐 **4 カテゴリの応答停止** — 宗教・選挙・暴力・卑猥に関する一切の助言を提供しない
- 🔄 **嗜好プロファイル全リセット可能** — エコーチェンバー回避のためユーザー側で常時管理可能
- 📝 **沈黙ログは本文ハッシュのみ保存** — 機微入力本文は永続化しない
- ⚠️ **重大決断ドメイン (結婚・進学・離婚・就活・終活)** はオンボーディングで「**最終的な人生の判断はご自身でなさってください**」と注意喚起

---

## 📚 詳細ドキュメント

### 📋 設計ドキュメント

| ドキュメント | 内容 |
|---|---|
| 📄 [requirements.md](aidlc-docs/inception/requirements/requirements.md) | 要件定義 (FR-AI / FR-NUDGE / FR-LEARN / NFR-SEC など全 12 セクション) |
| 📄 [stories.md](aidlc-docs/inception/user-stories/stories.md) | 34 ユーザーストーリー × 約 86 Gherkin AC + INVEST 検証 |
| 📄 [personas.md](aidlc-docs/inception/user-stories/personas.md) | 3 ペルソナ詳細 (田中・佐藤・山田) |
| 📄 [application-design.md](aidlc-docs/inception/application-design/application-design.md) | アプリケーション設計統合俯瞰 |
| 📄 [unit-of-work.md](aidlc-docs/inception/application-design/unit-of-work.md) | 12 ユニット定義 + モノレポ構造 |
| 📄 [execution-plan.md](aidlc-docs/inception/plans/execution-plan.md) | 実行計画書 (リスク・タイムライン・成功基準) |

### 🎨 視覚化ドキュメント (drawio)

| ファイル | ページ数 | 内容 |
|---|:---:|---|
| 📐 [persona-story-map.drawio](aidlc-docs/inception/user-stories/diagrams/persona-story-map.drawio) | 6 | ペルソナ × ストーリーマトリクス + Journey フロー総覧 |
| 📐 [application-design.drawio](aidlc-docs/inception/application-design/diagrams/application-design.drawio) | 11 | ネットワーク / 階層 / シーケンス (B/C/D/G/FR-CV) / ER / Strategy+DI / UoW / CDK |
| 📐 [ui-mockups.drawio](aidlc-docs/inception/application-design/diagrams/ui-mockups.drawio) | 9 | 画面ツリー / Onboarding / Decision / NoBurst / Silence / Score / Persona / Design System / Discussion View |
| 📐 [plans.drawio](aidlc-docs/inception/plans/diagrams/plans.drawio) | 6 | 計画書マップ / ワークフロー状況 / Per-Unit ループ / Gantt / 判断ツリー / リスクマトリクス |

> 💡 drawio ファイルは **diagrams.net** または VS Code の **Draw.io Integration 拡張**で開けます

### 📖 コンセプト絵本 (HTML)

| ファイル | 場面数 | 内容 |
|---|:---:|---|
| 📖 [concept-storybook.html](concept-storybook.html) | 12 | サービス全体を俯瞰する童謡風の紙芝居。判断疲労 → AI 委任 → 合議 → リアルタイム議論 → 委任度スコア → 4 ドメイン応答停止 → 再考メッセージ → 新しい暮らし まで 12 場面で表現 (キーボード ← →・スワイプ・自動再生・ベル音対応) |

> 💡 ローカルでは `open concept-storybook.html` (macOS) または該当ファイルをブラウザにドラッグ &ドロップで開けます

### 📜 開発履歴

📄 [audit.md](aidlc-docs/audit.md) — **すべてのユーザー入力と AI 応答の監査ログ** (verbatim、時系列、append-only)

---

## 👨‍💻 開発体制

| 項目 | 内容 |
|---|---|
| 👥 **チーム構成** | 2〜3 名 全員フルスタック (フロント / バック / インフラ 役割分担) |
| 📅 **開発期間** | 約 1 ヶ月 (2026年5月〜6月、AWS Summit Japan 2026 AI-DLC ハッカソン 期限) |
| 🛠️ **開発手法** | AI-DLC (要件 → 設計 → 実装の各段階で AI と人間が協働) |
| 🌏 **言語** | 日本語 (UI / ドキュメント), 英語 (コード識別子) |

---

## 📝 ライセンス

このプロジェクトは AWS Summit Japan 2026 AI-DLC ハッカソン提出作品です。

ライセンスは MIT License を予定しています (実装フェーズで `LICENSE` ファイルを追加)。

---

<div align="center">

## 🪞 最後に

> **「決められない人に、代わりに決める優しさを。」**
>
> **「決めたくない人に、AI に任せる自由を。」**
>
> **「あなたの最後の仕事は、YES で承認すること。」**

<br>

**判断疲労に悩む現代人のための、新しい意思決定支援サービス。**
**ぜひ実際に「YES」をスワイプして、決めない快適さを体験してください。**

<br>

[![Made with AI-DLC](https://img.shields.io/badge/Made_with-AI--DLC-9C27B0?style=for-the-badge)](aidlc-docs/audit.md)
[![Built for AWS Summit Japan 2026 AI-DLC ハッカソン](https://img.shields.io/badge/Built_for-AWS%20Summit%20Japan%202026%20AI--DLC%20ハッカソン-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](#)
[![Concept](https://img.shields.io/badge/Concept-決めなくていいを実現する-1976D2?style=for-the-badge)](#-プロジェクト概要)

</div>
