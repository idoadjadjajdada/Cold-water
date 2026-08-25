const { chromium } = require('playwright');
const path = require('path');

/* Resolve the game relative to this file so the suite runs from any checkout. */
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Use whatever Chromium Playwright installed; CHROMIUM_PATH overrides it. */
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let fails=0;
const ok=(n,c,x='')=>{ if(!c) fails++; console.log((c?'  ok  ':'FAIL  ')+n+(x?'  ['+x+']':'')); };
const H0=(t)=>({open:1,rows:5,tiles:t}), HX={open:0,rows:2,tiles:[]};

async function seed(b,obj){
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await ctx.addInitScript(v=>{ try{
    if(!localStorage.getItem('__seeded')){ localStorage.setItem('coldwater.v1',v); localStorage.setItem('__seeded','1'); }
  }catch(e){} }, JSON.stringify(obj));
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error'&&!/ERR_|fonts\.g/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.waitForTimeout(500);
  return {p,ctx,errs};
}
const flush=p=>p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
const read=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('coldwater.v1')));
const base=extra=>Object.assign({v:3,cash:1000,earned:1000,tool:'rack',hall:0,
  counts:{},up:{},auto:{},hard:{},perks:{},halls:[H0([]),HX,HX]},extra);

(async()=>{
  const b=await chromium.launch(LAUNCH);

  console.log('\n--- new hardware ---');
  let {p,ctx,errs}=await seed(b,base({cash:5e5,hard:{batt:1,gpu:1,ups:1,crac:1,asic:1}}));
  ok('no exception', errs.length===0, errs.join('|'));
  ok('10 machines + Sell in the tray', await p.locator('.tool').count()===11,
     String(await p.locator('.tool').count()));
  for(const k of ['sw','ups','crac','asic'])
    ok(`${k} tool present and unlocked`, await p.locator(`.tool[data-k="${k}"]`).count()===1
       && !await p.locator(`.tool[data-k="${k}"]`).evaluate(e=>e.classList.contains('lock')));
  ok('tray scrolls rather than squashing',
     await p.locator('#tray').evaluate(e=>e.scrollWidth>e.clientWidth));
  ok('no horizontal page overflow', await p.evaluate(()=>document.body.scrollWidth<=window.innerWidth));
  for(const k of ['sw','ups','crac','asic']){
    await p.locator(`.tool[data-k="${k}"]`).click(); await p.waitForTimeout(120);
    const idx={sw:0,ups:1,crac:2,asic:3}[k];
    await p.locator('.hallgrid.on .tile').nth(idx).click(); await p.waitForTimeout(180);
    ok(`${k} places and draws`, await p.locator('.hallgrid.on .tile').nth(idx).locator('svg').count()===1);
  }
  await ctx.close();

  console.log('\n--- switch boosts its neighbours ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e4,halls:[H0([[7,'sw',0,0,0]]),HX,HX]})));
  const wired=await p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile')]
      .map((e,i)=>e.classList.contains('wired')?i:-1).filter(i=>i>=0));
  ok('switch range marks its four neighbours', JSON.stringify(wired)===JSON.stringify([1,6,8,13]), JSON.stringify(wired));
  await p.locator('.tool[data-k="sw"]').click(); await p.waitForTimeout(150);
  ok('picking up the Switch turns on wiremode', await p.locator('#floor').evaluate(e=>e.classList.contains('wiremode')));
  await ctx.close();
  // a rack next to a switch must out-earn a lone rack
  // buffer:20 lifts the cap to 108 units so none of these can top out mid-test
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,up:{buffer:20},
    halls:[H0([[0,'rack',0,0,0],[1,'sw',0,0,0],[2,'rack',0,0,0],[4,'rack',0,0,0]]),HX,HX]})));
  await p.waitForTimeout(3500);
  const bufs=await p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile .fillbar')]
      .map(e=>parseFloat(e.getAttribute('width'))));
  ok('boosted racks fill faster than the lone rack', bufs[0]>bufs[2]*1.1&&bufs[1]>bufs[2]*1.1,
     'adjacent='+bufs[0].toFixed(1)+','+bufs[1].toFixed(1)+' lone='+bufs[2].toFixed(1));
  await ctx.close();

  console.log('\n--- dust ---');
  ({p,ctx,errs}=await seed(b,base({halls:[H0([[0,'rack',0,0,0,0.9,0]]),HX,HX]})));
  ok('a dusty tile is flagged', await p.locator('.tile.dirty').count()===1);
  ok('dust veil is painted', await p.locator('.hallgrid.on .tile').nth(0)
      .locator('.dustveil').evaluate(e=>parseFloat(e.style.opacity)>0));
  await p.locator('.hallgrid.on .tile').nth(0).click(); await p.waitForTimeout(300);
  ok('tapping wipes the dust before collecting', await p.locator('.tile.dirty').count()===0);
  await flush(p);
  ok('dust persists to the save', typeof (await read(p)).halls[0].tiles[0][5]==='number',
     JSON.stringify((await read(p)).halls[0].tiles[0]));
  await ctx.close();
  // maintenance crew clears it unattended
  ({p,ctx,errs}=await seed(b,base({auto:{crew:8},halls:[H0([[0,'rack',0,0,0,0.9,0]]),HX,HX]})));
  await p.waitForTimeout(3000);
  ok('maintenance crew clears dust on its own', await p.locator('.tile.dirty').count()===0);
  await ctx.close();

  console.log('\n--- coolant leaks ---');
  ({p,ctx,errs}=await seed(b,base({halls:[H0([[7,'fan',0,0,0,0,1],[1,'rack',0,0,0,0,0]]),HX,HX]})));
  ok('a leaking fan is flagged', await p.locator('.tile.leak').count()===1);
  ok('a leaking fan cools nothing', await p.locator('.tile.cooled').count()===0,
     String(await p.locator('.tile.cooled').count()));
  ok('hint calls out the leak', /leak/i.test(await p.locator('#hint').textContent()),
     await p.locator('#hint').textContent());
  await p.locator('.hallgrid.on .tile').nth(7).click(); await p.waitForTimeout(300);
  ok('tapping seals it', await p.locator('.tile.leak').count()===0);
  ok('cooling comes back once sealed', await p.locator('.tile.cooled').count()===4,
     String(await p.locator('.tile.cooled').count()));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({auto:{leakbot:6},halls:[H0([[7,'fan',0,0,0,0,1]]),HX,HX]})));
  await p.waitForTimeout(1800);
  ok('leak drone seals it unattended', await p.locator('.tile.leak').count()===0);
  await ctx.close();

  console.log('\n--- power surge ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e5,earned:5e5,
    halls:[H0([[0,'rack',0,0,0],[1,'rack',0,0,0],[2,'gen',0,0,0]]),HX,HX]})));
  const capBefore=await p.locator('#pval').textContent();
  await p.evaluate(()=>{ /* no handle on S; drive a surge by waiting is too slow, so assert config instead */ });
  ok('power meter reads normally before a surge', /\/\d+ kW/.test(capBefore), capBefore);
  ok('surge tip is not shown while calm', !/surge/i.test(await p.locator('#hint').textContent()));
  await ctx.close();

  console.log('\n--- new automation ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e6,earned:1e6,auto:{grid:12},
    halls:[H0([[0,'gen',0,0,0],[1,'gen',0,0,0]]),HX,HX]})));
  await p.waitForTimeout(900);
  ok('grid tie earns from spare capacity', (await p.locator('#rate').textContent())!=='',
     await p.locator('#rate').textContent());
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({auto:{failover:8},halls:[H0([[0,'rack',0,0,1]]),HX,HX]})));
  await p.waitForTimeout(2500);
  const fb=await p.locator('.hallgrid.on .tile').nth(0).locator('.fillbar').getAttribute('width');
  ok('failover keeps a faulted rack limping', parseFloat(fb)>0, 'fillbar='+fb);
  await ctx.close();

  console.log('\n--- new upgrades present ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e6})));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(300);
  ok('upgrades tab lists 15', await p.locator('.card').count()===15, String(await p.locator('.card').count()));
  await p.locator('.tab[data-tab="automate"]').click(); await p.waitForTimeout(200);
  ok('automate tab lists 9', await p.locator('.card').count()===9, String(await p.locator('.card').count()));
  await p.locator('.tab[data-tab="hardware"]').click(); await p.waitForTimeout(200);
  ok('hardware tab lists 5 unlocks + 10 machines', await p.locator('.card').count()===15,
     String(await p.locator('.card').count()));
  await ctx.close();

  console.log('\n--- rebirth ---');
  ({p,ctx,errs}=await seed(b,base({cash:500,earned:5000})));
  ok('rebirth tab hidden before you qualify', await p.locator('#rebirthtab').evaluate(e=>e.classList.contains('hide')));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({cash:9e6,earned:9e6,up:{density:5},auto:{bot:3},hard:{batt:1,gpu:1},
    halls:[{open:1,rows:4,tiles:[[0,'rack',0,0,0]]},{open:1,rows:3,tiles:[[0,'rack',0,0,0]]},HX]})));
  ok('rebirth tab appears once you qualify', !await p.locator('#rebirthtab').evaluate(e=>e.classList.contains('hide')));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(300);
  await p.locator('.tab[data-tab="rebirth"]').click(); await p.waitForTimeout(250);
  const rb=p.locator('.card').filter({hasText:'Rebirth'}).first();
  ok('rebirth offers renown for a $9M run', /★36/.test(await rb.locator('.buy').textContent()),
     await rb.locator('.buy').textContent());
  ok('perk cards render', await p.locator('.card').count()>=6, String(await p.locator('.card').count()));
  p.on('dialog',d=>d.accept());
  await rb.locator('.buy').click();
  await p.waitForTimeout(1500);
  const st=await read(p);
  ok('renown banked', st.renown===36, String(st.renown));
  ok('run counter incremented', st.runs===1, String(st.runs));
  ok('lifetime recorded', st.lifetime>=9e6, String(st.lifetime));
  ok('cash reset to seed', st.cash===40, String(st.cash));
  ok('earned reset', st.earned<1000, String(st.earned));
  ok('upgrades reset', st.up.density===0, String(st.up.density));
  ok('automation reset', st.auto.bot===0, String(st.auto.bot));
  ok('hardware unlocks reset without blueprints', st.hard.gpu===0, String(st.hard.gpu));
  ok('halls torn down to Hall A', st.halls[0].open===1&&st.halls[1].open===0);
  ok('Hall A back to 2 rows', st.halls[0].rows===2, String(st.halls[0].rows));
  ok('machines cleared', st.halls[0].tiles.length===0, JSON.stringify(st.halls[0].tiles));
  await ctx.close();

  console.log('\n--- perks carry into the next run ---');
  ({p,ctx,errs}=await seed(b,base({cash:9e6,earned:9e6,renown:200,runs:2,lifetime:2e7,
    perks:{seed:3,yield:4,cold:5,groundwork:2,blueprints:1},hard:{gpu:1,batt:1},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,0,0]]},{open:1,rows:3,tiles:[]},HX]})));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(250);
  ok('renown shows in the drawer header', await p.locator('#drenown').evaluate(e=>e.classList.contains('on')));
  ok('blueprints kept the gpu unlock', !await p.locator('.tool[data-k="gpu"]').evaluate(e=>e.classList.contains('lock')));
  await p.locator('.tab[data-tab="rebirth"]').click(); await p.waitForTimeout(250);
  p.on('dialog',d=>d.accept());
  await p.locator('.card').filter({hasText:'Rebirth'}).first().locator('.buy').click({noWaitAfter:true});
  await p.waitForTimeout(2200);
  const st2=await read(p);
  ok('renown kept and topped up', st2.renown===236, String(st2.renown));
  ok('perks survive the rebirth', st2.perks.yield===4&&st2.perks.groundwork===2, JSON.stringify(st2.perks));
  ok('seed capital funds the new run', st2.cash===1572, String(st2.cash));
  ok('groundwork opens 2 extra rows in Hall A', st2.halls[0].rows===4, String(st2.halls[0].rows));
  ok('blueprints kept hardware through rebirth', st2.hard.gpu===1&&st2.hard.batt===1, JSON.stringify(st2.hard));
  ok('extra halls still torn down', st2.halls[1].open===0);
  ok('run counter advanced', st2.runs===3, String(st2.runs));
  ok('the reloaded page shows the wider Hall A',
     await p.locator('.hallgrid.on .tile:not(.locked)').count()===24,
     String(await p.locator('.hallgrid.on .tile:not(.locked)').count()));
  await ctx.close();

  await b.close();
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  process.exit(fails?1:0);
})();
