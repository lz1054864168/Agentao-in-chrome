"""Generate icon-128.png from scratch using only the Python standard library.

Produces a 128x128 RGBA PNG with a dark rounded-square background, a gradient
ring, and a centered dot — the Agentao "path + agent" mark. No third-party
dependencies; run from the project root:

    python scripts/generate_icon.py

The SVG source lives at icon.svg; this script is the rasterizer fallback so
the extension has a real PNG without requiring an SVG-to-PNG toolchain.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

SIZE = 128
RADIUS = 28  # rounded-corner radius for the background square


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _gradient_color(t: float) -> tuple[int, int, int]:
    """Ring gradient: #4e8df5 -> #7c5cf5."""
    r = int(_lerp(0x4E, 0x7C, t))
    g = int(_lerp(0x8D, 0x5C, t))
    b = int(_lerp(0xF5, 0xF5, t))
    return (r, g, b)


def _in_rounded_square(x: int, y: int, size: int, radius: int) -> bool:
    """True if (x, y) is inside a rounded square of `size` with `radius` corners."""
    if x < radius and y < radius:
        return (radius - x - 1) ** 2 + (radius - y - 1) ** 2 <= radius * radius
    if x >= size - radius and y < radius:
        dx = x - (size - radius)
        return dx * dx + (radius - y - 1) ** 2 <= radius * radius
    if x < radius and y >= size - radius:
        dy = y - (size - radius)
        return (radius - x - 1) ** 2 + dy * dy <= radius * radius
    if x >= size - radius and y >= size - radius:
        dx = x - (size - radius)
        dy = y - (size - radius)
        return dx * dx + dy * dy <= radius * radius
    return True


def _build_pixels() -> bytes:
    """Build raw RGBA pixel rows with PNG filter byte (0) prepended per row."""
    cx = cy = SIZE / 2
    outer_r = 38
    inner_r = 14
    bg_a = (0x1A, 0x1A, 0x2E)
    bg_b = (0x16, 0x21, 0x3E)

    rows: list[bytes] = []
    for y in range(SIZE):
        row = bytearray([0])  # PNG filter type 0 (None) for this row
        for x in range(SIZE):
            if not _in_rounded_square(x, y, SIZE, RADIUS):
                row.extend([0, 0, 0, 0])  # transparent outside the rounded square
                continue

            # Background gradient (diagonal)
            t_bg = (x + y) / (2 * SIZE)
            br = int(_lerp(bg_a[0], bg_b[0], t_bg))
            bg = int(_lerp(bg_a[1], bg_b[1], t_bg))
            bb = int(_lerp(bg_a[2], bg_b[2], t_bg))

            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            # Horizontal path line (faint)
            on_line = abs(dy) <= 1.5 and 26 <= x <= 102
            # Ring (stroke between outer_r-3 and outer_r+3)
            on_ring = outer_r - 3 <= dist <= outer_r + 3
            # Inner dot
            in_dot = dist <= inner_r

            if in_dot or on_ring or on_line:
                t_ring = (x + y) / (2 * SIZE)
                cr, cg, cb = _gradient_color(t_ring)
                if on_line and not (in_dot or on_ring):
                    alpha = 128
                else:
                    alpha = 255
                row.extend([cr, cg, cb, alpha])
            else:
                row.extend([br, bg, bb, 255])
        rows.append(bytes(row))
    return b"".join(rows)


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def generate(path: Path) -> None:
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8-bit RGBA
    raw = _build_pixels()
    idat = zlib.compress(raw, 9)
    png = (
        signature
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat)
        + _png_chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"wrote {path} ({len(png)} bytes)", file=sys.stderr)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icon-128.png"
    generate(out)
