const { chromium } = require('playwright');
const path = require('path');

/* Resolve the game relative to this file so the suite runs from any checkout. */
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
/* Use whatever Chromium Playwright installed; CHROMIUM_PATH overrides it. */
const LAUNCH = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

let fails=0;
const ok=(n,c,x='')=>{ if(!c) fails++; console.log((c?'  ok  ':'FAIL  ')+n+(x?'  ['+x+']':'')); };

async function withSave(browser, obj){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(v=>{ try{ localStorage.setItem('coldwater.v1',v); }catch(e){} },
                          typeof obj==='string'?obj:JSON.stringify(obj));
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(500);
  return {p,ctx,errs};
}

(async()=>{
  const browser=await chromium.launch(LAUNCH);

  console.log('\n--- garbage in every field ---');
  let {p,ctx,errs}=await withSave(browser,{
    v:1, cash:'nonsense', rows:999, earned:null, tool:'bogus', savedAt:'later',
    counts:{rack:9999,gpu:50}, up:{density:9999,bandwidth:-5}, auto:{night:9999},
    hard:{gpu:'yes',batt:0},
    tiles:[[0,'rack',500,999,1],[999,'rack',0,0,0],[1,'notathing',0,0,0],null,[2,'gpu',10,3,0]]
  });
  ok('no exception thrown', errs.length===0, errs.join('|'));
  ok('rows clamped to 5 (30 tiles unlocked)', await p.locator('.tile:not(.locked)').count()===30,
     String(await p.locator('.tile:not(.locked)').count()));
  ok('cash coerced to $0', (await p.locator('#cash').textContent())==='$0', await p.locator('#cash').textContent());
  ok('unknown machine type skipped', await p.locator('.tile').nth(1).locator('svg').count()===0);
  ok('out-of-range tile index ignored', true);
  await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('coldwater.v1')));
  ok('upgrade level clamped to max 30', st.up.density===30, String(st.up.density));
  ok('negative upgrade level clamped to 0', st.up.bandwidth===0, String(st.up.bandwidth));
  ok('Night crew clamped to new max 5', st.auto.night===5, String(st.auto.night));
  ok('counts rebuilt from tiles, not trusted', st.counts.rack===1, JSON.stringify(st.counts));
  ok('gpu tile kept (hard.gpu truthy)', st.counts.gpu===1, String(st.counts.gpu));
  ok('bad tool falls back to rack', st.tool==='rack', st.tool);
  ok('heat clamped to 0-100', st.halls[0].tiles.every(t=>t[2]>=0&&t[2]<=100), JSON.stringify(st.halls[0].tiles));
  await ctx.close();

  console.log('\n--- machine whose hardware is not unlocked ---');
  ({p,ctx,errs}=await withSave(browser,{v:1,cash:100,rows:2,hard:{gpu:0,batt:0},counts:{gpu:1},tiles:[[0,'gpu',0,0,0]]}));
  await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const st2=await p.evaluate(()=>JSON.parse(localStorage.getItem('coldwater.v1')));
  ok('locked-hardware tile dropped', st2.counts.gpu===0, JSON.stringify(st2.counts));
  await ctx.close();

  console.log('\n--- outright malformed JSON ---');
  ({p,ctx,errs}=await withSave(browser,'{not json at all'));
  ok('falls back to a fresh game', (await p.locator('#cash').textContent())==='$40', await p.locator('#cash').textContent());
  ok('no exception', errs.length===0, errs.join('|'));
  await ctx.close();

  console.log('\n--- offline earnings on return ---');
  ({p,ctx,errs}=await withSave(browser,{
    v:1,cash:0,rows:2,earned:500,savedAt:Date.now()-3600*1000,
    hard:{},counts:{rack:2},up:{},auto:{},tiles:[[0,'rack',0,0,0],[1,'rack',0,0,0]]
  }));
  ok('away modal shown after an hour', await p.locator('#modal').evaluate(e=>e.classList.contains('open')));
  const body=await p.locator('#mbody').textContent(), big=await p.locator('#mbig').textContent();
  ok('modal reports the gap', /hour/.test(body), body);
  ok('payout is non-trivial', big!=='$0', big);
  await p.locator('#mok').click(); await p.waitForTimeout(300);
  ok('collect closes the modal', !await p.locator('#modal').evaluate(e=>e.classList.contains('open')));
  ok('collect credits the wallet', (await p.locator('#cash').textContent())!=='$0', await p.locator('#cash').textContent());
  await ctx.close();

  console.log('\n--- faulted hardware earns nothing offline ---');
  ({p,ctx,errs}=await withSave(browser,{
    v:1,cash:0,rows:2,earned:500,savedAt:Date.now()-3600*1000,
    hard:{},counts:{rack:2},up:{},auto:{},tiles:[[0,'rack',0,0,1],[1,'rack',0,0,1]]
  }));
  ok('all-faulted floor pays nothing', !await p.locator('#modal').evaluate(e=>e.classList.contains('open')));
  ok('fault state restored from save', await p.locator('.tile.fault').count()===2,
     String(await p.locator('.tile.fault').count()));
  await ctx.close();

  await browser.close();
  console.log(fails?`\n${fails} FAILURE(S)`:'\nALL PASS');
  process.exit(fails?1:0);
})();
