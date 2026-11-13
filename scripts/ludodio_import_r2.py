#!/usr/bin/env python3
"""Copie de l'export Ludodio vers un bucket R2 dédié, jamais de suppression.

Nécessite boto3 et des clés R2 configurées en variables d'environnement.
Par défaut, ne réalise aucune écriture ; passer --apply pour copier.
"""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path, PurePosixPath

import boto3
from botocore.exceptions import ClientError


def is_missing(error):
    if not isinstance(error, ClientError):
        return False
    return error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound")


def digest_file(path):
    h = hashlib.sha256()
    total = 0
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
            total += len(block)
    return total, h.hexdigest()


def digest_remote(client, bucket, key):
    obj = client.get_object(Bucket=bucket, Key=key)
    digest = hashlib.sha256()
    body = obj["Body"]
    try:
        for chunk in body.iter_chunks(chunk_size=1024 * 1024):
            if chunk:
                digest.update(chunk)
    finally:
        body.close()
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="/tmp/ludodio-export")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path(args.source).resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    media = manifest.get("files", [])
    allowed = {"audios", "images", "blog-images", "studio-sounds"}
    for item in media:
        key = item["key"]
        parts = PurePosixPath(key).parts
        if not parts or parts[0] not in allowed or ".." in parts or key.startswith("/"):
            raise ValueError("Clé R2 non autorisée : " + key)
        local = root / "media" / key
        if not local.is_file() or local.resolve() != (root / "media" / key).resolve():
            raise ValueError("Média manquant ou déplacé : " + key)
        size, digest = digest_file(local)
        if size != item["size"] or digest != item["sha256"]:
            raise ValueError("Checksum non conforme : " + key)

    if not args.apply:
        print(f"Simulation : {len(media)} objets vérifiés, aucune écriture ni suppression.")
        return

    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    bucket = os.environ.get("LUDODIO_R2_BUCKET", "ludodio-media")
    if bucket != "ludodio-media":
        raise SystemExit("Bucket inattendu : ne pas toucher au stockage d'un autre site.")
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    copied = 0
    skipped = 0
    for item in media:
        key = item["key"]
        path = root / "media" / key
        existing = None
        try:
            existing = client.head_object(Bucket=bucket, Key=key)
        except ClientError as error:
            if not is_missing(error):
                raise
        if existing:
            if existing["ContentLength"] != item["size"]:
                raise ValueError("Objet R2 existant de taille différente : " + key)
            existing_hash = existing.get("Metadata", {}).get("sha256")
            if existing_hash != item["sha256"]:
                existing_hash = digest_remote(client, bucket, key)
            if existing_hash != item["sha256"]:
                raise ValueError("Conflit R2 : le contenu existant est différent : " + key)
            skipped += 1
            continue
        content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        with path.open("rb") as f:
            client.put_object(
                Bucket=bucket, Key=key, Body=f, ContentType=content_type,
                Metadata={"sha256": item["sha256"]},
            )
        verified = client.head_object(Bucket=bucket, Key=key)
        if verified["ContentLength"] != item["size"] or verified.get("Metadata", {}).get("sha256") != item["sha256"]:
            raise ValueError("Copie R2 non confirmée : " + key)
        copied += 1
    print(f"R2 confirmé : {copied} nouveaux fichiers, {skipped} déjà identiques, aucune suppression.")


if __name__ == "__main__":
    main()
