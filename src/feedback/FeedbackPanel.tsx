import React,{useEffect,useRef} from 'react';
import {mountFeedback,feedbackText} from './feedback';
import './feedback.css';
export function Feedback({language,version}:{language:string;version:string}) {
 const target=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!target.current)return;
  return mountFeedback(target.current,{language,source:'desktop',version,request:async(method,path,body,files)=>window.desktop.feedback(method,path,body,files?await Promise.all(files.map(async file=>({bytes:new Uint8Array(await file.arrayBuffer()),type:file.type}))):undefined),
   imageUrl:async (id,index,thumbnail)=>{const r=await window.desktop.feedback('GET','/'+id+(thumbnail?'/thumbnail/':'/image/')+index);if(r.status!==200||typeof r.data.image!=='string')throw Error();return 'data:'+r.data.mime+';base64,'+r.data.image;}});
 },[language,version]);
 return <section className="feedback-desktop"><h1>{feedbackText(language,'nav')}</h1><p className="feedback-intro">{feedbackText(language,'intro')}</p><div ref={target}/></section>;
}
