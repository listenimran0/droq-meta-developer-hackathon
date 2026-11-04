#!/usr/bin/env python3
"""Build polished Play Store screenshots from real app captures.

Reads phone-real/*.png, strips AdMob test banners + status bar,
writes phone-clean/ and designed play-phone|7inch|10inch exports.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "phone-real"
CLEAN = ROOT / "phone-clean"
PLAY = ROOT / "play-phone"
PLAY7 = ROOT / "play-7inch"
PLAY10 = ROOT / "play-10inch"

BG = (7, 8, 11)
BRASS = (201, 180, 138)
BRASS_DIM = (145, 128, 98)
WHITE = (244, 241, 234)
MUTED = (155, 152, 144)

SHOTS = [
    ("01-home.png", "01-home", "Sense what's nearby", "Distance only. No early pin."),
    ("02-discover.png", "02-discover", "Unlock by walking", "Get close. Then it opens."),
    ("03-create.png", "03-leave", "Leave a Drop", "Plant a note where you stand."),
    ("04-profile.png", "04-profile", "Your hunt log", "Streaks, finds, and trails."),
    ("05-found.png", "05-found", "What you unlocked", "Stuff you found IRL."),
    ("06-settings.png", "06-settings", "Make it yours", "Language, alerts, privacy."),
    ("07-friends.png", "07-friends", "Hunt with friends", "Squad up. Keep the pin hidden."),
    ("09-trail.png", "08-trail", "Follow the trail", "One Drop leads to the next."),
]

STATUS_CROP = 100
HOME_IND_BOTTOM = 28
FONT_DISPLAY = "/System/Library/Fonts/NewYork.ttf"
FONT_BODY = "/System/Library/Fonts/SFNS.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def detect_ad_band(rgb: np.ndarray):
    gray = rgb.mean(axis=2)
    bright = (gray > 200).mean(axis=1)
    rows = np.where(bright > 0.30)[0]
    if len(rows) == 0:
        return None
    clusters = []
    start = prev = int(rows[0])
    for r in rows[1:]:
        r = int(r)
        if r - prev > 4:
            if prev - start >= 80:
                clusters.append((start, prev))
            start = r
        prev = r
    if prev - start >= 80:
        clusters.append((start, prev))
    return max(clusters, key=lambda c: c[1] - c[0]) if clusters else None


def clean_screenshot(path: Path) -> Image.Image:
    arr = np.array(Image.open(path).convert("RGB"))
    h = arr.shape[0]
    ad = detect_ad_band(arr)
    if ad:
        top, bot = ad
        top = max(0, top - 2)
        bot = min(h - 1, bot + 2)
        arr = np.concatenate([arr[:top], arr[bot + 1 :]], axis=0)
    arr = arr[STATUS_CROP : arr.shape[0] - HOME_IND_BOTTOM]
    return Image.fromarray(arr)


def load_font(path: str, size: int):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.truetype(FONT_BOLD, size)


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255
    )
    return m


def make_background(w, h):
    yy, xx = np.mgrid[0:h, 0:w]
    arr = np.zeros((h, w, 3), dtype=np.float32)
    arr[:] = BG
    glow = (
        np.clip(
            1.0
            - np.sqrt((xx - w * 0.52) ** 2 + (yy - h * 0.22) ** 2) / (w * 0.9),
            0,
            1,
        )
        ** 2
    )
    arr[..., 0] += glow * 32
    arr[..., 1] += glow * 24
    arr[..., 2] += glow * 12
    glow2 = (
        np.clip(
            1.0
            - np.sqrt((xx - w * 0.28) ** 2 + (yy - h * 0.82) ** 2) / (w * 0.75),
            0,
            1,
        )
        ** 2
    )
    arr[..., 0] += glow2 * 16
    arr[..., 1] += glow2 * 13
    arr[..., 2] += glow2 * 8
    vx = ((xx / max(w - 1, 1)) * 2 - 1) ** 2
    vy = ((yy / max(h - 1, 1)) * 2 - 1) ** 2
    arr *= 1.0 - np.clip(vx * 0.5 + vy * 0.5, 0, 1)[..., None] * 0.32
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def fit_phone(content, max_w, max_h):
    cw, ch = content.size
    scale = min(max_w / cw, max_h / ch)
    return content.resize(
        (max(1, int(cw * scale)), max(1, int(ch * scale))), Image.Resampling.LANCZOS
    )


def compose(content, title, subtitle, size):
    W, H = size
    s = W / 1080
    canvas = make_background(W, H)
    draw = ImageDraw.Draw(canvas)

    font_title = load_font(FONT_DISPLAY, int(48 * s))
    font_sub = load_font(FONT_BODY, int(24 * s))
    font_brand = load_font(FONT_BOLD, int(16 * s))

    pad_x = int(48 * s)
    y = int(36 * s)
    draw.rectangle([pad_x, y, pad_x + int(28 * s), y + int(3 * s)], fill=BRASS)
    y += int(16 * s)
    draw.text((pad_x, y), "DROQ", font=font_brand, fill=BRASS)
    y += int(28 * s)
    draw.text((pad_x, y), title, font=font_title, fill=WHITE)
    bbox = draw.textbbox((pad_x, y), title, font=font_title)
    y = bbox[3] + int(6 * s)
    draw.text((pad_x, y), subtitle, font=font_sub, fill=MUTED)
    bbox2 = draw.textbbox((pad_x, y), subtitle, font=font_sub)
    caption_bottom = bbox2[3] + int(18 * s)

    frame_top = caption_bottom
    frame_bottom = H - int(36 * s)
    frame_side = int(48 * s)
    avail_w = W - 2 * frame_side
    avail_h = frame_bottom - frame_top

    bezel = int(8 * s)
    radius = int(42 * s)
    phone = fit_phone(content, avail_w - 2 * bezel, avail_h - 2 * bezel)
    pw, ph = phone.size
    fw, fh = pw + 2 * bezel, ph + 2 * bezel
    fx = (W - fw) // 2
    fy = frame_top + max(0, (avail_h - fh) // 2)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [
            fx + int(6 * s),
            fy + int(14 * s),
            fx + fw + int(6 * s),
            fy + fh + int(14 * s),
        ],
        radius=radius,
        fill=(0, 0, 0, 170),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(22 * s)))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")

    bezel_img = Image.new("RGB", (fw, fh), (16, 15, 13))
    ImageDraw.Draw(bezel_img).rounded_rectangle(
        [0, 0, fw - 1, fh - 1],
        radius=radius,
        outline=BRASS_DIM,
        width=max(2, int(2 * s)),
    )
    screen = Image.new("RGBA", (pw, ph), (*BG, 255))
    screen.paste(phone.convert("RGBA"), (0, 0))
    screen.putalpha(rounded_mask((pw, ph), max(6, radius - bezel)))

    bezel_rgba = bezel_img.convert("RGBA")
    bezel_rgba.putalpha(rounded_mask((fw, fh), radius))

    out = canvas.convert("RGBA")
    out.alpha_composite(bezel_rgba, (fx, fy))
    out.alpha_composite(screen, (fx + bezel, fy + bezel))
    return out.convert("RGB")


def main():
    for d in (CLEAN, PLAY, PLAY7, PLAY10):
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.png"):
            old.unlink()

    for src_name, slug, title, subtitle in SHOTS:
        cleaned = clean_screenshot(SRC / src_name)
        cleaned.save(CLEAN / f"{slug}.png", optimize=True)
        print(slug, cleaned.size)
        compose(cleaned, title, subtitle, (1080, 1920)).save(
            PLAY / f"{slug}.png", optimize=True
        )
        compose(cleaned, title, subtitle, (1200, 1920)).save(
            PLAY7 / f"{slug}.png", optimize=True
        )
        compose(cleaned, title, subtitle, (1600, 2560)).save(
            PLAY10 / f"{slug}.png", optimize=True
        )

    print("OK", PLAY)


if __name__ == "__main__":
    main()
