#!/usr/bin/env python3
"""Copy verified Ludodio media and D1 content; leave public site & Supabase untouched.
Intended for an isolated GitHub runner with CLOUDFLARE_ACCOUNT_ID/API_TOKEN secrets.
"""
from __future__ import annotations
import concurrent.futures,hashlib,json,mimetypes,os,subprocess,sys,tempfile,time
from pathlib import Path
import requests

BASE=Path(__file__).resolve().parents[1]
ACCOUNT=os.environ["CLOUDFLARE_ACCOUNT_ID"]
TOKEN=os.environ["CLOUDFLARE_API_TOKEN"]
DB_ID="2af9d3e1-4b5c-4f05-a817-cb75c6653f62"
DB_NAME="ludodio"
BUCKET="ludodio-media"
API="https://ludodio-api.rondes.workers.dev"
def cli(*args,timeout=180):
 cmd=["wrangler",*args]
 result=subprocess.run(cmd,cwd=BASE,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                       timeout=timeout,env=os.environ.copy())
 if result.returncode:
  raise RuntimeError("Wrangler failed: "+str(args[:5])+"\n"+result.stdout[-1500:])
 return result.stdout

def main():
 if len(sys.argv)!=2:raise RuntimeError("Usage: ludodio_apply_cloudflare.py /tmp/export")
 root=Path(sys.argv[1]).resolve()
 manifest=json.loads((root/"manifest.json").read_text(encoding="utf-8"))
 files=manifest["files"]
 if len(files)!=258 or sum(int(f["size"]) for f in files)!=18997716:
  raise RuntimeError("Refusing an incomplete media manifest")
 config=BASE/"wrangler.ludodio-ci.toml"
 config.write_text(f'''name = "ludodio-api"
main = "cloudflare/ludodio-api-worker.js"
compatibility_date = "2026-11-13"
[vars]
ALLOWED_ORIGIN = "https://ludodulac.github.io"
[[d1_databases]]
binding = "LUDODIO_DB"
database_name = "{DB_NAME}"
database_id = "{DB_ID}"
[[r2_buckets]]
binding = "LUDODIO_MEDIA"
bucket_name = "{BUCKET}"
''',encoding="utf-8")
 try:
  # First create the relational schema (additive and idempotent).
  print("D1 schema ...",flush=True)
  cli("d1","execute",DB_NAME,"--remote","--file=cloudflare/ludodio-d1-schema.sql",f"--config={config}",timeout=180)
  print("Uploading media through Wrangler R2. Source is never changed.",flush=True)
  def copy_one(item):
   key=item["key"]
   source=(root/"media"/key).resolve()
   if not source.is_file() or not source.is_relative_to((root/"media").resolve()):
    raise RuntimeError("Media path escaped export directory")
   if source.stat().st_size!=item["size"]:raise RuntimeError("Size mismatch: "+key)
   if hashlib.sha256(source.read_bytes()).hexdigest()!=item["sha256"]:raise RuntimeError("Hash mismatch: "+key)
   typ=mimetypes.guess_type(key)[0] or "application/octet-stream"
   # No R2 objects were deleted; stable, source-derived keys.
   cli("r2","object","put",BUCKET+"/"+key,"--file="+str(source),"--content-type="+typ,
       "--remote","--force",timeout=150)
   return key
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   results=list(pool.map(copy_one,files))
  print(f"Copied {len(results)} files to distinct R2 bucket",flush=True)
  # Only after ALL media uploads succeed do we import the referenced database rows.
  print("Importing D1 data ...",flush=True)
  cli("d1","execute",DB_NAME,"--remote","--file="+str(root/"ludodio-data.sql"),f"--config={config}",timeout=240)
  # Public Worker can serve media without an admin PIN. No production client cutover here.
  print("Deploying isolated Ludodio API without touching Espace Jeunesse or Célébrations ...",flush=True)
  cli("deploy",f"--config={config}","--keep-vars","--strict",timeout=180)
  # We intentionally DO NOT set a password from another app or invent a public PIN.
  # Public reads work; login stays unavailable until owner sets ADMIN_PIN/SESSION_SECRET.
  print("Validating ALL 258 objects by SHA-256 via public Worker ...",flush=True)
  session=requests.Session()
  def verify(item):
   key=item["key"]
   r=session.get(API+"/media/"+"/".join(requests.utils.quote(s,safe="") for s in key.split("/")),
                 timeout=90,stream=True)
   r.raise_for_status()
   h=hashlib.sha256();size=0
   for ch in r.iter_content(chunk_size=1<<20):
    if ch:h.update(ch);size+=len(ch)
   if size!=item["size"] or h.hexdigest()!=item["sha256"]:
    raise RuntimeError("R2 verification mismatch: "+key)
   return True
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
   check=list(pool.map(verify,files))
  assert len(check)==len(files)
  # D1 anonymous projections must return exact published count, including latest stories.
  for table,count in [("audios",2),("articles",2),("categories",2),("subcategories",2),("blog_categories",2)]:
   r=requests.post(API+"/api/data",json={"table":table,"op":"select"},timeout=40,
                   headers={"Origin":"https://ludodulac.github.io"})
   r.raise_for_status();data=r.json()
   if len(data.get("data") or [])!=count:raise RuntimeError("D1 data mismatch: "+table)
  print("SUCCESS: 258/258 verified R2 files; D1 rows 2 audios + 2 articles + categories OK.",flush=True)
  print("Production GitHub Pages is still on original Supabase backend. No original data was deleted.",flush=True)
  print("Next prerequisite for final switch: set Ludodio ADMIN_PIN and SESSION_SECRET as Cloudflare Worker secrets.",flush=True)
 finally:
  config.unlink(missing_ok=True)
if __name__=="__main__":main()
