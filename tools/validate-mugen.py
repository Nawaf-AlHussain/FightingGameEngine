#!/usr/bin/env python3
"""MUGEN character/stage asset validator.

Checks DEF files, SFF headers, SND presence, path traversal, and size limits.
Usage: python3 validate-mugen.py <path_to_def_file>
"""

import sys
import os
import struct
from pathlib import Path

MAX_SIZE_MB = 50
MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024


def parse_def(filepath: str) -> dict:
    """Parse a MUGEN .def file and extract file references."""
    info = {
        "name": "",
        "sff": "",
        "snd": "",
        "air": "",
        "cmd": "",
        "cns_files": [],
        "basedir": str(Path(filepath).parent),
    }

    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        current_section = ""
        for line in f:
            line = line.strip()
            if not line or line.startswith(";"):
                continue
            if line.startswith("[") and line.endswith("]"):
                current_section = line[1:-1].lower()
                continue

            # Parse key = value (handle both = and space separators)
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip().lower()
                value = value.strip().strip('"')
            elif " " in line:
                parts = line.split(None, 1)
                key = parts[0].strip().lower()
                value = parts[1].strip().strip('"') if len(parts) > 1 else ""
            else:
                continue

            # Strip inline comments (MUGEN uses ; for comments)
            if ";" in value:
                value = value.split(";", 1)[0].strip().strip('"')

            if current_section == "info" and key == "name":
                info["name"] = value
            elif key in ("spr", "sprite"):
                info["sff"] = value
            elif key in ("snd", "sound"):
                info["snd"] = value
            elif key in ("anim", "air"):
                info["air"] = value
            elif key == "cmd":
                info["cmd"] = value
            elif key in ("cns", "st", "stcommon") or (key.startswith("st") and key[2:].isdigit()):
                # MUGEN [Files] section uses st, st1, st2, ..., st9, stcommon
                info["cns_files"].append(value)

    return info


def validate_sff(filepath: str) -> tuple[bool, str]:
    """Validate SFF file header (supports v1 and v2)."""
    try:
        with open(filepath, "rb") as f:
            header = f.read(12)

        if len(header) < 12:
            return False, "SFF file too small (< 12 bytes)"

        # Check for path traversal
        full_path = os.path.normpath(filepath)
        if ".." in full_path.split(os.sep):
            return False, f"Path traversal detected in SFF path: {filepath}"

        # SFF v2: starts with "Elecbyte" signature (8 bytes)
        if header[:8] == b"Elecbyte":
            # SFF v2 header: bytes 8-10 = verLo (3 bytes LE), byte 11 = verHi
            ver_lo = header[8] | (header[9] << 8) | (header[10] << 16)
            ver_hi = header[11]
            return True, f"SFF v2 format detected (ver {ver_hi}.{ver_lo})"
        # SFF v2 alternate: "2DTP" (rare, used by some tools)
        if header[:4] == b"2DTP":
            return True, "SFF v2 (2DTP) format detected"
        # SFF v1: signature word + version
        sig, ver_lo, ver_hi = struct.unpack("<HHB", header[:5])
        if sig == 0x0E84 and ver_lo == 1:
            return True, "SFF v1.1 format detected"
        if sig == 0x0E84 and ver_lo == 2:
            return True, "SFF v2.0 (legacy header) format detected"

        return False, f"Unknown SFF header: {header[:8].hex()}"

    except IOError as e:
        return False, f"Cannot read SFF: {e}"


def check_path_traversal(filepath: str) -> bool:
    """Check for path traversal attempts (..) in file paths."""
    normalized = os.path.normpath(filepath)
    parts = normalized.split(os.sep)
    return ".." in parts


def get_total_size(basedir: str) -> int:
    """Calculate total size of all files in a directory."""
    total = 0
    for root, _, files in os.walk(basedir):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    return total


def validate(def_path: str) -> tuple[bool, list[str]]:
    """Validate a MUGEN character or stage .def file."""
    errors = []
    warnings = []

    # 1. Check DEF file exists and is readable
    if not os.path.isfile(def_path):
        return False, [f"DEF file not found: {def_path}"]

    # 2. Check path traversal
    if check_path_traversal(def_path):
        return False, [f"Path traversal detected: {def_path}"]

    # 3. Parse DEF
    info = parse_def(def_path)
    if not info["name"]:
        warnings.append("No 'name' field in [Info] section")

    # 4. Check SFF
    if not info["sff"]:
        errors.append("No 'spr'/'sprite' (SFF) file specified in DEF")
    else:
        sff_path = os.path.join(info["basedir"], info["sff"])
        if not os.path.isfile(sff_path):
            errors.append(f"SFF file not found: {sff_path}")
        else:
            ok, msg = validate_sff(sff_path)
            if not ok:
                errors.append(f"SFF validation failed: {msg}")
            else:
                print(f"  ✓ SFF: {msg} ({os.path.getsize(sff_path) / 1024 / 1024:.1f} MB)")

    # 5. Check SND
    if not info["snd"]:
        warnings.append("No 'snd'/'sound' file specified (character may have no sound)")
    else:
        snd_path = os.path.join(info["basedir"], info["snd"])
        if not os.path.isfile(snd_path):
            warnings.append(f"SND file not found: {snd_path}")
        else:
            print(f"  ✓ SND: {os.path.getsize(snd_path) / 1024 / 1024:.1f} MB")

    # 6. Check AIR
    if not info["air"]:
        warnings.append("No 'anim'/'air' (AIR) file specified")
    else:
        air_path = os.path.join(info["basedir"], info["air"])
        if not os.path.isfile(air_path):
            warnings.append(f"AIR file not found: {air_path}")
        else:
            print(f"  ✓ AIR: {os.path.getsize(air_path) / 1024:.1f} KB")

    # 7. Size check
    total = get_total_size(info["basedir"])
    if total > MAX_SIZE_BYTES:
        errors.append(f"Total size {total / 1024 / 1024:.1f} MB exceeds {MAX_SIZE_MB} MB limit")
    else:
        print(f"  ✓ Total size: {total / 1024 / 1024:.1f} MB")

    all_messages = errors + [f"WARNING: {w}" for w in warnings]
    return len(errors) == 0, all_messages


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate-mugen.py <def_file>")
        print("       python3 validate-mugen.py <directory>  (validates all .def files)")
        sys.exit(1)

    target = sys.argv[1]
    all_ok = True

    if os.path.isdir(target):
        for root, _, files in os.walk(target):
            for f in sorted(files):
                if f.lower().endswith(".def"):
                    def_file = os.path.join(root, f)
                    char_name = Path(def_file).parent.name
                    print(f"\nValidating: {char_name} ({f})")
                    ok, msgs = validate(def_file)
                    for m in msgs:
                        print(f"  {'✗' if not ok else '!'} {m}")
                    if not ok:
                        all_ok = False
    else:
        ok, msgs = validate(target)
        for m in msgs:
            print(f"  {'✗' if not ok else '!'} {m}")
        if not ok:
            all_ok = False

    if all_ok:
        print("\n✅ All validations passed!")
        sys.exit(0)
    else:
        print("\n❌ Validation failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()