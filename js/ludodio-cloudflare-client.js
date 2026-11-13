/**
 * Ludodio : adaptateur compatible avec les appels de l'ancien client Supabase.
 * Ce fichier remplace js/supabase.js uniquement après déploiement du Worker et migration.
 * Aucun mot de passe ni jeton privilégié n'est inclus dans le JavaScript public.
 */
const LUDODIO_API='https://ludodio-api.rondes.workers.dev';
const LUDODIO_SESSION_KEY='ludodio-cloudflare-session';
function ludodioToken(){try{return sessionStorage.getItem(LUDODIO_SESSION_KEY)||''}catch{return ''}}
async function ludodioRequest(path,options={}){
  const token=ludodioToken(),headers=new Headers(options.headers||{});
  if(token)headers.set('Authorization','Bearer '+token);
  if(options.json!==undefined)headers.set('Content-Type','application/json');
  const response=await fetch(LUDODIO_API+path,{
    method:options.method||'GET',headers,cache:'no-store',
    ...(options.json!==undefined?{body:JSON.stringify(options.json)}:{}),
    ...(options.body!==undefined?{body:options.body}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'Service Ludodio momentanément indisponible'),{status:response.status});
  return data;
}
function ludodioPath(bucket,path){
  if(typeof path!=='string'||!path)throw new Error('Chemin de fichier manquant');
  if(path.startsWith('r2:')){
    const key=path.slice(3);
    if(key.startsWith(bucket+'/'))return key;
    if(key.startsWith('contes/')||key.startsWith('couvertures/'))return key;
    throw new Error('Référence de média invalide');
  }
  return bucket+'/'+path;
}
function getPublicUrl(bucket,path){
  if(typeof path!=='string'||!path)return '';
  if(path.startsWith('r2:')&&(path.startsWith('r2:contes/')||path.startsWith('r2:couvertures/'))){
    return 'https://foret-enchantee-stockage.rondes.workers.dev/media/'+path.slice(3).split('/').map(encodeURIComponent).join('/');
  }
  const key=ludodioPath(bucket,path);
  return LUDODIO_API+'/media/'+key.split('/').map(encodeURIComponent).join('/');
}
class LudodioQuery {
  constructor(table){this.table=table;this.op='select';this.filters=[];this.columns='*';this.ordering=null;this.maxRows=500;this.expectSingle=false;}
  select(fields='*'){this.columns=fields;return this}
  insert(values){this.op='insert';this.values=values;return this}
  update(values){this.op='update';this.values=values;return this}
  delete(){this.op='delete';return this}
  eq(key,value){this.filters.push({key,op:'eq',value});return this}
  neq(key,value){this.filters.push({key,op:'neq',value});return this}
  is(key,value){this.filters.push({key,op:'is',value});return this}
  gt(key,value){this.filters.push({key,op:'gt',value});return this}
  gte(key,value){this.filters.push({key,op:'gte',value});return this}
  lt(key,value){this.filters.push({key,op:'lt',value});return this}
  lte(key,value){this.filters.push({key,op:'lte',value});return this}
  in(key,value){this.filters.push({key,op:'in',value});return this}
  order(key,{ascending=true}={}){this.ordering={key,ascending};return this}
  limit(limit){this.maxRows=limit;return this}
  single(){this.expectSingle=true;return this}
  maybeSingle(){this.expectSingle=true;return this}
  async execute(){
    try{
      const result=await ludodioRequest('/api/data',{method:'POST',json:{
        table:this.table,op:this.op,values:this.values,columns:this.columns,
        filters:this.filters,order:this.ordering,limit:this.maxRows,single:this.expectSingle
      }});
      return {data:result.data,error:result.error||null};
    }catch(error){return {data:null,error}}
  }
  then(resolve,reject){return this.execute().then(resolve,reject)}
}
const dbClient={
  cloudMode:true,
  from(table){return new LudodioQuery(table)},
  auth:{
    async getSession(){
      const access_token=ludodioToken();
      return {data:{session:access_token?{access_token}:null},error:null};
    },
    async signInWithPassword({password}){
      try{
        const payload=await ludodioRequest('/api/login',{method:'POST',json:{code:password}});
        sessionStorage.setItem(LUDODIO_SESSION_KEY,payload.access_token);
        return {data:{session:{access_token:payload.access_token}},error:null};
      }catch(error){return {data:null,error}}
    },
    async signOut(){try{sessionStorage.removeItem(LUDODIO_SESSION_KEY)}catch{}return {error:null}}
  },
  async rpc(name){
    if(name!=='is_app_admin')return {data:false,error:new Error('Fonction non autorisée')};
    try{
      const payload=await ludodioRequest('/api/session');
      return {data:payload.authorized===true,error:null};
    }catch(error){return {data:false,error}}
  },
  storage:{
    from(bucket){
      const base='/media/';
      function url(path){const key=ludodioPath(bucket,path);return LUDODIO_API+base+key.split('/').map(encodeURIComponent).join('/')}
      return {
        async upload(path,file){
          try{
            if(!(file instanceof Blob))throw Error('Fichier invalide');
            const token=ludodioToken(),headers={Authorization:'Bearer '+token,'Content-Type':file.type||'application/octet-stream'};
            const response=await fetch(url(path),{method:'POST',body:file,headers,cache:'no-store'});
            const data=await response.json().catch(()=>({}));
            if(!response.ok)throw Error(data.error||'Téléversement refusé');
            return {data:{path:data.path},error:null};
          }catch(error){return {data:null,error}}
        },
        async remove(paths){
          try{
            if(!Array.isArray(paths)||paths.length>50)throw Error('Liste invalide');
            for(const path of paths){
              const response=await fetch(url(path),{method:'DELETE',headers:{Authorization:'Bearer '+ludodioToken()},cache:'no-store'});
              if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Suppression impossible')}
            }
            return {data:paths,error:null};
          }catch(error){return {data:null,error}}
        },
        async download(path){
          try{
            const res=await fetch(url(path),{cache:'no-store'});
            if(!res.ok)throw Error('Son indisponible');
            return {data:await res.blob(),error:null};
          }catch(error){return {data:null,error}}
        },
        getPublicUrl(path){return {data:{publicUrl:getPublicUrl(bucket,path)}}}
      };
    }
  }
};
