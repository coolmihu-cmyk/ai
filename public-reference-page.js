"use strict";
(() => {
  const CATEGORIES=['photography','design','commerce','other'];
  const el={grid:$('#referenceGrid'),empty:$('#referenceEmpty'),emptyTitle:$('#referenceEmptyTitle'),modal:$('#referenceModal'),modalTitle:$('#referenceModalTitle'),form:$('#referenceForm'),imageUrl:$('#referenceImageUrl'),category:$('#referenceCategory'),prompt:$('#referencePrompt'),error:$('#referenceFormError'),save:$('#referenceForm button[type="submit"]'),create:$('#referenceCreate'),emptyCreate:$('#referenceEmptyCreate'),close:$('#referenceClose'),cancel:$('#referenceCancel'),filters:[...document.querySelectorAll('[data-reference-filter]')],dateFilter:$('#referenceDateFilter'),count:$('#referenceCount')};
  const shell=document.querySelector('.reference-shell'),ledger=document.querySelector('.reference-ledger'),fades=document.querySelector('.reference-scroll-fades');
  let items=[],activeCategory='all',activeMonth='all',editingId=null,adminToken='';
  const icon=paths=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');paths.forEach(d=>{const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.appendChild(path)});return svg};
  const categoryOf=value=>CATEGORIES.includes(value)?value:'other';
  const monthKey=value=>{const date=new Date(value||0);return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,7)};
  const monthLabel=key=>{const [year,month]=key.split('-');return year+' 年 '+Number(month)+' 月'};
  const formatDate=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'刚刚添加':new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(date)};
  function updateFades(){
    if(!shell||!ledger||!fades)return;
    const box=ledger.getBoundingClientRect(),visible=box.height>2&&box.width>2;fades.hidden=!visible;if(!visible)return;
    fades.style.left=Math.round(box.left+1)+'px';fades.style.top=Math.round(box.top+1)+'px';fades.style.width=Math.round(box.width-2)+'px';fades.style.height=Math.round(box.height-2)+'px';
    fades.classList.toggle('has-top-fade',ledger.scrollTop>2);fades.classList.toggle('has-bottom-fade',ledger.scrollTop+ledger.clientHeight<ledger.scrollHeight-2);
  }
  async function request(path,{method='GET',body}={}){
    const headers={'Accept':'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(adminToken)headers['X-Public-Reference-Admin']=adminToken;
    const response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'公共参考库请求失败。');return data;
  }
  function refreshMonths(){const months=[...new Set(items.map(item=>monthKey(item.createdAt)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));if(activeMonth!=='all'&&!months.includes(activeMonth))activeMonth='all';el.dateFilter.replaceChildren(new Option('全部时间','all'),...months.map(key=>new Option(monthLabel(key),key)));el.dateFilter.value=activeMonth}
  function columnCount(){return matchMedia('(max-width:720px)').matches?2:matchMedia('(max-width:1180px)').matches?3:5}
  function render(){
    items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));refreshMonths();
    const visible=items.filter(item=>(activeCategory==='all'||categoryOf(item.category)===activeCategory)&&(activeMonth==='all'||monthKey(item.createdAt)===activeMonth));
    el.count.textContent=visible.length+' 张图片';el.grid.replaceChildren();el.empty.hidden=visible.length>0;el.emptyTitle.textContent=items.length&&(activeCategory!=='all'||activeMonth!=='all')?'这个筛选条件下还没有参考':'公共参考库正在整理';
    const columns=Array.from({length:columnCount()},()=>{const column=document.createElement('div');column.className='reference-column';return column});
    visible.forEach((item,index)=>{
      const card=document.createElement('article');card.className='reference-card';
      const media=document.createElement('button');media.type='button';media.className='reference-media';media.title='在新标签页查看原图';media.onclick=()=>openImage(item.imageUrl);
      const image=document.createElement('img');image.src=ImageDelivery.thumbnail(item.imageUrl);image.alt=item.prompt||'公共参考图片';image.loading='lazy';image.decoding='async';image.onerror=()=>{if(image.src!==item.imageUrl){image.src=item.imageUrl;return}card.classList.add('is-unavailable')};media.append(image);
      const body=document.createElement('div');body.className='reference-card-body';if(item.prompt){const prompt=document.createElement('p');prompt.textContent=item.prompt;body.append(prompt)}const meta=document.createElement('div');meta.className='reference-card-meta';meta.textContent=formatDate(item.createdAt);body.append(meta);
      const actions=document.createElement('div');actions.className='reference-card-actions';const use=document.createElement('button');use.type='button';use.title='带入创意';use.append(icon(['M12 3v18','M3 12h18']));use.onclick=()=>{try{sessionStorage.setItem('mihu_reference_payload',JSON.stringify({url:item.imageUrl,prompt:item.prompt||''}))}catch(_){}navigateWithLoading('index.html')};actions.append(use);
      if(adminToken){const edit=document.createElement('button');edit.type='button';edit.title='编辑公共参考';edit.append(icon(['M4 16.5V20h3.5L18.2 9.3l-3.5-3.5L4 16.5Z','m12.7 7.8 3.5 3.5']));edit.onclick=()=>openModal(item);const del=document.createElement('button');del.type='button';del.title='删除公共参考';del.append(icon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13']));del.onclick=()=>remove(item);actions.append(edit,del)}
      card.append(media,body,actions);columns[index%columns.length].append(card);
    });
    el.grid.append(...columns);requestAnimationFrame(updateFades);
  }
  function setError(message=''){el.error.textContent=message;el.error.hidden=!message}
  function openModal(item=null){editingId=item?.id||null;el.form.reset();setError();el.modalTitle.textContent=item?'编辑公共参考':'新建公共参考';el.save.textContent=item?'保存修改':'发布参考';if(item){el.imageUrl.value=item.imageUrl||'';el.category.value=categoryOf(item.category);el.prompt.value=item.prompt||''}el.modal.hidden=false;requestAnimationFrame(()=>el.imageUrl.focus())}
  function closeModal(){el.modal.hidden=true;editingId=null}
  async function startManage(){const token=window.prompt('请输入公共参考库管理口令（仅保留在本次页面会话中）：');if(!token)return;adminToken=token;render();openModal()}
  async function remove(item){if(!confirm('删除这条公共参考？'))return;try{await request('/api/public-references',{method:'DELETE',body:{id:item.id}});items=items.filter(entry=>entry.id!==item.id);render();toast('公共参考已删除')}catch(error){toast(error.message)}}
  async function load(){try{const data=await request('/api/public-references');items=Array.isArray(data.items)?data.items:[];render()}catch(error){el.empty.hidden=false;el.emptyTitle.textContent='公共参考库暂时不可用';toast(error.message)}}
  el.create.onclick=startManage;el.emptyCreate.onclick=startManage;el.close.onclick=closeModal;el.cancel.onclick=closeModal;
  el.filters.forEach(button=>button.onclick=()=>{activeCategory=button.dataset.referenceFilter;el.filters.forEach(item=>item.classList.toggle('is-active',item===button));render()});el.dateFilter.onchange=()=>{activeMonth=el.dateFilter.value;render()};ledger?.addEventListener('scroll',updateFades,{passive:true});window.addEventListener('resize',updateFades);el.modal.addEventListener('click',event=>{if(event.target===el.modal)closeModal()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el.modal.hidden)closeModal()});
  el.form.onsubmit=async event=>{event.preventDefault();setError();let imageUrl;try{imageUrl=new URL(el.imageUrl.value.trim());if(!/^https?:$/.test(imageUrl.protocol))throw new Error()}catch(_){setError('请输入有效的图片链接。');return}const next={imageUrl:imageUrl.href,prompt:el.prompt.value.trim(),category:categoryOf(el.category.value),updatedAt:new Date().toISOString()},editing=Boolean(editingId),item=editing?{...items.find(entry=>entry.id===editingId),...next}:{id:'public-reference-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),...next,createdAt:new Date().toISOString()};try{const saved=await request('/api/public-references',{method:'POST',body:{item}});const value=saved.item||item;items=[value,...items.filter(entry=>entry.id!==value.id)];render();closeModal();toast(editing?'公共参考已更新':'公共参考已发布')}catch(error){setError(error.message)}};
  load();
})();
