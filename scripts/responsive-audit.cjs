const { chromium } = require('C:/Users/This PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const sizes = [[320,568],[360,800],[390,844],[414,896],[768,1024],[1024,768],[1280,800],[1440,900],[844,390],[360,640]];
(async()=>{
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 const page = await browser.newPage();
 const errors=[]; page.on('requestfailed',r=>errors.push({url:r.url(),error:r.failure()?.errorText}));
 await page.goto(process.argv[2],{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(5000);
 const results=[];
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height}); await page.waitForTimeout(150);
  results.push(await page.evaluate(()=>{
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
   const name=e=>`${e.tagName.toLowerCase()}.${typeof e.className==='string'?e.className:''}`;
   const controls=[...document.querySelectorAll('button,a,summary,input:not([type=checkbox]),select')].filter(visible);
   const closeTargets=[];
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
    if(controls[i].contains(controls[j])||controls[j].contains(controls[i]))continue;
    const a=controls[i].getBoundingClientRect(),b=controls[j].getBoundingClientRect();
    const x=Math.max(0,a.left-b.right,b.left-a.right),y=Math.max(0,a.top-b.bottom,b.top-a.bottom);
    if(Math.hypot(x,y)<7.9)closeTargets.push([name(controls[i]),name(controls[j]),Math.hypot(x,y)]);
   }
   return {viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,closeTargets,
    overflow:[...document.querySelectorAll('body *')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1}).map(name).slice(0,20),
    smallTargets:controls.filter(e=>{const r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9}).map(e=>({element:name(e),text:e.textContent.trim().slice(0,35),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),
    fonts:[...new Set([...document.querySelectorAll('p')].filter(visible).map(e=>getComputedStyle(e).fontSize))],
    ctaBottom:document.querySelector('.hero-actions')?.getBoundingClientRect().bottom,
    grids:['.marketing-grid','.station-grid','.steps-marketing','.trust-strip','.footer-grid'].map(s=>({selector:s,columns:document.querySelector(s)?getComputedStyle(document.querySelector(s)).gridTemplateColumns:'missing'})),
    title:document.title,body:document.body.innerText.slice(0,100),css:document.styleSheets.length};
  }));
  // Full-page captures show sections normally rendered only when scrolled into view.
  const captureStyle=await page.addStyleTag({content:'.section-pad,.closing-cta,.site-footer{content-visibility:visible!important}'});
  await page.screenshot({path:`docs/${process.argv[3]}-${width}x${height}.png`,fullPage:true});
  await captureStyle.evaluate(e=>e.remove());
 }
 await page.setViewportSize({width:360,height:640});
 const menu=page.getByRole('button',{name:'Open navigation',exact:true});
 if(!await menu.count()){fs.writeFileSync(`docs/${process.argv[3]}.json`,JSON.stringify({url:process.argv[2],results,errors},null,2));console.log(JSON.stringify({results,errors}));await browser.close();return;}
 await menu.click();
 const opened=await page.evaluate(()=>({expanded:document.querySelector('[aria-controls="public-navigation"]').getAttribute('aria-expanded'),locked:getComputedStyle(document.body).overflow,focus:document.activeElement.textContent}));
 await page.keyboard.press('Shift+Tab'); const trap=await page.evaluate(()=>document.activeElement.getAttribute('aria-controls'));
 await page.keyboard.press('Escape');
 const closed=await page.evaluate(()=>({expanded:document.querySelector('[aria-controls="public-navigation"]').getAttribute('aria-expanded'),focus:document.activeElement.getAttribute('aria-controls'),locked:getComputedStyle(document.body).overflow}));
 fs.writeFileSync(`docs/${process.argv[3]}.json`,JSON.stringify({url:process.argv[2],results,menu:{opened,trap,closed},errors},null,2));
 console.log(JSON.stringify({results:results.map(r=>({...r,smallTargets:r.smallTargets.length})),menu:{opened,trap,closed},errors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
