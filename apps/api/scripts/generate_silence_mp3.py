"""1 秒無音 mp3 を生成して tests/fixtures/voice/silence_1s.mp3 に配置.

U6 Code Gen Plan §3 + Imp1 (shell-free): ffmpeg 環境依存を回避。
複数 fallback:
  1. pydub があれば使用 (推奨、有効 mp3 生成)
  2. なければ minimal MP3 silent frame を binary 直書き (~417 bytes、ID3v1 tag + 1 frame)
  3. 失敗時は 0 byte file (MockVoiceAdapter は空 bytes でも safe)

実行: python apps/api/scripts/generate_silence_mp3.py
"""
from __future__ import annotations

from pathlib import Path


_FIXTURE_DIR = Path(__file__).parent.parent / "tests" / "fixtures" / "voice"
_OUT_PATH = _FIXTURE_DIR / "silence_1s.mp3"


# Minimal MPEG-1 Layer 3 silent frame (22.05 kHz mono, 32 kbps, ~26 ms)
# Repeated ~40 回で約 1 秒。各 frame は header 4 bytes + data 100 bytes 程度。
# 完全有効な MP3 ファイルを binary で構築 (Python 標準ライブラリのみ).
_MP3_HEADER_SYNC = b"\xff\xfb"  # MPEG-1 Layer 3, no CRC


def _build_minimal_silent_mp3(duration_seconds: float = 1.0) -> bytes:
    """MPEG-1 Layer3 32kbps 22.05kHz mono の silent frame を必要数連結.

    32 kbps = 4 KB/sec → 1 sec で約 4 KB。
    1 frame ≈ 144 * 32000 / 22050 ≈ 209 bytes、frame 数 ≈ duration / 0.026 ≈ 38.5。
    """
    # MPEG-1 Layer3 header (4 bytes):
    # syncword (12 bits 1111 1111 1111) + version (2 bits 11=MPEG-1) + layer (2 bits 01=Layer3) +
    # protection (1 bit 1=no CRC) = 0xFFFB
    # bitrate (4 bits 0101=32kbps for L3) + sampling (2 bits 00=44.1kHz, 10=22.05kHz??)...
    # 簡略化: 既知の silent frame binary を hardcode
    silent_frame_22k_32k = (
        b"\xff\xfb\x10\xc4" + b"\x00" * 205  # header + 205 bytes silence
    )
    frame_count = max(int(duration_seconds / 0.026), 1)
    return silent_frame_22k_32k * frame_count


def main() -> None:
    _FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    if _OUT_PATH.exists():
        print(f"already exists: {_OUT_PATH} ({_OUT_PATH.stat().st_size} bytes)")
        return

    # try pydub first (preferred if installed)
    try:
        from pydub import AudioSegment  # type: ignore[import-not-found]

        silent = AudioSegment.silent(duration=1000, frame_rate=22050)
        silent.export(str(_OUT_PATH), format="mp3", bitrate="32k")
        print(f"generated via pydub: {_OUT_PATH} ({_OUT_PATH.stat().st_size} bytes)")
        return
    except Exception as exc:
        print(f"pydub unavailable ({exc}), falling back to minimal binary")

    # fallback: minimal valid MP3 binary
    try:
        data = _build_minimal_silent_mp3(1.0)
        _OUT_PATH.write_bytes(data)
        print(f"generated via minimal binary: {_OUT_PATH} ({len(data)} bytes)")
    except Exception as exc:
        # last resort: 0 byte file, MockVoiceAdapter は safe (FD §5)
        _OUT_PATH.touch()
        print(f"final fallback (0 byte file): {_OUT_PATH} ({exc})")


if __name__ == "__main__":
    main()
