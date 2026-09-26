export function createGallery(options:{count:number;label:string;previous:string;next:string;close:string;url:(index:number,thumbnail:boolean)=>string|Promise<string>;active:()=>boolean}):HTMLElement {
 const {count}=options,root=document.createElement('div');root.className='fb-gallery';root.setAttribute('aria-label',options.label);
 const row=document.createElement('div');row.className='fb-gallery-row fb-count-'+Math.min(5,count);root.append(row);let start=0;
 const controls=document.createElement('div');controls.className='fb-gallery-controls';controls.hidden=count<=5;
 const previous=document.createElement('button'),next=document.createElement('button'),position=document.createElement('span');previous.type=next.type='button';previous.textContent='‹';next.textContent='›';previous.setAttribute('aria-label',options.previous);next.setAttribute('aria-label',options.next);position.setAttribute('aria-live','polite');controls.append(previous,position,next);root.append(controls);
 const dialog=document.createElement('dialog');dialog.className='fb-lightbox';dialog.setAttribute('aria-label',options.label);
 const picture=document.createElement('img'),bar=document.createElement('div');bar.className='fb-gallery-controls';const before=document.createElement('button'),after=document.createElement('button'),close=document.createElement('button'),counter=document.createElement('span');before.type=after.type=close.type='button';before.textContent='‹';after.textContent='›';close.textContent=options.close;before.setAttribute('aria-label',options.previous);after.setAttribute('aria-label',options.next);counter.setAttribute('aria-live','polite');bar.append(before,counter,after,close);dialog.append(bar,picture);root.append(dialog);let selected=0,generation=0;
 function display(index:number){selected=index;const sequence=++generation;picture.removeAttribute('src');picture.alt=options.label+' '+(index+1);counter.textContent=`${index+1} / ${count}`;before.disabled=index===0;after.disabled=index===count-1;Promise.resolve(options.url(index,false)).then(url=>{if(options.active()&&sequence===generation&&dialog.isConnected)picture.src=url}).catch(()=>{});}
 function open(index:number){display(index);dialog.showModal();close.focus();}
 close.onclick=()=>dialog.close();before.onclick=()=>display(selected-1);after.onclick=()=>display(selected+1);dialog.addEventListener('close',()=>{generation++;picture.removeAttribute('src')});
 dialog.onkeydown=event=>{if(event.key==='ArrowLeft'&&selected>0){event.preventDefault();display(selected-1)}if(event.key==='ArrowRight'&&selected<count-1){event.preventDefault();display(selected+1)}};
 function render(){row.replaceChildren();for(let index=start;index<Math.min(start+5,count);index++){
  const button=document.createElement('button');button.type='button';button.className='fb-thumbnail';button.setAttribute('aria-label',options.label+' '+(index+1));const img=document.createElement('img');img.alt=options.label+' '+(index+1);img.loading='lazy';button.append(img);button.onclick=()=>open(index);row.append(button);
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();Promise.resolve(options.url(index,true)).then(url=>{if(options.active()&&img.isConnected)img.src=url}).catch(()=>{})}});observer.observe(button);
  // Detached cards must not leave observers alive.
  observers.push(observer);
 }
 previous.disabled=start===0;next.disabled=start+5>=count;position.textContent=`${start+1}–${Math.min(start+5,count)} / ${count}`;}
 const observers:IntersectionObserver[]=[];
 function move(delta:number){observers.splice(0).forEach(o=>o.disconnect());start=Math.max(0,Math.min(count-5,start+delta));render();}
 previous.onclick=()=>move(-5);next.onclick=()=>move(5);
 let touchX:number|undefined;row.addEventListener('touchstart',e=>{touchX=e.changedTouches[0]?.clientX},{passive:true});row.addEventListener('touchend',e=>{if(touchX===undefined||count<=5)return;const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>40)move(delta<0?5:-5);touchX=undefined},{passive:true});
 root.addEventListener('feedback:dispose',()=>{observers.splice(0).forEach(o=>o.disconnect());generation++;if(dialog.open)dialog.close()});render();return root;
}
