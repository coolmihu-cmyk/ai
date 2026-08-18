"use strict";
(() => {
  const STORAGE_KEY='mihu-reference-library-v1',MAX_ITEMS=300;
  const el={grid:$('#referenceGrid'),empty:$('#referenceEmpty'),modal:$('#referenceModal'),form:$('#referenceForm'),imageUrl:$('#referenceImageUrl'),prompt:$('#referencePrompt'),error:$('#referenceFormError'),create:$('#referenceCreate'),emptyCreate:$('#referenceEmptyCreate'),close:$('#referenceClose'),cancel:$('#referenceCancel'),exportJson:$('#referenceExportJson'),exportText:$('#referenceExportText')};
  let items=[];
  const icon=paths=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');paths.forEach(d=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path)});return svg};
  function read(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(saved)?saved:[]}catch(_){return []}}
  function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items.slice(0,MAX_ITEMS)))}catch(_){toast('本地存储空间不足，请删除部分参考')}}
  function formatDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'刚刚添加':new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(date)}
  function openModal(){el.form.reset();setError('');el.modal.hidden=false;requestAnimationFrame(()=>el.imageUrl.focus())}
  function closeModal(){el.modal.hidden=true}
  function setError(message){el.error.textContent=message;el.error.hidden=!message}
  function remove(id){items=items.filter(item=>item.id!==id);persist();render();toast('已删除参考')}
  async function copyPrompt(text){if(!text){toast('这条参考没有提示词');return}try{await navigator.clipboard.writeText(text);toast('提示词已复制')}catch(_){const input=document.createElement('textarea');input.value=text;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();toast('提示词已复制')}}
  function useReference(item){try{sessionStorage.setItem('mihu_reference_payload',JSON.stringify({url:item.imageUrl,prompt:item.prompt||''}))}catch(_){}navigateWithLoading('index.html')}
  function getColumnCount(){return matchMedia('(max-width:720px)').matches?2:matchMedia('(max-width:1180px)').matches?3:5}
  function download(filename,content,type){const blob=new Blob([content],{type});const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),0)}
  function exportReferences(format){
    if(!items.length){toast('还没有可导出的参考');return}
    const stamp=new Date().toISOString().slice(0,10);
    if(format==='json'){
      download(`mihu-reference-${stamp}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),items},null,2),'application/json;charset=utf-8');
    }else{
      const text=items.map((item,index)=>`# ${index+1}\n图片链接：${item.imageUrl}\n提示词：${item.prompt||'（未填写）'}\n添加时间：${item.createdAt||''}`).join('\n\n');
      download(`mihu-reference-${stamp}.txt`,text,'text/plain;charset=utf-8');
    }
    toast('参考库已导出');
  }
  function render(){
    items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    el.grid.replaceChildren();el.empty.hidden=items.length>0;
    const columns=Array.from({length:getColumnCount()},()=>{const column=document.createElement('div');column.className='reference-column';return column});
    items.forEach((item,index)=>{
      const card=document.createElement('article');card.className='reference-card';
      const media=document.createElement('button');media.type='button';media.className='reference-media';media.title='在新标签页查看原图';media.onclick=()=>openImage(item.imageUrl);
      const image=document.createElement('img');image.src=item.imageUrl;image.alt=item.prompt||'参考图片';image.loading='lazy';image.decoding='async';image.onerror=()=>card.classList.add('is-unavailable');media.appendChild(image);
      const body=document.createElement('div');body.className='reference-card-body';
      if(item.prompt){const prompt=document.createElement('p');prompt.textContent=item.prompt;body.appendChild(prompt)}
      const meta=document.createElement('div');meta.className='reference-card-meta';const date=document.createElement('span');date.textContent=formatDate(item.createdAt);meta.appendChild(date);body.appendChild(meta);
      const actions=document.createElement('div');actions.className='reference-card-actions';
      const use=document.createElement('button');use.type='button';use.title='带入创意';use.appendChild(icon(['M12 3v18','M3 12h18']));use.onclick=()=>useReference(item);
      const copy=document.createElement('button');copy.type='button';copy.title='复制提示词';copy.appendChild(icon(['M8 8h11v11H8z','M5 5h11v3','M5 5v11h3']));copy.onclick=()=>copyPrompt(item.prompt);
      const del=document.createElement('button');del.type='button';del.title='删除参考';del.appendChild(icon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13']));del.onclick=()=>remove(item.id);
      actions.append(use,copy,del);card.append(media,body,actions);columns[index%columns.length].appendChild(card);
    });
    el.grid.append(...columns);
  }
  el.create.onclick=openModal;el.emptyCreate.onclick=openModal;el.close.onclick=closeModal;el.cancel.onclick=closeModal;el.exportJson.onclick=()=>exportReferences('json');el.exportText.onclick=()=>exportReferences('text');
  el.modal.addEventListener('click',event=>{if(event.target===el.modal)closeModal()});
  el.form.onsubmit=event=>{
    event.preventDefault();setError();
    let imageUrl;try{imageUrl=new URL(el.imageUrl.value.trim());if(!/^https?:$/.test(imageUrl.protocol))throw new Error()}catch(_){setError('请输入有效的图片链接。');return}
    items.unshift({id:'reference-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),imageUrl:imageUrl.href,prompt:el.prompt.value.trim(),createdAt:new Date().toISOString()});
    persist();render();closeModal();toast('参考已保存');
  };
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el.modal.hidden)closeModal()});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120)});
  items=read().slice(0,MAX_ITEMS);render();
})();