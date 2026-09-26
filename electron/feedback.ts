/** Fixed-purpose IPC transport; original images are sent as multipart, never embedded in JSON. */
export async function feedbackRequest(endpoint:string,version:string,method:unknown,path:unknown,body?:unknown,files?:unknown) {
 if(!/^https:\/\/barcodemate\.com$|^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)||typeof path!=='string')throw Error('Invalid feedback endpoint');
 const get=method==='GET'&&/^(|\?before=[a-f0-9]{32}|\/[a-f0-9]{32}\/(?:image(?:\/[0-9]+)?|thumbnail\/[0-9]+))$/.test(path);
 const post=method==='POST'&&/^(|\/[a-f0-9]{32}\/withdraw)$/.test(path);
 if(!get&&!post)throw Error('Invalid feedback request');
 let payload=body;
 if(post&&path===''){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid feedback');payload={...body,source:'desktop',version};}
 const serialized=post?JSON.stringify(payload):undefined;
 if(serialized&&Buffer.byteLength(serialized)>65536)throw Error('Feedback metadata too large');
 let requestBody:BodyInit|undefined=serialized;
 const headers:Record<string,string>=post?{'Content-Type':'application/json','Origin':endpoint,'X-Feedback-Consent':'feedback-v1'}:{};
 if(files!==undefined){
  if(!post||path!==''||!Array.isArray(files))throw Error('Invalid images');let bytes=0;
  for(const file of files){if(!file||!(file.bytes instanceof Uint8Array)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.bytes.byteLength>50*1024*1024)throw Error('Invalid image');bytes+=file.bytes.byteLength;if(bytes>80*1024*1024)throw Error('Images too large');}
  const form=new FormData();form.append('data',serialized!);for(const file of files)form.append('images',new Blob([file.bytes],{type:file.type}),'upload');requestBody=form;delete headers['Content-Type'];
 }
 const image=/\/(?:image(?:\/[0-9]+)?|thumbnail\/[0-9]+)$/.test(path);
 const response=await fetch(endpoint+'/api/feedback'+path,{method:method as string,redirect:'error',headers,body:requestBody,signal:AbortSignal.timeout(files?180000:30000)});
 const limit=image?16*1024*1024:512*1024;
 if(Number(response.headers.get('content-length'))>limit)throw Error('Feedback response too large');
 const reader=response.body?.getReader();const chunks:Uint8Array[]=[];let bytes=0;
 if(reader)try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>limit){await reader.cancel();throw Error('Feedback response too large')}chunks.push(r.value)}}finally{reader.releaseLock()}
 const buffer=Buffer.concat(chunks);
 if(image&&response.ok){const mime=response.headers.get('content-type')?.split(';')[0];if(mime!=='image/jpeg'&&mime!=='image/png')throw Error('Invalid image');return {status:200,data:{image:buffer.toString('base64'),mime}};}
 let data:unknown={};try{data=JSON.parse(buffer.toString('utf8'))}catch{/* Structured error remains empty. */}
 return {status:response.status,data};
}
