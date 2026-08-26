"use strict";
(() => {
  const STORAGE_KEY='mihu-reference-library-v1',MAX_ITEMS=300;
  const CATEGORIES=['photography','design','commerce'];
  const el={grid:$('#referenceGrid'),empty:$('#referenceEmpty'),emptyTitle:$('#referenceEmptyTitle'),modal:$('#referenceModal'),form:$('#referenceForm'),imageUrl:$('#referenceImageUrl'),category:$('#referenceCategory'),prompt:$('#referencePrompt'),error:$('#referenceFormError'),create:$('#referenceCreate'),emptyCreate:$('#referenceEmptyCreate'),close:$('#referenceClose'),cancel:$('#referenceCancel'),exportJson:$('#referenceExportJson'),importFile:$('#referenceImportFile'),filters:[...document.querySelectorAll('[data-reference-filter]')]};
  let items=[],activeCategory='all';
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
  function categoryOf(value){return CATEGORIES.includes(value)?value:''}
  function getColumnCount(){return matchMedia('(max-width:720px)').matches?2:matchMedia('(max-width:1180px)').matches?3:5}
  function download(filename,content,type){const blob=new Blob([content],{type});const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),0)}
  function exportReferences(){
    if(!items.length){toast('还没有可导出的参考');return}
    const stamp=new Date().toISOString().slice(0,10);
    download(`mihu-reference-${stamp}.json`,JSON.stringify({version:1,exportedAt:new Date().toISOString(),items},null,2),'application/json;charset=utf-8');
    toast('参考库已导出');
  }
  async function importReferences(event){
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    try{
      const payload=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
      const source=Array.isArray(payload)?payload:payload?.items;
      if(!Array.isArray(source))throw new Error('unsupported backup');
      const knownUrls=new Set(items.map(item=>item.imageUrl));
      const imported=[];
      for(const candidate of source){
        if(!candidate||typeof candidate.imageUrl!=='string'||knownUrls.has(candidate.imageUrl))continue;
        let url;try{url=new URL(candidate.imageUrl);if(!/^https?:$/.test(url.protocol))continue}catch(_){continue}
        knownUrls.add(url.href);
        imported.push({id:'reference-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),imageUrl:url.href,prompt:typeof candidate.prompt==='string'?candidate.prompt:'',category:categoryOf(candidate.category),createdAt:!Number.isNaN(new Date(candidate.createdAt).getTime())?candidate.createdAt:new Date().toISOString()});
      }
      if(!imported.length){toast('没有可导入的新参考');return}
      items=[...imported,...items].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,MAX_ITEMS);
      persist();render();toast(`已导入 ${imported.length} 条参考`);
    }catch(error){console.warn('导入参考失败',error);toast('导入失败，请选择此前导出的 JSON 文件')}
  }
  function render(){
    items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const visibleItems=activeCategory==='all'?items:items.filter(item=>categoryOf(item.category)===activeCategory);
    el.grid.replaceChildren();el.empty.hidden=visibleItems.length>0;el.emptyTitle.textContent=items.length&&activeCategory!=='all'?'这个分类还没有参考':'还没有参考';
    const columns=Array.from({length:getColumnCount()},()=>{const column=document.createElement('div');column.className='reference-column';return column});
    visibleItems.forEach((item,index)=>{
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
  el.create.onclick=openModal;el.emptyCreate.onclick=openModal;el.close.onclick=closeModal;el.cancel.onclick=closeModal;el.exportJson.onclick=exportReferences;el.importFile.onchange=importReferences;
  el.filters.forEach(button=>button.onclick=()=>{activeCategory=button.dataset.referenceFilter;el.filters.forEach(item=>item.classList.toggle('is-active',item===button));render()});
  el.modal.addEventListener('click',event=>{if(event.target===el.modal)closeModal()});
  el.form.onsubmit=event=>{
    event.preventDefault();setError();
    let imageUrl;try{imageUrl=new URL(el.imageUrl.value.trim());if(!/^https?:$/.test(imageUrl.protocol))throw new Error()}catch(_){setError('请输入有效的图片链接。');return}
    items.unshift({id:'reference-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),imageUrl:imageUrl.href,prompt:el.prompt.value.trim(),category:categoryOf(el.category.value),createdAt:new Date().toISOString()});
    persist();render();closeModal();toast('参考已保存');
  };
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el.modal.hidden)closeModal()});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120)});
  items=read().slice(0,MAX_ITEMS);render();
})();
