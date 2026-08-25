const { chromium } = require('playwright');
const path = require('path');

/* Resolve the game relative to this file so the suite runs from any checkout. */
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Use whatever Chromium Playwright installed; CHROMIUM_PATH overrides it. */
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let fails=0;
const ok=(n,c,x='')=>{ if(!c) fails++; console.log((c?'  ok  ':'FAIL  ')+n+(x?'  ['+x+']':'')); };
const HX={open:0,rows:2,tiles:[]};
const ALL={batt:1,gpu:1,ups:1,crac:1,asic:1,tank:1,solar:1,spine:1,heatx:1,quantum:1};

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
const base=extra=>Object.assign({v:3,cash:1e7,earned:1e7,tool:'rack',hall:0,
  counts:{},up:{},auto:{},hard:{},perks:{},
  halls:[{open:1,rows:5,tiles:[]},HX,HX]},extra);
const DESK={width:1440,height:900};

(async()=>{
  const b=await chromium.launch(LAUNCH);

  console.log('\n--- the five new machines ---');
  let {p,ctx,errs}=await seed(b,base({cash:5e7,hard:ALL}));
  ok('no exception', errs.length===0, errs.join('|'));
  for(const k of ['tank','solar','spine','heatx','quantum'])
    ok(`${k} is unlocked and in the tray`, await p.locator(`.tool[data-k="${k}"]`).count()===1
       && !await p.locator(`.tool[data-k="${k}"]`).evaluate(e=>e.classList.contains('lock')));
  for(const [i,k] of ['tank','solar','spine','heatx','quantum'].entries()){
    await p.locator(`.tool[data-k="${k}"]`).click(); await p.waitForTimeout(100);
    await p.locator('.hallgrid.on .tile').nth(i).click(); await p.waitForTimeout(160);
    ok(`${k} places and renders`, await p.locator('.hallgrid.on .tile').nth(i).locator('svg').count()===1);
  }
  await ctx.close();

  console.log('\n--- a spine reaches its row and column ---');
  ({p,ctx,errs}=await seed(b,base({hard:ALL,
    halls:[{open:1,rows:5,tiles:[[8,'spine',0,0,0,0,0]]},HX,HX]})));
  // spine at index 8 => x=2,y=1. row y=1 is 6..11, column x=2 is 2,8,14,20,26
  const spined=await p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile')]
      .map((e,i)=>e.classList.contains('spined')?i:-1).filter(i=>i>=0));
  const want=[2,6,7,8,9,10,11,14,20,26];
  ok('row and column light up', JSON.stringify(spined)===JSON.stringify(want), JSON.stringify(spined));
  await p.locator('.tool[data-k="spine"]').click(); await p.waitForTimeout(150);
  ok('holding the Spine turns on spinemode', await p.locator('#floor').evaluate(e=>e.classList.contains('spinemode')));
  await ctx.close();
  // and it actually speeds the compute up
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,up:{buffer:20},
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,0,0,0,0],[6,'spine',0,0,0,0,0],[3,'rack',0,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(3000);
  const bars=await p.evaluate(()=>[...document.querySelectorAll('.hallgrid.on .tile .fillbar')]
      .map(e=>parseFloat(e.getAttribute('width'))));
  ok('the rack in the spine column outruns the one outside it', bars[0]>bars[1]*1.05,
     'incolumn='+bars[0].toFixed(1)+' outside='+bars[1].toFixed(1));
  await ctx.close();

  console.log('\n--- the exchanger sells heat ---');
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'asic',95,0,0,0,0],[1,'asic',95,0,0,0,0],[2,'heatx',20,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(1200);
  const hot=await p.locator('#rate').textContent();
  ok('a hot hall pays the exchanger', hot!=='', 'rate='+hot);
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({cash:0,earned:0,hard:ALL,
    halls:[{open:1,rows:5,tiles:[[2,'heatx',0,0,0,0,0]]},HX,HX]})));
  await p.waitForTimeout(1000);
  ok('a cold hall pays it almost nothing', (await p.locator('#rate').textContent())==='',
     await p.locator('#rate').textContent());
  await ctx.close();

  console.log('\n--- buy multipliers ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e6})));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(300);
  ok('the multiplier switch is there', await p.locator('.mult button').count()===3);
  const one=await p.locator('.card').filter({hasText:'Compute density'}).locator('.buy').textContent();
  await p.locator('.mult button').nth(1).click(); await p.waitForTimeout(250);
  const ten=await p.locator('.card').filter({hasText:'Compute density'}).locator('.buy').textContent();
  ok('x10 costs more than x1 and says so', /×10/.test(ten), one+' -> '+ten);
  await p.locator('.card').filter({hasText:'Compute density'}).locator('.buy').click();
  await p.waitForTimeout(350);
  await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('coldwater.v1')));
  ok('buying x10 adds ten levels at once', st.up.density===10, String(st.up.density));
  await p.locator('.mult button').nth(2).click(); await p.waitForTimeout(250);
  ok('buy-max is selectable', await p.locator('.mult button').nth(2).evaluate(e=>e.classList.contains('on')));
  await ctx.close();

  console.log('\n--- site tab ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e6,earned:5e6,hard:ALL,
    halls:[{open:1,rows:5,tiles:[[0,'rack',0,0,0,0,0],[1,'fan',0,0,0,0,1],[2,'rack',0,0,1,0,0],[3,'rack',0,0,0,.9,0]]},
           {open:1,rows:2,tiles:[[0,'rack',0,0,0,0,0]]},HX]})));
  await p.locator('#shopbtn').click(); await p.waitForTimeout(250);
  await p.locator('.tab[data-tab="site"]').click(); await p.waitForTimeout(600);
  const rows=await p.evaluate(()=>[...document.querySelectorAll('.stat')].map(e=>e.textContent));
  const find=k=>(rows.find(r=>r.startsWith(k))||'').slice(k.length);
  ok('counts the machines', find('Machines')==='5', find('Machines'));
  ok('counts faults', find('Faulted')==='1', find('Faulted'));
  ok('counts leaks', find('Leaking')==='1', find('Leaking'));
  ok('counts dusty tiles', find('Needs a wipe')==='1', find('Needs a wipe'));
  ok('lists both halls', rows.some(r=>r.startsWith('Hall A'))&&rows.some(r=>r.startsWith('Hall B')));
  ok('singular machine reads right', /1 machine ·/.test(rows.find(r=>r.startsWith('Hall B'))||''),
     rows.find(r=>r.startsWith('Hall B')));
  ok('shows what a rebirth is worth', /★/.test(find('Worth on rebirth')), find('Worth on rebirth'));
  await ctx.close();

  console.log('\n--- keyboard ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e6,hard:ALL}),DESK));
  await p.keyboard.press('2'); await p.waitForTimeout(150);
  ok('2 picks the second tool', await p.locator('.tool[data-k="fan"]').evaluate(e=>e.classList.contains('sel')));
  await p.keyboard.press('s'); await p.waitForTimeout(150);
  ok('s toggles sell mode', await p.locator('.tool[data-k="sell"]').evaluate(e=>e.classList.contains('sel')));
  await p.keyboard.press('s'); await p.waitForTimeout(150);
  ok('s toggles back off', !await p.locator('.tool[data-k="sell"]').evaluate(e=>e.classList.contains('sel')));
  await ctx.close();
  ({p,ctx,errs}=await seed(b,base({cash:1e6,hard:ALL,
    halls:[{open:1,rows:5,tiles:[]},{open:1,rows:2,tiles:[]},HX]}),DESK));
  await p.keyboard.press(']'); await p.waitForTimeout(300);
  ok('] moves to the next hall', (await p.locator('.hallchip.on').textContent())==='Hall B',
     await p.locator('.hallchip.on').textContent());
  await p.keyboard.press('['); await p.waitForTimeout(300);
  ok('[ moves back', (await p.locator('.hallchip.on').textContent())==='Hall A');
  await ctx.close();

  console.log('\n--- desktop layout ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e7,renown:50,hard:ALL}),DESK));
  ok('no exception at desktop width', errs.length===0, errs.join('|'));
  ok('the shop is docked, not hidden', await p.locator('#drawer').evaluate(e=>{
    const r=e.getBoundingClientRect();
    return r.width>200 && r.right<=window.innerWidth+1 && r.left>window.innerWidth/2;
  }));
  ok('the shop has content without being opened', await p.locator('.card').count()>0);
  ok('the Shop button is hidden when the shop is always visible',
     !await p.locator('#shopbtn').isVisible());
  ok('the close button is hidden too', !await p.locator('#dclose').isVisible());
  ok('every tab is reachable', await p.evaluate(()=>{
    const t=[...document.querySelectorAll('.tab')].filter(e=>!e.classList.contains('hide'));
    const box=document.querySelector('.tabs').getBoundingClientRect();
    return t.length===6 && t.every(e=>{const r=e.getBoundingClientRect();
      return r.left>=box.left-1 && r.right<=box.right+1;});
  }));
  ok('the tray shows every tool without scrolling',
     await p.locator('#tray').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  const deskTs=await p.evaluate(()=>parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ts')));
  ok('the board fills the space it is given', deskTs>=100, '--ts='+deskTs);
  ok('no horizontal overflow', await p.evaluate(()=>document.body.scrollWidth<=window.innerWidth));
  ok('the floor does not slide under the shop', await p.evaluate(()=>{
    const g=document.querySelector('.hallgrid.on').getBoundingClientRect();
    const d=document.querySelector('#drawer').getBoundingClientRect();
    return g.right<=d.left+1;
  }));
  ok('tiles carry a tooltip', await p.locator('.hallgrid.on .tile').nth(0).evaluate(e=>!!e.title));
  await ctx.close();

  console.log('\n--- a tall screen gets a bigger board ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e7,hard:ALL}),{width:1600,height:1200}));
  const tallTs=await p.evaluate(()=>parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ts')));
  ok('tiles pass the phone cap when there is room', tallTs>112, '--ts='+tallTs);
  ok('and stop at the desktop cap', tallTs<=150, '--ts='+tallTs);
  await ctx.close();

  console.log('\n--- mobile keeps the overlay drawer ---');
  ({p,ctx,errs}=await seed(b,base({cash:1e7,hard:ALL})));
  ok('the shop starts off screen', await p.locator('#drawer').evaluate(e=>
     e.getBoundingClientRect().left >= window.innerWidth-2));
  ok('the Shop button is visible', await p.locator('#shopbtn').isVisible());
  await p.locator('#shopbtn').click(); await p.waitForTimeout(350);
  ok('it slides in when tapped', await p.locator('#drawer').evaluate(e=>
     e.getBoundingClientRect().left < window.innerWidth-100));
  ok('no horizontal overflow on a phone', await p.evaluate(()=>document.body.scrollWidth<=window.innerWidth));
  await ctx.close();

  await b.close();
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  process.exit(fails?1:0);
})();
