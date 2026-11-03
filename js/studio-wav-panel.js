(function(root){
'use strict';
const Core=root.StudioRecordingWavCore,Bridge=root.StudioWavBridge,Long=root.StudioWavLongSource;
function mount({isStudioRecording=()=>false,isProjectOpen=()=>true,onImportTake=null,onStateChange=()=>{},onStatus=()=>{},onProgress=()=>{},onPeaks=()=>{},onStage=()=>{}}={}){
  const $=id=>document.getElementById(id);
  const panel=$('studio-wav-panel'),open=$('studio-wav-open');
  if(!panel||!open||!Core||!Bridge||!Long)throw Error('Panneau Studio WAV introuvable');
  const ui={close:$('studio-wav-close'),start:$('studio-wav-start'),stop:$('studio-wav-stop'),
    select:$('studio-wav-saved'),recover:$('studio-wav-recover'),listen:$('studio-wav-listen'),
    export:$('studio-wav-export'),download:$('studio-wav-download'),attach:$('studio-wav-attach'),player:$('studio-wav-player'),
    time:$('studio-wav-time'),status:$('studio-wav-status')};
  let ac=null,mic=null,inputNode=null,node=null,gain=null,take=null,writeChain=Promise.resolve();
  let pending=0,seq=0,failed=null,starting=false,stopping=false,attaching=false,ack=null,timer=null,startAt=null;
  let recovered=null,previewUrl=null,downloadUrl=null,captureGeneration=0,cancelPendingOpen=null,nonSilentPcm=false,validPcmSeconds=0,mutedCaptureWarning=false,lastCaptureStageAt=0,micTrackEnded=false,noPcmWarning=false;
  const report=message=>{ui.status.textContent=message;if(panel.hidden&&(/impossible|incomplet|interrompu|stockage trop lent|Prise enregistrée et ajoutée/i.test(message)))onStatus(message)};
  const clock=seconds=>{const n=Math.max(0,Math.floor(seconds));ui.time.textContent='⏱ '+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
  // Low-cost waveform for the live editor. Audio continues to be stored as
  // untouched PCM WAV fragments; only small numeric peaks reach the UI.
  function visualizeChunk(pcm,rate){
    const samples=new DataView(pcm.buffer,pcm.byteOffset,pcm.byteLength);
    const step=Math.max(1,Math.round(rate/35)),count=pcm.byteLength/2,peaks=[];
    validPcmSeconds+=count/rate;
    for(let i=0;i<count;i+=step){
      let peak=0;
      for(let j=i;j<Math.min(count,i+step);j++){
        const value=Math.abs(samples.getInt16(j*2,true));
        if(value>3)nonSilentPcm=true;
        peak=Math.max(peak,value/32768);
      }
      peaks.push(peak);
    }
    try{onPeaks(peaks)}catch(e){console.warn('Waveform only',e)}
    if(!nonSilentPcm&&validPcmSeconds>=3&&!mutedCaptureWarning){
      mutedCaptureWarning=true;
      onStage('warning','⚠ Le microphone ne transmet aucun son. Autre application ou micro coupé ?');
    }else if(nonSilentPcm&&mutedCaptureWarning){
      mutedCaptureWarning=false;
      onStage('recording','● Signal audio détecté : enregistrement WAV en cours.');
    }
  }
  const stopClock=()=>{if(timer!==null)clearInterval(timer);timer=null;if(startAt!==null)clock((performance.now()-startAt)/1000);startAt=null};
  const running=()=>!!ac;
  const bounded=(promise,ms,label)=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error(label+' : délai dépassé après '+Math.round(ms/1000)+' s')),ms);
    Promise.resolve(promise).then(v=>{clearTimeout(timeout);resolve(v)},e=>{clearTimeout(timeout);reject(e)});
  });
  const rootDir=async()=>{if(!navigator.storage?.getDirectory)throw Error('Enregistrement local OPFS indisponible');return navigator.storage.getDirectory()};
  const stage=(kind,message)=>{
    const now=performance.now();
    const elapsed=lastCaptureStageAt?Math.round(now-lastCaptureStageAt):0;
    lastCaptureStageAt=now;
    // Only timings and status, NEVER the microphone content, are reported.
    try{onStage(kind,message+(elapsed?' ('+elapsed+' ms)':''))}catch(e){console.warn('Studio WAV status',e)}
  };
  const releaseMicImmediately=()=>{
    try{mic?.getTracks().forEach(track=>track.stop())}catch(e){console.warn('Studio WAV stop microphone',e)}
  };
  const clearPlayer=()=>{ui.player.pause();ui.player.removeAttribute('src');ui.player.load();ui.player.hidden=true;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null};
  const clearDownload=()=>{ui.download.hidden=true;ui.download.removeAttribute('href');ui.download.removeAttribute('download');ui.download.textContent='⬇ TÉLÉCHARGER LE WAV';if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null};
  const buttons=()=>{ui.start.disabled=running()||starting||stopping||attaching;ui.stop.disabled=!running()||starting||stopping;ui.close.disabled=running()||starting||stopping||attaching;ui.recover.disabled=running()||starting||stopping||attaching;ui.listen.disabled=running()||starting||stopping||attaching||!recovered||recovered.interrupted;ui.export.disabled=running()||starting||stopping||attaching||!recovered||recovered.interrupted;ui.attach.disabled=running()||starting||stopping||attaching||!recovered||recovered.interrupted||!onImportTake||recovered.seconds>300};
  async function release(){
    stopClock();
    releaseMicImmediately();
    try{inputNode?.disconnect()}catch{}
    try{node?.disconnect()}catch{}
    try{gain?.disconnect()}catch{}
    const toClose=ac;
    // Clear state synchronously before awaiting browser/audio teardown.
    inputNode=null;node=null;gain=null;mic=null;ac=null;take=null;
    try{if(toClose)await bounded(toClose.close(),2500,'Fermeture du contexte audio')}catch(e){
      console.warn('Studio WAV audio context released with delayed close',e)
    }
    buttons();
  }
  async function listTakes(preferred){
    const items=await Core.listTakes(await rootDir()),selected=preferred||ui.select.value;
    ui.select.replaceChildren(new Option(items.length?'Choisir une prise ('+items.length+')':'Aucune prise trouvée',''));
    for(const item of items)ui.select.add(new Option(item.id+(item.readable?'':' — métadonnées illisibles'),item.id));
    if(items.some(x=>x.id===selected))ui.select.value=selected;
    else if(items.length)ui.select.value=items[0].id;
    return items;
  }
  async function recover(){
    if(running()||stopping||attaching)return;
    clearPlayer();clearDownload();recovered=null;buttons();
    try{
      const id=ui.select.value;
      if(!id)throw Error('Choisis une prise dans la liste');
      const r=await Core.recoverTake(await rootDir(),id);
      recovered=r;clock(r.seconds);buttons();
      report(r.interrupted?'Prise partiellement récupérée : '+r.problem+' ; fragments conservés.':
        'Prise retrouvée : '+r.seconds.toFixed(2)+' s, '+r.segments+' fragments. '+(r.seconds<=300?'Ajout au montage possible (lecture progressive au-delà de 30 s).':'Prise de plus de 5 minutes conservée dans OPFS, montage à vérifier.'));
    }catch(e){report('Récupération impossible : '+e.message)}
  }
  async function stop(){
    if(!running()||stopping)return;
    stopping=true;onStateChange('finalizing');buttons();stopClock();report('Arrêt et sauvegarde des fragments en cours…');
    const savedId=take?.meta?.id;
    let recordingCompleted=false,receivedSignal=false,stopProblem=null;
    try{
      const stoppedAck=node?bounded(new Promise(resolve=>{
        ack=resolve;
        node.port.postMessage({type:'stop'});
      }),3500,'Accusé d’arrêt WAV'):Promise.resolve();
      // Crucial Android invariant: stop using the hardware microphone on the
      // STOP tap, not after OPFS disk writes, decoding or user-interface work.
      releaseMicImmediately();
      await stoppedAck;
      await bounded(writeChain,10000,'Sauvegarde des fragments WAV');
      if(failed)throw failed;
      if(seq===0||validPcmSeconds<.15)throw Error('Microphone actif sans données PCM');
      receivedSignal=nonSilentPcm;
      recordingCompleted=true;
      report('Prise conservée sur le téléphone ('+seq+' fragments).');
    }catch(e){stopProblem=e?.message||String(e);report('Arrêt incomplet : '+stopProblem+'. Fragments déjà enregistrés conservés.')}
    finally{
      releaseMicImmediately();
      await release();stopping=false;
      try{await listTakes(savedId);if(savedId){ui.select.value=savedId;await recover()}}catch(e){report('Prise conservée ; liste indisponible : '+e.message)}
      buttons();
      try{
        if(recordingCompleted&&recovered&&!recovered.interrupted&&!receivedSignal&&recovered.seconds>=2){
          report('Micro muet : prise WAV conservée mais aucun son reçu. Non ajoutée automatiquement.');

        }else if(recordingCompleted&&recovered&&!recovered.interrupted&&recovered.seconds<=300&&isProjectOpen()&&onImportTake){
          await attach(true);
        }
      }finally{onStateChange('idle')}
      if(recordingCompleted&&recovered&&!recovered.interrupted&&!receivedSignal&&recovered.seconds>=2)
        onStage('silence','⚠ AUCUN SON REÇU DU MICRO : prise conservée, pas ajoutée au montage.');
      else if(stopProblem)
        onStage('error','⚠ ENREGISTREMENT INCOMPLET : '+stopProblem+'. Microphone libéré.');
    }
  }
  function cancelStart(){
    if(!starting)return false;
    captureGeneration++;
    cancelPendingOpen?.();
    stage('starting','Annulation de la demande de microphone…');
    return true;
  }
  async function start(){
    if(running()||starting||stopping||attaching)return false;
    if(isStudioRecording()){report('Arrête d’abord l’enregistrement normal du Studio.');return false}
    if(!isProjectOpen()){report('Ouvre d’abord un projet Studio.');return false}
    clearPlayer();clearDownload();recovered=null;writeChain=Promise.resolve();pending=0;seq=0;failed=null;
    nonSilentPcm=false;validPcmSeconds=0;mutedCaptureWarning=false;micTrackEnded=false;noPcmWarning=false;lastCaptureStageAt=performance.now();
    const generation=++captureGeneration;
    const checkOpen=()=>{if(generation!==captureGeneration)throw Error('Microphone interrompu lors du changement d’application')};
    const canceled=new Promise((_,reject)=>{cancelPendingOpen=()=>reject(Error('Microphone libéré : changement d’application'))});
    // A hard TOTAL budget, not a separate 8+10+7-second wait for each stage:
    // Android must never get trapped indefinitely in a microphone spinner.
    const openingDeadline=performance.now()+9000;
    const wait=(promise,ms,label)=>{
      const remaining=Math.max(100,Math.min(ms,openingDeadline-performance.now()));
      return Promise.race([bounded(promise,remaining,label),canceled]);
    };
    starting=true;onStateChange('starting');buttons();
    let failure=null;
    try{
      const AC=root.AudioContext||root.webkitAudioContext;
      if(!AC)throw Error('Web Audio indisponible');
      stage('starting','Préparation du moteur audio…');
      ac=new AC();
      // Chrome's Web Audio autoplay policy needs resume() while the REC tap
      // is still a user activation, BEFORE any permission or network await.
      const captureResume=ac.resume();
      await wait(ac.audioWorklet.addModule('js/studio-recording-wav-worklet.js'),8000,'Préparation audio');
      await wait(captureResume,4000,'Activation audio');
      checkOpen();
      // Verify local capture storage before holding the microphone. A slow
      // OPFS initialization must never monopolize Android's input device.
      stage('starting','Vérification du stockage des prises…');
      await wait(rootDir(),5000,'Accès stockage local');
      checkOpen();
      stage('starting','Demande d’accès au microphone…');
      const request=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      // Browsers cannot abort getUserMedia itself. If the user leaves the tab or
      // the request times out, stop any stream delivered later immediately.
      request.then(stream=>{
        if(generation!==captureGeneration)stream.getTracks().forEach(track=>track.stop());
      },()=>{});
      mic=await wait(request,10000,'Ouverture du microphone');
      checkOpen();
      const activeTrack=mic.getAudioTracks()[0];
      if(!activeTrack||activeTrack.readyState!=='live')throw Error('Microphone ouvert sans piste audio active');
      if(activeTrack.muted)stage('warning','Microphone ouvert mais déjà coupé par Android ou le navigateur.');
      activeTrack.addEventListener('mute',()=>{
        stage('warning','Le système a coupé le microphone (conflit possible avec une autre application).');
      });
      activeTrack.addEventListener('unmute',()=>{
        stage('recording','Le signal microphone est de nouveau accessible.');
      });
      activeTrack.addEventListener('ended',()=>{
        micTrackEnded=true;
        if(running()&&!stopping)void stop();
      });
      stage('starting','Initialisation des fragments WAV…');
      const id='rec-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
      take=await wait(Core.createTake(await rootDir(),{id,sampleRate:ac.sampleRate}),7000,'Stockage local WAV');
      checkOpen();
      node=new AudioWorkletNode(ac,'studio-recording-wav',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      gain=ac.createGain();gain.gain.value=0;
      node.port.onmessage=e=>{
        if(e.data?.type==='stopped'){ack?.();return}
        if(e.data?.type!=='pcm'||failed)return;
        const pcm=new Uint8Array(e.data.bytes),index=seq++;
        visualizeChunk(pcm,ac.sampleRate);
        pending++;
        if(pending>5){failed=Error('Stockage trop lent');stop();return}
        writeChain=writeChain.then(()=>Core.appendChunk(take,index,pcm)).catch(err=>{failed=err;stop()}).finally(()=>pending--);
      };
      inputNode=ac.createMediaStreamSource(mic);inputNode.connect(node);node.connect(gain).connect(ac.destination);
      startAt=performance.now();clock(0);
      timer=setInterval(()=>{
        if(startAt===null)return;
        const sec=(performance.now()-startAt)/1000;
        clock(sec);
        try{onProgress(sec)}catch(e){console.warn('Recording clock only',e)}
        // A running timer does not prove that Android is delivering audio.
        // Quit a dead AudioWorklet instead of holding the mic indefinitely.
        if(sec>=4&&validPcmSeconds<.2&&!noPcmWarning){
          noPcmWarning=true;
          stage('warning','Aucune donnée audio du moteur après '+Math.floor(sec)+' s.');
        }
        if(sec>=7&&validPcmSeconds<.2&&!stopping){
          failed=Error('Aucune donnée audio : moteur audio bloqué');
          stage('error','⚠ AUCUN AUDIO REÇU : le Studio libère le microphone.');
          void stop();
        }
      },120);
      onStateChange('recording');
      stage('recording','● Enregistrement WAV actif.');
      report('● Enregistrement WAV en cours — fragments sauvegardés chaque seconde.');
    }catch(e){
      failure=e?.message||String(e);
      if(generation===captureGeneration)captureGeneration++;
      report(/Microphone libéré : changement d’application/.test(failure)?'Ouverture du microphone annulée.':'Impossible d’utiliser le microphone : '+failure);
      await release();
    }
    cancelPendingOpen=null;
    starting=false;if(!running())onStateChange('idle');buttons();
    if(failure&&!/Microphone libéré : changement d’application/.test(failure))
      stage('error','⚠ MICROPHONE INDISPONIBLE — '+failure+'. Ferme les applications utilisant le micro.');
    else if(failure)
      stage('starting','Ouverture annulée : aucun enregistrement en cours.');
    return running();
  }
  async function listen(){
    if(running()||!recovered)return;
    clearPlayer();
    try{
      const result=await Core.previewWav(recovered);
      previewUrl=URL.createObjectURL(result.blob);ui.player.src=previewUrl;ui.player.hidden=false;
      report('Lecture des '+result.seconds.toFixed(1)+' premières secondes (30 s maximum).');
      try{await ui.player.play()}catch{report('Lecture prête : utilise le lecteur.')}
    }catch(e){report('Écoute impossible : '+e.message)}
  }
  async function prepareDownload(){
    if(running()||!recovered)return;
    clearDownload();report('Préparation du WAV complet…');
    try{
      const blob=await Core.completeSmallWav(recovered,{maxSeconds:300});
      downloadUrl=URL.createObjectURL(blob);ui.download.href=downloadUrl;
      ui.download.download='studio-'+ui.select.value+'.wav';ui.download.hidden=false;
      report('WAV complet prêt : appuie sur TÉLÉCHARGER LE WAV.');
    }catch(e){report('Export limité à 5 minutes / 32 Mio : '+e.message+'. Prise locale conservée.')}
  }
  async function attach(automatic=false){
    if(!onImportTake||!recovered||recovered.interrupted||recovered.seconds>300||running()||stopping||attaching)return;
    if(!isProjectOpen()){report('Ouvre un projet avant d’ajouter la prise.');return}
    attaching=true;buttons();
    report('Préparation de la prise pour le montage…');
    try{
      const isLong=recovered.seconds>Bridge.MAX_ATTACH_SECONDS;
      const item=isLong?{...(await Long.prepare(recovered,{onProgress:p=>{
        report('Préparation de la forme d’onde : '+Math.round(p*100)+' %');
      }})),kind:'opfs-long'}:await Bridge.makeShortClipSource(recovered);
      await onImportTake(item);
      report((automatic?'Prise enregistrée et ajoutée':'Prise ajoutée')+' à la piste active ✓ · '+item.seconds.toFixed(1)+' s. '+(isLong?'Lecture progressive, export du montage long à venir.':'')+' Le WAV source reste récupérable.');
    }catch(e){report('Prise conservée mais ajout au montage impossible : '+e.message)}
    finally{attaching=false;buttons()}
  }
  open.onclick=async()=>{
    if(isStudioRecording()){report('Arrête d’abord l’enregistrement en cours.');return}
    panel.hidden=false;clearPlayer();clearDownload();
    try{await listTakes();report('Prises WAV locales : sélectionne une prise, puis RETROUVER. Jusqu’à 5 minutes, tu peux l’ajouter à une piste.')}
    catch(e){report('Prises introuvables : '+e.message)}
    buttons();ui.close.focus();
  };
  ui.close.onclick=()=>{if(running()||starting||stopping||attaching)return;clearPlayer();clearDownload();panel.hidden=true;open.focus()};
  ui.start.onclick=start;ui.stop.onclick=stop;ui.recover.onclick=recover;
  ui.select.onchange=()=>{if(running())return;recovered=null;clearPlayer();clearDownload();buttons();report('Prise sélectionnée : appuie sur RETROUVER')};
  ui.listen.onclick=listen;ui.export.onclick=prepareDownload;ui.attach.onclick=()=>attach(false);
  ui.download.onclick=()=>{ui.download.textContent='↻ TÉLÉCHARGER À NOUVEAU';report('Téléchargement demandé à Brave : vérifie le dossier Téléchargements.')};
  // Release microphone when leaving the Studio. On Android a background tab
  // can otherwise monopolize the input needed by keyboard voice dictation.
  function leaveStudio(){
    if(starting){cancelStart();return} // late getUserMedia results are stopped above
    if(running()&&!stopping){
      void stop();
      releaseMicImmediately();
    }
  }
  root.addEventListener('pagehide',leaveStudio);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')leaveStudio()});
  buttons();
  return{start,stop,cancelStart,recover,listTakes,isRecording:()=>running()&&!stopping,isBusy:()=>running()||starting||stopping||attaching};
}
root.StudioWavPanel={mount};
})(typeof window!=='undefined'?window:globalThis);
