'use strict';
// STUDIO 029 — isolated mobile Chromium smoke test of the actual Studio HTML.
// No real user session, remote Supabase access, microphone capture, or publication.
// Local IndexedDB uses an ephemeral localhost origin in the CI browser profile.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const SHOT = path.resolve(ROOT, 'artifacts/studio-mobile-smoke-029.png');

const STUBS = {
  '/js/supabase.js': `window.dbClient={
    from(){return {select(){return {order:async()=>({data:[],error:null})}}}},
    storage:{from(){throw Error('Remote storage intentionally disabled in Studio 029')}}
  };`,
  '/js/auth.js': `window.requireAuth=async()=>({id:'isolated-ci-test'});`,
  '/js/audio-publish.js': `window.ForestAudioPublish={
    publishNormalAudio:async()=>{throw Error('Publication forbidden in Studio 029')}
  };`
};
function serve(req,res){
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const name = url.pathname;
  const send = (status,body,type='text/plain; charset=utf-8')=>{
    res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});
    res.end(body);
  };
  if(Object.hasOwn(STUBS,name))
    return send(200,STUBS[name],'application/javascript; charset=utf-8');
  if(name==='/studio.html'){
    return send(200,fs.readFileSync(path.join(ROOT,'studio.html')),
      'text/html; charset=utf-8');
  }
  if(!/^\/js\/[a-z0-9-]+\.js$/.test(name))
    return send(404,'Not found');
  const file=path.resolve(ROOT,name.slice(1));
  if(!file.startsWith(ROOT+path.sep) || !fs.existsSync(file))
    return send(404,'Not found');
  return send(200,fs.readFileSync(file),'application/javascript; charset=utf-8');
}
const server=http.createServer(serve);
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=()=>new Promise(resolve=>server.close(resolve));
(async()=>{
  let browser,page;
  const pageErrors=[];
  try{
    const port=await listen();
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    const context=await browser.newContext({
      viewport:{width:390,height:844},deviceScaleFactor:1,
      isMobile:true,hasTouch:true,acceptDownloads:false
    });
    page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(error.message));
    // Never contact Supabase/CDN or any other external server in this test.
    await page.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();
      return route.abort('blockedbyclient');
    });
    await page.goto('http://127.0.0.1:'+port+'/studio.html',{waitUntil:'load',timeout:30000});
    await page.waitForFunction(()=>{
      const status=document.querySelector('#project-library-status');
      return status && /Crée ton premier projet/.test(status.textContent);
    },null,{timeout:15000});
    assert.equal(await page.locator('#project-library-screen').isVisible(),true);
    assert.equal(await page.locator('#app').isVisible(),false);

    await page.locator('#create-local-project').click();
    await page.waitForFunction(()=>!document.querySelector('#app').hidden);
    assert.equal(await page.locator('#track-controls .track-control').count(),1);
    assert.equal(await page.evaluate(()=>typeof document.querySelector('#record').onclick), 'function');
    const loaded=await page.evaluate(()=>({
      wav:typeof StudioWavPanel?.mount,
      mix:typeof StudioWavLongMix?.streamToOpfs,
      opus:typeof StudioOpusCompact?.encodeWav
    }));
    assert.deepEqual(loaded,{wav:'function',mix:'function',opus:'function'});

    await page.locator('#tools-menu-toggle').click();
    await page.locator('#studio-wav-open').click();
    assert.equal(await page.locator('#studio-wav-panel').isVisible(),true);
    assert.equal(await page.locator('#studio-wav-start').isEnabled(),true);
    assert.equal(await page.locator('#studio-wav-stop').isDisabled(),true);
    // Never request microphone access in CI: only exercise opening/closing UI.
    await page.locator('#studio-wav-close').click();
    assert.equal(await page.locator('#studio-wav-panel').isVisible(),false);
    // The mobile TOOLS drawer stays open by design; its own close action is reachable above the footer.
    await page.locator('#tools-close').click();
    assert.equal(await page.locator('#tools-menu-panel').evaluate(el=>el.classList.contains('menu-open')),false);

    await page.locator('#addtrack').click();
    assert.equal(await page.locator('#track-controls .track-control').count(),2);
    await page.locator('#back-projects').click();
    await page.waitForFunction(()=>!document.querySelector('#project-library-screen').hidden);
    assert.equal(await page.locator('#local-project-list .local-project-card').count(),1);

    // Reopen in a fresh page load to prove local project persistence.
    await page.reload({waitUntil:'load',timeout:30000});
    await page.waitForFunction(()=>document.querySelector('#local-project-list .local-project-card'));
    await page.locator('#local-project-list .local-project-card').first().click();
    await page.waitForFunction(()=>!document.querySelector('#app').hidden);
    assert.equal(await page.locator('#track-controls .track-control').count(),2);
    assert.equal(await page.locator('#record').isEnabled(),true);
    assert.equal(await page.locator('#export-compress-opus').isDisabled(),true);
    assert.deepEqual(pageErrors,[],'No uncaught JavaScript errors');
    console.log('STUDIO 029 PASS: mobile project create/reopen + 2 tracks + WAV panel + Opus guard, remote access blocked.');
  }finally{
    if(page){
      fs.mkdirSync(path.dirname(SHOT),{recursive:true});
      try{await page.screenshot({path:SHOT,fullPage:false,timeout:10000})}
      catch(e){console.error('Screenshot unavailable:',e.message)}
    }
    try{await browser?.close()}catch{}
    if(server.listening)await close();
  }
})().catch(e=>{console.error('STUDIO 029 FAIL:',e);process.exitCode=1});
