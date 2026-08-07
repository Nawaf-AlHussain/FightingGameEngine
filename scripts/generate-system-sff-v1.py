#!/usr/bin/env python3
"""
Generate a MUGEN SFF v1 file with PCX UI sprites for system.def.

SFF v1 format (based on engine's SFFHeader + SFFSubFileHeader):
  Header (512 bytes):
    [0:12]   Signature "ElecbyteSpr\0"
    [12:16]  Version [0,1,0,1] (v1)
    [16:20]  GroupAmount (int32)
    [20:24]  ImageAmount (int32)
    [24:28]  FirstFileOffset (int32)
    [28:32]  SubheaderSize (int32) — size of each subfile header
    [32]     PaletteType (int8)
    [33:36]  Blank (3 bytes)
    [36:512] Comments (476 bytes)

  Subfile (28 bytes header + PCX data):
    [0:4]   NextFilePosition (int32) — 0 if last
    [4:8]   SubfileLength (int32) — PCX data length
    [8:10]  ImageAxisX (int16)
    [10:12] ImageAxisY (int16)
    [12:14] Group (int16)
    [14:16] Image (int16)
    [16:18] IndexOfPreviousSpriteCopy (int16) — for linked sprites
    [18]    HasSamePaletteAsPrevious (int8)
    [19:32] Comments (12 bytes, actually [19:31] = 12 bytes)

  PCX data: 8-bit indexed PCX image with palette
"""

import struct
import io
import sys
from PIL import Image


def create_solid_color_pcx(width, height, color_idx):
    """Create an 8-bit indexed PCX image with a solid color.
    Manual PCX writer — Pillow's PCX header doesn't match engine's PCXHeader struct."""
    # PCX header (128 bytes):
    # [0] manufacturer = 10
    # [1] version = 5
    # [2] encoding = 1 (RLE)
    # [3] bitsPerPixel = 8
    # [4:6] minX (int16 LE)
    # [6:8] minY (int16 LE)
    # [8:10] maxX (int16 LE)
    # [10:12] maxY (int16 LE)
    # [12:14] horizontalResolution (int16)
    # [14:16] verticalResolution (int16)
    # [16:64] headerPalette (48 bytes)
    # [65] reserved = 0
    # [66] planeAmount = 1
    # [67:69] bytesPerLine (int16 LE) — must be even, >= width
    # [69:71] paletteInfo (int16)
    # [71:128] filler (57 bytes)

    bytes_per_line = width if width % 2 == 0 else width + 1

    header = bytearray(128)
    header[0] = 10  # manufacturer
    header[1] = 5   # version
    header[2] = 1   # encoding (RLE)
    header[3] = 8   # bitsPerPixel
    struct.pack_into('<h', header, 4, 0)         # minX
    struct.pack_into('<h', header, 6, 0)         # minY
    struct.pack_into('<h', header, 8, width - 1)  # maxX
    struct.pack_into('<h', header, 10, height - 1) # maxY
    struct.pack_into('<h', header, 12, 100)       # hRes
    struct.pack_into('<h', header, 14, 100)       # vRes
    # headerPalette: 48 bytes (16 RGB entries) at offset 16..63 — leave as zeros
    header[64] = 0  # reserved
    header[65] = 1  # planeAmount = 1
    struct.pack_into('<H', header, 66, bytes_per_line)  # bytesPerLine
    struct.pack_into('<H', header, 68, 1)  # paletteInfo
    # filler: 58 bytes at offset 70..127 — leave as zeros

    # RLE-encoded image data
    # For a solid color, each line is: [color_idx | 0xC0] repeated bytes_per_line times
    # RLE: if byte has top 2 bits set (0xC0) and lower 6 = count, repeat next byte count times
    # For a single byte < 0xC0, it's a literal
    # For solid color: 0xC0 | bytes_per_line, color_idx  (but max count is 63)
    image_data = bytearray()
    for y in range(height):
        line_data = encode_rle_line(bytes_per_line, color_idx)
        image_data.extend(line_data)

    # Palette: 256 RGB entries (768 bytes), preceded by palette marker (0x0C)
    palette = bytearray(768)
    if color_idx == 1:    palette[1*3:1*3+3] = [255, 255, 255]
    elif color_idx == 2:  palette[2*3:2*3+3] = [128, 128, 128]
    elif color_idx == 3:  palette[3*3:3*3+3] = [0, 255, 0]
    elif color_idx == 4:  palette[4*3:4*3+3] = [0, 128, 0]
    elif color_idx == 5:  palette[5*3:5*3+3] = [255, 0, 0]
    elif color_idx == 6:  palette[6*3:6*3+3] = [128, 0, 0]
    elif color_idx == 7:  palette[7*3:7*3+3] = [128, 0, 128]

    return bytes(header) + bytes(image_data) + b'\x0c' + bytes(palette)


def encode_rle_line(width, fill_byte):
    """RLE-encode a single scanline of solid color."""
    result = bytearray()
    remaining = width
    while remaining > 0:
        count = min(63, remaining)
        if fill_byte >= 0xC0 or count > 1:
            result.append(0xC0 | count)
            result.append(fill_byte)
        else:
            result.append(fill_byte)
        remaining -= count
    return bytes(result)


def create_border_pcx(width, height, border_idx, fill_idx):
    """Create a PCX with a colored border and fill."""
    bytes_per_line = width if width % 2 == 0 else width + 1

    header = bytearray(128)
    header[0] = 10; header[1] = 5; header[2] = 1; header[3] = 8
    struct.pack_into('<h', header, 4, 0)
    struct.pack_into('<h', header, 6, 0)
    struct.pack_into('<h', header, 8, width - 1)
    struct.pack_into('<h', header, 10, height - 1)
    struct.pack_into('<h', header, 12, 100)
    struct.pack_into('<h', header, 14, 100)
    header[64] = 0; header[65] = 1  # reserved, planeAmount=1
    struct.pack_into('<H', header, 66, bytes_per_line)
    struct.pack_into('<H', header, 68, 1)

    # Build pixel data
    border_w = 3
    image_data = bytearray()
    for y in range(height):
        line = bytearray(bytes_per_line)
        for x in range(width):
            if x < border_w or x >= width - border_w or y < border_w or y >= height - border_w:
                line[x] = border_idx
            else:
                line[x] = fill_idx
        image_data.extend(encode_rle_line_raw(bytes_per_line, bytes(line)))

    # Palette
    palette = bytearray(768)
    palette[0*3:0*3+3] = [0, 0, 0]
    palette[1*3:1*3+3] = [255, 255, 255]
    palette[2*3:2*3+3] = [128, 128, 128]
    palette[3*3:3*3+3] = [0, 255, 0]
    palette[4*3:4*3+3] = [0, 128, 0]
    palette[5*3:5*3+3] = [255, 0, 0]
    palette[6*3:6*3+3] = [128, 0, 0]
    palette[7*3:7*3+3] = [128, 0, 128]

    return bytes(header) + bytes(image_data) + b'\x0c' + bytes(palette)


def encode_rle_line_raw(width, line_bytes):
    """RLE-encode a scanline from raw pixel data."""
    result = bytearray()
    i = 0
    while i < width:
        # Count consecutive identical bytes
        count = 1
        while i + count < width and line_bytes[i + count] == line_bytes[i] and count < 63:
            count += 1
        # Encode
        if line_bytes[i] >= 0xC0 or count > 1:
            result.append(0xC0 | count)
            result.append(line_bytes[i])
        else:
            result.append(line_bytes[i])
        i += count
    return bytes(result)


def build_sff_v1(sprites):
    """
    Build an SFF v1 file.
    sprites: list of (group, image, width, height, axis_x, axis_y, pcx_data)
    """
    num_images = len(sprites)

    # Calculate offsets
    header_size = 512
    subfile_header_size = 32  # SFFSubFileHeader is 31 bytes but C compiler pads to 32

    # Each subfile: 28-byte header + PCX data
    current_offset = header_size
    subfiles = []
    for i, (group, image, w, h, ax, ay, pcx_data) in enumerate(sprites):
        next_offset = current_offset + subfile_header_size + len(pcx_data) if i < num_images - 1 else 0
        subfiles.append({
            'next': next_offset,
            'length': len(pcx_data),
            'axis_x': ax,
            'axis_y': ay,
            'group': group,
            'image': image,
            'link': 0,  # not linked
            'same_pal': 0,
            'pcx': pcx_data,
            'offset': current_offset,
        })
        current_offset += subfile_header_size + len(pcx_data)

    # Build header (512 bytes)
    header = bytearray(header_size)
    header[0:12] = b'ElecbyteSpr\x00'
    header[12:16] = struct.pack('BBBB', 0, 1, 0, 1)  # v1
    struct.pack_into('<i', header, 16, num_images)  # groupAmount (approx)
    struct.pack_into('<i', header, 20, num_images)  # imageAmount
    struct.pack_into('<i', header, 24, header_size)  # firstFileOffset
    struct.pack_into('<i', header, 28, subfile_header_size)  # subheaderSize
    header[32] = 0  # paletteType: shared
    # Comments
    comment = b'FGE system.sff v1 - PCX sprites'
    header[36:36+len(comment)] = comment

    # Build subfiles
    result = bytes(header)
    for sf in subfiles:
        subfile_data = bytearray(subfile_header_size)  # 32 bytes (31 + 1 padding)
        struct.pack_into('<i', subfile_data, 0, sf['next'])
        struct.pack_into('<i', subfile_data, 4, sf['length'])
        struct.pack_into('<h', subfile_data, 8, sf['axis_x'])
        struct.pack_into('<h', subfile_data, 10, sf['axis_y'])
        struct.pack_into('<h', subfile_data, 12, sf['group'])
        struct.pack_into('<h', subfile_data, 14, sf['image'])
        struct.pack_into('<h', subfile_data, 16, sf['link'])
        subfile_data[18] = sf['same_pal']
        # comments: bytes 19..30 (12 bytes) + 1 byte padding at 31 — leave as zeros
        result += bytes(subfile_data) + sf['pcx']

    return result


def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else 'data/system.sff'

    sprites = []

    # Group 100: Cell sprites for character select
    # 100,0 = cell background (solid gray 60x60)
    pcx = create_solid_color_pcx(60, 60, 2)  # gray
    sprites.append((100, 0, 60, 60, 0, 0, pcx))

    # 100,1 = random select cell (solid purple 60x60)
    pcx = create_solid_color_pcx(60, 60, 7)  # purple
    sprites.append((100, 1, 60, 60, 0, 0, pcx))

    # Group 200: P1 cursors
    # 200,0 = P1 active cursor (green border, transparent center)
    pcx = create_border_pcx(62, 62, 3, 0)  # green border, black fill
    sprites.append((200, 0, 62, 62, 0, 0, pcx))

    # 200,1 = P1 done cursor (dark green border)
    pcx = create_border_pcx(62, 62, 4, 0)
    sprites.append((200, 1, 62, 62, 0, 0, pcx))

    # Group 201: P2 cursors
    # 201,0 = P2 active cursor (red border)
    pcx = create_border_pcx(62, 62, 5, 0)  # red border
    sprites.append((201, 0, 62, 62, 0, 0, pcx))

    # 201,1 = P2 done cursor (dark red border)
    pcx = create_border_pcx(62, 62, 6, 0)
    sprites.append((201, 1, 62, 62, 0, 0, pcx))

    sff_data = build_sff_v1(sprites)

    with open(output_path, 'wb') as f:
        f.write(sff_data)

    print(f'Generated {output_path} ({len(sff_data)} bytes, {len(sprites)} sprites)')
    for s in sprites:
        print(f'  Group {s[0]}, Image {s[1]}: {s[2]}x{s[3]} ({len(s[6])} bytes PCX)')


if __name__ == '__main__':
    main()
