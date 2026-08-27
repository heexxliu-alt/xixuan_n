#!/usr/bin/env python3
"""Extract the supplied checkerboard-preview whale into a transparent PNG.

The source PNG is an RGB preview with a baked-in neutral checkerboard.  This
keeps the whale pixels unchanged and removes only edge-connected neutral
background pixels, so pale cream areas in the illustration are preserved.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def extract(source: Path, destination: Path) -> tuple[tuple[int, int], tuple[int, int, int, int]]:
    image = Image.open(source).convert("RGB")
    pixels = np.asarray(image, dtype=np.uint8)
    maximum = pixels.max(axis=2).astype(np.int16)
    minimum = pixels.min(axis=2).astype(np.int16)
    chroma = maximum - minimum

    # The baked checkerboard is neutral and bright.  The whale's lavender,
    # peach and cream strokes are kept because they are not edge-connected to
    # this mask, even when a local cream highlight is low-chroma.
    background_candidate = (chroma <= 18) & (maximum >= 180)
    height, width = background_candidate.shape
    background = np.zeros_like(background_candidate, dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(y: int, x: int) -> None:
        if background_candidate[y, x] and not background[y, x]:
            background[y, x] = True
            queue.append((y, x))

    for x in range(width):
        enqueue(0, x)
        enqueue(height - 1, x)
    for y in range(1, height - 1):
        enqueue(y, 0)
        enqueue(y, width - 1)

    while queue:
        y, x = queue.popleft()
        if y:
            enqueue(y - 1, x)
        if y + 1 < height:
            enqueue(y + 1, x)
        if x:
            enqueue(y, x - 1)
        if x + 1 < width:
            enqueue(y, x + 1)

    alpha = np.where(background, 0, 255).astype(np.uint8)
    rgba = np.dstack((pixels, alpha))
    alpha_image = Image.fromarray(alpha, mode="L")
    bbox = alpha_image.getbbox()
    if bbox is None:
        raise ValueError("No whale pixels found in source image")

    # Keep a small transparent safety margin so the outline never hugs the
    # CSS box.  Cropping does not alter the whale's proportions or pixels.
    pad_x = max(8, round((bbox[2] - bbox[0]) * 0.018))
    pad_y = max(8, round((bbox[3] - bbox[1]) * 0.018))
    crop = (
        max(0, bbox[0] - pad_x),
        max(0, bbox[1] - pad_y),
        min(width, bbox[2] + pad_x),
        min(height, bbox[3] + pad_y),
    )
    output = Image.fromarray(rgba, mode="RGBA").crop(crop)
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, format="PNG", optimize=True)
    return output.size, crop


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    size, crop = extract(args.source, args.destination)
    print(f"saved {args.destination} size={size[0]}x{size[1]} crop={crop}")


if __name__ == "__main__":
    main()
