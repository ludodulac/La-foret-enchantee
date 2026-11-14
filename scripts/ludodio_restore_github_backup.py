#!/usr/bin/env python3
"""Restore only verified public Ludodio SQL + 252 byte-size-matched images from GitHub.
DO NOT switch the production website while six files are inaccessible (Supabase 402).
"""
from __future__ import annotations
import concurrent.futures,hashlib,os,subprocess,sys
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
DB_ID="2af9d3e1-4b5c-4f05-a817-cb75c6653f62"
BUCKET="ludodio-media"
WORKER="ludodio-api"
URL="https://ludodio-api.rondes.workers.dev"
def wr(*args,timeout=240):
 res=subprocess.run(["wrangler",*args],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                    env=os.environ.copy(),timeout=timeout)
 if res.returncode:raise RuntimeError("Wrangler "+str(args[:4])+" failed: "+res.stdout[-1300:])
 return res.stdout

def main():
 if not os.getenv("CLOUDFLARE_API_TOKEN") or not os.getenv("CLOUDFLARE_ACCOUNT_ID"):
  raise RuntimeError("No Cloudflare credentials")
 images=sorted((ROOT/"assets/illustrations/admin-library").glob("*.webp"))
 if len(images)!=252 or sum(x.stat().st_size for x in images)!=2212832:
  raise RuntimeError("GitHub backup differs from 252 file Supabase inventory; not restoring")
 cfg=ROOT/"wrangler.ludodio-ci.toml"
 cfg.write_text(f'''name = "{WORKER}"
main = "cloudflare/ludodio-api-worker.js"
compatibility_date = "2026-11-13"
[vars]
ALLOWED_ORIGIN = "https://ludodulac.github.io"
[[d1_databases]]
binding = "LUDODIO_DB"
database_name = "ludodio"
database_id = "{DB_ID}"
[[r2_buckets]]
binding = "LUDODIO_MEDIA"
bucket_name = "{BUCKET}"
''',encoding="utf-8")
 try:
  wr("d1","execute","ludodio","--remote","--file=cloudflare/ludodio-d1-schema.sql",f"--config={cfg}")
  print("D1 schema installed; no content in original Supabase changed",flush=True)
  def send(file):
   wr("r2","object","put",f"{BUCKET}/images/admin-library/{file.name}",
      f"--file={file}","--content-type=image/webp","--remote","--force",timeout=150)
   return file.name
  with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
   names=list(pool.map(send,images))
  print(f"{len(names)} public illustrations restored in isolated R2 bucket",flush=True)
  wr("d1","execute","ludodio","--remote","--file=cloudflare/ludodio-data-public.sql",
     f"--config={cfg}")
  print("10 published source rows restored (2 audios, 2 articles, 6 categories)",flush=True)
  wr("deploy",f"--config={cfg}","--keep-vars","--strict")
  # Public read works, but ADMIN_PIN deliberately NOT configured: owner must choose a strong secret.
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
   def validate(file):
    link=URL+"/media/images/admin-library/"+file.name
    r=requests.get(link,timeout=45);r.raise_for_status()
    if hashlib.sha256(r.content).digest()!=hashlib.sha256(file.read_bytes()).digest():
     raise RuntimeError("R2 binary verification failed: "+file.name)
    return True
   checks=list(pool.map(validate,images))
  assert len(checks)==252
  for table,count in [("audios",2),("articles",2),("categories",2),("subcategories",2),("blog_categories",2)]:
   r=requests.post(URL+"/api/data",json={"table":table,"op":"select"},
     headers={"Origin":"https://ludodulac.github.io"},timeout=30)
   r.raise_for_status()
   obj=r.json()
   if len(obj.get("data") or [])!=count:raise RuntimeError("D1 verification failed: "+table)
  print("SUCCESS: 252/252 R2 illustrations SHA-256 verified; D1 published rows verified",flush=True)
  print("Still missing from Supabase restricted source: 2 audios, 3 blog images, 1 story cover",flush=True)
  print("NO production website cutover, NO source deletion, NO modification of Celebrations",flush=True)
 finally:cfg.unlink(missing_ok=True)
if __name__=="__main__":main()
