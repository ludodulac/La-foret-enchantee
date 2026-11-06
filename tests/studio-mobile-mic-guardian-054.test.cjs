'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Mic=require('../js/studio-mic-guard.js');
const html=fs.readFileSync(path.join(__dirname,'../studio.html'),'utf8');
const source=html.slice(html.indexOf('function micStatus('),html.indexOf('function clickBeat('));
const ui=html.slice(html.indexOf('nav class="tools"'),html.indexOf('section class="multitrack"'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function tests(){
  assert(source.startsWith('function micStatus('));
  assert(html.includes('src="js/studio-mic-guard.js"'));
  assert(ui.includes('id="mic-choice"')&&ui.includes('id="mic-status"'));
  assert(html.includes("window.addEventListener('pagehide',exitMicroCapture)"));
  assert(html.includes("document.addEventListener('visibilitychange'"));
  assert(source.includes("StudioMicGuard.acquire(navigator.mediaDevices"));
  assert(source.includes("StudioMicGuard.audioConstraints(navigator.userAgent||'',chosen)"),'Studio must use automatic browser-aware Android capture');
  const android=Mic.audioConstraints('Mozilla/5.0 (Linux; Android 13; Redmi Note 12)','');
  assert.equal(android.echoCancellation,true,'Android must avoid CAMCORDER preset forcing internal mic');
  assert.equal(android.noiseSuppression,false);
  assert.equal(android.autoGainControl,false);
  assert(!('deviceId' in android),'Automatic mode delegates lavalier routing to Android');
  const forced=Mic.audioConstraints('Android 13','usb-cravate-id');
  assert.deepEqual(forced.deviceId,{exact:'usb-cravate-id'},'Manual fallback still available');
  const desktop=Mic.audioConstraints('Mozilla/5.0 (X11; Linux x86_64)','');
  assert.equal(desktop.echoCancellation,false,'Preserve raw recording on desktop');
  console.log('ANDROID_CAMERA_STYLE_AUTO_MIC_ROUTING PASS');
  assert(source.indexOf('preparePlayback(recStart)')<source.indexOf('StudioMicGuard.acquire('),
    'Source decoding must finish or time out before microphone capture');
  assert(source.indexOf('StudioMicGuard.release(stream)')<source.indexOf('await ctx.decodeAudioData'),
    'Microphone must be freed BEFORE decoding or saving final recording');
  assert(source.includes('if(!blob.size)throw Error('),'Empty recordings must report their cause');
  assert(source.includes('startPreparedPlayback(recStart,true,'),'Overdubbing playback retained');
  assert(source.includes("recorder.start(1000)")===false,'Recorder is referenced by a local variable, not a stale global');
  assert(source.includes('activeRecorder.start(1000)'),'Recorder must start even without playable clips');
  assert(source.includes('if(ctx.state===\'running\')'),'Level monitor must not gate recording');
  assert(source.includes("ctx.suspend()"),'Release Web Audio to reduce Android microphone contention');
  assert(html.includes("if(recording||micStarting)return msg('Arrête l’enregistrement"),'Project navigation blocked while mic pending');
  console.log('MOBILE_MIC_LIFECYCLE_STRUCTURAL PASS');

  const stopped=[];
  const makeStream=(id)=>({
    getAudioTracks(){return [{id}]},
    getTracks(){return [{stop(){stopped.push(id)}}]}
  });
  const direct=makeStream('direct');
  assert.equal(await Mic.acquire({getUserMedia:async()=>direct},{audio:true},{timeoutMs:1000}),direct);
  Mic.release(direct);
  assert.deepEqual(stopped,['direct']);
  const denied=Error('Permission denied');denied.name='NotAllowedError';
  await assert.rejects(()=>Mic.acquire({getUserMedia:async()=>{throw denied}},{audio:true},{timeoutMs:1000}),/Permission denied/);
  assert.match(Mic.errorMessage(denied),/Autorise le micro/);
  console.log('MIC_ACQUIRE_AND_DENIED_PERMISSION PASS');

  let deliverLate;
  const pending=new Promise(resolve=>{deliverLate=resolve});
  await assert.rejects(
    ()=>Mic.acquire({getUserMedia:()=>pending},{audio:true},{timeoutMs:12}),
    err=>err.code==='MIC_TIMEOUT'
  );
  const late=makeStream('late');
  deliverLate(late);
  await delay(10);
  assert(stopped.includes('late'),'Late granted permission must release the actual Android mic');
  console.log('LATE_MIC_PERMISSION_NO_LEAK PASS');

  let cancel=true, delivered=makeStream('cancelled');
  await assert.rejects(
    ()=>Mic.acquire({getUserMedia:async()=>delivered},{audio:true},{timeoutMs:1000,cancelled:()=>cancel}),
    err=>err.code==='MIC_CANCELLED'
  );
  assert(stopped.includes('cancelled'));
  console.log('CANCELLED_MIC_NO_LEAK PASS');

  const empty={getAudioTracks:()=>[],getTracks:()=>[{stop(){stopped.push('empty')}}]};
  await assert.rejects(()=>Mic.acquire({getUserMedia:async()=>empty},{audio:true},{timeoutMs:1000}),/Aucune piste audio/);
  assert(stopped.includes('empty'));
  for(const [name,expected] of [['NotReadableError','Micro occupé'],['OverconstrainedError','Micro choisi'],['NotFoundError','Aucun micro']]){
    const err=new Error(name);err.name=name;assert(Mic.errorMessage(err).includes(expected),name)
  }
  console.log('NO_AUDIO_TRACK_AND_DEVICE_SELECTION_ERRORS PASS');
  console.log('STUDIO_ANDROID_MIC_DICTATION_054 ALL PASS');
}
tests().catch(e=>{console.error(e);process.exitCode=1});
