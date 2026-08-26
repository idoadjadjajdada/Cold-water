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
const base=extra=>Object.assign({v:3,cash:1e7,earned:1e7,tool:'rack',hall:0,
  counts:{},up:{},auto:{},hard:{},perks:{},
  halls:[{open:1,rows:5,tiles:[]},HX,HX]},extra);
const bars=p=>p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile .fillbar')]
  .map(e=>parseFloat(e.getAttribute('width'))));

(async()=>{
  const b=await chromium.launch(LAUNCH);

  console.log('\n--- rotating parts spin on their own axis ---');
  let {p,ctx,errs}=await seed(b,base({hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'fan',0,0,0,0,0],[1,'ac',0,0,0,0,0],[2,'crac',0,0,0,0,0],
                                 [3,'vault',0,0,0,0,0],[4,'quantum',0,0,0,0,0]]},HX,HX]}),
    {width:900,height:900});
  const drift=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.hallgrid.on .tile .spin').forEach(g=>{
      g.style.animation='none'; g.style.transform='rotate(0deg)';
      const a=g.getBoundingClientRect();
      g.style.transform='rotate(90deg)';
      const c=g.getBoundingClientRect();
      out.push(Math.max(Math.abs((a.left+a.width/2)-(c.left+c.width/2)),
                        Math.abs((a.top+a.height/2)-(c.top+c.height/2))));
    });
    return out;
  });
  ok('all five spinners were found', drift.length===5, String(drift.length));
  ok('none of them wanders when rotated', Math.max(...drift)<0.6,
     'worst drift '+Math.max(...drift).toFixed(2)+'px');
  await ctx.close();

  console.log('\n--- dense packing ---');
  /* The fill bar is quantised to 1/40 of each tile's own cap, so it cannot
     resolve a 6% difference. Read the banked buffers instead. */
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,up:{buffer:20},
    halls:[{open:1,rows:5,tiles:[[6,'rack',0,0,0,0,0],[7,'rack',0,0,0,0,0],[8,'rack',0,0,0,0,0],
                                 [4,'rack',0,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(6000);
  await flush(p);
  const pk=await read(p);
  const pbuf=k=>pk.halls[0].tiles.find(t=>t[0]===k)[3];
  ok('a rack with two compute neighbours beats a lone one', pbuf(7)>pbuf(4)*1.08,
     'middle='+pbuf(7)+' lone='+pbuf(4));
  ok('and one neighbour lands between the two', pbuf(6)>pbuf(4)&&pbuf(6)<pbuf(7),
     'edge='+pbuf(6)+' lone='+pbuf(4)+' middle='+pbuf(7));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({halls:[{open:1,rows:5,tiles:[[7,'rack',0,0,0,0,0]]},HX,HX]})));
  await p.locator('.tool[data-k="rack"]').click(); await p.waitForTimeout(250);
  ok('holding a compute tool previews where a cluster would form',
     await p.locator('#floor').evaluate(e=>e.classList.contains('clustermode')));
  const packed=await p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile')]
    .map((e,i)=>e.classList.contains('packed')?i:-1).filter(i=>i>=0));
  ok('and marks only the empty tiles beside it', JSON.stringify(packed)===JSON.stringify([1,6,8,13]),
     JSON.stringify(packed));
  await p.locator('.tool[data-k="fan"]').click(); await p.waitForTimeout(200);
  ok('a non-compute tool drops the preview',
     !await p.locator('#floor').evaluate(e=>e.classList.contains('clustermode')));
  await ctx.close();

  console.log('\n--- weather ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e6,earned:1e6,up:{ambient:10},
    halls:[{open:1,rows:5,tiles:[[0,'rack',60,0,0,0,0]]},HX,HX]})));
  // drive the clock rather than waiting minutes for a natural event
  const heatRate=await p.evaluate(async()=>{
    const before=document.querySelector('.hallgrid.on .tile .heatveil').style.opacity;
    return before;
  });
  ok('the strip is hidden while nothing is happening',
     !await p.locator('#events').evaluate(e=>e.classList.contains('on')));
  ok('no event chips are visible', await p.locator('.ev:visible').count()===0,
     String(await p.locator('.ev:visible').count()));
  await ctx.close();

  console.log('\n--- rush jobs ---');
  /* A job that cannot be finished quickly, so it is still pending when read. */
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:1e6,
    job:{need:100000,got:0,left:50,reward:1234},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,0,0,0,0]]},HX,HX]})));
  ok('a saved job is restored and shown', await p.locator('.ev.job').isVisible());
  ok('the strip shows itself for it', await p.locator('#events').evaluate(e=>e.classList.contains('on')));
  ok('it names the target', /Rush job \d+\/100000/.test(await p.locator('.ev.job .evn').textContent()),
     await p.locator('.ev.job .evn').textContent());
  ok('its countdown is running', await p.locator('.ev.job .evv').textContent()!=='',
     await p.locator('.ev.job .evv').textContent());
  await ctx.close();
  /* One that completes: the bot banks a full rack past a small target. */
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:1e6,auto:{bot:5},
    job:{need:3,got:0,left:45,reward:1234},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,7,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(3000);
  await flush(p);
  /* Read the number, not the rendered "$1.25k" — the suffix is not a decimal. */
  const cash=(await read(p)).cash;
  ok('delivering it pays the reward', cash>1234, '$'+cash.toFixed(0)+' (reward was $1234)');
  ok('and the chip clears', !await p.locator('.ev.job').isVisible());
  ok('a delivered job is not written back', !(await read(p)).job, JSON.stringify((await read(p)).job));
  await ctx.close();
  /* One that runs out: it should simply vanish and cost nothing. Page setup can
     take ten seconds on a loaded machine, so do not assume a short clock here. */
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:1e6,job:{need:999999,got:0,left:6,reward:50}})));
  await p.waitForTimeout(8000);
  ok('an expired job clears without penalty', !await p.locator('.ev.job').isVisible());
  ok('and it costs nothing', (await p.locator('#cash').textContent())==='$0',
     await p.locator('#cash').textContent());
  await ctx.close();
  // a junk job in a save must not crash or persist
  ({p,ctx,errs}=await seed(b,base({job:{need:'lots',got:null,left:'soon',reward:'plenty'}})));
  ok('a malformed job is discarded', errs.length===0 && !await p.locator('.ev.job').isVisible(),
     errs.join('|'));
  await flush(p);
  ok('and is not written back', (await read(p)).job===null||(await read(p)).job===undefined,
     JSON.stringify((await read(p)).job));
  await ctx.close();

  console.log('\n--- the scheduler bot now shows its work ---');
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:1e4,auto:{bot:6},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,7,0,0,0]]},HX,HX]})));
  let sawFlash=false;
  for(let i=0;i<24;i++){
    if(await p.locator('.tile.collected').count()>0){ sawFlash=true; break; }
    await p.waitForTimeout(120);
  }
  ok('a swept tile flashes', sawFlash);
  await ctx.close();

  console.log('\n--- the three new upgrades ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e8})));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(300);
  ok('upgrades tab lists 26', await p.locator('.card').count()===26, String(await p.locator('.card').count()));
  for(const n of ['Dense packing','Building envelope','Service levels'])
    ok(`${n} is on the list`, await p.locator('.card').filter({hasText:n}).count()===1);
  await p.locator('.tab[data-tab="site"]').click(); await p.waitForTimeout(400);
  const rows=await p.evaluate(()=>[...document.querySelectorAll('.stat')].map(e=>e.textContent));
  ok('the site tab explains the outlines', rows.some(r=>/Blue ring/.test(r)), rows.slice(0,3).join(' | '));
  await ctx.close();

  await b.close();
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  process.exit(fails?1:0);
})();
