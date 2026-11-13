#!/usr/bin/env python3
"""Préparer sans suppression une migration La Forêt → Cloudflare D1/R2.

Le script lit UNIQUEMENT les tables Ludodio et les quatre buckets médias.
Les identifiants Supabase restent dans les variables d'environnement.
Ne pas versionner le répertoire exporté (il contient données et médias).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote

import requests

TABLES = (
    "categories", "subcategories", "blog_categories", "audios", "articles",
    "studio_sound_library", "studio_projects",
)
BUCKETS = ("audios", "images", "blog-images", "studio-sounds")
MEDIA_URL = "https://ludodio-api.rondes.workers.dev/media/"


class Exporter:
    def __init__(self, output: Path):
        self.base = os.environ["SUPABASE_URL"].rstrip("/")
        self.secret = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.output = output
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": self.secret,
            "Authorization": "Bearer " + self.secret,
        })

    def api(self, method, path, **kwargs):
        url = self.base + path
        response = self.session.request(method, url, timeout=90, **kwargs)
        response.raise_for_status()
        return response

    def rows(self, table):
        rows = []
        offset = 0
        while True:
            batch = self.api("GET", "/rest/v1/" + quote(table, safe=""), params={
                "select": "*", "order": "id.asc", "limit": 500, "offset": offset
            }).json()
            if not isinstance(batch, list):
                raise ValueError("Réponse API inattendue pour " + table)
            rows.extend(batch)
            if len(batch) < 500:
                break
            offset += len(batch)
        return rows

    def objects(self, bucket, prefix=""):
        """Parcourt les pseudo-dossiers Supabase sans ignorer les images anciennes."""
        offset = 0
        while True:
            batch = self.api(
                "POST",
                "/storage/v1/object/list/" + quote(bucket, safe=""),
                json={
                    "prefix": prefix, "limit": 100, "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                },
            ).json()
            if not isinstance(batch, list):
                raise ValueError("Listing Storage invalide pour " + bucket)
            for item in batch:
                name = item.get("name")
                if not name or name in (".", ".."):
                    continue
                key = prefix + name
                if item.get("id") is None:
                    yield from self.objects(bucket, key + "/")
                else:
                    yield key
            if len(batch) < 100:
                break
            offset += len(batch)

    def save_media(self, bucket, key):
        destination = self.output / "media" / bucket / key
        if ".." in Path(key).parts or Path(key).is_absolute():
            raise ValueError("Chemin dangereux : " + key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        url = "/storage/v1/object/authenticated/" + quote(bucket, safe="") + "/" + quote(key, safe="/")
        h = hashlib.sha256()
        size = 0
        with self.api("GET", url, stream=True) as response, destination.open("wb") as stream:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                stream.write(chunk)
                h.update(chunk)
                size += len(chunk)
        if not size:
            destination.unlink(missing_ok=True)
            raise ValueError("Fichier vide : " + bucket + "/" + key)
        return {"key": bucket + "/" + key, "size": size, "sha256": h.hexdigest()}


def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (list, dict)):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def adjusted_row(row, source_url):
    item = dict(row)
    if isinstance(item.get("content"), str):
        # L'ancien journal contient des images intégrées avec une URL Supabase absolue.
        for bucket in BUCKETS:
            old = source_url.rstrip("/") + "/storage/v1/object/public/" + bucket + "/"
            item["content"] = item["content"].replace(old, MEDIA_URL + bucket + "/")
    return item


def row_to_sql(table, row):
    if not row or "id" not in row:
        raise ValueError("ID manquant pour la table " + table)
    columns = list(row)
    names = ", ".join('"' + name.replace('"', '""') + '"' for name in columns)
    values = ", ".join(sql_literal(row[name]) for name in columns)
    updates = ", ".join(
        '"' + name.replace('"', '""') + '"=excluded."' + name.replace('"', '""') + '"'
        for name in columns if name != "id"
    )
    statement = (
        'INSERT INTO "' + table + '" (' + names + ') VALUES (' + values + ')'
        + ' ON CONFLICT("id") DO UPDATE SET ' + updates + ";\n"
    )
    if len(statement.encode("utf-8")) > 100_000:
        raise ValueError("Une ligne dépasse la limite d'une requête D1 : " + table)
    return statement


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/ludodio-export")
    args = parser.parse_args()
    target = Path(args.output).expanduser().resolve()
    if target == Path.cwd() or target == Path.home():
        raise SystemExit("Choisir un dossier d'export isolé.")
    target.mkdir(parents=True, exist_ok=True)
    export = Exporter(target)

    row_counts = {}
    sql = ["PRAGMA foreign_keys=ON;\n"]
    for table in TABLES:
        rows = export.rows(table)
        row_counts[table] = len(rows)
        for row in rows:
            sql.append(row_to_sql(table, adjusted_row(row, export.base)))
    sql_path = target / "ludodio-data.sql"
    sql_path.write_text("".join(sql), encoding="utf-8")

    manifest = []
    for bucket in BUCKETS:
        for key in export.objects(bucket):
            manifest.append(export.save_media(bucket, key))
    (target / "manifest.json").write_text(
        json.dumps({"tables": row_counts, "files": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Export sans suppression terminé.")
    print("Tables :", row_counts)
    print("Médias :", len(manifest), "fichiers /", sum(x["size"] for x in manifest), "octets")
    print("Ne pas publier l'export sur un dépôt GitHub public !")
    print("Dossier privé :", target)


if __name__ == "__main__":
    main()
