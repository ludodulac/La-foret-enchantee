'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const manifest=JSON.parse(read('assets/covers/manifest.json'));
const keywords=JSON.parse(read('assets/covers/keywords.json'));
assert.deepEqual(manifest,[],'The former image bank must be empty');
assert.equal(keywords.baseUrl,'','The old Supabase image URL must be removed');
assert.deepEqual(keywords.concepts,{},'No old cover categories should be suggested');
assert.equal(fs.readdirSync(path.join(root,'assets/illustrations')).includes('admin-library'),false,
  'The 252 sample images must not ship in the static site');
const js=read('js/supabase.js');
assert.match(js,/const LUDODIO_API=/);
assert.match(js,/cloudMode:true/);
assert.doesNotMatch(js,/SUPABASE_ANON_KEY|\.supabase\.co/);
for(const p of ['index.html','admin.html','audio.html','blog.html','article.html','studio.html']){
 assert.doesNotMatch(read(p),/src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/,
  p+' cannot load the obsolete Supabase client');
}
assert.match(read('admin.html'),/id="ej-audio-select"/,
  'Ludodio keeps the optional Espace Jeunesse MP3 connection');
assert.match(read('js/admin.js'),/espaceJeunesseId/,
  'Espace Jeunesse links remain without uploads');
console.log('Ludodio clean start: zero suggested covers, no Supabase runtime, separate Studio PASS');
