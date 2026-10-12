// Private worker: only the server creates this bounded config file. It is not
// exposed as a tool and never attaches to an existing browser/profile.
import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const p=new URL(config.proxy);
let browser,phase='launch';
try {
  browser=await chromium.launch({executablePath:config.executable,headless:true,proxy:{server:`http://${p.hostname}:${p.port}`,username:p.username,password:p.password},args:['--proxy-bypass-list=<-loopback>','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync'],timeout:config.timeout_ms});
  const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block'});
  const page=await context.newPage();phase='navigation';const response=await page.goto(config.url,{waitUntil:'domcontentloaded',timeout:config.timeout_ms});
  if(config.selector)await page.locator(config.selector).first().waitFor({state:'attached',timeout:config.timeout_ms});
  const html=await page.content();const title=await page.title();
  console.log(JSON.stringify({final_url:page.url(),status:response?.status()??0,title,html,headers:[],redirect_chain:[],engine_version:browser.version()}));
}catch(e){const brief=e.message.split('\n')[0].replace(/https?:\/\/\S+/g,'[url]').slice(0,200);process.stderr.write(JSON.stringify({phase,code:e.message.match(/net::ERR_[A-Z_]+/)?.[0]??'chromium_worker_failed',brief,browser_exit:e.message.match(/exitCode=([^,\s>]+)/)?.[1]??null})+'\n');process.exitCode=1;}
finally {await browser?.close().catch(()=>{});}
