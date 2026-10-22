const {chromium}=require('C:/Users/This PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
const sizes=[[320,568],[360,800],[390,844],[414,896],[768,1024],[1024,768],[1280,800],[1440,900],[844,390]];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
 await page.goto('http://localhost:3005',{waitUntil:'networkidle'});
 const zoom=await page.addStyleTag({content:'html{font-size:200% !important}'});
 const zoomResults=[];
 for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.waitForTimeout(100);zoomResults.push(await page.evaluate(()=>({viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1)}).map(e=>e.tagName+'.'+e.className).slice(0,20)})))}
 await page.setViewportSize({width:320,height:568});
 const capture=await page.addStyleTag({content:'.section-pad,.closing-cta,.site-footer{content-visibility:visible!important}'});
 await page.screenshot({path:'docs/responsive-200-percent.png',fullPage:true});await capture.evaluate(e=>e.remove());await zoom.evaluate(e=>e.remove());
 const pages=[];
 async function measure(name){pages.push(await page.evaluate(name=>({page:name,viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,smallTargets:[...document.querySelectorAll('button,a,summary,input:not([type=checkbox]),select')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&(r.width<43.9||r.height<43.9)}).map(e=>({text:e.textContent.trim().slice(0,35),className:e.className,size:[e.getBoundingClientRect().width,e.getBoundingClientRect().height]}))}),name))}
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  const menu=page.getByRole('button',{name:'Open navigation',exact:true});if(await menu.isVisible())await menu.click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Find Chargers',exact:true}).click();await measure('Public Find Chargers');
  if(await menu.isVisible())await menu.click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Contact',exact:true}).click();await measure('Contact');
  if(await menu.isVisible())await menu.click();await page.getByRole('button',{name:'Log in',exact:true}).filter({visible:true}).click();await measure('Login');
  await page.getByRole('button',{name:'Back to website',exact:true}).click();
 }
 await page.setViewportSize({width:360,height:640});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Home',exact:true}).click();
 await page.screenshot({path:'docs/responsive-after-mobile.png'});
 await page.locator('.station-card').first().screenshot({path:'docs/responsive-after-station.png'});
 await page.getByRole('button',{name:'List your charger',exact:true}).click();await measure('Host Add Charger');
 const hostZoom=await page.addStyleTag({content:'html{font-size:200% !important}'});
 for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.waitForTimeout(100);await measure('Host Add Charger at 200%');}
 await hostZoom.evaluate(e=>e.remove());await page.setViewportSize({width:360,height:640});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 const workspace=await page.evaluate(()=>({locked:getComputedStyle(document.body).overflow,expanded:document.querySelector('[aria-controls="workspace-navigation"]').getAttribute('aria-expanded'),focused:document.activeElement.getAttribute('aria-label')}));
 await page.keyboard.press('Escape');workspace.restored=await page.evaluate(()=>document.activeElement.getAttribute('aria-controls'));
 const result={zoomResults,pages,workspace};fs.writeFileSync('docs/responsive-interactions.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
