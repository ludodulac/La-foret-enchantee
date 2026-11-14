/* La Forêt Enchantée — R2 client for story media. Draft integration only. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ForestR2Media=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BASE='https://foret-enchantee-stockage.rondes.workers.dev';
  const R2=/^r2:(contes\/[a-z0-9_-]+\.mp3|couvertures\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i;
  const MAX_AUDIO=60*1024*1024,MAX_COVER=10*1024*1024;
  function isR2Path(path){return typeof path==='string'&&(R2.test(path)||/^r2:(?:audios\/[a-z0-9_\/-]+\.(?:mp3|m4a|wav|ogg)|images\/[a-z0-9_\/-]+\.(?:jpg|jpeg|png|webp))$/i.test(path))}
  function publicUrl(path){
    if(!isR2Path(path))throw Error('Référence de média R2 non reconnue');
    if(path.startsWith('r2:audios/')||path.startsWith('r2:images/')){
      return 'https://ludodio-api.rondes.workers.dev/media/'+path.slice(3);
    }
    return BASE+'/media/'+path.slice(3);
  }
  function kindForBucket(bucket){
    if(bucket==='audios')return 'audio';
    if(bucket==='images')return 'cover';
    throw Error('Destination de fichier non autorisée');
  }
  function checkedMedia(bucket,file){
    if(!(file instanceof Blob)||!file.size)throw Error('Fichier vide ou invalide');
    const kind=kindForBucket(bucket);
    const ext=(file.name||'').split('.').pop().toLowerCase();
    const mime=(file.type||'').toLowerCase();
    if(kind==='audio'){
      if(ext!=='mp3'||!['audio/mpeg','audio/mp3',''].includes(mime))throw Error('Pour publier un conte, exporte-le en MP3.');
      if(file.size>MAX_AUDIO)throw Error('MP3 trop volumineux (maximum 60 Mo).');
      return {kind,mime:'audio/mpeg'};
    }
    if(!['jpg','jpeg','png','webp'].includes(ext))throw Error('Couverture JPG, PNG ou WebP requise.');
    const expected=ext==='jpg'||ext==='jpeg'?'image/jpeg':'image/'+ext;
    if(mime&&mime!==expected)throw Error('Format de couverture incompatible.');
    if(file.size>MAX_COVER)throw Error('Couverture trop volumineuse (maximum 10 Mo).');
    return {kind,mime:expected};
  }
  async function accessToken(dbClient){
    if(!dbClient?.auth?.getSession)throw Error('Connexion Supabase indisponible');
    const {data,error}=await dbClient.auth.getSession();
    const token=data?.session?.access_token;
    if(error||!token)throw Error('Connecte-toi à ton administration avant de publier.');
    return token;
  }
  async function send(dbClient,url,init){
    const token=await accessToken(dbClient);
    const response=await fetch(BASE+url,{
      ...init,headers:{...init?.headers,Authorization:'Bearer '+token},
      cache:'no-store'
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Le stockage Cloudflare a refusé la demande ('+response.status+').');
    return result;
  }
  async function upload(dbClient,bucket,file){
    const cfg=checkedMedia(bucket,file);
    if(dbClient?.cloudMode){
      const suffix=cfg.kind==='audio'?'mp3':cfg.mime.split('/')[1].replace('jpeg','jpg');
      const path='studio/'+crypto.randomUUID()+'.'+suffix;
      const {data,error}=await dbClient.storage.from(bucket).upload(path,file,{contentType:cfg.mime,upsert:false});
      if(error)throw error;
      return data.path;
    }
    const result=await send(dbClient,'/api/upload?kind='+cfg.kind,{
      method:'POST',headers:{'Content-Type':cfg.mime},body:file
    });
    if(!isR2Path(result.path))throw Error('Réponse de stockage invalide');
    return result.path;
  }
  async function verify(path){
    const response=await fetch(publicUrl(path),{method:'HEAD',cache:'no-store'});
    if(!response.ok)throw Error('Fichier Cloudflare non confirmé ('+response.status+').');
    return true;
  }
  async function remove(dbClient,path){
    if(!isR2Path(path))throw Error('Média Cloudflare inconnu');
    if(dbClient?.cloudMode&&(path.startsWith('r2:audios/')||path.startsWith('r2:images/'))){
      const bucket=path.split('/')[0].slice(3);
      const {error}=await dbClient.storage.from(bucket).remove([path]);
      if(error)throw error;
      return {removed:true};
    }
    const key=path.slice(3);
    if(!/^(?:contes|couvertures)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp3|jpg|jpeg|png|webp)$/i.test(key))throw Error('Fichier Cloudflare non géré : suppression refusée');
    return send(dbClient,'/api/media/'+key,{method:'DELETE'});
  }
  return {BASE,isR2Path,publicUrl,checkedMedia,upload,verify,remove};
});
