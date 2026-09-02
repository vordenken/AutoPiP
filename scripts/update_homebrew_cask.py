#!/usr/bin/env python3

import argparse
import hashlib
import os
import re
import stat
import tempfile
from pathlib import Path


def parse_arguments():
    parser = argparse.ArgumentParser(description="Update the Homebrew cask release")
    parser.add_argument("--cask", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--archive", type=Path, required=True)
    return parser.parse_args()


def archive_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as archive:
        for chunk in iter(lambda: archive.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def update_cask(cask_path, version, archive_path):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError(f"Invalid version: {version}")
    if not archive_path.is_file():
        raise ValueError(f"Archive does not exist: {archive_path}")

    cask = cask_path.read_text(encoding="utf-8")
    checksum = archive_sha256(archive_path)
    cask, version_count = re.subn(
        r'^  version "[^"]+"$', f'  version "{version}"', cask, count=1, flags=re.M
    )
    cask, checksum_count = re.subn(
        r'^  sha256 "[0-9a-f]{64}"$',
        f'  sha256 "{checksum}"',
        cask,
        count=1,
        flags=re.M,
    )
    if version_count != 1 or checksum_count != 1:
        raise ValueError("Cask must contain exactly one version and SHA-256 stanza")

    mode = stat.S_IMODE(cask_path.stat().st_mode)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=cask_path.parent,
            delete=False,
            prefix="autopip-cask-",
        ) as temporary_file:
            temporary_file.write(cask)
            temporary_path = Path(temporary_file.name)
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, cask_path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def main():
    args = parse_arguments()
    update_cask(args.cask, args.version, args.archive)


if __name__ == "__main__":
    main()