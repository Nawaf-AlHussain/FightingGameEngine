#!/usr/bin/env python3
"""
Generate a minimal MUGEN SFF v2 file with UI sprites for the character
select screen.

Creates solid-color PNG sprites for:
  - Group 100: cell background (gray) + random cell (purple)
  - Group 200: P1 cursors (active=green, done=dark green)
  - Group 201: P2 cursors (active=red, done=dark red)

SFF v2 format (based on engine/DolmexicaInfinite/addons/prism/mugenspritefilereader.cpp):
  Header (512 bytes):
    [0:12]   Signature "ElecbyteSpr\0"
    [12:16]  Version (4 bytes)
    [16:20]  Reserved1
    [20:24]  Reserved2
    [24:28]  CompatibleVersion
    [28:32]  Reserved3
    [32:36]  Reserved4
    [36:40]  SpriteOffset (offset to first sprite node)
    [40:44]  SpriteTotal
    [44:48]  PaletteOffset
    [48:52]  PaletteTotal
    [52:56]  LDataOffset (sprite data section)
    [56:60]  LDataLength
    [60:64]  TDataOffset
    [64:68]  TDataLength
    [68:72]  Reserved5
    [72:76]  Reserved6
    [76:512] Comments (436 bytes)

  Sprite node (28 bytes each):
    [0:2]   mGroupNo (uint16 LE)
    [2:4]   mItemNo (uint16 LE)
    [4:6]   mWidth (uint16 LE)
    [6:8]   mHeight (uint16 LE)
    [8:10]  mAxisX (int16 LE)
    [10:12] mAxisY (int16 LE)
    [12:14] mIndex (uint16 LE) — for linked sprites
    [14]    mFormat (uint8) — 0=raw, 2=RLE8, 4=LZ5, 10/11/12=PNG
    [15]    mColorDepth (uint8) — 0=8bit, 1=15bit, 2=16bit, 4=24bit, 8=32bit
    [16:20] mDataOffset (uint32 LE) — relative to LDataOffset
    [20:24] mDataLength (uint32 LE) — PNG data length (NOT including 4-byte prefix)
    [24:26] mPaletteIndex (uint16 LE)
    [26:28] mFlags (uint16 LE) — 0=LData, 1=TData

  PNG sprite data (at LDataOffset + mDataOffset):
    [0:2]   textureWidth (uint16 LE)
    [2:4]   textureHeight (uint16 LE)
    [4:]    PNG file data

Usage: python3 generate-system-sff.py <output_path>
"""

import struct
import io
import sys
from PIL import Image


def create_solid_color_png(width, height, color):
    """Create a PNG image with a solid color and return the PNG bytes."""
    img = Image.new('RGBA', (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def create_border_png(width, height, border_color, fill_color, border_width=2):
    """Create a PNG with a colored border and transparent/colored fill."""
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    # Draw border (top, bottom, left, right rectangles)
    for x in range(width):
        for y in range(height):
            if x < border_width or x >= width - border_width or y < border_width or y >= height - border_width:
                img.putpixel((x, y), border_color)
            else:
                img.putpixel((x, y), fill_color)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def create_question_mark_png(width, height):
    """Create a purple cell with a '?' pattern."""
    img = Image.new('RGBA', (width, height), (80, 0, 80, 255))
    # Draw a simple "?" using pixels
    cx, cy = width // 2, height // 2
    # Top arc of ?
    for dx in range(-8, 9):
        for dy in range(-10, -3):
            if dx*dx + dy*dy < 60 and dy < -5:
                img.putpixel((cx + dx, cy + dy), (255, 255, 255, 255))
    # Vertical line
    for dy in range(-2, 3):
        img.putpixel((cx, cy + dy), (255, 255, 255, 255))
    # Dot
    img.putpixel((cx, cy + 6), (255, 255, 255, 255))
    img.putpixel((cx, cy + 8), (255, 255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def build_sff(sprites):
    """
    Build an SFF v2 file from a list of sprite definitions.
    Each sprite: (group, index, width, height, axis_x, axis_y, png_bytes)
    """
    num_sprites = len(sprites)

    # Calculate offsets
    header_size = 512
    sprite_nodes_size = num_sprites * 28
    palette_nodes_offset = header_size + sprite_nodes_size
    # No palettes — palette_total = 0
    ldata_offset = palette_nodes_offset  # sprite data starts right after nodes
    # No palette nodes, so ldata starts immediately

    # Build sprite data and calculate per-sprite offsets
    sprite_data_blocks = []
    current_data_offset = 0
    for (group, index, w, h, ax, ay, png_bytes) in sprites:
        # PNG sprite data: [2 bytes texW][2 bytes texH][PNG bytes]
        tex_w = w
        tex_h = h
        block = struct.pack('<HH', tex_w, tex_h) + png_bytes
        sprite_data_blocks.append({
            'group': group,
            'index': index,
            'width': w,
            'height': h,
            'axis_x': ax,
            'axis_y': ay,
            'data_offset': current_data_offset,
            'data_length': len(png_bytes),  # PNG data only, not including 4-byte prefix
            'block': block,
        })
        current_data_offset += len(block)

    ldata_length = current_data_offset

    # Build header (512 bytes)
    header = bytearray(512)
    # Signature
    header[0:12] = b'ElecbyteSpr\x00'
    # Version: 0,0,0,2 — SFF v2 (mVersion[1]=0, mVersion[3]=2 triggers loadMugenSpriteFile2)
    header[12:16] = struct.pack('BBBB', 0, 0, 0, 2)
    # Reserved1, Reserved2
    header[16:24] = struct.pack('<II', 0, 0)
    # CompatibleVersion
    header[24:28] = struct.pack('BBBB', 0, 1, 0, 0)
    # Reserved3, Reserved4
    header[28:36] = struct.pack('<II', 0, 0)
    # SpriteOffset
    header[36:40] = struct.pack('<I', header_size)
    # SpriteTotal
    header[40:44] = struct.pack('<I', num_sprites)
    # PaletteOffset (same as ldata_offset since no palettes)
    header[44:48] = struct.pack('<I', ldata_offset)
    # PaletteTotal
    header[48:52] = struct.pack('<I', 0)
    # LDataOffset
    header[52:56] = struct.pack('<I', ldata_offset)
    # LDataLength
    header[56:60] = struct.pack('<I', ldata_length)
    # TDataOffset (not used)
    header[60:64] = struct.pack('<I', 0)
    # TDataLength
    header[64:68] = struct.pack('<I', 0)
    # Reserved5, Reserved6
    header[68:76] = struct.pack('<II', 0, 0)
    # Comments
    comment = b'Generated by FGE system.sff generator'
    header[76:76 + len(comment)] = comment

    # Build sprite nodes (28 bytes each)
    sprite_nodes = bytearray()
    for s in sprite_data_blocks:
        node = struct.pack('<HHHHhhHBBIIHH',
            s['group'],       # mGroupNo
            s['index'],       # mItemNo
            s['width'],       # mWidth
            s['height'],      # mHeight
            s['axis_x'],      # mAxisX (int16)
            s['axis_y'],      # mAxisY (int16)
            0,                # mIndex (linked sprite index, 0 = not linked)
            12,               # mFormat (12 = raw PNG)
            32,               # mColorDepth (32 = RGBA)
            s['data_offset'], # mDataOffset
            s['data_length'], # mDataLength
            0,                # mPaletteIndex
            0,                # mFlags (0 = LData)
        )
        sprite_nodes.extend(node)

    # Build sprite data
    sprite_data = bytearray()
    for s in sprite_data_blocks:
        sprite_data.extend(s['block'])

    # Assemble file
    return bytes(header) + bytes(sprite_nodes) + bytes(sprite_data)


def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else 'system.sff'

    # Define sprites needed by the character select screen
    # Format: (group, index, width, height, axis_x, axis_y, png_bytes)
    sprites = []

    # Group 100: Cell sprites
    # 100,0 = cell background (dark gray, 60x60)
    png = create_solid_color_png(60, 60, (40, 40, 40, 255))
    sprites.append((100, 0, 60, 60, 0, 0, png))

    # 100,1 = random select cell (purple with "?", 60x60)
    png = create_question_mark_png(60, 60)
    sprites.append((100, 1, 60, 60, 0, 0, png))

    # Group 200: P1 cursors (green)
    # 200,0 = P1 active cursor (bright green border, transparent center)
    png = create_border_png(62, 62, (0, 255, 0, 255), (0, 0, 0, 0), border_width=3)
    sprites.append((200, 0, 62, 62, 0, 0, png))

    # 200,1 = P1 done cursor (darker green border)
    png = create_border_png(62, 62, (0, 128, 0, 255), (0, 0, 0, 0), border_width=3)
    sprites.append((200, 1, 62, 62, 0, 0, png))

    # Group 201: P2 cursors (red)
    # 201,0 = P2 active cursor (bright red border)
    png = create_border_png(62, 62, (255, 0, 0, 255), (0, 0, 0, 0), border_width=3)
    sprites.append((201, 0, 62, 62, 0, 0, png))

    # 201,1 = P2 done cursor (darker red border)
    png = create_border_png(62, 62, (128, 0, 0, 255), (0, 0, 0, 0), border_width=3)
    sprites.append((201, 1, 62, 62, 0, 0, png))

    # Build the SFF file
    sff_data = build_sff(sprites)

    with open(output_path, 'wb') as f:
        f.write(sff_data)

    print(f'Generated {output_path} ({len(sff_data)} bytes, {len(sprites)} sprites)')
    for s in sprites:
        print(f'  Group {s[0]}, Index {s[1]}: {s[2]}x{s[3]} ({len(s[6])} bytes PNG)')


if __name__ == '__main__':
    main()
