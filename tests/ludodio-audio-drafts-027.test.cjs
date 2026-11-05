'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {publishDraftMp3}=require('../js/audio-publish.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const studio=read('studio.html'),admin=read('admin.html'),adminJs=read('js/admin.js'),sql=read('supabase/migrations/20261105_ludodio_audio_drafts.sql');
assert(sql.includes('is_published boolean NOT NULL DEFAULT true'),'Existing stories must remain public');
assert(sql.includes('USING (is_published IS TRUE)'),'Public SELECT must exclude draft rows');
assert(sql.includes('public.is_app_admin()'),'Admins must read drafts');
assert(admin.includes('id="audio-drafts-section"'),'Admin must show an À classer draft panel');
assert(adminJs.includes('audio.is_published===false'),'Draft listing must be separated from published stories');
assert(adminJs.includes(".update({is_published:true})"),'Publishing must be explicit');
assert(adminJs.includes("if(!audio.category_id)"),'Publishing requires classification');
assert(studio.includes('ForestAudioPublish.publishDraftMp3({'),'Studio must upload MP3 as draft');
assert(studio.includes('ForestR2Media'),'Studio must use the existing authorized R2 gateway');
assert(studio.includes("encodeWavBlob(x.blob"),'Studio must convert WAV to MP3 before upload');
assert(studio.includes('if(exportBusy||downloadExportBusy||forestPublishBusy)'), 'Keep page exit warning during upload');
(async()=>{
 const mp3=new Blob([Uint8Array.of(0xff,0xfb,0x90,0x64,1,2,3)],{type:'audio/mpeg'});
 let events=[],captured;
 const media={
  checkedMedia(bucket,file){events.push('check');assert.equal(bucket,'audios');assert.equal(file.type,'audio/mpeg');assert(file.name.endsWith('.mp3'))},
  async upload(_,bucket,file){events.push('upload');assert.equal(bucket,'audios');assert.equal(file.type,'audio/mpeg');return 'r2:contes/00000000-0000-4000-8000-000000000001.mp3'},
  async verify(path){events.push('verify');assert(path.startsWith('r2:'))},
  async remove(_client,path){events.push('remove');assert(path.startsWith('r2:'))}
 };
 let shouldFail=false;
 const dbClient={
  auth:{async getSession(){return{data:{session:{access_token:'token'}},error:null}}},
  async rpc(fn){assert.equal(fn,'is_app_admin');return{data:true,error:null}},
  from(table){assert.equal(table,'audios');return{insert(row){events.push('insert');captured=row;return{select(){return{async single(){return shouldFail?{data:null,error:{message:'base indisponible'}}:{data:{id:15,is_published:row.is_published,audio_path:row.audio_path,title:row.title},error:null}}}}}}}}
 };
 const saved=await publishDraftMp3({dbClient,blob:mp3,title:' Mon histoire ',projectName:'?',duration:18*60,media});
 assert.equal(saved.id,15);
 assert.equal(saved.title,'Mon histoire');
 assert.equal(saved.is_published,false);
 assert.equal(captured.category_id,null);
 assert.equal(captured.subcategory_id,null);
 assert.equal(captured.is_published,false);
 assert.equal(captured.duration,1080);
 assert.deepEqual(events,['check','upload','verify','insert']);
 shouldFail=true;
 await assert.rejects(()=>publishDraftMp3({dbClient,blob:mp3,title:'Deuxième',duration:10,media}),/brouillon impossible/i);
 assert.deepEqual(events.slice(4),['check','upload','verify','insert','remove'],'Failure must remove R2 upload');
 const unauthorized={...dbClient,async rpc(){return{data:false,error:null}}};
 await assert.rejects(()=>publishDraftMp3({dbClient:unauthorized,blob:mp3,title:'Interdit',media}),/Accès administrateur requis/);
 console.log('LUDODIO DRAFT MP3 027 — protected R2 upload, unpublished insert, rollback, category-later PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
