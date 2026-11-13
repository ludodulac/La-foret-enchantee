/**
 * Ludodio — backend Cloudflare indépendant de Supabase.
 * D1 binding: LUDODIO_DB. R2 binding: LUDODIO_MEDIA.
 * Secrets: ADMIN_PIN and SESSION_SECRET (never put these in the public repository).
 * NOT deployed by GitHub Pages: requires an independent Cloudflare Worker deployment.
 */
const ORIGIN='https://ludodulac.github.io';
const encoder=new TextEncoder();
const FIELDS={
  categories:['id','name','created_at'],
  subcategories:['id','name','category_id','created_at'],
  audios:['id','title','description','image_path','audio_path','category_id','subcategory_id','duration','created_at','illustration_key','cover_color','is_published'],
  blog_categories:['id','name','created_at'],
  articles:['id','title','excerpt','content','category','cover_path','published','published_at','created_at'],
  studio_sound_library:['id','name_fr','original_name','storage_path','category','keywords','mime_type','size_bytes','created_by','created_at','content_sha256'],
  studio_projects:['id','name','project_data','created_by','created_at','updated_at']
};
const FLAGS={audios:['is_published'],articles:['published']};
const JSON_FIELDS={studio_sound_library:['keywords'],studio_projects:['project_data']};
const MEDIA_BUCKETS=new Set(['audios','images','blog-images','studio-sounds']);
const MEDIA_PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9_\-/.]{1,240}$/;
function response(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}})}
function allowedOrigin(request,env){
  const origin=request.headers.get('Origin');
  return origin&&(origin===(env.ALLOWED_ORIGIN||ORIGIN));
}
function cors(request,env){
  if(!allowedOrigin(request,env))return {};
  return {'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||ORIGIN,'Access-Control-Allow-Methods':'GET,HEAD,POST,OPTIONS,DELETE','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'};
}
function denied(request,env,message,status=403){return response({error:message},status,cors(request,env))}
function base64url(bytes){
  let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unbase64url(value){const s=value.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,ch=>ch.charCodeAt(0))}
async function hmacKey(env){
  if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('Configuration de session absente');
  return crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function createToken(env){
  const payload=base64url(encoder.encode(JSON.stringify({expires:Date.now()+8*60*60*1000,nonce:crypto.randomUUID()})));
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),encoder.encode(payload)));
  return payload+'.'+base64url(signature);
}
async function validSession(request,env){
  const auth=request.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')||auth.length>1000)return false;
  const value=auth.slice(7);if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))return false;
  try{
    const [data,tag]=value.split('.');
    const verified=await crypto.subtle.verify('HMAC',await hmacKey(env),unbase64url(tag),encoder.encode(data));
    if(!verified)return false;
    const payload=JSON.parse(new TextDecoder().decode(unbase64url(data)));
    return typeof payload.expires==='number'&&Date.now()<payload.expires&&Date.now()>payload.expires-8*60*60*1000;
  }catch{return false}
}
function equalCode(a,b){
  const x=encoder.encode(String(a||'')),y=encoder.encode(String(b||''));
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);
  return diff===0;
}
async function ipKey(request,env){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const bytes=encoder.encode(String(env.SESSION_SECRET||'')+':'+ip);
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
}
async function login(request,env){
  if(!env.LUDODIO_DB||!env.ADMIN_PIN||!env.SESSION_SECRET)return denied(request,env,'Configuration de connexion incomplète',503);
  if(Number(request.headers.get('Content-Length')||0)>2048)return denied(request,env,'Requête trop volumineuse',413);
  let payload;try{payload=await request.json()}catch{return denied(request,env,'Code manquant',400)}
  const code=payload&&typeof payload.code==='string'?payload.code:'';
  const key=await ipKey(request,env),now=Date.now();
  const row=await env.LUDODIO_DB.prepare('SELECT fails,locked_until FROM login_limits WHERE visitor=?').bind(key).first();
  if(row&&row.locked_until>now)return denied(request,env,'Trop de tentatives. Réessaie dans quelques minutes.',429);
  if(!equalCode(code,env.ADMIN_PIN)){
    const fails=(row?.fails||0)+1;
    const locked_until=fails>=5?now+15*60*1000:0;
    await env.LUDODIO_DB.prepare('INSERT INTO login_limits(visitor,fails,locked_until) VALUES(?,?,?) ON CONFLICT(visitor) DO UPDATE SET fails=excluded.fails,locked_until=excluded.locked_until')
      .bind(key,locked_until?0:fails,locked_until).run();
    return denied(request,env,'Code incorrect',401);
  }
  await env.LUDODIO_DB.prepare('DELETE FROM login_limits WHERE visitor=?').bind(key).run();
  return response({access_token:await createToken(env),token_type:'bearer',expires_in:28800},200,cors(request,env));
}
function column(table,key){if(!FIELDS[table]?.includes(key))throw Error('Champ non autorisé : '+key);return '"'+key+'"'}
function readValue(table,key,value){
  if(JSON_FIELDS[table]?.includes(key)){
    if(typeof value==='string')return value;
    return JSON.stringify(value??(key==='keywords'?[]:{}));
  }
  if(FLAGS[table]?.includes(key))return value===true||value===1?1:0;
  if(value===null)return null;
  if(typeof value==='string'||typeof value==='number')return value;
  throw Error('Valeur non autorisée : '+key);
}
function normalize(table,row){
  if(!row)return row;
  const obj={...row};
  for(const name of FLAGS[table]||[])if(name in obj)obj[name]=obj[name]===1||obj[name]===true;
  for(const name of JSON_FIELDS[table]||[])if(typeof obj[name]==='string'){
    try{obj[name]=JSON.parse(obj[name])}catch{/* Keep legacy plain text */}
  }
  return obj;
}
function readFilters(table,filters,params){
  if(!Array.isArray(filters)||filters.length>20)throw Error('Filtres non valides');
  const parts=[];
  for(const filter of filters){
    if(!filter||typeof filter.key!=='string')throw Error('Filtre non valide');
    const col=column(table,filter.key),op=filter.op;
    if(op==='is'){
      if(filter.value!==null)throw Error('IS ne prend que null');
      parts.push(col+' IS NULL');
    }else if(op==='in'){
      if(!Array.isArray(filter.value)||filter.value.length<1||filter.value.length>50)throw Error('Filtre IN non valide');
      parts.push(col+' IN ('+filter.value.map(()=>'?').join(',')+')');
      for(const value of filter.value)params.push(readValue(table,filter.key,value));
    }else{
      const sqlOp={eq:'=',neq:'!=',gt:'>',gte:'>=',lt:'<',lte:'<='}[op];
      if(!sqlOp)throw Error('Opérateur non autorisé');
      parts.push(col+' '+sqlOp+' ?');
      params.push(readValue(table,filter.key,filter.value));
    }
  }
  return parts;
}
function whereClause(table,op,query,params,admin){
  const parts=readFilters(table,query.filters||[],params);
  if(op==='select'&&!admin){
    if(table==='audios')parts.push('"is_published" = 1');
    if(table==='articles')parts.push('"published" = 1');
    if(table==='studio_projects'||table==='studio_sound_library')throw Error('Connexion nécessaire');
  }
  return parts.length?' WHERE '+parts.join(' AND '):'';
}
function columnList(table,columns){
  if(!columns||columns==='*')return '*';
  if(typeof columns!=='string')throw Error('Colonnes non valides');
  const arr=columns.split(',').map(x=>x.trim());
  if(!arr.length||arr.length>FIELDS[table].length)return '*';
  return arr.map(col=>column(table,col)).join(',');
}
async function databaseQuery(request,env,admin){
  if(!env.LUDODIO_DB)return denied(request,env,'Base de données non configurée',503);
  let q;try{q=await request.json()}catch{return denied(request,env,'Requête JSON invalide',400)}
  const table=q?.table,op=q?.op||'select';
  if(!Object.hasOwn(FIELDS,table))return denied(request,env,'Table interdite',400);
  if(!['select','insert','update','delete'].includes(op))return denied(request,env,'Opération interdite',400);
  if(op!=='select'&&!admin)return denied(request,env,'Connexion requise',401);
  try{
    const name='"'+table+'"',params=[];
    let sql='',result=[];
    if(op==='select'){
      sql='SELECT '+columnList(table,q.columns)+' FROM '+name+whereClause(table,op,q,params,admin);
      if(q.order){
        const ord=q.order;
        sql+=' ORDER BY '+column(table,ord.key)+(ord.ascending===false?' DESC':' ASC');
      }
      const limit=Math.min(Math.max(Number(q.limit)||500,1),500);
      sql+=' LIMIT '+limit;
      result=(await env.LUDODIO_DB.prepare(sql).bind(...params).all()).results||[];
    }else if(op==='insert'){
      const values=Array.isArray(q.values)?q.values:[q.values];
      if(!values.length||values.length>50||values.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('Données non valides');
      for(const row of values){
        const fields=Object.keys(row);
        if(!fields.length)throw Error('Ligne vide');
        const args=fields.map(key=>{column(table,key);return readValue(table,key,row[key])});
        sql='INSERT INTO '+name+' ('+fields.map(key=>column(table,key)).join(',')+') VALUES('+fields.map(()=>'?').join(',')+') RETURNING '+columnList(table,q.columns);
        const saved=(await env.LUDODIO_DB.prepare(sql).bind(...args).all()).results||[];
        result.push(...saved);
      }
    }else{
      const where=whereClause(table,op,q,params,true);
      if(!where)throw Error('Une condition est obligatoire pour modifier ou supprimer');
      if(op==='delete'){
        sql='DELETE FROM '+name+where+' RETURNING '+columnList(table,q.columns);
        result=(await env.LUDODIO_DB.prepare(sql).bind(...params).all()).results||[];
      }else{
        const values=q.values;
        if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Valeurs manquantes');
        const keys=Object.keys(values);if(!keys.length)throw Error('Valeurs manquantes');
        const args=keys.map(key=>{column(table,key);return readValue(table,key,values[key])});
        sql='UPDATE '+name+' SET '+keys.map(key=>column(table,key)+'=?').join(',')+where+' RETURNING '+columnList(table,q.columns);
        result=(await env.LUDODIO_DB.prepare(sql).bind(...args,...params).all()).results||[];
      }
    }
    const rows=result.map(row=>normalize(table,row));
    if(q.single)return response({data:rows[0]||null,error:rows.length?null:{message:'Aucun résultat'}},200,cors(request,env));
    return response({data:rows,error:null},200,cors(request,env));
  }catch(error){
    return denied(request,env,'Opération impossible : '+String(error.message||error).slice(0,140),400);
  }
}
function mediaKey(pathname){
  let decoded;
  try{decoded=decodeURIComponent(pathname.slice('/media/'.length))}catch{return null}
  const cut=decoded.indexOf('/');
  if(cut<1)return null;
  const bucket=decoded.slice(0,cut),path=decoded.slice(cut+1);
  if(!MEDIA_BUCKETS.has(bucket)||!MEDIA_PATH.test(path)||path.includes('//'))return null;
  return bucket+'/'+path;
}
function fileType(bucket,path,mime){
  const suffix=path.split('.').pop().toLowerCase();
  const type=(mime||'').split(';')[0].trim().toLowerCase();
  if(bucket==='audios')return {
    ok:({mp3:['audio/mpeg','audio/mp3','application/octet-stream'],m4a:['audio/mp4','audio/x-m4a','application/octet-stream'],wav:['audio/wav','audio/x-wav','audio/wave','application/octet-stream'],ogg:['audio/ogg','application/ogg']}[suffix]||[]).includes(type),
    max:60*1024*1024
  };
  if(bucket==='studio-sounds')return {ok:['mp3','wav','ogg','m4a'].includes(suffix)&&type.startsWith('audio/'),max:30*1024*1024};
  return {ok:({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[suffix])===type,max:10*1024*1024};
}
async function media(request,env,pathname,admin){
  if(!env.LUDODIO_MEDIA)return denied(request,env,'Stockage non configuré',503);
  const key=mediaKey(pathname);
  if(!key)return denied(request,env,'Chemin de fichier invalide',404);
  if(request.method==='GET'||request.method==='HEAD'){
    const object=request.method==='HEAD'?await env.LUDODIO_MEDIA.head(key):await env.LUDODIO_MEDIA.get(key,{range:request.headers});
    if(!object)return new Response('Fichier introuvable',{status:404});
    const headers=new Headers({'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
    object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);
    if(request.method==='HEAD'){headers.set('Content-Length',String(object.size));return new Response(null,{status:200,headers})}
    const range=object.range;const partial=range&&Number.isInteger(range.offset)&&Number.isInteger(range.length);
    if(partial){headers.set('Content-Range','bytes '+range.offset+'-'+(range.offset+range.length-1)+'/'+object.size);headers.set('Content-Length',String(range.length))}
    else headers.set('Content-Length',String(object.size));
    return new Response(object.body,{status:partial?206:200,headers});
  }
  if(!admin)return denied(request,env,'Connexion requise',401);
  if(request.method==='DELETE'){
    await env.LUDODIO_MEDIA.delete(key);return response({removed:true},200,cors(request,env));
  }
  if(request.method==='POST'){
    const type=fileType(key.split('/')[0],key,request.headers.get('Content-Type'));
    if(!type.ok)return denied(request,env,'Format de média non autorisé',415);
    const length=Number(request.headers.get('Content-Length')||0);
    if(!Number.isSafeInteger(length)||length<1)return denied(request,env,'Taille requise',411);
    if(length>type.max)return denied(request,env,'Fichier trop volumineux',413);
    if(await env.LUDODIO_MEDIA.head(key))return denied(request,env,'Fichier déjà présent',409);
    if(!request.body)return denied(request,env,'Fichier vide',400);
    await env.LUDODIO_MEDIA.put(key,request.body,{httpMetadata:{contentType:request.headers.get('Content-Type')}});
    return response({path:'r2:'+key,size:length},201,cors(request,env));
  }
  return denied(request,env,'Méthode non autorisée',405);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(request.method==='OPTIONS')return allowedOrigin(request,env)?new Response(null,{status:204,headers:cors(request,env)}):denied(request,env,'Origine refusée');
    if(path.startsWith('/media/')&&['GET','HEAD'].includes(request.method))return media(request,env,path,false);
    if(!allowedOrigin(request,env))return denied(request,env,'Origine refusée');
    if(path==='/api/login'&&request.method==='POST')return login(request,env);
    const admin=await validSession(request,env);
    if(path==='/api/session'&&request.method==='GET')return response({authorized:admin},200,cors(request,env));
    if(path==='/api/data'&&request.method==='POST')return databaseQuery(request,env,admin);
    if(path.startsWith('/media/'))return media(request,env,path,admin);
    return denied(request,env,'Route inconnue',404);
  }
};