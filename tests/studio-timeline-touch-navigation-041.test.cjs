'use strict';
// STUDIO-031: realistic browser API exercise with Chrome's SYNTHETIC microphone.
// No real microphone, user audio, network, account, Supabase, production writes, or deletion.
// The browser profile and OPFS/IndexedDB are ephemeral for this run only.
const assert=require('node:assert/strict'),http=require('node:http'),
  fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const STUBS={
  '/js/supabase.js':`window.dbClient={
    from(){return{select(){return{order:async()=>({data:[],error:null})}}}},
    storage:{from(){throw Error('Remote storage forbidden in 030')}}
  };`,
  '/js/auth.js':`window.requireAuth=async()=>({id:'synthetic-ci-only'});`,
  '/js/audio-publish.js':`window.ForestAudioPublish={
    publishNormalAudio:async()=>{throw Error('Remote publication forbidden in 030')}
  };`
};
function serve(req,res){
  const u=new URL(req.url||'/', 'http://127.0.0.1');
  const name=u.pathname;
  const respond=(code,body,type='text/plain; charset=utf-8')=>{
    res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  };
  if(Object.hasOwn(STUBS,name))return respond(200,STUBS[name],'application/javascript; charset=utf-8');
  if(name==='/studio.html')return respond(200,fs.readFileSync(path.join(ROOT,'studio.html')),'text/html; charset=utf-8');
  if(!/^\/js\/[a-z0-9-]+\.js$/.test(name))return respond(404,'Missing');
  const file=path.resolve(ROOT,name.slice(1));
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return respond(404,'Missing');
  return respond(200,fs.readFileSync(file),'application/javascript; charset=utf-8');
}
const server=http.createServer(serve);
const listen=()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=()=>new Promise(resolve=>server.close(resolve));
(async()=>{
 let browser;
 try{
  const port=await listen();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1'&&url.port===String(port))return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:'+port+'/studio.html',{waitUntil:'load'});
  await page.waitForFunction(()=>/Crée ton premier projet/.test(document.querySelector('#project-library-status')?.textContent||''),null,{timeout:15000});
  await page.locator('#create-local-project').click();
  await page.waitForFunction(()=>!document.querySelector('#app').hidden);
  await page.evaluate(()=>{
    tracks.push({id:'ci-track-B',type:'sound',name:'Musique',color:'#009982',gain:1,muted:false});
    clips.push({id:'ci-take-A',track:tracks[0].id,sourceId:'test-no-file',name:'Voix',start:4,trim:0,len:6,gain:1,muted:false});
    zoom=3;render();
    document.querySelector('#timeline').scrollLeft=140;
  });
  const first=page.locator('#tracks .clip').first();
  const getPosition=()=>page.evaluate(()=>({
    scroll:document.querySelector('#timeline').scrollLeft,
    start:clips[0].start,
    track:clips[0].track,
    selected:selected?.id||null,
    panel:document.querySelector('#editor').classList.contains('show'),
    undo:undo.length
  }));
  const touch=await page.context().newCDPSession(page);
  const swipe=async(x,y,dx,dy=0)=>{
    const at=(xx,yy)=>({x:Math.round(xx),y:Math.round(yy)});
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at(x,y)]});
    for(let i=1;i<=12;i++){
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[at(x+dx*i/12,y+dy*i/12)]});
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(250);
  };
  const clipBox=await first.boundingBox();
  const timelineBox=await page.locator('#timeline').boundingBox();
  assert(clipBox&&timelineBox);
  const cx=Math.min(timelineBox.x+timelineBox.width-35,Math.max(timelineBox.x+35,clipBox.x+48));
  const cy=clipBox.y+clipBox.height/2;
  assert(cx>clipBox.x+3&&cx<clipBox.x+clipBox.width-3,'Swipe must begin inside clip');
  const initial=await getPosition();
  assert.equal(initial.selected,null);
  await swipe(cx,cy,-90);
  const swiped=await getPosition();
  assert.equal(swiped.start,4,'UNSELECTED touch swipe changed clip time');
  assert.equal(swiped.track,initial.track,'UNSELECTED touch swipe changed track');
  assert.equal(swiped.selected,null,'UNSELECTED swipe selected clip');
  assert.equal(swiped.panel,false,'UNSELECTED swipe opened editor');
  assert.equal(swiped.undo,initial.undo,'UNSELECTED swipe made undo entry');
  assert(swiped.scroll>initial.scroll+15,'Touch gesture must PAN horizontal timeline: '+JSON.stringify({initial,swiped}));
  console.log('STUDIO-041 UNSELECTED CLIP TOUCH SCROLL PASS '+JSON.stringify({initial,swiped}));

  // Tap selects, second tap deselects and reduces screen usage.
  await first.scrollIntoViewIfNeeded();
  let box=await first.boundingBox();
  let x=Math.min(timelineBox.x+timelineBox.width-45,Math.max(timelineBox.x+40,box.x+70)),y=box.y+box.height/2;
  await page.touchscreen.tap(x,y);
  await page.waitForFunction(()=>selected?.id==='ci-take-A');
  assert.equal(await page.locator('#editor').isVisible(),true);
  assert.equal(await page.locator('#clip-close').isVisible(),true);
  await page.touchscreen.tap(x,y);
  await page.waitForFunction(()=>selected===null);
  assert.equal(await page.locator('#editor').isVisible(),false);
  console.log('STUDIO-041 REPEAT TAP TOGGLE PANEL PASS');

  // A tap in the EMPTY second track also dismisses selection.
  await page.touchscreen.tap(x,y);
  await page.waitForFunction(()=>selected?.id==='ci-take-A');
  const lane=await page.locator('#tracks .lane').nth(1).boundingBox();
  await page.touchscreen.tap(timelineBox.x+50,lane.y+Math.min(lane.height-10,45));
  await page.waitForFunction(()=>selected===null);
  assert.equal(await page.locator('#editor').isVisible(),false);
  console.log('STUDIO-041 EMPTY LANE TAP CLOSES PANEL PASS');

  // Explicit X is a second escape hatch for accessible phone use.
  await page.touchscreen.tap(x,y);
  await page.waitForFunction(()=>selected?.id==='ci-take-A');
  await page.locator('#clip-close').click();
  await page.waitForFunction(()=>selected===null);
  assert.equal(await page.locator('#editor').isVisible(),false);
  console.log('STUDIO-041 VISIBLE CLOSE BUTTON PASS');

  // Deliberately select first; only the NEXT gesture can move audio.
  await page.touchscreen.tap(x,y);
  await page.waitForFunction(()=>selected?.id==='ci-take-A');
  await swipe(x,y,55);
  await page.waitForFunction(()=>clips[0].start>4.2);
  const moved=await getPosition();
  assert.equal(moved.track,initial.track);
  assert(moved.start>4.2,'Selected clip did not move');
  assert.equal(moved.undo,initial.undo+1,'Intentional drag must remain undoable');
  await page.evaluate(()=>{$('#undo').click()});
  await page.waitForFunction(()=>Math.abs(clips[0].start-4)<.0001);
  console.log('STUDIO-041 SELECTED SECOND-GESTURE MOVE + UNDO PASS '+JSON.stringify(moved));
  assert.deepEqual(pageErrors,[],'No uncaught browser errors');
 }finally{
  try{await browser?.close()}catch{}
  if(server.listening)await close();
 }
})().catch(err=>{console.error('STUDIO-041 FAIL:',err);process.exitCode=1});
