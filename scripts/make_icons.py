#!/usr/bin/env python3
"""
Resize the FormFill Pro icon to 16x16, 48x48, and 128x128 PNG files
for the Chrome extension manifest.

Run from the extension root directory:
    python3 scripts/make_icons.py
"""

import sys
import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not found. Installing...")
    os.system(f"{sys.executable} -m pip install Pillow --quiet")
    from PIL import Image

SRC = Path(__file__).parent.parent / "formfill_icon_source.png"
DEST_DIR = Path(__file__).parent.parent / "icons"
SIZES = [16, 48, 128]

def main():
    DEST_DIR.mkdir(exist_ok=True)
    if not SRC.exists():
        print(f"Source icon not found: {SRC}")
        sys.exit(1)

    with Image.open(SRC) as img:
        img = img.convert("RGBA")
        for size in SIZES:
            out = img.resize((size, size), Image.LANCZOS)
            dest = DEST_DIR / f"icon-{size}.png"
            out.save(dest, "PNG")
            print(f"  ✓ {dest} ({size}x{size})")

    print("\nAll icons generated successfully.")

if __name__ == "__main__":
    main()
