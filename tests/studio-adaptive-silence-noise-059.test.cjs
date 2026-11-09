'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Silence=require('../js/studio-silence-editor.js');
const html=fs.readFileSync('studio.html','utf8');

function audio(seconds=18,sr=8000){
  const pcm=new Float32Array(Math.floor(seconds*sr));
  const noise=(t)=>.026*Math.sin(2*Math.PI*141*t)+.008*Math.sin(2*Math.PI*389*t);
  for(let i=0;i<pcm.length;i++)pcm[i]=noise(i/sr);
  const voice=(a,b,level=.15)=>{
    for(let i=Math.round(a*sr);i<Math.round(b*sr);i++){
      let t=i/sr;
      pcm[i]+=level*(.7*Math.sin(2*Math.PI*192*t)+.3*Math.sin(2*Math.PI*350*t));
    }
  };
  const buffer={sampleRate:sr,length:pcm.length,duration:seconds,numberOfChannels:1,getChannelData:()=>pcm};
  return{voice,pcm,buffer,sr};
}
const overlaps=(p,a,b)=>p.start<b&&p.end>a;
async function main(){
  assert(Silence.ANALYSIS_VERSION>=2,'A new algorithm must invalidate previously cached silence decisions');
  const {voice,pcm,buffer,sr}=audio();
  voice(0,3);voice(8,12);voice(15,18);
  // Two isolated noises that used to split silence into false fragments.
  voice(4.8,4.84,.09);voice(6.2,6.24,.09);
  const original=pcm.slice();
  const edit=await Silence.analyze(buffer,0,18,'natural');
  assert.equal(edit.analysisVersion,Silence.ANALYSIS_VERSION);
  assert.equal(edit.pauses.length,2,'Detect both long noisy gaps, despite tiny isolated microphone ticks');
  assert(Math.abs(edit.pauses[0].start-3)<.16,'First long pause begins after voice');
  assert(Math.abs(edit.pauses[0].end-8)<.16,'First long pause lasts across multiple hiss ticks');
  assert(Math.abs(edit.pauses[1].start-12)<.16);
  assert(Math.abs(edit.pauses[1].end-15)<.16);
  const clip={id:'A',sourceId:'original-take',track:'voice',start:10,trim:0,len:18,gain:.72,silenceEdit:edit};
  const shortened=Silence.duration(clip);
  assert(shortened<11.2&&shortened>10.1,'5s and 3s gaps reduce to 0.25s each');
  assert.equal(clip.sourceId,'original-take');
  assert.deepEqual(pcm,original,'Analysis and silence edits never alter the original PCM');
  console.log('AMBIENT_MIC_HISS_AND_ISOLATED_TICKS_REMOVED PASS');

  // Important whispered word in an otherwise long pause must remain audible.
  const whisper=audio(12);
  whisper.voice(0,2,.12);
  whisper.voice(5.2,5.56,.065);
  whisper.voice(9.5,12,.12);
  const whisperEdit=await Silence.analyze(whisper.buffer,0,12,'natural');
  assert(whisperEdit.pauses.length>=2,'Two silence portions detected around the quiet word');
  assert(whisperEdit.pauses.every(p=>p.cutEnd<=5.2||p.cutStart>=5.56),'Quiet word survives, not mistaken for room noise');
  console.log('LOW_VOLUME_WORD_WITHIN_LONG_PAUSE_PRESERVED PASS');

  // Ambiguous constant room noise with no voice must not become a false cut.
  const room=audio(6);
  const roomEdit=await Silence.analyze(room.buffer,0,6,'natural');
  assert.equal(roomEdit.pauses.length,0,'Do not erase audio when background and voice cannot be distinguished');
  console.log('CONSERVATIVE_WHEN_ALL_AUDIO_IS_NOISE PASS');

  const dynamic=await Silence.analyze(buffer,0,18,'dynamic');
  assert(dynamic.pauses.length>=2);
  assert(Silence.duration({...clip,silenceEdit:dynamic})<=shortened+.05,'Dynamic preserves no more silence than natural');
  const singleRestored=JSON.parse(JSON.stringify(edit));
  singleRestored.pauses[0].reduced=false;
  const onlySecond=Silence.duration({...clip,silenceEdit:singleRestored});
  assert(onlySecond>shortened+3,'User can restore one long ambient gap independently');
  const a3={track:'voice',id:'3',start:28,len:3},a4={track:'voice',id:'4',start:31,len:2},other={track:'music',id:'B',start:28,len:8};
  clip.len=shortened;
  const n=Silence.ripple([clip,a3,a4,other],clip,28,shortened-18);
  assert.equal(n,2);assert(Math.abs(a3.start-(clip.start+shortened))<.001);
  assert.equal(other.start,28);
  console.log('RESTORE_ONE_GAP_AND_RIPPLE_WITHOUT_ALTERING_OTHER_TRACK PASS');

  // Processed projects need a genuine re-analysis: otherwise the older
  // empty result would be silently reused and the user's screenshot unchanged.
  assert(html.includes('clip.silenceEdit.analysisVersion===StudioSilenceEditor.ANALYSIS_VERSION'));
  assert(html.includes('const restoredBefore='),'Existing manually restored pauses remain protected');
  assert(html.includes('pause.reduced=false;'),'Previous manual choices survive updated analysis');
  const assetVersion=html.split('studio-silence-editor.js?v=');assert(assetVersion.length===2&&parseInt(assetVersion[1],10)>=59,'Android must fetch the updated detector');
  console.log('PREVIOUSLY_PROCESSED_PROJECT_REANALYZED_ON_REOPEN PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});
