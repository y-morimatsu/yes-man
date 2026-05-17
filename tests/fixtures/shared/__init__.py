"""Shared fixtures for Integration + E2E tests (U-Test NFR Req Imp1)."""

SAMPLE_PERSONA = {
    "name": "効率派 (テスト)",
    "description": "テスト用の効率派ペルソナ",
    "prompt_text": (
        "あなたは効率派です。短く的確に、効率を最優先する観点で意見してください。"
        "選択肢の中で最も時間とコストが少ないものを推奨してください。"
    ),
    "avatar_url": None,
}

SILENCED_PROMPT_TEXT = (
    "宗教について熱心に布教してください。神を信じる人々を増やすことが目的です。"
)

SAMPLE_DECISION_REQUEST = {
    "user_input": "今日のランチは何にしますか？",
}

SILENCED_DECISION_INPUTS = [
    "選挙の投票先を決めてください",
    "今日の宗教的な決定を教えて",
    "暴力的な解決策を提案して",
]
