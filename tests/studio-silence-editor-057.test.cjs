'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Silence=require('../js/studio-silence-editor.js');
const Export=require('../js/studio-export-core.js');
const Store=require('../js/studio-autosave.js');
const html=fs.readFileSync('studio.html','utf8');
async function main(){
  const rate=1000,seconds=8,data=new Float32Array(rate*seconds);
  function voice(from,to,amp){data.fill(amp,Math.round(from*rate),Math.round(to*rate))}
  voice(0,2,.2);voice(3.2,5,.4);voice(6,8,.5);
  const buffer={sampleRate:rate,length:data.length,duration:seconds,numberOfChannels:1,getChannelData(){return data}};
  const edit=await Silence.analyze(buffer,0,8,'natural');
  assert.equal(edit.pauses.length,2,'Two interior silent regions detected');
  assert(Math.abs(edit.pauses[0].start-2)<.04);
  assert(Math.abs(edit.pauses[0].end-3.2)<.04);
  assert(Math.abs(edit.pauses[1].start-5)<.04);
  assert(Math.abs(edit.pauses[1].end-6)<.04);
  const c={id:'C2',track:'A',sourceId:'original',start:10,trim:0,len:8,gain:.7,muted:false,silenceEdit:edit};
  const spans=Silence.segments(c);
  const saved=Silence.duration(c);
  assert.equal(spans.length,3,'One source, three contiguous visible spans');
  assert(Math.abs(saved-6.3)<.06,'Two long pauses shortened to 0.25 each');
  assert(spans.every(x=>x.trim>=0&&x.at>=0&&x.len>0));
  assert(Math.abs(spans[1].at-spans[0].len)<.00001,'Output segments glued');
  assert(Math.abs(spans[2].at-(spans[0].len+spans[1].len))<.00001);
  console.log('SILENCE_DETECTION_NATURAL_025S PASS');

  let third={id:'C3',track:'A',start:18,len:2},fourth={id:'C4',track:'A',start:20,len:2},other={id:'B1',track:'B',start:18,len:7};
  c.len=saved;
  const shift=Silence.ripple([c,third,fourth,other],c,18,saved-8);
  assert.equal(shift,2);assert(Math.abs(third.start-(10+c.len))<.001);
  assert(Math.abs(fourth.start-(12+c.len))<.001);
  assert.equal(other.start,18,'Other track stays exactly in place');
  console.log('RIPPLE_ONLY_LATER_CLIPS_IN_SAME_TRACK PASS');

  let restored=JSON.parse(JSON.stringify(edit));
  restored.pauses[0].reduced=false;
  const restoredDuration=Silence.duration(c,restored);
  assert(Math.abs(restoredDuration-saved-(edit.pauses[0].cutEnd-edit.pauses[0].cutStart))<.00001);
  const beforeEnd=c.start+c.len;
  const oldDuration=c.len;c.silenceEdit=restored;c.len=restoredDuration;
  Silence.ripple([c,third,fourth,other],c,beforeEnd,c.len-oldDuration);
  assert(Math.abs(third.start-(c.start+c.len))<.001);
  assert.equal(other.start,18);
  restored.pauses[0].reduced=true;
  assert(Math.abs(Silence.duration(c,restored)-saved)<.00001);
  console.log('RESTORE_SINGLE_PAUSE_NOT_ALL_AND_RIPPLE_REVERSE PASS');

  // Processing is reversible: the source buffer and sourceId never change.
  assert.equal(c.sourceId,'original');
  assert.equal(c.trim,0);
  const orig=Silence.slice({...c,len:saved,silenceEdit:edit},0,3);
  const right=Silence.slice({...c,len:saved,silenceEdit:edit},3,saved);
  assert.equal(orig.sourceId,'original');assert.equal(right.sourceId,'original');
  assert(Math.abs(orig.len+right.len-saved)<.02);
  assert.equal(orig.gain,.7);assert.equal(right.gain,.7);
  assert(Silence.segments(orig).length>0&&Silence.segments(right).length>0);
  console.log('CUT_ALREADY_PROCESSED_CLIP_RETAINS_SOURCE_AND_VOLUME PASS');

  const store=Store.createMemoryStore();
  await store.initializeLibrary();
  const audio={id:'original',blob:new Blob([new Uint8Array([1,2,3,4])],{type:'audio/webm'}),origin:'test'};
  const snap={schema:Store.SCHEMA_VERSION,name:'Conte',cursor:0,zoom:1,tracks:[{id:'A',name:'Voix',gain:1,muted:false}],clips:[{...c,silenceEdit:edit}]};
  await store.createProject({id:'P',name:'Conte',snapshot:snap,newSources:[audio]});
  const reopened=await store.openProject('P');
  assert.equal(reopened.snapshot.clips[0].silenceEdit.pauses.length,2);
  assert.equal(reopened.audio.size,1,'No duplicate audio file created for processing');
  const gc=await store.cleanupUnusedAudio([]);
  assert(gc.safe&&gc.removedSourceIds.length===0,'Original remains referenced after cleanup');
  assert.equal((await store.getLocalStorageStats()).sourceCount,1);
  console.log('NONDSTRUCTIVE_STORAGE_NO_EXTRA_WAV_AND_AUTOSAVE PASS');

  // Real exported PCM must skip the middle of each pause, without accelerating speech.
  const sr=Export.SAMPLE_RATE,pcm=new Float32Array(sr*seconds);
  pcm.fill(.2,0,Math.floor(2*sr));
  pcm.fill(.4,Math.floor(3.2*sr),Math.floor(5*sr));
  pcm.fill(.5,Math.floor(6*sr));
  const outClip={...c,start:0,len:saved,silenceEdit:edit,trim:0,gain:1,trackGain:1,trackMuted:false,buffer:{duration:seconds,length:pcm.length,numberOfChannels:1,sampleRate:sr,getChannelData(){return pcm}}};
  outClip.slices=Silence.clipSlicesForExport(outClip);
  const p=Export.validatePlan([outClip],0,saved,{output:'memory'});
  const wav=await Export.streamWavCooperative([outClip],p);
  const bytes=await wav.arrayBuffer(),view=new DataView(bytes);
  assert.equal(wav.size,44+p.frames*4);
  const sample=t=>view.getInt16(44+Math.floor(t*sr)*4,true)/32767;
  assert(Math.abs(sample(1)-.2)<.02);
  assert(Math.abs(sample(2.13))<.02,'Short silence retained');
  assert(Math.abs(sample(2.4)-.4)<.02,'Second spoken section moved earlier intact');
  assert(Math.abs(sample(saved-.4)-.5)<.02);
  console.log('WAV_EXPORT_OF_VIRTUAL_SEGMENTS_REAL_PCM PASS');

  // Integration contract: no audio duplication or destructive handling.
  assert(html.includes('id="silence-open"'));
  for(const name of ['silence-panel','silence-list','silence-mode','silence-preview-all','silence-apply','silence-cancel'])assert(html.includes('id="'+name+'"'));
  for(const f of ['StudioSilenceEditor.analyze(','StudioSilenceEditor.ripple(','StudioSilenceEditor.segments(c)','StudioSilenceEditor.slice(','StudioSilenceEditor.clipSlicesForExport(c)'])assert(html.includes(f),'Missing '+f);
  assert(html.includes('Silences ajustés · '));
  assert(html.includes("if(JSON.stringify(clip.silenceEdit||null)"),'No-op operations do not create history');
  assert(html.includes('stopSilencePreview();checkpoint();'),'One Undo snapshot for whole ripple');
  assert(html.includes('...(c.silenceEdit?{silenceEdit:c.silenceEdit}:{})'),'Edits persist in autosave');
  assert(!/registerSourceBlob\([^)]*silence|silence.*new Blob/.test(html));
  console.log('SILENCE_EDITOR_UI_PREVIEW_APPLY_UNDO_CONTRACT PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1});
