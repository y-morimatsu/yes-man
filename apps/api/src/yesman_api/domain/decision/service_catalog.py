"""ServiceCatalog — Drill-down chain の最終提案を実 web service へ紐付ける.

Hackathon Pragmatism: ダミー catalog (real public homepage URL を流用)、
keyword matching で proposal text からカテゴリを推定し、対応 service を返す。
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ExternalService:
    name: str
    url: str
    emoji: str


# カテゴリ別 service. 各カテゴリの先頭が default (proposal 文字列に固有 service 名がない場合).
SERVICE_CATALOG: dict[str, list[ExternalService]] = {
    "movie": [
        # User 希望: 映画は Amazon Prime を first preference に
        ExternalService("Amazon Prime Video", "https://www.amazon.co.jp/Amazon-Video", "📺"),
        ExternalService("Netflix", "https://www.netflix.com/jp/", "🎬"),
        ExternalService("U-NEXT", "https://video.unext.jp/", "🎞️"),
        ExternalService("YouTube", "https://www.youtube.com/", "▶️"),
    ],
    "food_delivery": [
        ExternalService("Uber Eats", "https://www.ubereats.com/jp", "🍔"),
        ExternalService("出前館", "https://demae-can.com/", "🍱"),
        ExternalService("Wolt", "https://wolt.com/ja/jpn", "🛵"),
        ExternalService("ピザハット", "https://www.pizzahut.jp/", "🍕"),
        ExternalService("ドミノ・ピザ", "https://www.dominos.jp/", "🍕"),
    ],
    "shopping": [
        ExternalService("Amazon", "https://www.amazon.co.jp/", "📦"),
        ExternalService("楽天市場", "https://www.rakuten.co.jp/", "🛍️"),
        ExternalService("Yahoo!ショッピング", "https://shopping.yahoo.co.jp/", "🛒"),
        ExternalService("メルカリ", "https://jp.mercari.com/", "💱"),
    ],
    "fashion": [
        # User 希望 (2026-05-25): 全 category で Amazon サービスを first preference に統一
        ExternalService("Amazon Fashion", "https://www.amazon.co.jp/fashion", "👔"),
        ExternalService("ユニクロ", "https://www.uniqlo.com/jp/ja/", "👖"),
        ExternalService("GU", "https://www.gu-global.com/jp/ja/", "👗"),
        ExternalService("ZOZOTOWN", "https://zozo.jp/", "👕"),
    ],
    "music": [
        # User 希望: 音楽は Amazon Music を first preference に
        ExternalService("Amazon Music", "https://music.amazon.co.jp/", "🎵"),
        ExternalService("Spotify", "https://open.spotify.com/", "🎵"),
        ExternalService("Apple Music", "https://music.apple.com/jp/", "🎧"),
        ExternalService("YouTube Music", "https://music.youtube.com/", "🎶"),
    ],
    "books": [
        ExternalService("Kindle", "https://www.amazon.co.jp/kindlestore", "📚"),
        ExternalService("Audible", "https://www.audible.co.jp/", "🎧"),
        ExternalService("honto", "https://honto.jp/", "📖"),
        ExternalService("ebookjapan", "https://ebookjapan.yahoo.co.jp/", "📕"),
    ],
    # 2026-05-26 (Hackathon): オーディオブック専用 category. books より先に判定して
    # Audible を first preference にする (Kindle に流れないようにする).
    "audio_books": [
        ExternalService("Audible", "https://www.audible.co.jp/", "🎧"),
    ],
    "travel": [
        ExternalService("じゃらん", "https://www.jalan.net/", "🏨"),
        ExternalService("Expedia", "https://www.expedia.co.jp/", "✈️"),
        ExternalService("Booking.com", "https://www.booking.com/index.ja.html", "🛏️"),
        ExternalService("楽天トラベル", "https://travel.rakuten.co.jp/", "🚆"),
    ],
    "games": [
        # User 希望 (2026-05-25): Amazon サービス (Prime Gaming) を first preference に
        ExternalService("Amazon Prime Gaming", "https://gaming.amazon.com/", "🎮"),
        ExternalService("Steam", "https://store.steampowered.com/", "🎮"),
        ExternalService("Nintendo Store", "https://store-jp.nintendo.com/", "🎯"),
        ExternalService("Epic Games", "https://store.epicgames.com/ja/", "🕹️"),
    ],
    "food_restaurant": [
        ExternalService("食べログ", "https://tabelog.com/", "🍽️"),
        ExternalService("Google Maps", "https://www.google.com/maps", "🗺️"),
        ExternalService("ホットペッパー", "https://www.hotpepper.jp/", "🍴"),
    ],
    "exercise": [
        ExternalService("YouTube (筋トレ動画)", "https://www.youtube.com/results?search_query=筋トレ", "💪"),
        ExternalService("Nike Training Club", "https://www.nike.com/jp/ntc-app", "🏋️"),
    ],
    "study": [
        ExternalService("Udemy", "https://www.udemy.com/ja/", "📘"),
        ExternalService("YouTube (学習動画)", "https://www.youtube.com/", "🎓"),
        ExternalService("Coursera", "https://www.coursera.org/", "🎒"),
    ],
}

# カテゴリ判定のキーワード (proposal text + chain history に対するマッチ).
# 最初に match した category を採用 (順序が優先度).
#
# 2026-05-23 fix: books キーワードから「本」を削除 (「1本」「5本」など counter
# 用法で誤マッチ、全 category が books → Kindle に流れていたバグ修正)。
# 書籍は明示的キーワード (読書/漫画/小説/Kindle) のみで検出。
# また movie / fashion を books より優先 (より specific な category を先に).
CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    # 2026-05-26 fix: "宅配" を単独 keyword から外す ("自宅配信" 内の "宅配" に誤マッチして
    # movie/music 提案が food_delivery と判定される事例があった). より特異な語に置き換え.
    ("food_delivery", [
        "ピザ", "宅配ピザ", "宅配寿司", "宅配弁当",
        "デリバリー", "フードデリバリー",
        "Uber Eats", "ウーバーイーツ",
        "出前館", "出前",
        "wolt", "Wolt", "ウォルト",
        "ドミノ", "ピザハット",
    ]),
    ("food_restaurant", ["レストラン", "外食", "ランチに行", "ディナー", "食べに行"]),
    # 2026-05-26 (Hackathon): "アニメ" 単独 keyword 追加 (お題「アニメ 観たい」 対応).
    ("movie", ["映画", "シネマ", "ホラー", "アニメ映画", "アニメ", "Netflix", "Prime Video", "Amazon Prime", "U-NEXT", "YouTube映画", "ドラマ"]),
    ("music", ["音楽", "曲", "プレイリスト", "Spotify", "アーティスト", "アルバム"]),
    ("fashion", ["ジーパン", "ジーンズ", "Tシャツ", "T シャツ", "シャツ", "洋服", "服を", "服が", "ワンピース", "ユニクロ", "ZOZO", "GU", "Amazon Fashion", "ファッション", "コーディネート", "メンズ", "レディース", "デニム", "スカート", "ニット"]),
    # 2026-05-26 (Hackathon): オーディオブック専用 category を books より先に判定.
    # 「オーディオブック / ながら聴き / 朗読 / Audible」 keyword で hit させて Audible 直行.
    ("audio_books", ["オーディオブック", "ながら聴き", "朗読", "Audible"]),
    ("books", ["読書", "漫画", "マンガ", "小説", "Kindle", "ebookjapan"]),
    ("travel", ["旅行", "ホテル", "宿", "温泉", "観光", "新幹線", "じゃらん"]),
    ("games", ["ゲーム", "Steam", "Nintendo", "Switch", "RPG"]),
    ("exercise", ["筋トレ", "運動", "ジム", "ヨガ", "ストレッチ", "ランニング"]),
    ("study", ["勉強", "学習", "資格", "Udemy"]),
    # shopping は最も広いので fallback 寄りに最後
    # 2026-05-26 (Hackathon): 日用品 / 生活用品 / 家電 / ガジェット / 雑貨 を追加 (Amazon shopping 着地用).
    ("shopping", ["買う", "購入", "通販", "ショッピング", "Amazon", "楽天", "メルカリ", "日用品", "生活用品", "家電", "ガジェット", "雑貨"]),
]


def detect_category(text: str) -> str | None:
    """proposal text + chain history から category を 1 件決定。

    複数候補がヒットしても優先度順 (CATEGORY_KEYWORDS の順) で最初に match した
    カテゴリを採用。1 件も match しなければ None (= service 未紐付け)。
    Case-insensitive (例: "AMAZON Fashion" / "amazon fashion" 両方マッチ)。
    """
    if not text:
        return None
    text_lower = text.lower()
    for category, keywords in CATEGORY_KEYWORDS:
        for kw in keywords:
            if kw.lower() in text_lower:
                return category
    return None


def pick_service(text: str) -> ExternalService | None:
    """text からカテゴリを判定し、該当 service を返す。

    優先順:
      1. 完全 service 名が text に含まれる (例: "Netflix", "ピザハット")
      2. ブランド頭部単語の case-insensitive 部分一致
         (例: "AMAZON Basic" → "Amazon Fashion" / "Amazon Prime Video")
      3. category default (リスト先頭)
    無 category なら None。
    """
    category = detect_category(text)
    if category is None:
        return None
    services = SERVICE_CATALOG[category]
    text_lower = text.lower()
    # 1. 完全 service 名マッチ (case-insensitive)
    for svc in services:
        if svc.name.lower() in text_lower:
            return svc
    # 2. ブランド頭部単語 partial match (例: "Amazon" → "Amazon Fashion")
    for svc in services:
        first_word = svc.name.split()[0].lower()
        if len(first_word) >= 3 and first_word in text_lower:
            return svc
    # 3. default
    return services[0]


__all__ = [
    "ExternalService",
    "SERVICE_CATALOG",
    "CATEGORY_KEYWORDS",
    "detect_category",
    "pick_service",
]
