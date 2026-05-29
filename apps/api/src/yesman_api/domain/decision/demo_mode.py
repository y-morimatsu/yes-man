"""Demo mode — email に "morimatsu" を含むユーザー向けの scripted デモ挙動.

ライブデモ (AWS Summit Japan 2026) 専用。本物のエンジン/ストアを汚さず、
demo user のときだけ scripted な合議・深掘り・スコアを再現する単一の真実源。

設計方針 (2026-05-28):
- 判定は email ベース (LLM_PROVIDER 等の global env に依存しない)
- 合議は本物のパイプラインを再利用し、demo-aware LLM が scripted text を返す
  (proposal → pick_service → Amazon CTA → 永続化 → Yes/スコア が自動で動く)
- 妻 / 娘 / ワンコ ペルソナは demo user に遅延 seed され合議に参加する
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

# 推移グラフ / 履歴の開始日 (デモ表示用に固定)
DEMO_SEED_START_DATE = date(2026, 5, 15)

# ============================================================
# demo user 判定
# ============================================================
DEMO_EMAIL_MARKER = "morimatsu"


def is_demo_user(email: str | None) -> bool:
    """email に "morimatsu" を含むユーザーをデモアカウントと判定 (大小無視)."""
    return bool(email) and DEMO_EMAIL_MARKER in email.lower()


# ============================================================
# デモ用カスタムペルソナ (妻 / 娘 / ワンコ)
# ============================================================
@dataclass(frozen=True, slots=True)
class DemoPersona:
    id: UUID
    name: str
    prompt_text: str
    avatar_emoji: str
    avatar_color: str  # avatarColors のキー (green/orange/blue/purple/pink/yellow/teal/umber)
    description: str  # 選択画面に表示する短い説明


DEMO_PERSONAS: tuple[DemoPersona, ...] = (
    DemoPersona(
        UUID("00000000-0000-0000-0000-0000000000d1"),
        "妻",
        "あなたは現実的で少し口うるさい妻。健康・家計・身だしなみを気にして率直にダメ出しする。",
        "👩",
        "pink",
        "口うるさい怖い妻",
    ),
    DemoPersona(
        UUID("00000000-0000-0000-0000-0000000000d2"),
        "娘",
        "あなたは無邪気で正直な娘。思ったことをストレートに言う。",
        "👧",
        "yellow",
        "無邪気な娘",
    ),
    DemoPersona(
        UUID("00000000-0000-0000-0000-0000000000d3"),
        "ワンコ",
        "あなたは飼い犬。どんな提案にも『ワン!』と全肯定で応じる究極の YesWan。",
        "🐶",
        "umber",
        "何にでも『ワン!』と全肯定で応じる犬",
    ),
)

DEMO_PERSONA_IDS: tuple[UUID, ...] = tuple(p.id for p in DEMO_PERSONAS)


def encode_avatar(emoji: str, color: str) -> str:
    """emoji + color を frontend と同形式の avatar_url にエンコード.

    PersonaCreateModal.encodeAvatarForUrl と互換: "yesman-avatar:" + base64(JSON).
    PersonaCard / AvatarEditor が decode して emoji を背景色付きで表示できる。
    """
    import base64
    import json

    payload = json.dumps(
        {"mode": "emoji", "color": color, "emoji": emoji},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    b64 = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    return f"yesman-avatar:{b64}"


# ============================================================
# scripted 台詞 (合議「外出着は何にすべき?」)
# ============================================================
# persona 名 → scripted 発言. demo-aware LLM が persona prompt からこの名前を検出して返す.
PERSONA_LINES: dict[str, str] = {
    "妻": "またそのヨレヨレのパーカー? せめて襟付きを着てちょうだい。",
    "娘": "パパ、それ去年も着てたよ?",
    "ワンコ": "ワン!",
}

# 外出着お題の提案. "シャツ" が service_catalog の fashion に hit し Amazon Fashion に解決。
# depth=0 (root) は early-final 不可なのでソフト提案、Yes 連鎖の depth>=1 で
# 末尾「開きますか?」(= _detect_final_signal) を付けて final 化 → Amazon Fashion CTA。
OUTFIT_PROPOSAL_ROOT = "襟付きシャツが よさそうです。"
OUTFIT_PROPOSAL_FINAL = "襟付きシャツを Amazon で 開きますか?"

# 「外出着」系入力の検出トリガ (どれか含めば scripted 合議を発火)
OUTFIT_TRIGGERS: tuple[str, ...] = ("外出着", "何を着", "服装", "着る服", "今日の服", "何着")


# ============================================================
# scripted 深掘り (「最近の俺、どう?」)
# ============================================================
DEEP_DIVE_TRIGGERS: tuple[str, ...] = ("最近の俺", "最近どう", "私のこと", "俺のこと", "ちゃんとしてる")
DEEP_DIVE_TEXT = (
    "過去 30 日を分析しました。夕飯の 91% をあなたが決定 (うち 7 割が「とりあえず生」)。"
    "娘さんへの「あとでね」は 8 回。妻の提案 Yes 率は 23%。委任度 73% — でも、心地よいですよね?"
)
# 深掘りお題のときの家族の反応 (合議パート用)
DEEP_DIVE_PERSONA_LINES: dict[str, str] = {
    "妻": "聞かない方がいいと思うけど…。",
    "娘": "パパ、ほんとに大丈夫?",
    "ワンコ": "ワン…。",
}


# ============================================================
# お題トピック判定
# ============================================================
TOPIC_OUTFIT = "outfit"
TOPIC_DEEP_DIVE = "deep_dive"


def match_topic(text: str | None) -> str | None:
    """user 入力から scripted トピックを判定. 該当なしは None (= 本物 LLM に委譲)."""
    if not text:
        return None
    if any(t in text for t in DEEP_DIVE_TRIGGERS):
        return TOPIC_DEEP_DIVE
    if any(t in text for t in OUTFIT_TRIGGERS):
        return TOPIC_OUTFIT
    return None


def persona_line(topic: str | None, persona_name: str) -> str | None:
    """topic + persona 名 → scripted 発言. 該当なしは None."""
    if topic == TOPIC_OUTFIT:
        return PERSONA_LINES.get(persona_name)
    if topic == TOPIC_DEEP_DIVE:
        return DEEP_DIVE_PERSONA_LINES.get(persona_name)
    return None


def proposal_text(topic: str | None, depth: int = 0) -> str | None:
    """topic + drill-down depth → scripted 提案. 該当なしは None.

    外出着は depth=0 でソフト提案 (Yes で drill-down)、depth>=1 で final
    (末尾「開きますか?」→ is_final + Amazon Fashion CTA)。
    深掘りは depth 問わず一発で reveal。
    """
    if topic == TOPIC_OUTFIT:
        return OUTFIT_PROPOSAL_FINAL if depth >= 1 else OUTFIT_PROPOSAL_ROOT
    if topic == TOPIC_DEEP_DIVE:
        return DEEP_DIVE_TEXT
    return None


# ============================================================
# デモ用スコア (「人生の 73% を委任」+ ドメイン内訳)
# ============================================================
DEMO_SCORE_RATIO = 0.73
# ドメイン名 → 委任率 (スライド step03 と一致)
DEMO_SCORE_BREAKDOWN: dict[str, float] = {
    "食事": 0.91,
    "服装": 0.65,
    "人間関係": 0.12,
}

# seed_demo_decisions 用: 履歴/嗜好を 妻/娘/ワンコ で生成 (/preferences の persona 名整合)
DEMO_SEED_PERSONA_SPECS: list[tuple[str, str]] = [
    ("妻", "ちゃんと考えて決めなさい"),
    ("娘", "それでいいんじゃない?"),
    ("ワンコ", "ワン!"),
]
DEMO_SEED_PERSONA_STYLE: dict[str, float] = {"妻": 0.78, "娘": 0.62, "ワンコ": 0.95}


async def ensure_demo_seeded(persona_repo, selection_repo, user_id, decision_repo=None) -> None:
    """demo user に 妻/娘/ワンコ カスタムペルソナ + 3 人選択 + 30 日履歴を冪等に投入.

    - persona は無ければ insert、selection は毎回 妻/娘/ワンコ に強制 (デモの再現性)
    - decision_repo が MockStore backed なら 30 日分の使用履歴も best-effort で seed
      (home の "recent" / preferences をリッチに見せる。冪等)
    repo 群は application 層の protocol (duck-typed)。
    """
    from yesman_api.domain.persistence.models import Persona, UserPersonaSelection

    for p in DEMO_PERSONAS:
        existing = await persona_repo.get(p.id)
        persona = Persona(
            id=p.id,
            owner_user_id=user_id,
            name=p.name,
            description=p.description,
            prompt_text=p.prompt_text,
            avatar_url=encode_avatar(p.avatar_emoji, p.avatar_color),
            is_shared=False,
            is_builtin=False,
        )
        if existing is None:
            await persona_repo.insert(persona)
        elif (
            str(existing.owner_user_id) != str(user_id)
            or existing.avatar_url != persona.avatar_url
            or existing.description != persona.description
        ):
            # 固定 ID を共有するため、アクセス中の sub に re-own して
            # その sub の /personas/me (カスタム) に表示されるようにする。
            # avatar 差分でも update (既存 seed 済みペルソナに avatar を backfill)。
            await persona_repo.update(persona)
    await selection_repo.upsert(
        UserPersonaSelection(
            user_id=user_id,
            persona_ids=[str(pid) for pid in DEMO_PERSONA_IDS],
        )
    )
    # best-effort: MockStore backed なら 30 日履歴を seed (冪等、mock 以外は no-op)
    # 履歴/嗜好の persona も 妻/娘/ワンコ にして /preferences と整合させる。
    store = getattr(decision_repo, "_store", None)
    if store is not None and hasattr(store, "seed_demo_decisions"):
        try:
            from datetime import datetime, timezone

            # 推移グラフの開始日を固定 (今日までの日数を seed)
            days = (datetime.now(timezone.utc).date() - DEMO_SEED_START_DATE).days + 1
            store.seed_demo_decisions(
                user_id,
                days=max(days, 1),
                persona_specs=DEMO_SEED_PERSONA_SPECS,
                persona_style_preference=DEMO_SEED_PERSONA_STYLE,
            )
        except Exception:  # noqa: BLE001  (デモ seed 失敗で本番フローを止めない)
            pass


__all__ = [
    "is_demo_user",
    "ensure_demo_seeded",
    "DemoPersona",
    "DEMO_PERSONAS",
    "DEMO_PERSONA_IDS",
    "PERSONA_LINES",
    "OUTFIT_PROPOSAL_ROOT",
    "OUTFIT_PROPOSAL_FINAL",
    "OUTFIT_TRIGGERS",
    "DEEP_DIVE_TRIGGERS",
    "DEEP_DIVE_TEXT",
    "DEEP_DIVE_PERSONA_LINES",
    "DEMO_SCORE_RATIO",
    "DEMO_SCORE_BREAKDOWN",
    "TOPIC_OUTFIT",
    "TOPIC_DEEP_DIVE",
    "match_topic",
    "persona_line",
    "proposal_text",
]
