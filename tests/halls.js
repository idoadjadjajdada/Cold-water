const { chromium } = require('playwright');
const path = require('path');

/* Resolve the game relative to this file so the suite runs from any checkout. */
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Use whatever Chromium Playwright installed; CHROMIUM_PATH overrides it. */
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let fails=0;
const ok=(n,c,x='')=>{ if(!c) fails++; console.log((c?'  ok  ':'FAIL  ')+n+(x?'  ['+x+']':'')); };

async function seed(browser,obj,vp){
  const ctx=await browser.newContext({viewport:vp||{width:390,height:844},hasTouch:true,isMobile:true});
  await ctx.addInitScript(v=>{ try{ localStorage.setItem('coldwater.v1',v); }catch(e){} }, JSON.stringify(obj));
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error'&&!/ERR_|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.waitForTimeout(500);
  return {p,ctx,errs};
}
const flush=p=>p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
const read=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('coldwater.v1')));

(async()=>{
  const b=await chromium.launch(LAUNCH);

  console.log('\n--- v1 save migrates into Hall A ---');
  let {p,ctx,errs}=await seed(b,{v:1,cash:900,rows:3,earned:5000,tool:'rack',
    counts:{rack:2},up:{},auto:{},hard:{},tiles:[[0,'rack',10,3,0],[7,'fan',5,0,0]]});
  ok('no exception', errs.length===0, errs.join('|'));
  ok('rows carried over (18 unlocked)', await p.locator('.tile:not(.locked)').count()===18,
     String(await p.locator('.tile:not(.locked)').count()));
  ok('machines carried over', await p.locator('.hallgrid.on .tile svg').count()===2,
     String(await p.locator('.hallgrid.on .tile svg').count()));
  await flush(p);
  const st=await read(p);
  ok('resaved as v3 with halls', st.v===3&&Array.isArray(st.halls), 'v'+st.v);
  ok('hall A holds the old tiles', st.halls[0].tiles.length===2, JSON.stringify(st.halls[0].tiles));
  ok('halls B and C start closed', !st.halls[1].open&&!st.halls[2].open);
  await ctx.close();

  console.log('\n--- fan coverage highlight ---');
  ({p,ctx,errs}=await seed(b,{v:2,cash:5000,earned:5000,tool:'rack',counts:{},up:{},auto:{},hard:{},
    halls:[{open:1,rows:3,tiles:[[7,'fan',0,0,0]]},{open:0,rows:2,tiles:[]},{open:0,rows:2,tiles:[]}]}));
  // fan at index 7 => x=1,y=1. neighbours: 1(0,1)? no: idx 1 =(1,0), 6=(0,1), 8=(2,1), 13=(1,2)
  const cooled=await p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile')]
      .map((e,i)=>e.classList.contains('cooled')?i:-1).filter(i=>i>=0));
  ok('exactly the four neighbours are marked', JSON.stringify(cooled)===JSON.stringify([1,6,8,13]), JSON.stringify(cooled));
  ok('the fan tile itself is not marked', !cooled.includes(7));
  await p.locator('.tool[data-k="fan"]').click(); await p.waitForTimeout(200);
  ok('picking up the Fan turns on fanmode', await p.locator('#floor').evaluate(e=>e.classList.contains('fanmode')));
  await p.locator('.tool[data-k="rack"]').click(); await p.waitForTimeout(200);
  ok('fanmode clears with another tool', !await p.locator('#floor').evaluate(e=>e.classList.contains('fanmode')));
  await p.locator('.hallgrid.on .tile').nth(7).click(); await p.waitForTimeout(200);
  ok('tapping a fan flashes its range', await p.locator('.tile.coolflash').count()===4,
     String(await p.locator('.tile.coolflash').count()));
  await p.waitForTimeout(1000);
  ok('the flash clears', await p.locator('.tile.coolflash').count()===0);
  // coverage updates when a fan is removed
  await p.locator('.tool[data-k="sell"]').click(); await p.waitForTimeout(150);
  await p.locator('.hallgrid.on .tile').nth(7).click(); await p.waitForTimeout(300);
  ok('coverage clears when the fan is sold', await p.locator('.tile.cooled').count()===0,
     String(await p.locator('.tile.cooled').count()));
  await ctx.close();

  console.log('\n--- sell mode ---');
  ({p,ctx,errs}=await seed(b,{v:2,cash:1000,earned:5000,tool:'rack',counts:{},up:{},auto:{},hard:{},
    halls:[{open:1,rows:3,tiles:[[0,'rack',0,0,0],[1,'gen',0,0,0]]},{open:0,rows:2,tiles:[]},{open:0,rows:2,tiles:[]}]}));
  ok('tray has a Sell tool', await p.locator('.tool[data-k="sell"]').count()===1);
  await p.locator('.tool[data-k="sell"]').click(); await p.waitForTimeout(250);
  ok('Sell tool highlights', await p.locator('.tool[data-k="sell"]').evaluate(e=>e.classList.contains('sel')));
  ok('machines get a sell outline', await p.locator('.tile.sellable').count()===2,
     String(await p.locator('.tile.sellable').count()));
  ok('hint explains sell mode', /Sell mode/.test(await p.locator('#hint').textContent()));
  const before=await p.locator('#cash').textContent();
  await p.locator('.hallgrid.on .tile').nth(1).click(); await p.waitForTimeout(300);
  ok('single tap sells in sell mode', await p.locator('.hallgrid.on .tile').nth(1).evaluate(e=>e.classList.contains('empty')));
  ok('refund paid', await p.locator('#cash').textContent()!==before, before+' -> '+await p.locator('#cash').textContent());
  const cash2=await p.locator('#cash').textContent();
  await p.locator('.hallgrid.on .tile').nth(5).click(); await p.waitForTimeout(250);
  ok('tapping empty ground in sell mode does nothing', await p.locator('#cash').textContent()===cash2);
  await p.locator('.tool[data-k="rack"]').click(); await p.waitForTimeout(200);
  ok('leaving sell mode clears the outlines', await p.locator('.tile.sellable').count()===0);
  await flush(p);
  ok('sell mode is never persisted', (await read(p)).tool!=='sell', (await read(p)).tool);
  await ctx.close();

  console.log('\n--- buying and switching halls ---');
  ({p,ctx,errs}=await seed(b,{v:2,cash:80000,earned:200000,tool:'rack',counts:{},up:{},auto:{},hard:{},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,0,0]]},{open:0,rows:2,tiles:[]},{open:0,rows:2,tiles:[]}]}));
  ok('hall bar visible once a hall is in reach', await p.locator('#halls').evaluate(e=>e.classList.contains('on')));
  ok('one hall chip plus the add chip', await p.locator('.hallchip').count()===2,
     String(await p.locator('.hallchip').count()));
  await p.locator('.hallchip.add').click(); await p.waitForTimeout(350);
  ok('add chip opens the Floor tab', await p.locator('.tab[data-tab="floor"]').evaluate(e=>e.classList.contains('on')));
  const buyBtn=p.locator('.card').filter({hasText:'Hall B'}).locator('.buy');
  ok('Hall B is affordable at $80k', !(await buyBtn.isDisabled()));
  await buyBtn.click(); await p.waitForTimeout(600);
  ok('buying a hall closes the shop', !await p.locator('#drawer').evaluate(e=>e.classList.contains('open')));
  ok('Hall B opened and became active', await p.locator('.hallchip.on').textContent()==='Hall B',
     await p.locator('.hallchip.on').textContent());
  ok('two hall chips plus add-Hall-C', await p.locator('.hallchip').count()===3,
     String(await p.locator('.hallchip').count()));
  ok('a ghost floor appears behind', await p.locator('.ghost.g1').evaluate(e=>e.classList.contains('on')));
  ok('only one grid is shown', await p.locator('.hallgrid.on').count()===1);
  ok('Hall B is 6x6 = 36 tiles', await p.locator('.hallgrid').nth(1).locator('.tile').count()===36,
     String(await p.locator('.hallgrid').nth(1).locator('.tile').count()));
  ok('Hall B starts with 2 rows open', await p.locator('.hallgrid.on .tile:not(.locked)').count()===12,
     String(await p.locator('.hallgrid.on .tile:not(.locked)').count()));
  // the rack left behind in Hall A must keep earning
  await p.waitForTimeout(2500);
  await p.locator('.hallchip').first().click(); await p.waitForTimeout(400);
  /* Hall A's art is only repainted while you are standing in it, so read the bar
     right after switching back: anything past a sliver was earned while away. */
  const awayBar=parseFloat(await p.locator('.hallgrid.on .tile').nth(0).locator('.fillbar').getAttribute('width'));
  ok('the hall you left kept computing', awayBar>8, 'fillbar='+awayBar.toFixed(1)+'/38');
  ok('switching back shows Hall A', await p.locator('.hallchip.on').textContent()==='Hall A');
  ok('Hall A rack survived the trip', await p.locator('.hallgrid.on .tile').nth(0).locator('svg').count()===1);
  await flush(p);
  const st2=await read(p);
  ok('both halls persisted', st2.halls[0].open===1&&st2.halls[1].open===1);
  ok('active hall persisted', st2.hall===0, String(st2.hall));
  await ctx.close();

  console.log('\n--- per-hall rows and site-wide power ---');
  ({p,ctx,errs}=await seed(b,{v:2,cash:500000,earned:1e6,tool:'rack',counts:{},up:{},auto:{},hard:{},
    halls:[{open:1,rows:2,tiles:[[0,'gen',0,0,0],[1,'gen',0,0,0]]},
           {open:1,rows:2,tiles:[[0,'rack',0,0,0],[1,'rack',0,0,0],[2,'rack',0,0,0]]},
           {open:0,rows:2,tiles:[]}]}));
  await p.waitForTimeout(600);
  const pv=await p.locator('#pval').textContent();
  ok('power sums both halls (2 gensets = 40 kW cap)', /\/40 kW/.test(pv), pv);
  ok('draw counts racks in the other hall', /^9\//.test(pv), pv);
  await p.locator('#shopbtn').click(); await p.waitForTimeout(300);
  await p.locator('.tab[data-tab="floor"]').click(); await p.waitForTimeout(200);
  const rowBtn=p.locator('.card').filter({hasText:'Open the next row'}).locator('.buy');
  await rowBtn.click(); await p.waitForTimeout(400);
  ok('row opened in the active hall only', await p.locator('.hallgrid.on .tile:not(.locked)').count()===18,
     String(await p.locator('.hallgrid.on .tile:not(.locked)').count()));
  await flush(p);
  const st3=await read(p);
  ok('other hall rows untouched', st3.halls[1].rows===2, String(st3.halls[1].rows));
  ok('active hall rows saved', st3.halls[0].rows===3, String(st3.halls[0].rows));
  await ctx.close();

  await b.close();
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  process.exit(fails?1:0);
})();
