from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
PUBLIC = ROOT / "public"

BG = "#0F172A"
SURFACE = "#F8F7F2"
ACCENT = "#14B8A6"
ACCENT_2 = "#F59E0B"


def rr(draw: ImageDraw.ImageDraw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_brand_icon(size: int) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def v(x: float) -> int:
        return round(x / 64 * s)

    rr(draw, (v(4), v(4), v(60), v(60)), radius=v(18), fill=BG)
    rr(draw, (v(11), v(11), v(53), v(53)), radius=v(13), fill=SURFACE)

    rr(draw, (v(16), v(18), v(23), v(46)), radius=v(3.5), fill=ACCENT)

    draw.line(
        [(v(23), v(24)), (v(34), v(24))],
        fill=BG,
        width=max(1, v(6)),
        joint="curve",
    )
    draw.arc(
        (v(28), v(18), v(47), v(38)),
        start=205,
        end=342,
        fill=BG,
        width=max(1, v(6)),
    )
    draw.line(
        [(v(41), v(23)), (v(47), v(18))],
        fill=BG,
        width=max(1, v(6)),
        joint="curve",
    )

    draw.line(
        [(v(27), v(36)), (v(42), v(36))],
        fill=BG,
        width=max(1, v(4.5)),
        joint="curve",
    )
    draw.line(
        [(v(27), v(43)), (v(36), v(43))],
        fill=BG,
        width=max(1, v(4.5)),
        joint="curve",
    )

    draw.ellipse((v(44.5), v(42.5), v(50.5), v(48.5)), fill=ACCENT_2)

    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    BUILD.mkdir(exist_ok=True)
    base = make_brand_icon(1024)

    base.save(BUILD / "icon.png")
    base.save(BUILD / "icon.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    base.save(BUILD / "icon.icns", sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])

    base.resize((512, 512), Image.Resampling.LANCZOS).save(PUBLIC / "icon-512.png")
    base.resize((192, 192), Image.Resampling.LANCZOS).save(PUBLIC / "icon-192.png")
    base.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
