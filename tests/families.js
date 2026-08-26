const { chromium } = require('playwright');
const path = require('path');

/* Resolve the game relative to this file so the suite runs from any checkout. */
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Use whatever Chromium Playwright installed; CHROMIUM_PATH overrides it. */
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let fails=0;
const ok=(n,c,x='')=>{ if(!c) fails++; console.log((c?'  ok  ':'FAIL  ')+n+(x?'  ['+x+']':'')); };
const HX={open:0,rows:2,tiles:[]};
const ALL={batt:1,gpu:1,ups:1,crac:1,asic:1,tank:1,solar:1,spine:1,heatx:1,quantum:1,
           sensor:1,halon:1,silo:1,vault:1,desk:1,exchange:1};

async function seed(b,obj,vp){
  const ctx=await b.newContext({viewport:vp||{width:390,height:844}});
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
const base=extra=>Object.assign({v:3,cash:1e8,earned:1e8,tool:'rack',hall:0,
  counts:{},up:{},auto:{},hard:{},perks:{},
  halls:[{open:1,rows:5,tiles:[]},HX,HX]},extra);
const marks=(p,cls)=>p.evaluate(c=>[...document.querySelectorAll('.hallgrid.on .tile')]
  .map((e,i)=>e.classList.contains(c)?i:-1).filter(i=>i>=0),cls);
const bars=p=>p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile .fillbar')]
  .map(e=>parseFloat(e.getAttribute('width'))));

(async()=>{
  const b=await chromium.launch(LAUNCH);

  console.log('\n--- all six place and render ---');
  let {p,ctx,errs}=await seed(b,base({hard:ALL}));
  ok('no exception', errs.length===0, errs.join('|'));
  ok('21 machines + Sell in the tray', await p.locator('.tool').count()===22,
     String(await p.locator('.tool').count()));
  ok('the tray is grouped by family', await p.locator('.traysep').count()===6,
     String(await p.locator('.traysep').count()));
  for(const [i,k] of ['sensor','halon','silo','vault','desk','exchange'].entries()){
    ok(`${k} is unlocked`, !await p.locator(`.tool[data-k="${k}"]`).evaluate(e=>e.classList.contains('lock')));
    await p.locator(`.tool[data-k="${k}"]`).click(); await p.waitForTimeout(100);
    await p.locator('.hallgrid.on .tile').nth(i).click(); await p.waitForTimeout(160);
    ok(`${k} places and renders`, await p.locator('.hallgrid.on .tile').nth(i).locator('svg').count()===1);
  }
  await ctx.close();

  console.log('\n--- care: sensors and suppression ---');
  ({p,ctx,errs}=await seed(b,base({hard:ALL,halls:[{open:1,rows:5,tiles:[[8,'sensor',0,0,0,0,0]]},HX,HX]})));
  await p.locator('.tool[data-k="sensor"]').click(); await p.waitForTimeout(200);
  ok('holding a Sensor previews its four neighbours',
     JSON.stringify(await marks(p,'cared'))===JSON.stringify([2,7,9,14]),
     JSON.stringify(await marks(p,'cared')));
  ok('caremode is on', await p.locator('#floor').evaluate(e=>e.classList.contains('caremode')));
  await p.locator('.tool[data-k="rack"]').click(); await p.waitForTimeout(150);
  ok('the preview is only shown while the tool is held',
     !await p.locator('#floor').evaluate(e=>e.classList.contains('caremode')));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({hard:ALL,halls:[{open:1,rows:5,tiles:[[8,'halon',0,0,0,0,0]]},HX,HX]})));
  await p.locator('.tool[data-k="halon"]').click(); await p.waitForTimeout(200);
  ok('a Suppression rig covers its row and column',
     JSON.stringify(await marks(p,'cared'))===JSON.stringify([2,6,7,8,9,10,11,14,20,26]),
     JSON.stringify(await marks(p,'cared')));
  await ctx.close();
  /* Faults are a dice roll, so they cannot be asserted in one run. Dust uses the
     same protection factor and accrues deterministically, so measure that. */
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,up:{},auto:{},
    halls:[{open:1,rows:5,tiles:[[7,'rack',0,0,0,0,0],[1,'sensor',0,0,0,0,0],
                                 [6,'sensor',0,0,0,0,0],[8,'sensor',0,0,0,0,0],
                                 [4,'rack',0,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(9000);
  await flush(p);
  const cv=await read(p);
  const dust=k=>cv.halls[0].tiles.find(t=>t[0]===k)[5];
  ok('a watched rack gathers dust more slowly than a bare one', dust(7)<dust(4),
     'watched='+dust(7)+' bare='+dust(4));
  await ctx.close();

  console.log('\n--- store: silos and vaults ---');
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,up:{buffer:0},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,0,0,0,0],[1,'silo',0,0,0,0,0],[4,'rack',0,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(11000);
  await flush(p);
  const sv=await read(p);
  const buf=k=>sv.halls[0].tiles.find(t=>t[0]===k)[3];
  ok('the bare rack stops at the base cap of 8', buf(4)<=8.01, 'bare='+buf(4));
  ok('the silo neighbour banks well past it', buf(0)>buf(4)*1.5,
     'nextToSilo='+buf(0)+' bare='+buf(4));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({hard:ALL,halls:[{open:1,rows:5,tiles:[[0,'vault',0,0,0,0,0]]},HX,HX]})));
  await p.locator('.tool[data-k="vault"]').click(); await p.waitForTimeout(250);
  ok('a Vault marks the whole hall', (await marks(p,'stored')).length===30,
     String((await marks(p,'stored')).length));
  await ctx.close();

  console.log('\n--- market: desks and exchanges ---');
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,8,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(700);
  await p.locator('.hallgrid.on .tile').nth(0).click(); await p.waitForTimeout(400);
  const plain=await p.evaluate(()=>parseFloat(document.querySelector('#cash').textContent.replace(/[^0-9.]/g,'')));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,8,0,0,0],[5,'desk',0,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(700);
  await p.locator('.hallgrid.on .tile').nth(0).click(); await p.waitForTimeout(400);
  const withDesk=await p.evaluate(()=>parseFloat(document.querySelector('#cash').textContent.replace(/[^0-9.]/g,'')));
  ok('a Desk raises what the same compute sells for', withDesk>plain*1.1,
     'plain=$'+plain+' desk=$'+withDesk);
  await p.locator('.tool[data-k="desk"]').click(); await p.waitForTimeout(250);
  ok('holding a Desk marks the hall it serves', (await marks(p,'markd')).length===30,
     String((await marks(p,'markd')).length));
  await ctx.close();
  // an exchange reaches across halls, a desk does not
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,8,0,0,0]]},
           {open:1,rows:2,tiles:[[0,'exchange',0,0,0,0,0]]},HX]})));
  await p.waitForTimeout(700);
  await p.locator('.hallgrid.on .tile').nth(0).click(); await p.waitForTimeout(400);
  const crossHall=await p.evaluate(()=>parseFloat(document.querySelector('#cash').textContent.replace(/[^0-9.]/g,'')));
  ok('an Exchange in another hall still lifts the price', crossHall>plain*1.1,
     'plain=$'+plain+' exchange-elsewhere=$'+crossHall);
  await ctx.close();

  console.log('\n--- the three family upgrades ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e8})));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(300);
  ok('upgrades tab lists 23', await p.locator('.card').count()===23, String(await p.locator('.card').count()));
  for(const n of ['Diagnostics','Deep racking','Brokerage'])
    ok(`${n} is on the list`, await p.locator('.card').filter({hasText:n}).count()===1);
  await p.locator('.tab[data-tab="hardware"]').click(); await p.waitForTimeout(250);
  ok('hardware tab lists 16 unlocks + 21 machines', await p.locator('.card').count()===37,
     String(await p.locator('.card').count()));
  await ctx.close();

  console.log('\n--- saves survive the new hardware ---');
  ({p,ctx,errs}=await seed(b,base({hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'sensor',0,0,0,0,0],[1,'silo',0,0,0,0,0],[2,'desk',0,0,0,0,0],
                                 [3,'vault',0,0,0,0,0],[4,'exchange',0,0,0,0,0],[5,'halon',0,0,0,0,0]]},HX,HX]})));
  await flush(p);
  const back=await read(p);
  ok('all six round-trip through the save', back.halls[0].tiles.length===6, JSON.stringify(back.counts));
  ok('counts are rebuilt from the tiles',
     back.counts.sensor===1&&back.counts.vault===1&&back.counts.exchange===1, JSON.stringify(back.counts));
  await ctx.close();
  // an old save that predates them still loads
  ({p,ctx,errs}=await seed(b,{v:1,cash:900,rows:3,earned:5000,tool:'rack',
    counts:{rack:2},up:{},auto:{},hard:{},tiles:[[0,'rack',10,3,0],[7,'fan',5,0,0]]}));
  ok('a v1 save still loads alongside the new hardware', errs.length===0, errs.join('|'));
  ok('and keeps its machines', await p.locator('.hallgrid.on .tile svg').count()===2,
     String(await p.locator('.hallgrid.on .tile svg').count()));
  await ctx.close();

  await b.close();
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  process.exit(fails?1:0);
})();
