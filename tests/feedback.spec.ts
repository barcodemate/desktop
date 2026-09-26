import {test,expect,_electron as electron} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
test('desktop submits only explicitly, uses IPC for images, and withdraws public/private feedback',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'barcodemate-feedback-'));
 const items=new Map<string,any>();let calls=0;
 const server=createServer(async(req,res)=>{
  calls++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);let body:any={};
  if(req.headers['content-type']?.startsWith('multipart/form-data')){const form=await new Response(raw,{headers:{'Content-Type':req.headers['content-type']}}).formData();body=JSON.parse(String(form.get('data')));body.images=await Promise.all(form.getAll('images').map(async f=>Buffer.from(await (f as File).arrayBuffer()).toString('base64')));}else if(raw.length)body=JSON.parse(raw.toString());
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET'&&req.url==='/api/feedback'){res.end(JSON.stringify({enabled:true,entries:[...items.values()].filter(x=>x.visibility==='public').map(({email,token,images,...x})=>({...x,image:!!images?.length,imageCount:images?.length||0}))}));return}
  if(req.method==='POST'&&req.url==='/api/feedback'){
   const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('hex');items.set(id,{...body,id,token,createdAt:new Date().toISOString()});res.statusCode=201;res.end(JSON.stringify({id,token,visibility:body.visibility}));return;
  }
  const id=req.url?.split('/')[3],item=id?items.get(id):null;
  if(req.method==='GET'&&/\/(image|thumbnail)(\/\d+)?$/.test(req.url||'')&&item?.visibility==='public'){res.setHeader('Content-Type','image/png');res.end(Buffer.from(item.images[Number(req.url?.split('/')[5]||0)],'base64'));return}
  if(req.method==='POST'&&req.url?.endsWith('/withdraw')&&item?.token===body.token){items.delete(id!);res.end('{}');return}
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const app=await electron.launch({...process.env.BARCODEMATE_EXECUTABLE?{executablePath:process.env.BARCODEMATE_EXECUTABLE,args:[]}:{args:['.']},env:{...process.env,BARCODEMATE_TEST_DIR:temp,BARCODEMATE_FEEDBACK_API:endpoint,BARCODEMATE_HOME_API:''}});
 try{
  const page=await app.firstWindow();await page.waitForSelector('h1');await page.locator('#language-select').selectOption('en');expect(calls).toBe(0);
  await page.locator('[data-workspace=feedback]').click();await expect(page.locator('.fb-submit')).toBeVisible();await expect(page.locator('input[value=private]')).toBeChecked();expect(await page.locator('input[value=private]').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThan(24);
  await page.locator('input[name=title]').fill('Desktop private acceptance');await page.locator('textarea[name=text]').fill('An idea');await page.locator('.fb-submit').click();await expect(page.locator('.fb-receipt')).toHaveCount(1);expect(items.size).toBe(1);
  const first=[...items.values()][0];expect(first.source).toBe('desktop');expect(first.version).toMatch(/^\d+\.\d+\.\d+$/);await expect(page.locator('.fb-card')).toHaveCount(0);
  await page.locator('input[name=title]').fill('Desktop public acceptance');await page.locator('textarea[name=text]').fill('Please improve labels.');await page.locator('input[value=public]').check();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d')!;x.fillStyle='#4552e8';x.fillRect(0,0,80,40);return c.toDataURL('image/png').split(',')[1]});
  await page.locator('input[type=file]').setInputFiles(Array.from({length:6},(_,i)=>({name:'acceptance-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})));await expect(page.locator('.fb-image-preview')).toBeVisible();await page.locator('.fb-submit').click();await expect(page.locator('.fb-card')).toHaveCount(1);await expect(page.locator('.fb-card .fb-thumbnail')).toHaveCount(5);await expect(page.locator('.fb-card .fb-thumbnail img').first()).toHaveJSProperty('naturalWidth',80);await page.getByRole('button',{name:'Next images',exact:true}).click();await expect(page.locator('.fb-gallery-controls').first()).toContainText('2–6 / 6');await page.locator('.fb-thumbnail').last().click();await expect(page.locator('.fb-lightbox')).toBeVisible();await expect(page.locator('.fb-lightbox img')).toHaveJSProperty('naturalWidth',80);await page.getByRole('button',{name:'Close',exact:true}).click();
  await mkdir('test-results/feedback',{recursive:true});await page.screenshot({path:'test-results/feedback/desktop-en.png',fullPage:true});
  await page.getByTitle('Switch appearance',{exact:true}).click();await expect(page.locator('.fb-submit')).toBeEnabled();await expect(page.locator('.workspace')).toHaveCSS('background-color','rgb(20, 26, 38)');await page.screenshot({path:'test-results/feedback/desktop-dark.png',fullPage:true});
  await page.locator('#language-select').selectOption('zh-Hans');await expect(page.locator('.feedback-desktop h1')).toHaveText('意见反馈');await expect(page.locator('.fb-receipt')).toHaveCount(2);
  await page.reload();await page.locator('[data-workspace=feedback]').click();await expect(page.locator('.fb-receipt')).toHaveCount(2);
  page.on('dialog',d=>d.accept());await page.locator('.fb-receipt button').first().click();await expect(page.locator('.fb-receipt')).toHaveCount(1);await page.locator('.fb-receipt button').first().click();await expect(page.locator('.fb-receipt')).toHaveCount(0);expect(items.size).toBe(0);
 }finally{await app.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(temp,{recursive:true,force:true})}
});
