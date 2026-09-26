import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {feedbackRequest} from '../electron/feedback';
test('feedback IPC restricts methods and URLs and assigns the installed version',async()=>{
 const requests:{url:string;body:any;origin:string|undefined}[]=[];
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;requests.push({url:req.url!,body:raw?JSON.parse(raw):null,origin:req.headers.origin});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({entries:[]}))});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
  for(const args of [['GET','/../../admin'],['GET','?url=https://evil.example'],['DELETE',''],['POST','/abc/withdraw']])await assert.rejects(feedbackRequest(endpoint,'0.5.0',args[0],args[1]));
  await assert.rejects(feedbackRequest('https://evil.example','0.5.0','GET',''));
  await assert.rejects(feedbackRequest(endpoint,'0.5.0','POST','',{text:'x'.repeat(3*1024*1024)}));
  assert.equal(requests.length,0);
  await feedbackRequest(endpoint,'0.5.0','GET','');await feedbackRequest(endpoint,'0.5.0','POST','',{title:'A',text:'B',source:'website',version:'fake'});
  assert.equal(requests[1].body.source,'desktop');assert.equal(requests[1].body.version,'0.5.0');assert.equal(requests[1].origin,endpoint);assert.equal(requests[0].url,'/api/feedback');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
});
