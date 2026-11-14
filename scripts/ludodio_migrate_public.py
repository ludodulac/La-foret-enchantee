#!/usr/bin/env python3
"""Non destructive Ludodio migration: public Supabase data -> private runner export.
The legacy Supabase project is shared with Celebrations; NEVER delete any source.
The script requires full equality with the verified source inventory and stops
rather than silently dropping private/unpublished records.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, sys
from pathlib import Path
from urllib.parse import quote
import requests

SUPABASE_REF="jwyayfkssyagvnablttg"
URL=f"https://{SUPABASE_REF}.supabase.co"
EXPECTED_TABLES={"categories":2,"subcategories":2,"blog_categories":2,"audios":2,"articles":2}
EXPECTED_BUCKETS={"audios":2,"blog-images":3,"images":253}
EXPECTED_BYTES={"audios":4927328,"blog-images":11847736,"images":2222652}
DEST_URL="https://ludodio-api.rondes.workers.dev/media/"
SQL_COLUMNS={
 "categories":{"id","name","created_at"},
 "subcategories":{"id","name","category_id","created_at"},
 "blog_categories":{"id","name","created_at"},
 "audios":{"id","title","description","image_path","audio_path","category_id","subcategory_id",
            "duration","created_at","illustration_key","cover_color","is_published"},
 "articles":{"id","title","excerpt","content","category","cover_path","published","published_at","created_at"},
}
def sql_literal(v):
 if v is None:return "NULL"
 if v is True:return "1"
 if v is False:return "0"
 if isinstance(v,(dict,list)):v=json.dumps(v,ensure_ascii=False,separators=(",",":"))
 if isinstance(v,(int,float)):return str(v)
 return "'"+str(v).replace("'","''")+"'"

def upsert(table,row):
 if set(row)-SQL_COLUMNS[table]:raise RuntimeError(f"Unrecognized schema fields for {table}: {set(row)-SQL_COLUMNS[table]}")
 if not row.get("id"):raise RuntimeError(f"Missing ID for {table}")
 fields=list(row)
 names=",".join('"'+c+'"' for c in fields)
 values=",".join(sql_literal(row[c]) for c in fields)
 updates=",".join(f'"{c}"=excluded."{c}"' for c in fields if c!="id")
 if not updates:raise RuntimeError("No updates")
 return f'INSERT INTO "{table}" ({names}) VALUES ({values}) ON CONFLICT(id) DO UPDATE SET {updates};\n'

class Source:
 def __init__(self,anon):
  self.s=requests.Session();self.s.headers.update({"apikey":anon,"Authorization":"Bearer "+anon})
 def rows(self,table):
  out=[];offset=0
  while True:
   r=self.s.get(f"{URL}/rest/v1/{table}",params={"select":"*","order":"id.asc","limit":500,"offset":offset},timeout=60)
   r.raise_for_status();batch=r.json()
   if not isinstance(batch,list):raise RuntimeError("Bad Supabase table response")
   out+=batch
   if len(batch)<500:break
   offset+=len(batch)
  return out
 def objects(self,bucket,prefix=""):
  out=[];offset=0
  while True:
   r=self.s.post(f"{URL}/storage/v1/object/list/{bucket}",json={
       "prefix":prefix,"limit":100,"offset":offset,"sortBy":{"column":"name","order":"asc"}},timeout=60)
   r.raise_for_status();batch=r.json()
   if not isinstance(batch,list):raise RuntimeError("Bad Storage object listing")
   for x in batch:
    name=x.get("name")
    if not name or name in (".",".."):continue
    key=prefix+name
    if x.get("id") is None:
     out+=self.objects(bucket,key+"/")
    else:out.append({"key":key,"expected_size":int((x.get("metadata") or {}).get("size") or 0)})
   if len(batch)<100:break
   offset+=len(batch)
  return out
 def fetch_object(self,bucket,obj,folder):
  key=obj["key"]
  if ".." in Path(key).parts or Path(key).is_absolute():raise RuntimeError("Invalid key")
  dst=folder/"media"/bucket/key;dst.parent.mkdir(parents=True,exist_ok=True)
  # All three audited buckets are public. Private Studio contents are not migrated by this script.
  r=self.s.get(f"{URL}/storage/v1/object/public/{bucket}/{quote(key,safe='/')}",timeout=90,stream=True)
  r.raise_for_status();h=hashlib.sha256();size=0
  with dst.open("wb") as f:
   for chunk in r.iter_content(chunk_size=1024*1024):
    if chunk:f.write(chunk);h.update(chunk);size+=len(chunk)
  if not size or (obj["expected_size"] and obj["expected_size"]!=size):
   raise RuntimeError("Missing or truncated file: "+bucket+"/"+key)
  return {"key":bucket+"/"+key,"size":size,"sha256":h.hexdigest()}

def main():
 parser=argparse.ArgumentParser();parser.add_argument("--output",required=True);parser.add_argument("--anon-source",required=True)
 args=parser.parse_args()
 if not args.anon_source.startswith("eyJ"):raise RuntimeError("Expected public anon JWT")
 path=Path(args.output).resolve();path.mkdir(parents=True,exist_ok=True)
 source=Source(args.anon_source)
 counts={};statements=["PRAGMA foreign_keys=ON;\n"]
 for table,expected in EXPECTED_TABLES.items():
  records=source.rows(table);counts[table]=len(records)
  if len(records)!=expected:raise RuntimeError(f"{table}: read {len(records)}; expected {expected}; refusing incomplete migration")
  for row in records:
   row=dict(row)
   if table=="articles" and isinstance(row.get("content"),str):
    for bucket in EXPECTED_BUCKETS:
     row["content"]=row["content"].replace(
      f"{URL}/storage/v1/object/public/{bucket}/",DEST_URL+bucket+"/")
   statements.append(upsert(table,row))
 manifest=[];sizes={}
 for bucket,expected in EXPECTED_BUCKETS.items():
  objects=source.objects(bucket)
  if len(objects)!=expected:raise RuntimeError(f"{bucket}: listed {len(objects)}, expected {expected}")
  sizes[bucket]=0
  for obj in objects:
   record=source.fetch_object(bucket,obj,path)
   sizes[bucket]+=record["size"];manifest.append(record)
  if sizes[bucket]!=EXPECTED_BYTES[bucket]:
   raise RuntimeError(f"{bucket}: exported {sizes[bucket]} bytes; expected {EXPECTED_BYTES[bucket]}")
 (path/"ludodio-data.sql").write_text("".join(statements),encoding="utf-8")
 (path/"manifest.json").write_text(json.dumps({"counts":counts,"sizes":sizes,"files":manifest},
    ensure_ascii=False,indent=2),encoding="utf-8")
 print(f"Source validated: {sum(counts.values())} records, {len(manifest)} files, {sum(sizes.values())} bytes")
 print("No Supabase updates or deletion performed. Private exported data stays in runner /tmp.")
if __name__=="__main__":main()
