"""Generate RSA keypair for Chrome extension, compute extension ID, write key to manifest.json.

Chrome extension ID algorithm:
  1. Take the DER-encoded public key (SubjectPublicKeyInfo)
  2. SHA-256 hash it
  3. Take first 16 bytes
  4. Map each byte to a-p (0->a, 1->b, ..., 15->p)
  5. That 32-char string is the extension ID

The `key` field in manifest.json is the base64-encoded DER public key.
"""
import base64
import hashlib
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def compute_extension_id(public_key_der: bytes) -> str:
    digest = hashlib.sha256(public_key_der).digest()[:16]
    return "".join(chr(ord("a") + b) for b in digest)


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    manifest_path = project_root / "extension" / "manifest.json"
    private_key_path = project_root / "extension-key.pem"

    if private_key_path.exists():
        print(f"WARNING: {private_key_path} already exists. Aborting to avoid overwriting.")
        print("Delete it first if you want to regenerate.")
        return 1

    # Generate 2048-bit RSA key
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    # Serialize private key (PEM) — keep secret, do NOT commit
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    private_key_path.write_bytes(private_pem)
    print(f"Private key written to: {private_key_path}")
    print("  (Keep this secret. Needed only for Chrome Web Store upload.)")

    # Serialize public key (DER — SubjectPublicKeyInfo)
    public_der = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_b64 = base64.b64encode(public_der).decode("ascii")

    extension_id = compute_extension_id(public_der)
    print(f"Extension ID: {extension_id}")
    print(f"Public key (base64 DER): {public_b64[:60]}...")

    # Write key into manifest.json
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["key"] = public_b64
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Updated: {manifest_path}")

    # Verify: re-read manifest and recompute ID
    manifest2 = json.loads(manifest_path.read_text(encoding="utf-8"))
    key_b64 = manifest2["key"]
    key_der = base64.b64decode(key_b64)
    recomputed_id = compute_extension_id(key_der)
    print(f"Verification — recomputed ID from manifest key: {recomputed_id}")
    if recomputed_id != extension_id:
        print("ERROR: ID mismatch!", file=sys.stderr)
        return 1
    print("OK: manifest key produces the expected extension ID.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
