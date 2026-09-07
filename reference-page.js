"use strict";
(() => {
  const STORAGE_KEY='mihu-reference-library-v1',MAX_ITEMS=300;
  const CATEGORIES=['photography','design','commerce','other'];
  const el={grid:$('#referenceGrid'),empty:$('#referenceEmpty'),emptyTitle:$('#referenceEmptyTitle'),modal:$('#referenceModal'),modalTitle:$('#referenceModalTitle'),form:$('#referenceForm'),imageUrl:$('#referenceImageUrl'),category:$('#referenceCategory'),prompt:$('#referencePrompt'),error:$('#referenceFormError'),save:$('#referenceForm button[type="submit"]'),create:$('#referenceCreate'),emptyCreate:$('#referenceEmptyCreate'),close:$('#referenceClose'),cancel:$('#referenceCancel'),filters:[...document.querySelectorAll('[data-reference-filter]')],dateFilter:$('#referenceDateFilter'),count:$('#referenceCount')};
  let items=[],activeCategory='all',activeMonth='all',editingId=null;
  const referenceShell=document.querySelector('.reference-shell');
  const referenceLedger=document.querySelector('.reference-ledger');
  const referenceScrollFades=document.querySelector('.reference-scroll-fades');
  function updateReferenceBottomFade(){
    if(!referenceShell||!referenceLedger||!referenceScrollFades)return;
    const shellBounds=referenceShell.getBoundingClientRect(),ledgerBounds=referenceLedger.getBoundingClientRect();
    const top=Math.max(shellBounds.top,ledgerBounds.top),bottom=Math.min(shellBounds.bottom,ledgerBounds.bottom);
    const visible=bottom-top>2&&ledgerBounds.width>2;
    referenceScrollFades.hidden=!visible;
    if(!visible)return;
    referenceScrollFades.style.left=Math.round(ledgerBounds.left)+'px';
    referenceScrollFades.style.top=Math.round(top)+'px';
    referenceScrollFades.style.width=Math.round(ledgerBounds.width)+'px';
    referenceScrollFades.style.height=Math.round(bottom-top)+'px';
    const atTop=referenceShell.scrollTop<=2;
    const atBottom=referenceShell.scrollTop+referenceShell.clientHeight>=referenceShell.scrollHeight-2;
    referenceScrollFades.classList.toggle('has-top-fade',!atTop);
    referenceScrollFades.classList.toggle('has-bottom-fade',!atBottom);
  }
  const icon=paths=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');paths.forEach(d=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path)});return svg};
  function read(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(saved)?saved:[]}catch(_){return []}}
  function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items.slice(0,MAX_ITEMS)))}catch(_){toast('本地存储空间不足，请删除部分参考')}}
  const CloudReferences={
    async request(path,{method='GET',body}={}){
      const token=await CloudHistory.token();if(!token)return null;
      const headers={'Accept':'application/json','X-History-Key':token};if(body!==undefined)headers['Content-Type']='application/json';
      const response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'云端参考同步失败。');return data;
    },
    async list(){
      const items=[],deletedIds=[],seen=new Set();let cursor='';
      for(let page=0;page<12;page++){
        const data=await this.request('/api/references'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!data)return null;
        items.push(...(Array.isArray(data.items)?data.items:[]));deletedIds.push(...(Array.isArray(data.deletedIds)?data.deletedIds:[]));
        if(!data.cursor||data.complete||seen.has(data.cursor))break;seen.add(data.cursor);cursor=data.cursor;
      }
      return {items,deletedIds};
    },
    save(item){return this.request('/api/references',{method:'POST',body:{item}})},
    remove(id){return this.request('/api/references',{method:'DELETE',body:{id}})}
  };
  function cloudSave(item){CloudReferences.save(item).catch(error=>console.warn('云端参考保存失败',error))}
  function cloudRemove(id){CloudReferences.remove(id).catch(error=>console.warn('云端参考删除失败',error))}
  function formatDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'刚刚添加':new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(date)}
  function openModal(item=null){
    editingId=item?.id||null;el.form.reset();setError('');
    el.modalTitle.textContent=item?'编辑参考':'新建参考';el.save.textContent=item?'保存修改':'保存参考';
    if(item){el.imageUrl.value=item.imageUrl||'';el.category.value=categoryOf(item.category)||'other';el.prompt.value=item.prompt||''}
    el.modal.hidden=false;requestAnimationFrame(()=>el.imageUrl.focus())
  }
  function closeModal(){el.modal.hidden=true;editingId=null}
  function setError(message){el.error.textContent=message;el.error.hidden=!message}
  function remove(id){items=items.filter(item=>item.id!==id);persist();render();cloudRemove(id);toast('已删除参考')}
  function useReference(item){try{sessionStorage.setItem('mihu_reference_payload',JSON.stringify({url:item.imageUrl,prompt:item.prompt||''}))}catch(_){}navigateWithLoading('index.html')}
  function categoryOf(value){return CATEGORIES.includes(value)?value:''}
  function monthKey(value){const date=new Date(value||0);return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,7)}
  function monthLabel(key){const [year,month]=key.split('-');return year+' 年 '+Number(month)+' 月'}
  function refreshMonthOptions(){
    if(!el.dateFilter)return;
    const months=[...new Set(items.map(item=>monthKey(item.createdAt)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
    if(activeMonth!=='all'&&!months.includes(activeMonth))activeMonth='all';
    el.dateFilter.replaceChildren(new Option('全部时间','all'),...months.map(key=>new Option(monthLabel(key),key)));
    el.dateFilter.value=activeMonth;
  }
  function getColumnCount(){return matchMedia('(max-width:720px)').matches?2:matchMedia('(max-width:1180px)').matches?3:5}
  function render(){
    items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    refreshMonthOptions();
    const visibleItems=items.filter(item=>(activeCategory==='all'||categoryOf(item.category)===activeCategory)&&(activeMonth==='all'||monthKey(item.createdAt)===activeMonth));
    el.count.textContent=visibleItems.length+' 张图片';
    el.grid.replaceChildren();el.empty.hidden=visibleItems.length>0;el.emptyTitle.textContent=items.length&&(activeCategory!=='all'||activeMonth!=='all')?'这个筛选条件下还没有参考':'还没有参考';
    const columns=Array.from({length:getColumnCount()},()=>{const column=document.createElement('div');column.className='reference-column';return column});
    visibleItems.forEach((item,index)=>{
      const card=document.createElement('article');card.className='reference-card';
      const media=document.createElement('button');media.type='button';media.className='reference-media';media.title='在新标签页查看原图';media.onclick=()=>openImage(item.imageUrl);
      const image=document.createElement('img');image.src=ImageDelivery.thumbnail(item.imageUrl);image.alt=item.prompt||'参考图片';image.loading='lazy';image.decoding='async';image.onerror=()=>{if(image.src!==item.imageUrl){image.src=item.imageUrl;return}card.classList.add('is-unavailable')};media.appendChild(image);
      const body=document.createElement('div');body.className='reference-card-body';
      if(item.prompt){const prompt=document.createElement('p');prompt.textContent=item.prompt;body.appendChild(prompt)}
      const meta=document.createElement('div');meta.className='reference-card-meta';const date=document.createElement('span');date.textContent=formatDate(item.createdAt);meta.appendChild(date);body.appendChild(meta);
      const actions=document.createElement('div');actions.className='reference-card-actions';
      const use=document.createElement('button');use.type='button';use.title='带入创意';use.appendChild(icon(['M12 3v18','M3 12h18']));use.onclick=()=>useReference(item);
      const edit=document.createElement('button');edit.type='button';edit.title='编辑参考';edit.appendChild(icon(['M4 16.5V20h3.5L18.2 9.3l-3.5-3.5L4 16.5Z','m12.7 7.8 3.5 3.5','M13.8 5.7 15.4 4a2 2 0 0 1 2.8 2.8l-1.7 1.6']));edit.onclick=()=>openModal(item);
      const del=document.createElement('button');del.type='button';del.title='删除参考';del.appendChild(icon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13']));del.onclick=()=>remove(item.id);
      actions.append(use,edit,del);card.append(media,body,actions);columns[index%columns.length].appendChild(card);
    });
    el.grid.append(...columns);
    requestAnimationFrame(updateReferenceBottomFade);
  }
  el.create.onclick=openModal;el.emptyCreate.onclick=openModal;el.close.onclick=closeModal;el.cancel.onclick=closeModal;
  el.filters.forEach(button=>button.onclick=()=>{activeCategory=button.dataset.referenceFilter;el.filters.forEach(item=>item.classList.toggle('is-active',item===button));render()});
  el.dateFilter.onchange=()=>{activeMonth=el.dateFilter.value;render()};
  referenceShell?.addEventListener('scroll',updateReferenceBottomFade,{passive:true});
  window.addEventListener('resize',updateReferenceBottomFade);
  el.modal.addEventListener('click',event=>{if(event.target===el.modal)closeModal()});
  el.form.onsubmit=event=>{
    event.preventDefault();setError();
    let imageUrl;try{imageUrl=new URL(el.imageUrl.value.trim());if(!/^https?:$/.test(imageUrl.protocol))throw new Error()}catch(_){setError('请输入有效的图片链接。');return}
    const next={imageUrl:imageUrl.href,prompt:el.prompt.value.trim(),category:categoryOf(el.category.value),updatedAt:new Date().toISOString()};
    if(editingId){
      const index=items.findIndex(item=>item.id===editingId);
      if(index<0){setError('这条参考已不存在，请重新添加。');return}
      items[index]={...items[index],...next};
      const updated=items[index];persist();render();cloudSave(updated);closeModal();toast('参考已更新');
      return;
    }
    const item={id:'reference-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),...next,createdAt:new Date().toISOString()};items.unshift(item);
    persist();render();cloudSave(item);closeModal();toast('参考已保存');
  };
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el.modal.hidden)closeModal()});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120)});
  async function syncCloudReferences(){
    try{
      const cloud=await CloudReferences.list();if(!cloud)return;
      const deleted=new Set(cloud.deletedIds.map(String)),remote=new Map();
      cloud.items.forEach(item=>{if(item?.id&&!deleted.has(String(item.id)))remote.set(String(item.id),item)});
      const merged=new Map(),upload=[];
      items.forEach(item=>{
        if(!item?.id||deleted.has(String(item.id)))return;
        const id=String(item.id),remoteItem=remote.get(id);
        if(!remoteItem){merged.set(id,item);upload.push(item);return}
        if(new Date(item.updatedAt||item.createdAt||0)>new Date(remoteItem.updatedAt||remoteItem.createdAt||0)){merged.set(id,item);upload.push(item);return}
        merged.set(id,remoteItem);
      });
      remote.forEach((item,id)=>{if(!merged.has(id))merged.set(id,item)});
      items=[...merged.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,MAX_ITEMS);persist();render();
      upload.forEach(cloudSave);
    }catch(error){console.warn('云端参考同步失败',error)}
  }
  items=read().slice(0,MAX_ITEMS);render();syncCloudReferences();
})();
