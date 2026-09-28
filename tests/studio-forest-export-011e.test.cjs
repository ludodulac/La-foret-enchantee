const assert=require('node:assert/strict');
const fs=require('fs');
const Publish=require('../js/audio-publish.js');
const ExportCore=require('../js/studio-export-core.js');

const studio=fs.readFileSync('studio.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const audioPage=fs.readFileSync('js/audio.js','utf8');
const helper=fs.readFileSync('js/audio-publish.js','utf8');

function mockClient({uploadError=null,insertError=null,removeError=null}={}){
  const calls={buckets:[],uploads:[],tables:[],rows:[],removes:[],publicUrls:[]};
  const client={
    storage:{from(bucket){
      calls.buckets.push(bucket);
      return{
        async upload(path,blob,opts){calls.uploads.push({bucket,path,blob,opts});return{data:uploadError?null:{path},error:uploadError}},
        async remove(paths){calls.removes.push({bucket,paths});return{data:removeError?null:paths,error:removeError}},
        getPublicUrl(path){calls.publicUrls.push({bucket,path});return{data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/'+bucket+'/'+path}}}
      };
    }},
    from(table){
      calls.tables.push(table);
      return{async insert(row){calls.rows.push({table,row});return{data:insertError?null:[{id:1,...row}],error:insertError}}};
    }
  };
  return{client,calls};
}

async function makeStudioWav(){
  const frames=4800,sampleRate=48000;
  const left=new Float32Array(frames),right=new Float32Array(frames);
  for(let i=0;i<frames;i++){left[i]=Math.sin(i/17)*.25;right[i]=Math.cos(i/19)*.2}
  return ExportCore.encodeWavCooperative(left,right,sampleRate);
}
async function inspect(blob){
  const h=await blob.slice(0,44).arrayBuffer(),v=new DataView(h);
  const tag=(o,n)=>String.fromCharCode(...new Uint8Array(h,o,n));
  const channels=v.getUint16(22,true),sampleRate=v.getUint32(24,true),bits=v.getUint16(34,true),dataSize=v.getUint32(40,true);
  return{riff:tag(0,4),wave:tag(8,4),fmt:tag(12,4),data:tag(36,4),channels,sampleRate,bits,dataSize,duration:dataSize/(channels*bits/8)/sampleRate};
}

(async()=>{
  assert.equal(Publish.BUCKET,'audios');
  assert.equal(Publish.TABLE,'audios');
  console.log('FOREST_EXPORT_USES_AUDIOS_BUCKET = PASS');

  assert.equal(Publish.resolveTitle('  Histoire forêt  ','Projet automatique'),'Histoire forêt');
  console.log('FOREST_EXPORT_TITLE_EXPLICIT = PASS');
  assert.equal(Publish.resolveTitle('   ','Projet 28 septembre - 11:40'),'Projet 28 septembre - 11:40');
  assert(/^Projet /.test(Publish.resolveTitle('','',new Date('2026-09-28T09:32:00+02:00'))));
  console.log('FOREST_EXPORT_TITLE_PROJECT_FALLBACK = PASS');

  const wav=await makeStudioWav(),info=await inspect(wav);
  assert.equal(wav.type,'audio/wav');
  assert.equal(info.riff,'RIFF');assert.equal(info.wave,'WAVE');assert.equal(info.fmt,'fmt ');assert.equal(info.data,'data');
  assert.equal(info.bits,16);assert.equal(info.channels,2);assert.equal(info.sampleRate,48000);
  assert(Math.abs(info.duration-.1)<1e-9);
  console.log('WAV_STUDIO_RIFF_WAVE_PCM16 = PASS');

  const ok=mockClient();
  const result=await Publish.publishNormalAudio({
    dbClient:ok.client,blob:wav,title:'Histoire forêt',projectName:'Projet X',duration:info.duration,
    uuidFn:()=> 'uuid-test',nowFn:()=>123456789
  });
  assert.deepEqual(ok.calls.buckets,['audios']);
  assert.equal(ok.calls.uploads.length,1);
  assert.equal(ok.calls.uploads[0].opts.contentType,'audio/wav');
  assert.equal(ok.calls.uploads[0].opts.upsert,false);
  assert.equal(ok.calls.tables[0],'audios');
  assert.equal(ok.calls.rows.length,1);
  assert.deepEqual(Object.keys(ok.calls.rows[0].row).sort(),['audio_path','duration','title']);
  assert.equal(ok.calls.rows[0].row.title,'Histoire forêt');
  assert.equal(ok.calls.rows[0].row.audio_path,'studio/123456789-uuid-test-histoire-foret.wav');
  assert.equal(ok.calls.rows[0].row.duration,1);
  assert.equal(result.bucket,'audios');assert.equal(result.table,'audios');
  assert(result.publicUrl.includes('/object/public/audios/'));
  console.log('FOREST_EXPORT_INSERTS_NORMAL_AUDIO_ROW = PASS');
  console.log('FOREST_EXPORT_DURATION = PASS');
  console.log('FOREST_EXPORT_PUBLIC_URL_MODEL = PASS');

  const uploadFail=mockClient({uploadError:{message:'upload denied'}});
  await assert.rejects(()=>Publish.publishNormalAudio({dbClient:uploadFail.client,blob:wav,title:'TEST',duration:1}),e=>e.stage==='upload');
  assert.equal(uploadFail.calls.rows.length,0);
  assert.equal(uploadFail.calls.removes.length,0);
  console.log('FOREST_EXPORT_UPLOAD_FAILURE_NO_ROW = PASS');

  const insertFail=mockClient({insertError:{message:'insert denied'}});
  await assert.rejects(()=>Publish.publishNormalAudio({
    dbClient:insertFail.client,blob:wav,title:'TEST rollback',duration:1,
    path:'studio/test-rollback.wav'
  }),e=>e.stage==='insert'&&e.rollbackAttempted===true&&e.rollbackError===null);
  assert.equal(insertFail.calls.rows.length,1);
  assert.deepEqual(insertFail.calls.removes,[{bucket:'audios',paths:['studio/test-rollback.wav']}]);
  console.log('FOREST_EXPORT_INSERT_FAILURE_STORAGE_ROLLBACK = PASS');

  // Studio keeps the existing local download path, but only after one shared mix/encode.
  assert(studio.includes('function downloadPreparedExport()'));
  assert(studio.includes("a.download=x.filename"));
  assert(studio.includes("$('#export-download-ready').onclick=downloadPreparedExport"));
  assert(studio.includes("openExportDestination({blob,wavInfo,filename,diagnostic,requestedStart,requestedEnd})"));
  assert.equal((studio.match(/StudioExportCore\.encodeWavCooperative\(/g)||[]).length,1);
  console.log('DOWNLOAD_EXPORT_STILL_WORKS = PASS');

  // One publication at a time; repeated taps return before any second call.
  assert(studio.includes('if(forestPublishBusy||!pendingExport)return'));
  assert(studio.includes('forestPublishBusy=true;btn.disabled=true'));
  assert(studio.includes('finally{forestPublishBusy=false;btn.disabled=false'));
  console.log('FOREST_EXPORT_DOUBLE_TAP_GUARD = PASS');

  // Admin return is deliberately a discreet text link on the project library, not the old primary back button.
  assert(studio.includes('<a class="project-library-admin-link" href="admin.html">← Administration La Forêt Enchantée</a>'));
  assert(!studio.includes('<a class="project-library-back game-btn'));
  console.log('ADMIN_RETURN_TARGET = admin.html');

  // Public player consumes exactly the same normal audio_path through public audios URLs.
  assert(app.includes("function audioUrl(audio) { return audio.audio_path ? getPublicUrl('audios', audio.audio_path) : ''; }"));
  assert(app.includes('player.src = audioUrl(audio)'));
  assert(audioPage.includes("getPublicUrl('audios'"));
  console.log('WAV_PUBLIC_PLAYER_PIPELINE_COMPATIBILITY = PASS');

  // Gate is implementation-only: no schema, table, bucket, policy creation code.
  for(const forbidden of ['create table','alter table','create policy','storage.buckets','studio_audio_sources','studio_project_sources']){
    assert(!helper.toLowerCase().includes(forbidden),forbidden);
  }
  assert.equal(Publish.BUCKET,'audios');
  assert.equal(Publish.TABLE,'audios');
  console.log('FOREST_EXPORT_NO_NEW_TABLE = PASS');
  console.log('FOREST_EXPORT_NO_NEW_BUCKET = PASS');
  console.log('FOREST_EXPORT_NO_NEW_RLS = PASS');

  // Production Studio uses the helper with the already-authenticated dbClient and exact success message.
  assert(studio.includes('ForestAudioPublish.publishNormalAudio({dbClient,blob:x.blob'));
  assert(studio.includes("msg('Audio ajouté à La Forêt Enchantée ✓')"));
  assert(studio.includes('<script src="js/audio-publish.js"></script>'));

  console.log('Studio forest export 011E tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
