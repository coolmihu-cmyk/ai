/* Shared generation execution for the homepage and asset workspace. */
const GenerationQueue=(()=>{
  let running=false,activeJob=null;
  const states=new Map();
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('mihu-generation-updates'):null;
  function emit(message){channel?.postMessage(message);window.dispatchEvent(new Event('mihu-generation-updated'))}
  if(channel)channel.onmessage=event=>{
    const message=event.data;
    if(message?.type==='state')states.set(message.id,message.state);
    else if(message?.id)states.delete(message.id);
    window.dispatchEvent(new Event('mihu-generation-updated'));
  };
  function state(job,patch){const value={...states.get(job.id),...patch};states.set(job.id,value);emit({type:'state',id:job.id,state:value})}
  async function runJob(job,hooks={}){
    state(job,{phase:'processing',progress:0});
    return execute(job,{
      status(message){state(job,{message});hooks.status?.(message)},
      progress(status,progress,message){state(job,{phase:status,progress:Number(progress)||0,...(message?{message}:{})});hooks.progress?.(status,progress,message)},
      completed(job,item){states.delete(job.id);hooks.completed?.(job,item);emit({type:'completed',id:job.id})},
      failed(job,message){states.delete(job.id);hooks.failed?.(job,message);emit({type:'failed',id:job.id})}
    });
  }
  async function run(hooks={}){
    if(running)return false;
    running=true;
    try{return await GenerationExecutionLock.run(async()=>{
      while(true){
        const jobs=await PendingGeneration.loadAll();
        const next=jobs.find(job=>!job.failedAt);
        if(!next){activeJob=null;hooks.idle?.(jobs);break}
        activeJob=next;hooks.started?.(next);
        await runJob(next,hooks);activeJob=null;
      }
    })}finally{running=false;activeJob=null}
  }
async function execute(job,hooks={}){
  const apiKey=Settings.getKey();
  const isMoss=job.provider==='moss'||MODEL_CONFIG[job.model]?.provider==='moss';
  if(!apiKey&&!isMoss){
    const message='请先在设置中保存 API Key，再重试此任务。';
    job.failedAt=new Date().toISOString();job.lastError=message;await PendingGeneration.save(job);hooks.failed?.(job,message);return false;
  }
  const maxWaitMs=Math.max(300000,Math.min(Number(job.maxWaitMs)||300000,30*60*1000));
  const controller=new AbortController(),timeoutId=setTimeout(()=>controller.abort(),maxWaitMs+15000);
  const startedAt=performance.now();
  try{
    let url;
    if(isMoss){
      if(job.resultUrl)url=job.resultUrl;
      else{
        if(job.synchronousStartedAt)throw new Error('上次 MOSS 生成连接已中断，请先确认结果；如需重新生成，请手动点击重试。');
        job.synchronousStartedAt=new Date().toISOString();await PendingGeneration.save(job);
        hooks.status?.('MOSS 正在生成图片，请保持页面打开');hooks.progress('processing',0);
        url=await Moss.generate(job.body,controller.signal);
        job.resultUrl=url;await PendingGeneration.save(job);
      }
    }else if(job.taskId){
      url=await Apimart.pollTask(apiKey,job.taskId,hooks.progress,controller.signal,maxWaitMs);
    }else{
      url=await Apimart.generate({
        apiKey,body:job.body,endpoint:job.endpoint,signal:controller.signal,
        onSubmitted:taskId=>{
          job.taskId=taskId;
          PendingGeneration.save(job).catch(()=>{});
          PromptLog.update(job.promptLogId,{taskId,status:'processing'});
          hooks.status?.('任务已提交');
        },
        onProgress:hooks.progress
      });
    }
    const itemId=Date.now(),createdAt=new Date().toISOString();
    let archived=false,historyKey='';
    if(!isMoss&&Archive.isAvailable()){
      try{
        const archive=await Archive.image(url,{
          id:itemId,prompt:job.prompt||'',model:job.model||'gpt',settings:job.settings||{},referenceUrl:job.referenceUrls?.[0]||'',referenceUrls:job.referenceUrls||[],createdAt,type:'image'
        });
        url=archive.url;archived=true;historyKey=archive.historyKey||'';
      }catch(error){
        console.warn('图片归档失败，暂时保留 APIMart 临时地址',error);
        toast('图片已生成，但永久归档失败；请先下载原图。');
      }
    }
    const item={
      id:itemId,url,prompt:job.prompt||'',model:job.model||'gpt',settings:job.settings||{},referenceUrl:job.referenceUrls?.[0]||'',referenceUrls:job.referenceUrls||[],archived,historyKey,
      createdAt,durationMs:Math.round(performance.now()-startedAt)
    };
    await History.save(item);
    PromptLog.update(job.promptLogId,{status:'completed',cosUrl:archived?url:null,errorMessage:null});
    await PendingGeneration.delete(job.id);
    hooks.completed?.(job,item);
    notifyGenerated(MODEL_CONFIG[item.model]?.name||item.model);
    return true;
  }catch(error){
    console.warn('图片生成失败',error);
    const message=isMoss
      ?(error?.name==='AbortError'?'MOSS 连接中断或等待超时，原请求可能仍在生成，请稍后确认，避免立即重复提交。':String(error?.message||'MOSS 生成失败，请稍后重试。'))
      :generationErrorMessage(error);
    job.failedAt=new Date().toISOString();
    job.lastError=message;
    PromptLog.update(job.promptLogId,{status:'failed',errorMessage:message});
    await PendingGeneration.save(job);
    hooks.failed?.(job,message);
    return false;
  }finally{
    clearTimeout(timeoutId);
  }
}
  async function retry(job){
    delete job.failedAt;delete job.lastError;delete job.synchronousStartedAt;job.taskId=null;
    await PendingGeneration.save(job);PromptLog.update(job.promptLogId,{status:'submitted',errorMessage:null});
  }
  return {run,retry,execute:runJob,notify(){emit({type:'history'})},states,get running(){return running},get activeJob(){return activeJob}};
})();
