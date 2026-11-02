const assert=require('node:assert/strict');
const fs=require('fs');
const A=require('../js/studio-autosave.js');
const Wave=require('../js/studio-waveform-core.js');
(async()=>{
  assert.equal(A.DB_VERSION,3,'must not migrate user projects');
  const pointer={version:1,takeId:'rec-long-preserved',rate:48000,frames:300*48000};
  const blob=new Blob([JSON.stringify(pointer)],{type:'application/vnd.studio.wav-opfs+json'});
  assert(blob.size<256,'must store a tiny pointer, not 5 minute WAV in IndexedDB');
  const src={id:'src-long',blob,sourceSchema:A.SOURCE_SCHEMA_VERSION,origin:'opfs-wav-long',
    mimeType:blob.type,originalName:'studio-rec-long-preserved.wav',size:blob.size};
  const waveform={version:Wave.WAVEFORM_VERSION,peakRate:Wave.PEAK_RATE,duration:300,
    peaks:new Uint8Array(300*Wave.PEAK_RATE).fill(128)};
  const track={id:'voice',name:'VOIX',type:'voice',gain:1,muted:false,color:'#785cff'};
  const clip={id:'clip-long',sourceId:'src-long',track:'voice',name:'Voix',start:0,trim:0,len:300,gain:1,muted:false};
  const snapshot={schema:A.SCHEMA_VERSION,name:'Mon conte',cursor:0,zoom:1,
    selectedRecordTrackId:'voice',selectionStart:null,selectionEnd:null,tracks:[track],clips:[clip]};
  const store=A.createMemoryStore();await store.initializeLibrary();
  await store.createProject({id:'my-project',name:'Mon conte',snapshot,newSources:[src]});
  await store.saveWaveform('src-long',waveform);
  const before=store._metrics().audioWrites;
  const initial=await store.openProject('my-project');
  assert.equal(initial.snapshot.clips[0].len,300);
  assert.equal(initial.sources.get('src-long').origin,'opfs-wav-long');
  assert.equal((await initial.audio.get('src-long').text()),JSON.stringify(pointer));
  assert.equal(initial.waveforms.get('src-long').duration,300);
  const next=JSON.parse(JSON.stringify(initial.snapshot));
  next.clips[0].trim=60;next.clips[0].len=90;next.clips[0].start=45;
  next.clips.push({...next.clips[0],id:'clip-long-copy',start:200});
  await store.saveProject('my-project',next,[]);
  const reopened=await store.openProject('my-project');
  assert.equal(reopened.snapshot.clips.length,2);
  assert.equal(reopened.snapshot.clips[0].trim,60);
  assert.equal(reopened.snapshot.clips[0].start,45);
  assert.equal(reopened.waveforms.get('src-long').duration,300);
  assert.equal(store._metrics().audioWrites,before,'moves/cuts must not copy WAV data');
  // The actual OPFS source remains independently stored, not deleted by project edits.
  const html=fs.readFileSync('studio.html','utf8');
  assert.match(html,/origin:isLong\?'opfs-wav-long':'opfs-wav-short'/);
  assert.match(html,/longIndexForSource/);
  assert.match(html,/StudioWavLongPlayback\.start\(ctx,plan/);
  assert.match(html,/return exportLongRange\(start,end,label,diagnostic\)/);assert.match(html,/StudioWavLongMix\.streamToOpfs\(mixInputs,plan/);
  console.log('STUDIO-WAV-LONG-023: OPFS pointer autosave, reload, split/move, waveform, no PCM copy PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
