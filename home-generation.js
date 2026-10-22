/* Homepage task feedback; execution is shared with the assets page. */
const HomeGeneration=(()=>{
  const panel=document.querySelector('#homeGeneration'),list=document.querySelector('#homeGenerationList');
  const sessionKey='mihu-home-generation-start';
  let sessionStart=Number(sessionStorage.getItem(sessionKey))||Date.now(),revision=0,lastSignature='';
  sessionStorage.setItem(sessionKey,String(sessionStart));
  let taskNumbers;try{taskNumbers=JSON.parse(sessionStorage.getItem('mihu-home-task-numbers')||'{}')}catch(_){taskNumbers={}}
  function taskNumber(job){
    if(!taskNumbers[job.id]){
      taskNumbers[job.id]=Math.max(0,...Object.values(taskNumbers).map(Number))+1;
      sessionStorage.setItem('mihu-home-task-numbers',JSON.stringify(taskNumbers));
    }
    return String(taskNumbers[job.id]).padStart(2,'0');
  }
  function button(label,action){const node=document.createElement('button');node.type='button';node.textContent=label;node.onclick=action;return node}
  function edit(item){
    if(preparingGeneration){toast('参考图正在准备，请稍候');return}
    const urls=item.referenceUrls||item.body?.image_urls||[];
    sessionStorage.setItem('mihu_reference_payload',JSON.stringify({model:item.model,prompt:item.prompt||'',settings:item.settings||{},urls,replacePrompt:true}));
    sharedReferenceManager.clear();applyReferenceLibraryPayload();els.composer.scrollIntoView({block:'center'});els.promptInput.focus({preventScroll:true});
  }
  function promptDetails(item){
    const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');
    summary.textContent='查看提示词';text.textContent=item.prompt||'';details.append(summary,text);return details;
  }
  async function refresh(){
    const current=++revision;
    const [jobs,history]=await Promise.all([PendingGeneration.loadAll(),History.load()]);
    if(current!==revision)return;
    const results=history.filter(item=>(item.type||'image')==='image'&&new Date(item.createdAt).getTime()>=sessionStart).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8);
    const signature=JSON.stringify([jobs.map(job=>[job.id,job.model,job.prompt,job.failedAt,job.lastError,job.taskId,job.synchronousStartedAt,GenerationQueue.states.get(job.id)]),results.map(item=>[item.id,item.url])]);
    if(signature===lastSignature)return;lastSignature=signature;
    const expanded=new Set([...list.querySelectorAll('article[data-job-id] details[open]')].map(node=>node.closest('article').dataset.jobId));
    panel.hidden=!jobs.length&&!results.length;
    document.querySelector('#homeGenerationCount').textContent=jobs.length?'待处理 '+jobs.length+' 项':'已完成 '+results.length+' 项';
    list.replaceChildren();
    for(const job of jobs){
      const state=GenerationQueue.states.get(job.id),running=!!(state||job.taskId||job.synchronousStartedAt)&&!job.failedAt;
      const row=document.createElement('article');row.className='home-generation-task';row.dataset.jobId=job.id;
      const heading=document.createElement('div');heading.className='home-generation-task-head';
      const name=document.createElement('b');name.textContent='任务 '+taskNumber(job)+' · '+(MODEL_CONFIG[job.model]?.name||job.model);
      const progress=Math.max(0,Math.min(100,Number(state?.progress)||0));
      const status=document.createElement('span');status.textContent=job.failedAt?'生成失败':running?(progress>0?'生成中 '+Math.round(progress)+'%':state?.message||'正在生成 · 处理中'):'排队中';heading.append(name,status);
      const details=promptDetails(job);details.open=expanded.has(job.id);row.append(heading,details);
      if(running){
        const bar=document.createElement('progress');bar.className='home-generation-progress';bar.max=100;
        bar.setAttribute('aria-label','任务 '+taskNumber(job)+' 生成进度');
        if(progress>0)bar.value=progress;
        bar.setAttribute('aria-valuetext',progress>0?Math.round(progress)+'%':'处理中');row.append(bar);
      }
      if(job.failedAt){const error=document.createElement('p');error.className='home-generation-error';error.textContent=job.lastError||'生成未完成';row.append(error)}
      const actions=document.createElement('div');actions.className='home-generation-actions';
      if(job.failedAt)actions.append(button('重试',async()=>{await GenerationQueue.retry(job);GenerationQueue.run().catch(()=>{});refresh()}),button('修改提示词',()=>edit(job)));
      if(!running)actions.append(button('取消任务',async()=>{await PendingGeneration.delete(job.id);refresh();GenerationQueue.run().catch(()=>{})}));
      row.append(actions);list.append(row);
    }
    if(results.length){
      const grid=document.createElement('div');grid.className='home-generation-results';
      for(const item of results){
        const card=document.createElement('article');card.className='home-generation-result';
        const preview=button('',()=>openImage(item.url));preview.className='home-generation-preview';preview.setAttribute('aria-label','查看生成图片');
        const image=document.createElement('img');image.src=ImageDelivery.thumbnail(item.url);image.alt='生成结果';image.loading='lazy';
        image.onerror=()=>{image.hidden=true;preview.textContent='图片暂时无法读取'};preview.append(image);
        const name=document.createElement('small');name.textContent=MODEL_CONFIG[item.model]?.name||item.model;
        const actions=document.createElement('div');actions.className='home-generation-actions';actions.append(button('下载',()=>downloadImage(item.url)),button('继续创作',()=>edit(item)));
        card.append(preview,name,actions);grid.append(card);
      }
      list.append(grid);
    }
  }
  let scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh().catch(error=>console.warn('首页任务列表读取失败',error))})}
  window.addEventListener('mihu-pending-generation-change',schedule);
  window.addEventListener('mihu-generation-updated',schedule);
  function tick(){schedule();GenerationQueue.run().catch(error=>console.warn('生成队列执行失败',error))}
  setInterval(tick,3000);window.addEventListener('pageshow',tick);window.addEventListener('focus',tick);tick();
  return {refresh:schedule};
})();
