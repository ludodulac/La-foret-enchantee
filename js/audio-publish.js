(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ForestAudioPublish=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';

const BUCKET='audios',TABLE='audios';

function cleanTitle(value){return String(value||'').replace(/\s+/g,' ').trim()}
function resolveTitle(explicitTitle,projectName,now=new Date()){
  const explicit=cleanTitle(explicitTitle);
  if(explicit)return explicit.slice(0,160);
  const project=cleanTitle(projectName);
  if(project)return project.slice(0,160);
  const d=now instanceof Date?now:new Date(now);
  const safe=Number.isNaN(d.getTime())?new Date():d;
  const date=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(safe);
  const time=new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(safe);
  return ('Projet '+date+' - '+time).slice(0,160);
}
function slugify(value){return cleanTitle(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'audio'}
function makeAudioPath(title,{uuidFn,nowFn}={}){
  const id=(uuidFn||(()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)))();
  const now=Number((nowFn||Date.now)());
  return 'studio/'+now+'-'+id+'-'+slugify(title)+'.wav'
}
function normalizeDuration(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.max(1,Math.floor(n)):null}

async function publishNormalAudio({dbClient,blob,title,projectName,duration,path,uuidFn,nowFn}){
  if(!dbClient)throw Error('Client Supabase indisponible');
  if(!(blob instanceof Blob)||!blob.size)throw Error('Audio exporté invalide');
  const finalTitle=resolveTitle(title,projectName);
  const audioPath=path||makeAudioPath(finalTitle,{uuidFn,nowFn});
  const storage=dbClient.storage.from(BUCKET);
  const upload=await storage.upload(audioPath,blob,{contentType:blob.type||'audio/wav',upsert:false});
  if(upload?.error){
    const error=new Error('Envoi audio impossible : '+(upload.error.message||upload.error));
    error.stage='upload';error.cause=upload.error;throw error;
  }
  const row={title:finalTitle,audio_path:audioPath,duration:normalizeDuration(duration)};
  const inserted=await dbClient.from(TABLE).insert(row);
  if(inserted?.error){
    let rollbackError=null;
    try{const removed=await storage.remove([audioPath]);if(removed?.error)rollbackError=removed.error}catch(e){rollbackError=e}
    const error=new Error('Publication audio impossible : '+(inserted.error.message||inserted.error)+(rollbackError?' · nettoyage Storage incomplet':''));
    error.stage='insert';error.cause=inserted.error;error.rollbackAttempted=true;error.rollbackError=rollbackError;throw error;
  }
  let publicUrl='';
  try{publicUrl=storage.getPublicUrl(audioPath)?.data?.publicUrl||''}catch{}
  return{bucket:BUCKET,table:TABLE,title:finalTitle,audio_path:audioPath,duration:row.duration,publicUrl};
}


/* Direct MP3 upload is a draft: no category or public visibility until admin publication.
   R2 owns MP3 uploads; Supabase's existing admin RLS owns row writes. */
async function publishDraftMp3({dbClient,blob,title,projectName,duration,media}) {
  if(!dbClient?.auth?.getSession||!dbClient.rpc)throw Error('Connexion Ludodio indisponible.');
  if(!(blob instanceof Blob)||!blob.size)throw Error('MP3 vide ou invalide.');
  if(!media?.upload||!media?.verify||!media?.remove||!media?.checkedMedia)throw Error('Stockage MP3 indisponible.');
  const {data:sessionData,error:sessionError}=await dbClient.auth.getSession();
  if(sessionError||!sessionData?.session?.access_token)throw Error('Connecte-toi à ton administration Ludodio.');
  const {data:authorized,error:authError}=await dbClient.rpc('is_app_admin');
  if(authError||authorized!==true)throw Error('Accès administrateur requis pour enregistrer dans Ludodio.');
  const finalTitle=resolveTitle(title,projectName);
  const file=new File([blob],slugify(finalTitle)+'.mp3',{type:'audio/mpeg'});
  media.checkedMedia('audios',file);
  let storedPath=null;
  try{
    storedPath=await media.upload(dbClient,'audios',file);
    await media.verify(storedPath);
    const row={title:finalTitle,audio_path:storedPath,duration:normalizeDuration(duration),
      category_id:null,subcategory_id:null,is_published:false};
    const {data,error}=await dbClient.from(TABLE).insert(row).select('id,is_published,audio_path,title').single();
    if(error)throw Error('Enregistrement du brouillon impossible : '+(error.message||error));
    if(!data?.id||data.is_published!==false||data.audio_path!==storedPath)throw Error('Brouillon non confirmé : sauvegarde interrompue.');
    return{id:data.id,title:finalTitle,audio_path:storedPath,is_published:false,duration:row.duration};
  }catch(error){
    if(storedPath){
      try{await media.remove(dbClient,storedPath)}
      catch(cleanupError){error.rollbackError=cleanupError}
    }
    throw error;
  }
}

return{BUCKET,TABLE,cleanTitle,resolveTitle,slugify,makeAudioPath,normalizeDuration,publishNormalAudio,publishDraftMp3};
});
