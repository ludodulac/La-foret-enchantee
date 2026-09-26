const assert=require('node:assert/strict');
const fs=require('fs');
const A=require('../js/studio-autosave.js');

const bytes=async blob=>[...new Uint8Array(await blob.arrayBuffer())];
const copy=x=>JSON.parse(JSON.stringify(x));

(async()=>{
  assert.equal(A.SCHEMA_VERSION,2);
  assert.equal(A.LEGACY_SCHEMA_VERSION,1);
  assert.equal(A.SOURCE_SCHEMA_VERSION,2);

  const importBytes=new Uint8Array([73,68,51,4,0,0,0,0,0,21,10,20,30,40,50,60]);
  const imported=new Blob([importBytes],{type:'audio/mpeg'});
  const sourceId='src-import-001';
  const base={
    schema:2,name:'Local first',cursor:4.2,zoom:2,selectionStart:2,selectionEnd:5,
    tracks:[{id:'v',name:'Voix',gain:.8,muted:false}],
    clips:[{id:'a',track:'v',name:'Source',start:1.25,trim:.5,len:3,gain:.7,muted:false,sourceId}]
  };

  const store=A.createMemoryStore();
  await store.save(base,[{
    id:sourceId,blob:imported,sourceSchema:2,mimeType:imported.type,
    originalName:'foret.mp3',origin:'phone-import',size:imported.size
  }]);
  assert.equal(store._metrics().audioWrites,1,'IMPORT doit écrire une seule source audio');

  let loaded=await store.load();
  assert.deepEqual(await bytes(loaded.audio.get(sourceId)),[...importBytes],'les octets importés doivent rester identiques');
  assert.equal(loaded.sources.get(sourceId).mimeType,'audio/mpeg');
  assert.equal(loaded.sources.get(sourceId).origin,'phone-import');

  let s=copy(base);
  s.clips[0].start=8.5;
  await store.save(s,[]);
  assert.equal(store._metrics().audioWrites,1,'MOVE ne doit écrire aucun audio');

  s=copy(s);
  s.clips[0].start=9;
  s.clips[0].trim=.75;
  s.clips[0].len=2.75;
  await store.save(s,[]);
  assert.equal(store._metrics().audioWrites,1,'TRIM ne doit écrire aucun audio');

  s=copy(s);
  const split={...s.clips[0],id:'split-right',start:10.25,trim:2,len:1.5};
  s.clips[0].len=1.25;
  s.clips.push(split);
  assert.equal(s.clips[0].sourceId,split.sourceId);
  await store.save(s,[]);
  assert.equal(store._metrics().audioWrites,1,'SPLIT ne doit écrire aucun audio');

  s=copy(s);
  const duplicate={...s.clips[0],id:'duplicate',start:12};
  s.clips.push(duplicate);
  assert.equal(duplicate.sourceId,sourceId);
  await store.save(s,[]);
  assert.equal(store._metrics().audioWrites,1,'DUPLICATE ne doit écrire aucun audio');

  s=copy(s);
  s.clips[0].gain=.35;
  await store.save(s,[]);
  assert.equal(store._metrics().audioWrites,1,'GAIN ne doit écrire aucun audio');

  s=copy(s);
  s.clips[0].muted=true;
  await store.save(s,[]);
  assert.equal(store._metrics().audioWrites,1,'MUTE ne doit écrire aucun audio');

  for(let i=0;i<10;i++){
    s=copy(s);
    s.cursor=20+i/10;
    await store.save(s,[]);
  }
  assert.equal(store._metrics().audioWrites,1,'10 AUTOSAVES sans nouvelle source ne doivent écrire aucun audio');

  const micBytes=new Uint8Array([26,69,223,163,1,2,3,4,5,6,7,8,9]);
  const micBlob=new Blob([micBytes],{type:'audio/webm;codecs=opus'});
  const micId='src-mic-001';
  s=copy(s);
  s.clips.push({id:'mic',track:'v',name:'Voix',start:30,trim:0,len:2.4,gain:1,muted:false,sourceId:micId});
  await store.save(s,[{
    id:micId,blob:micBlob,sourceSchema:2,mimeType:micBlob.type,
    originalName:'Voix',origin:'micro-recording',size:micBlob.size
  }]);
  assert.equal(store._metrics().audioWrites,2,'une nouvelle prise micro doit ajouter exactement une écriture audio');
  loaded=await store.load();
  assert.deepEqual(await bytes(loaded.audio.get(micId)),[...micBytes],'le Blob MediaRecorder doit être conservé byte-for-byte');
  assert.equal(loaded.sources.get(micId).origin,'micro-recording');

  assert.deepEqual(loaded.snapshot.clips,s.clips,'restauration: clips/positions/trims/gains doivent rester identiques');
  assert.equal(loaded.snapshot.clips.filter(c=>c.sourceId===sourceId).length,3,'une source doit pouvoir alimenter plusieurs clips');

  const legacy=A.createMemoryStore();
  const legacyBlob=new Blob([new Uint8Array([82,73,70,70,36,0,0,0,87,65,86,69])],{type:'audio/wav'});
  const legacySnapshot={
    schema:1,name:'Ancien',cursor:0,zoom:1,selectionStart:null,selectionEnd:null,
    tracks:[{id:'v',name:'Voix',gain:1,muted:false}],
    clips:[{id:'old',track:'v',name:'Ancien WAV',start:0,trim:0,len:1,gain:1,muted:false,sourceId:'legacy-wav'}]
  };
  await legacy.save(legacySnapshot,[{id:'legacy-wav',blob:legacyBlob}]);
  const legacyLoaded=await legacy.load();
  assert.equal(legacyLoaded.snapshot.schema,1,'snapshot v1 doit rester lisible');
  assert.equal(legacyLoaded.sources.get('legacy-wav').sourceSchema,1,'ancienne source WAV doit être reconnue comme v1');
  assert.deepEqual(await bytes(legacyLoaded.audio.get('legacy-wav')),[82,73,70,70,36,0,0,0,87,65,86,69]);

  const html=fs.readFileSync('studio.html','utf8');
  assert(html.includes("registerSourceBlob(f,b,{origin:'phone-import'"),'import téléphone doit enregistrer le File original');
  assert(html.includes("registerSourceBlob(blob,b,{origin:'micro-recording'"),'micro doit enregistrer le Blob MediaRecorder original');
  assert(html.includes("registerSourceBlob(data,b,{origin:'cloud-library'"),'sonothèque téléchargée doit devenir source locale');
  assert(html.includes("registerSourceBlob(blob,null,{origin:'cloud-project'"),'projet cloud chargé doit avoir une source locale sans imposer de decode eager');
  const autosave=html.slice(html.indexOf('async function runAutosave()'),html.indexOf('function markProjectDirty()'));
  assert(autosave.includes('localSources.get(id)'),'autosave doit lire la source persistante originale');
  assert(!autosave.includes('wav('),'autosave ne doit plus réencoder AudioBuffer en WAV');
  assert(html.includes("let right={...selected,id:crypto.randomUUID()"),'split doit partager sourceId par copie des métadonnées');
  assert(html.includes("let c={...selected,id:crypto.randomUUID()"),'duplicate doit partager sourceId par copie des métadonnées');

  console.log('AUDIO_WRITE_METRIC IMPORT=1; MOVE+TRIM+SPLIT+DUPLICATE+GAIN+MUTE+10_AUTOSAVES=0 additional audio writes');
  console.log('MIC_WRITE_METRIC new MediaRecorder blob=1 additional audio write');
  console.log('Studio local source model 001 tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});