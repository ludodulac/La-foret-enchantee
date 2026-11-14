'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../cloudflare/ludodio-api-worker.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../js/supabase.js'),'utf8');
const gate=fs.readFileSync(path.join(__dirname,'../js/admin-entry-footer.js'),'utf8');
const login=fs.readFileSync(path.join(__dirname,'../login.html'),'utf8');
assert(!gate.includes("'lfe'")&&!gate.includes('"lfe"'),'PIN cannot be published as a client comparison');
assert(!client.includes('SUPABASE_ANON_KEY')&&!client.includes('.supabase.co'),'No Supabase runtime for the new site');
assert(login.includes('index.html#administration'),'Old login link returns to the only access form');
(async()=>{
  const source='data:text/javascript;base64,'+Buffer.from(code,'utf8').toString('base64');
  const worker=(await import(source)).default;
  const sqlStatements=[];
  const fakeDb={
    prepare(sql){const statement={sql,params:[],bind(...params){this.params=params;return this},
      async first(){return null},
      async run(){sqlStatements.push({sql,params:this.params});return {success:true}},
      async all(){
        sqlStatements.push({sql,params:this.params});
        return {results:sql.startsWith('SELECT')?[{id:1,name:'Contes'}]:[{id:1,name:'Contes'}]}
      }};
      return statement;
    }
  };
  const env={ADMIN_PIN:'code-de-test',SESSION_SECRET:'secret-de-session-test-de-42-caracteres-123',LUDODIO_DB:fakeDb,ALLOWED_ORIGIN:'https://ludodulac.github.io'};
  const url='https://ludodio-api.rondes.workers.dev';
  const headers={Origin:'https://ludodulac.github.io','Content-Type':'application/json'};
  const post=(p,data,auth)=>new Request(url+p,{method:'POST',headers:{...headers,...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(data)});
  let response=await worker.fetch(post('/api/data',{table:'categories',op:'delete',filters:[{key:'id',op:'eq',value:1}]}),env);
  assert.equal(response.status,401,'No public DELETE even with the published frontend code');
  response=await worker.fetch(post('/api/login',{code:'mauvais-code'}),env);
  assert.equal(response.status,401,'Wrong PIN is rejected');
  response=await worker.fetch(post('/api/login',{code:'code-de-test'}),env);
  assert.equal(response.status,200,'Correct PIN is accepted');
  const {access_token:token}=await response.json();
  assert(token.includes('.'),'Token is signed');
  response=await worker.fetch(new Request(url+'/api/session',{headers:{...headers,Authorization:'Bearer '+token}}),env);
  assert.equal((await response.json()).authorized,true,'Server verifies signature');
  response=await worker.fetch(post('/api/data',{table:'categories',op:'update',values:{name:'Merveilleux'},filters:[{key:'id',op:'eq',value:1}]},token),env);
  assert.equal(response.status,200,'Authorized update accepted');
  response=await worker.fetch(post('/api/data',{table:'articles',op:'select'}),env);
  assert.equal(response.status,200);
  assert(sqlStatements.some(x=>x.sql.includes('"published" = 1')),'Public articles exclude drafts');
  const alien=new Request(url+'/api/login',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({code:'code-de-test'})});
  response=await worker.fetch(alien,env);
  assert.equal(response.status,403,'Cross-origin login blocked');
  console.log('LUDODIO — worker: one PIN, authorization, writes, draft filtering and CORS PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
