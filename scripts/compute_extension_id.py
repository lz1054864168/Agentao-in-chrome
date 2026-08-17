"""Verify the extension ID from the manifest.json key field.

Chrome extension ID algorithm:
  1. DER-decode the base64 `key` field -> public key bytes
  2. SHA-256 hash
  3. Take first 16 bytes
  4. Each byte -> two chars: high nibble + low nibble, each mapped 0-15 -> a-p
  5. Result: 32-char lowercase string
"""
import base64
import hashlib
import json
from pathlib import Path


def compute_extension_id(public_key_der: bytes) -> str:
    digest = hashlib.sha256(public_key_der).digest()[:16]
    chars = []
    for byte in digest:
        chars.append(chr(ord("a") + ((byte >> 4) & 0x0F)))
        chars.append(chr(ord("a") + (byte & 0x0F)))
    return "".join(chars)


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    manifest = json.loads(
        (project_root / "extension" / "manifest.json").read_text(encoding="utf-8")
    )
    key_b64 = manifest["key"]
    key_der = base64.b64decode(key_b64)
    ext_id = compute_extension_id(key_der)
    # Write to file to avoid console encoding issues
    Path("extension-id.txt").write_text(ext_id, encoding="ascii")
    print(f"Extension ID: {ext_id}")
    print(f"Length: {len(ext_id)}")
    print(f"All chars in a-p: {all(c in 'abcdefghijklmnop' for c in ext_id)}")


if __name__ == "__main__":
    main()
