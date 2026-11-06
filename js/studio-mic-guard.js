/* Ludodio Studio — microphone acquisition and deterministic release.
 * Never leave a late permission result holding Android's microphone.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StudioMicGuard=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function release(stream){
    if(!stream||typeof stream.getTracks!=='function')return;
    for(const track of stream.getTracks()){
      try{track.stop()}catch(error){console.warn('Microphone release',error)}
    }
  }
  function errorMessage(error){
    if(error?.code==='MIC_TIMEOUT')return 'Le micro ne répond pas. Vérifie que Brave/Android autorise le micro, puis réessaie.';
    if(error?.code==='MIC_CANCELLED')return 'Ouverture du micro annulée. Micro libéré.';
    switch(error?.name){
      case 'NotAllowedError':case 'PermissionDeniedError':case 'SecurityError':return 'Accès micro refusé. Autorise le micro pour ce site dans le navigateur.';
      case 'NotFoundError':case 'DevicesNotFoundError':return 'Aucun micro trouvé. Rebranche le micro-cravate et vérifie les entrées Android.';
      case 'NotReadableError':case 'TrackStartError':return 'Micro occupé par une autre application. Ferme la dictée ou l’autre enregistreur, puis réessaie.';
      case 'OverconstrainedError':return 'Micro choisi indisponible. Sélectionne « Micro Android » puis réessaie.';
      default:return 'Impossible de démarrer le micro : '+(error?.message||'erreur inconnue');
    }
  }
  async function acquire(mediaDevices,constraints,{timeoutMs=12000,cancelled=()=>false}={}){
    if(!mediaDevices||typeof mediaDevices.getUserMedia!=='function')throw Error('Micro indisponible dans ce navigateur.');
    let timer,timedOut=false;
    const pending=Promise.resolve().then(()=>mediaDevices.getUserMedia(constraints)).then(stream=>{
      if(timedOut||cancelled()){
        release(stream);
        const error=Error('Ouverture du microphone annulée');
        error.code='MIC_CANCELLED';
        throw error;
      }
      if(!stream?.getAudioTracks?.().length){
        release(stream);
        throw Error('Aucune piste audio reçue du micro.');
      }
      return stream;
    });
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>{
        timedOut=true;
        const error=Error('Le micro tarde à répondre');
        error.code='MIC_TIMEOUT';
        reject(error);
      },timeoutMs);
    });
    try{return await Promise.race([pending,timeout])}finally{clearTimeout(timer)}
  }
  return{release,acquire,errorMessage};
});
