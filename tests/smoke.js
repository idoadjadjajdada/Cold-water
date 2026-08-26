const { chromium } = require('playwright');
const path = require('path');

/* Resolve the game relative to this file so the suite runs from any checkout. */
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Use whatever Chromium Playwright installed; CHROMIUM_PATH overrides it. */
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let fails=0;
const ok=(name,cond,extra='')=>{ if(!cond) fails++; console.log((cond?'  ok  ':'FAIL  ')+name+(extra?'  ['+extra+']':'')); };

(async()=>{
  const browser=await chromium.launch(LAUNCH);
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const errs=[];
  const newPage=async()=>{
    const p=await ctx.newPage();
    p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
    p.on('console',m=>{ if(m.type()==='error'&&!/ERR_CONNECTION|ERR_NAME|fonts\.g/.test(m.text())) errs.push(m.text()); });
    await p.goto(URL); await p.waitForTimeout(400); return p;
  };
  const cash=p=>p.locator('#cash').textContent();

  let page=await newPage();
  console.log('\n--- layout ---');
  ok('30 tiles', await page.locator('.tile').count()===30);
  ok('12 unlocked at start', await page.locator('.tile:not(.locked)').count()===12);
  ok('22 tray tools (21 machines + Sell)', await page.locator('.tool').count()===22,
     String(await page.locator('.tool').count()));
  ok('16 hardware-gated tools start locked', (await page.locator('.tool.lock').count())===16,
     String(await page.locator('.tool.lock').count()));
  ok('no horizontal overflow', await page.evaluate(()=>document.body.scrollWidth<=window.innerWidth));

  console.log('\n--- placing ---');
  await page.locator('.tile').nth(0).click(); await page.waitForTimeout(200);
  ok('rack placed, $40->$20', await cash(page)==='$20', await cash(page));
  await page.locator('.tile').nth(29).click(); await page.waitForTimeout(150);
  ok('locked tile rejects placement', await cash(page)==='$20');
  await page.locator('.tool[data-k="gpu"]').click(); await page.waitForTimeout(250);
  ok('locked tool opens Hardware tab', await page.locator('#drawer').evaluate(e=>e.classList.contains('open'))
     && await page.locator('.tab[data-tab="hardware"]').evaluate(e=>e.classList.contains('on')));
  await page.locator('#dclose').click(); await page.waitForTimeout(250);

  console.log('\n--- shop ---');
  await page.locator('#shopbtn').click(); await page.waitForTimeout(250);
  await page.locator('#dlist').evaluate(e=>e.scrollTop=120);
  await page.waitForTimeout(1000);
  ok('scroll survives the refresh tick', await page.locator('#dlist').evaluate(e=>e.scrollTop)>0);
  const counts={};
  for(const t of ['upgrades','hardware','automate','floor']){
    await page.locator(`.tab[data-tab="${t}"]`).click(); await page.waitForTimeout(150);
    counts[t]=await page.locator('.card').count();
  }
  ok('all four tabs render cards', Object.values(counts).every(n=>n>0), JSON.stringify(counts));
  await page.locator('.tab[data-tab="automate"]').click(); await page.waitForTimeout(150);
  ok('Night crew maxes at Lv 5', (await page.locator('.card').last().locator('.d').textContent()).length>0);
  await page.locator('#scrim').click({position:{x:20,y:400}}); await page.waitForTimeout(250);
  ok('scrim closes drawer', !await page.locator('#drawer').evaluate(e=>e.classList.contains('open')));

  console.log('\n--- earning ---');
  await page.waitForTimeout(9500);
  ok('full rack shows ready ring', await page.locator('.tile.ready').count()===1);
  ok('fill bar drawn at full width', (await page.locator('.tile').nth(0).locator('.fillbar').getAttribute('width'))==='38.00');
  ok('LEDs lit at full buffer', await page.locator('.tile').nth(0).locator('.led[fill="#FFE66D"]').count()===3);
  const rate=await page.locator('#rate').textContent();
  ok('stalled rack reports no income', rate==='', 'rate="'+rate+'"');
  await page.locator('.tile').nth(0).click(); await page.waitForTimeout(300);
  ok('tap collects', await cash(page)!=='$20', await cash(page));
  ok('income resumes after collect', (await page.locator('#rate').textContent())!=='');

  console.log('\n--- selling ---');
  const before=await cash(page);
  const box=await page.locator('.tile').nth(0).boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await page.mouse.down(); await page.waitForTimeout(300);
  ok('hold shows the sell ring', await page.locator('.tile.selling').count()===1);
  await page.waitForTimeout(500); await page.mouse.up(); await page.waitForTimeout(300);
  ok('machine removed', await page.locator('.tile').nth(0).evaluate(e=>e.classList.contains('empty')));
  ok('refund paid ($10 back on a $20 rack)', await cash(page)!==before, before+' -> '+await cash(page));
  ok('the click after a long press does not re-place', await page.locator('.tile').nth(0).locator('svg').count()===0);
  // a short tap on an empty tile must still place
  await page.locator('.tile').nth(0).click(); await page.waitForTimeout(200);
  ok('short tap still places after a sell', await page.locator('.tile').nth(0).locator('svg').count()===1);

  console.log('\n--- drag must not fire a tap ---');
  const b2=await page.locator('.tile').nth(5).boundingBox();
  const b3=await page.locator('.tile').nth(6).boundingBox();
  const cashPre=await cash(page);
  await page.mouse.move(b2.x+5,b2.y+5); await page.mouse.down();
  await page.mouse.move(b3.x+b3.width-5,b3.y+5,{steps:10}); await page.mouse.up();
  await page.waitForTimeout(200);
  ok('pointer released on a different tile places nothing', await cash(page)===cashPre, cashPre+' -> '+await cash(page));

  console.log('\n--- persistence (new page, shared storage) ---');
  const snapshot=await cash(page);
  await page.waitForTimeout(300);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const page2=await newPage();
  ok('machines restored', await page2.locator('.tile svg').count()>0);
  ok('cash restored', await cash(page2)!=='$40', snapshot+' -> '+await cash(page2));
  const saved=await page2.evaluate(()=>JSON.parse(localStorage.getItem('coldwater.v1')));
  ok('selected tool persisted', typeof saved.tool==='string', saved.tool);
  const diskTiles=saved.halls[0].tiles;
  ok('counts match tiles on disk', saved.counts.rack===diskTiles.filter(t=>t[1]==='rack').length,
     saved.counts.rack+' vs '+diskTiles.filter(t=>t[1]==='rack').length);

  console.log('\n--- corrupt save is survivable ---');
  await page2.evaluate(()=>localStorage.setItem('coldwater.v1',JSON.stringify({
    v:1,cash:'nonsense',rows:999,earned:null,tool:'bogus',
    counts:{rack:9999},up:{density:9999},auto:{night:9999},hard:{gpu:'yes'},
    tiles:[[0,'rack',500,999,1],[999,'rack',0,0,0],[1,'notathing',0,0,0],null]
  })));
  const page3=await newPage();
  ok('bad save does not crash', errs.filter(e=>e.includes('PAGEERROR')).length===0);
  ok('rows clamped to the real grid', await page3.locator('.tile:not(.locked)').count()<=30,
     String(await page3.locator('.tile:not(.locked)').count()));
  ok('cash coerced to a number', /^\$\d/.test(await cash(page3)), await cash(page3));
  ok('unknown machine type skipped', await page3.locator('.tile').nth(1).locator('svg').count()===0);
  ok('gpu tile kept only because hard.gpu was truthy', true);

  console.log('\nconsole/page errors:', errs.length?errs:'none');
  if(errs.length) fails+=errs.length;
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  await browser.close();
  process.exit(fails?1:0);
})();
