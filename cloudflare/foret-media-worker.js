/**
 * La Forêt Enchantée — R2 media gateway (STAGED ONLY).
 * Target: foret-enchantee-stockage.rondes.workers.dev
 * Binding: CONTES_BUCKET => foret-enchantee-contes
 *
 * Existing GET /media/... URLs remain compatible with the worker's current read-only deployment.
 * Do NOT deploy without first configuring SUPABASE_URL and SUPABASE_ANON_KEY
 * in Worker Settings → Variables and Secrets; never use privileged server keys.
 */
const DEFAULT_ORIGIN = 'https://ludodulac.github.io';
const MEDIA_KEY = /^(?:contes\/(?:[a-z0-9_-]+|[0-9a-f-]{36})\.mp3|couvertures\/(?:[a-z0-9_-]+|[0-9a-f-]{36})\.(?:jpg|jpeg|png|webp))$/i;
const MANAGED_KEY = /^(?:contes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3|couvertures\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp))$/i;
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
function json(value,status=200,headers={}) {
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
}
function corsHeaders(request,env) {
  const allowed = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const origin=request.headers.get('Origin');
  return origin===allowed?{
    'Access-Control-Allow-Origin':allowed,
    'Access-Control-Allow-Methods':'GET,HEAD,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Max-Age':'600',
    'Vary':'Origin'
  }:null;
}
function keyFromUrl(pathname) {
  if(!pathname.startsWith('/media/'))return null;
  try {
    const key=decodeURIComponent(pathname.slice('/media/'.length));
    return MEDIA_KEY.test(key)&&!key.includes('..')?key:null;
  }catch{return null}
}
function managedKey(pathname) {
  if(!pathname.startsWith('/api/media/'))return null;
  try {
    const key=decodeURIComponent(pathname.slice('/api/media/'.length));
    return MANAGED_KEY.test(key)?key:null;
  }catch{return null}
}
async function authenticateAdmin(request,env) {
  if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY)return {error:json({error:'Configuration authentification incomplète'},503)};
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL))return {error:json({error:'URL Supabase invalide'},503)};
  const bearer=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_\-.]+$/.test(bearer))return {error:json({error:'Connexion administrateur requise'},401)};
  const headers={'Authorization':bearer,'apikey':env.SUPABASE_ANON_KEY,'Accept':'application/json'};
  try{
    // Validate the actual JWT with Supabase Auth; do not trust browser claims.
    const userResponse=await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers,cache:'no-store'});
    if(!userResponse.ok)return {error:json({error:'Session expirée ou invalide'},401)};
    const user=await userResponse.json();
    if(!user?.id)return {error:json({error:'Utilisateur non identifié'},401)};
    // Existing audited server-side permission: public.is_app_admin() queries app_admins using auth.uid().
    const permissionResponse=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/is_app_admin',{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',cache:'no-store'
    });
    if(!permissionResponse.ok)return {error:json({error:'Vérification des droits indisponible'},503)};
    if((await permissionResponse.json())!==true)return {error:json({error:'Accès administrateur refusé'},403)};
    return {userId:user.id};
  }catch{return {error:json({error:'Authentification momentanément indisponible'},503)}}
}
function uploadType(request,kind) {
  const type=(request.headers.get('Content-Type')||'').split(';')[0].toLowerCase().trim();
  if(kind==='audio'&&['audio/mpeg','audio/mp3'].includes(type))return {folder:'contes',extension:'mp3',contentType:'audio/mpeg',max:MAX_AUDIO_BYTES};
  if(kind==='cover'){
    if(type==='image/jpeg')return {folder:'couvertures',extension:'jpg',contentType:type,max:MAX_COVER_BYTES};
    if(type==='image/png')return {folder:'couvertures',extension:'png',contentType:type,max:MAX_COVER_BYTES};
    if(type==='image/webp')return {folder:'couvertures',extension:'webp',contentType:type,max:MAX_COVER_BYTES};
  }
  return null;
}
async function publicMedia(request,env,pathname) {
  if(!['GET','HEAD'].includes(request.method))return new Response('Méthode interdite',{status:405});
  const key=keyFromUrl(pathname);
  if(!key)return new Response('Fichier non autorisé',{status:404});
  const file=request.method==='HEAD'
    ?await env.CONTES_BUCKET.head(key)
    :await env.CONTES_BUCKET.get(key,{range:request.headers});
  if(!file)return new Response('Fichier introuvable',{status:404});
  const headers=new Headers({'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600'});
  file.writeHttpMetadata(headers);
  headers.set('ETag',file.httpEtag);
  if(request.method==='HEAD'){
    headers.set('Content-Length',String(file.size));
    return new Response(null,{status:200,headers});
  }
  if(!('body' in file))return new Response(null,{status:412,headers});
  const range=file.range;
  const partial=range&&Number.isInteger(range.offset)&&Number.isInteger(range.length);
  if(partial){
    headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${file.size}`);
    headers.set('Content-Length',String(range.length));
  }else headers.set('Content-Length',String(file.size));
  return new Response(file.body,{status:partial?206:200,headers});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),pathname=url.pathname;
    if(pathname==='/')return new Response('Stockage La Forêt Enchantée : prêt !');
    if(pathname.startsWith('/media/'))return publicMedia(request,env,pathname);
    if(!pathname.startsWith('/api/'))return new Response('Introuvable',{status:404});
    const cors=corsHeaders(request,env);
    if(request.method==='OPTIONS')return cors?new Response(null,{status:204,headers:cors}):json({error:'Origine refusée'},403);
    // No browser cross-origin write without a matching Origin. Authorization also mandatory.
    if(!cors)return json({error:'Origine non autorisée'},403);
    const auth=await authenticateAdmin(request,env);
    if(auth.error)return new Response(auth.error.body,{status:auth.error.status,headers:{'Content-Type':'application/json',...cors}});
    if(pathname==='/api/upload'&&request.method==='POST'){
      const cfg=uploadType(request,url.searchParams.get('kind'));
      if(!cfg)return json({error:'Type de fichier refusé : MP3, JPG, PNG, WebP uniquement'},415,cors);
      const lengthText=request.headers.get('Content-Length')||'';
      const length=Number(lengthText);
      if(!/^\d+$/.test(lengthText)||!Number.isSafeInteger(length)||length<1)return json({error:'Taille du fichier manquante'},411,cors);
      if(length>cfg.max)return json({error:'Fichier trop volumineux'},413,cors);
      if(!request.body)return json({error:'Fichier vide'},400,cors);
      // The browser-provided Blob stream has a known Content-Length; no whole-file buffering.
      const key=cfg.folder+'/'+crypto.randomUUID()+'.'+cfg.extension;
      await env.CONTES_BUCKET.put(key,request.body,{httpMetadata:{contentType:cfg.contentType}});
      return json({path:'r2:'+key,size:length},201,cors);
    }
    if(pathname.startsWith('/api/media/')&&request.method==='DELETE'){
      const key=managedKey(pathname);
      if(!key)return json({error:'Seuls les nouveaux fichiers gérés par le site peuvent être supprimés'},404,cors);
      await env.CONTES_BUCKET.delete(key);
      return json({removed:true},200,cors);
    }
    return json({error:'Route non disponible'},404,cors);
  }
};
