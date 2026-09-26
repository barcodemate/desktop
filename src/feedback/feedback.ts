import messages from './messages.json';
import {createGallery} from './gallery';
export type FeedbackRequest = (method: 'GET'|'POST', path: string, body?: unknown, files?:File[]) => Promise<{status:number;data:any}>;
export type FeedbackKey = keyof typeof messages.en;
export function feedbackText(language:string,key:FeedbackKey):string {return ((messages as Record<string,Partial<typeof messages.en>>)[language]?.[key]||messages.en[key]);}
type Entry={id:string;createdAt:string;title:string;text:string;nickname:string;source:string;version:string;image:boolean;imageCount?:number};
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const receiptsKey='barcodemate-feedback-receipts-v1';
type LocalReceipt={id:string;token:string;title:string;visibility:string};
function receipts():LocalReceipt[]{try{const r=JSON.parse(localStorage.getItem(receiptsKey)||'[]');return Array.isArray(r)?r.filter(x=>x&&/^[a-f0-9]{32}$/.test(x.id)&&/^[a-f0-9]{64}$/.test(x.token)&&typeof x.title==='string').slice(0,30):[]}catch{return []}}
async function previewImage(file:File):Promise<string>{
 const bitmap=await createImageBitmap(file,{resizeWidth:360,resizeQuality:'low'});
 try{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);const url=canvas.toDataURL('image/jpeg',.65);canvas.width=canvas.height=0;return url;}finally{bitmap.close()}
}
export function mountFeedback(root:HTMLElement,options:{language:string;source:'website'|'desktop';version?:string;request:FeedbackRequest;imageUrl:(id:string,index:number,thumbnail:boolean)=>string|Promise<string>}):()=>void {
 const t=(key:FeedbackKey)=>feedbackText(options.language,key),e=(key:FeedbackKey)=>escape(t(key));
 let active=true,uploads:{file:File;preview:string}[]=[],preparing=false,sending=false,generation=0,entries:Entry[]=[];
 const inMemory=receipts();
 root.classList.add('fb-root');root.dir=['ar','fa','he'].includes(options.language)?'rtl':'ltr';
 root.innerHTML=`<div class="fb-layout"><section class="fb-panel"><h2>${e('form')}</h2><form class="fb-form"><label>${e('title')}<input name="title" maxlength="100" required></label><label>${e('text')}<textarea name="text" maxlength="5000" rows="6" required></textarea></label><div class="fb-two"><label>${e('name')}<input name="nickname" maxlength="60" autocomplete="nickname"></label><label>${e('email')}<input type="email" name="email" maxlength="254" autocomplete="email"></label></div><fieldset><legend>${e('visibility')}</legend><label class="fb-choice"><input type="radio" name="visibility" value="private" checked>${e('private')}</label><label class="fb-choice"><input type="radio" name="visibility" value="public">${e('public')}</label><p class="fb-visibility-note">${e('privateNote')}</p></fieldset><label>${e('image')}<input name="image" type="file" multiple accept="image/png,image/jpeg,image/webp" aria-describedby="fb-image-hint"></label><p id="fb-image-hint" class="fb-muted">${e('imageHint')}</p><div class="fb-image-preview" hidden></div><label class="fb-trap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><details class="fb-privacy"><summary>${e('privacyTitle')}</summary><p class="fb-muted">${e('privacy')}</p></details><button class="fb-submit" type="submit">${e('send')}</button><p class="fb-status" role="status" aria-live="polite"></p></form></section><section class="fb-board"><div class="fb-board-heading"><h2>${e('board')}</h2><button class="fb-refresh" type="button">${e('refresh')}</button></div><p class="fb-load-status" role="status">${e('loading')}</p><div class="fb-entries"></div><button class="fb-more" type="button" hidden>${e('more')}</button><section class="fb-mine"><h3>${e('mine')}</h3><p class="fb-muted">${e('receiptNote')}</p><div class="fb-receipts"></div></section></section></div>`;
 const form=root.querySelector('form')!,submit=root.querySelector<HTMLButtonElement>('.fb-submit')!,status=root.querySelector<HTMLElement>('.fb-status')!,listStatus=root.querySelector<HTMLElement>('.fb-load-status')!,list=root.querySelector<HTMLElement>('.fb-entries')!,more=root.querySelector<HTMLButtonElement>('.fb-more')!;
 const input=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const preview=root.querySelector<HTMLElement>('.fb-image-preview')!;
 const updateButton=()=>{submit.disabled=preparing||sending;input('image').disabled=preparing||sending;for(const button of preview.querySelectorAll<HTMLButtonElement>('button'))button.disabled=preparing||sending;submit.textContent=sending?t('sending'):t('send')};
 function mine(){
  const target=root.querySelector('.fb-receipts')!;target.replaceChildren();
  for(const item of inMemory){const row=document.createElement('div');row.className='fb-receipt';const title=document.createElement('span');title.textContent=item.title;const btn=document.createElement('button');btn.type='button';btn.textContent=t('withdraw');btn.dataset.withdraw=item.id;btn.onclick=()=>void withdraw(item,btn);row.append(title,btn);target.append(row)}
  root.querySelector<HTMLElement>('.fb-mine')!.hidden=inMemory.length===0;
 }
 function saveReceipts(){try{localStorage.setItem(receiptsKey,JSON.stringify(inMemory.slice(0,30)))}catch{/* Keep withdrawal access in memory for this session. */}}
 async function withdraw(item:LocalReceipt,btn:HTMLButtonElement){
  if(!confirm(t('withdrawConfirm')))return;btn.disabled=true;
  try{const r=await options.request('POST',`/${item.id}/withdraw`,{token:item.token});if(![200,404].includes(r.status))throw Error();
   const at=inMemory.indexOf(item);if(at>=0)inMemory.splice(at,1);saveReceipts();if(active){mine();status.textContent=t('withdrawn');await load(false)}
  }catch{if(active){status.textContent=t('withdrawError');btn.disabled=false}}
 }
 function disposeGalleries(){for(const gallery of list.querySelectorAll('.fb-gallery'))gallery.dispatchEvent(new Event('feedback:dispose'));}
 function render(){disposeGalleries();list.replaceChildren();for(const item of entries){
  if(!/^[a-f0-9]{32}$/.test(item.id))continue;
  const card=document.createElement('article');card.className='fb-card';card.dataset.feedback=item.id;
  const when=new Date(item.createdAt);const date=Number.isFinite(when.getTime())?when.toLocaleDateString(options.language):'';
  card.innerHTML=`<p class="fb-meta">${escape(item.nickname||t('anonymous'))} · ${escape(date)} · ${escape(t(item.source==='desktop'?'desktop':'website'))}${item.version?' '+escape(item.version):''}</p><h3>${escape(item.title)}</h3><p class="fb-content">${escape(item.text)}</p>`;
  const count=item.imageCount??(item.image?1:0);
  if(Number.isSafeInteger(count)&&count>0)card.append(createGallery({count,label:t('image'),previous:t('previous'),next:t('next'),close:t('close'),url:(index,thumb)=>options.imageUrl(item.id,index,thumb),active:()=>active}));
  list.append(card);
 }}
 async function load(append:boolean){
  const thisGeneration=++generation;more.disabled=true;listStatus.textContent=t('loading');
  try{const last=append?entries.at(-1)?.id:undefined;const r=await options.request('GET',last?'?before='+last:'');
   if(!active||generation!==thisGeneration)return;if(r.status!==200||!Array.isArray(r.data.entries))throw Error();
   if(!r.data.enabled){listStatus.textContent=t('unavailable');submit.disabled=true;return}
   const fetched=r.data.entries as Entry[];entries=append?[...entries,...fetched]:fetched;render();listStatus.textContent=entries.length?'':t('empty');more.hidden=fetched.length<20;
  }catch{if(active&&generation===thisGeneration)listStatus.textContent=t('unavailable')}finally{if(active)more.disabled=false}
 }
 for(const radio of root.querySelectorAll<HTMLInputElement>('input[name=visibility]'))radio.onchange=()=>{root.querySelector('.fb-visibility-note')!.textContent=t(radio.value==='public'?'publicNote':'privateNote')};
 let selection=0;
 function previews(){preview.replaceChildren();preview.hidden=uploads.length===0;for(const item of uploads){const box=document.createElement('div');const img=document.createElement('img');img.src=item.preview;img.alt=t('image');const remove=document.createElement('button');remove.type='button';remove.className='fb-remove';remove.textContent=t('remove');remove.onclick=()=>{uploads=uploads.filter(x=>x!==item);previews();updateButton()};box.append(img,remove);preview.append(box)}}
 input('image').onchange=async()=>{const current=++selection;const files=[...(input('image').files||[])];input('image').value='';if(!files.length)return;
  const total=uploads.reduce((n,x)=>n+x.file.size,0)+files.reduce((n,x)=>n+x.size,0);
  if(total>80*1024*1024||files.some(f=>f.size>50*1024*1024||!['image/png','image/jpeg','image/webp'].includes(f.type))){status.textContent=t('imageHint');return}
  preparing=true;updateButton();status.textContent='';
  try{const additions:typeof uploads=[];for(const file of files){const url=await previewImage(file);if(!active||current!==selection)return;additions.push({file,preview:url})}uploads.push(...additions);previews()}
  catch{if(active)status.textContent=t('imageError')}finally{if(active&&current===selection){preparing=false;updateButton()}}
 };
 form.onsubmit=async event=>{event.preventDefault();if(sending||preparing||!form.reportValidity())return;
  const title=input('title').value.trim(),text=input('text').value.trim();if(!title||!text){status.textContent=t('required');return}
  const visibility=(new FormData(form)).get('visibility') as string;
  sending=true;updateButton();status.textContent='';
  try{const r=await options.request('POST','',{title,text,nickname:input('nickname').value,email:input('email').value,visibility,language:options.language,source:options.source,version:options.version||'',consent:'feedback-v1',website:input('website').value},uploads.map(x=>x.file));
   if(!active)return;if(r.status!==201){status.textContent=t(r.status===429?'rate':r.status===503?'unavailable':'error');return}
   if(!/^[a-f0-9]{32}$/.test(r.data.id)||!/^[a-f0-9]{64}$/.test(r.data.token))throw Error();
   inMemory.unshift({id:r.data.id,token:r.data.token,title,visibility});inMemory.splice(30);saveReceipts();mine();
   form.reset();uploads=[];previews();root.querySelector('.fb-visibility-note')!.textContent=t('privateNote');status.textContent=t('sent');await load(false);
  }catch{if(active)status.textContent=t('error')}finally{if(active){sending=false;updateButton()}}
 };
 root.querySelector<HTMLButtonElement>('.fb-refresh')!.onclick=()=>void load(false);more.onclick=()=>void load(true);mine();void load(false);
 return()=>{active=false;selection++;generation++;uploads=[];disposeGalleries();root.replaceChildren()};
}
