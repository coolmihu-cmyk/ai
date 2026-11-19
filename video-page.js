"use strict";
/* Video jobs are separate from the image queue. Only known task IDs are resumed. */
const VideoStudio=(()=>{
  const id=name=>document.getElementById(name);
  const el={form:id('videoForm'),fields:id('videoFields'),mode:id('videoMode'),prompt:id('videoPrompt'),size:id('videoSize'),resolution:id('videoResolution'),duration:id('videoDuration'),format:id('videoFormat'),audio:id('videoAudio'),watermark:id('videoWatermark'),images:id('videoImages'),first:id('videoFirstFrame'),last:id('videoLastFrame'),videos:id('videoVideos'),audios:id('videoAudios'),error:id('videoFormError'),submit:id('videoSubmit'),player:id('videoPlayer'),list:id('videoTaskList')};
  // Gold reference rates, USD x 10 = Credits; APIMart pricing/model snapshot 2026-11-19.
  // Input-video billing also includes the source-video seconds; 4K settles on actual usage.
  const rates={'480p':0.9608,'720p':2.16,'1080p':5.346,'4k':8.6088};
  const inputRates={'480p':0.576,'720p':1.296,'1080p':3.192,'4k':5.2768};
  let storeKey='',scope='',signature='',busy=false,selected='',lastResult='',polling=false,ready=false;
  const observed=new Map(),sending=new Set();
  for(let seconds=4;seconds<=30;seconds++)el.duration.add(new Option(seconds+' 秒',seconds));
  el.duration.value='5';
  function error(message=''){el.error.textContent=message;el.error.hidden=!message}
  function read(){
    if(!storeKey)return [];
    const value=JSON.parse(localStorage.getItem(storeKey)||'[]');
    if(!Array.isArray(value))throw new Error('本地视频记录格式异常，请先备份浏览器数据。');
    return value;
  }
  function update(jobId,changes){
    const jobs=read(),index=jobs.findIndex(item=>item.id===jobId);
    if(index<0)return;
    jobs[index]={...jobs[index],...changes};
    localStorage.setItem(storeKey,JSON.stringify(jobs));
    render();
  }
  function urls(text,maximum,label){
    const values=text.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
    if(values.length>maximum)throw new Error(label+'最多 '+maximum+' 个。');
    values.forEach(value=>{
      if(/^asset:\/\/[a-zA-Z0-9_-]+$/.test(value))return;
      try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error()}
      catch(_){throw new Error(label+'请填写公网 HTTP(S) 链接或 asset:// 素材 ID。')}
    });
    return values;
  }
  function sync(){
    const mode=el.mode.value,frames=mode==='frames',text=mode==='text',fixed=frames||mode==='edit'||mode==='extend';
    id('videoReferences').hidden=text;
    id('videoImageReferences').hidden=frames;
    id('videoFrameReferences').hidden=!frames;
    id('videoOtherReferences').hidden=frames;
    el.size.disabled=fixed;
    if(fixed)el.size.value='adaptive';
    el.duration.disabled=mode==='edit';
    if(mode==='edit')el.duration.value='-1';
    const notes={text:'',reference:'可用 @图片1、@视频1、@音频1 指代对应链接。仅音频参考也可生成视频。',frames:'首帧必填，尾帧可选。此模式使用自动比例，不混入参考视频或音频。',edit:'至少添加一段源视频。比例和时长跟随源视频，提交时按最多 30 秒输出预扣。',extend:'至少添加一段源视频，比例跟随源视频。请在提示词中说明向前或向后延长。'};
    id('videoModeNote').textContent=notes[mode];
    const hasInput=!text&&!frames&&el.videos.value.trim(),seconds=Number(el.duration.value)===-1?30:Number(el.duration.value);
    const rate=(hasInput?inputRates:rates)[el.resolution.value];
    const total=Number((rate*seconds).toFixed(4));
    id('videoEstimate').textContent=(seconds===30&&el.duration.value==='-1'?'输出预扣参考':'输出费用参考')+'：'+total+' 积分'+(hasInput?'，另加输入视频总秒数 × '+rate+' 积分':'')+'（'+rate+' 积分/秒）';
  }
  function payload(){
    const prompt=el.prompt.value.trim(),mode=el.mode.value;
    if(!prompt)throw new Error('请填写提示词。');
    const duration=Number(el.duration.value);
    if(!Number.isInteger(duration)||(duration!==-1&&(duration<4||duration>30)))throw new Error('时长需为 4–30 秒或自动。');
    if(!['480p','720p','1080p','4k'].includes(el.resolution.value))throw new Error('请选择正确的分辨率。');
    if(!['adaptive','16:9','9:16','1:1','4:3','3:4','21:9'].includes(el.size.value))throw new Error('请选择正确的画面比例。');
    const body={model:'seedance-2.5',prompt,resolution:el.resolution.value,size:el.size.value,duration,output_format:el.format.value,generate_audio:el.audio.checked,watermark:el.watermark.checked};
    if(mode==='frames'){
      const first=urls(el.first.value,1,'首帧图片'),last=urls(el.last.value,1,'尾帧图片');
      if(!first.length)throw new Error('请添加首帧图片。');
      body.image_with_roles=[{url:first[0],role:'first_frame'},...last.map(url=>({url,role:'last_frame'}))];body.size='adaptive';
    }else if(mode!=='text'){
      const images=urls(el.images.value,30,'参考图片'),videos=urls(el.videos.value,10,'参考视频'),audios=urls(el.audios.value,10,'参考音频');
      if(mode==='reference'&&!images.length&&!videos.length&&!audios.length)throw new Error('请至少添加一种参考素材，或切换为文生视频。');
      if((mode==='edit'||mode==='extend')&&!videos.length)throw new Error('视频编辑 / 延长至少需要一段源视频。');
      if(images.length)body.image_urls=images;if(videos.length)body.video_urls=videos;if(audios.length)body.audio_urls=audios;
      body.omni_reference_task_type=mode;
      if(mode!=='reference')body.size='adaptive';
      if(mode==='edit')body.duration=-1;
    }
    return body;
  }
  function render(){
    const jobs=read().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const current=jobs.find(job=>job.id===selected&&job.url)||jobs.find(job=>job.url);
    if(current&&current.url!==lastResult){
      lastResult=current.url;selected=current.id;
      el.player.src=current.url;el.player.hidden=false;id('videoEmpty').hidden=true;id('videoResultActions').hidden=false;
      id('videoOpen').href=current.url;id('videoPlaybackError').hidden=true;
    }
    if(!current&&lastResult){lastResult='';el.player.pause();el.player.removeAttribute('src');el.player.load();el.player.hidden=true;id('videoEmpty').hidden=false;id('videoResultActions').hidden=true}
    const next=JSON.stringify(jobs.map(job=>[job.id,job.status,job.progress,job.error,job.pollError,job.url,job.credits]));
    if(signature===next)return;signature=next;
    el.list.replaceChildren();id('videoTasksEmpty').hidden=jobs.length>0;id('videoTaskCount').textContent=jobs.length+' 项';
    for(const job of jobs){
      const row=document.createElement('article');row.className='video-task';row.dataset.jobId=job.id;
      const head=document.createElement('div');head.className='video-task-head';
      const status=document.createElement('strong'),date=document.createElement('time');date.dateTime=job.createdAt;date.textContent=new Date(job.createdAt).toLocaleString('zh-CN');
      const labels={submitting:'正在提交',processing:'正在生成',pending:'排队中',completed:'已完成',failed:'生成失败',unknown:'提交结果待确认'};
      status.textContent=(labels[job.status]||'查询中')+(job.progress>0&&job.status!=='completed'?' '+Math.round(job.progress)+'%':'');head.append(status,date);row.append(head);
      const meta=document.createElement('p');meta.className='video-note';meta.textContent=job.body.resolution+' · '+(job.body.duration===-1?'自动时长':job.body.duration+' 秒')+' · '+job.body.size+' · '+job.body.output_format.toUpperCase()+(Number.isFinite(job.credits)?' · 实际 '+job.credits+' 积分':'');row.append(meta);
      if(['processing','pending'].includes(job.status)){
        const bar=document.createElement('progress');bar.max=100;bar.setAttribute('aria-label','视频生成进度');if(job.progress>0)bar.value=job.progress;row.append(bar);
      }
      const details=document.createElement('details'),summary=document.createElement('summary'),prompt=document.createElement('p');summary.textContent='完整提示词';prompt.textContent=job.body.prompt;details.append(summary,prompt);row.append(details);
      if(job.taskId){const task=document.createElement('p');task.className='video-task-id';task.textContent='任务 ID：'+job.taskId;row.append(task)}
      if(job.error||job.pollError){const message=document.createElement('p');message.className=job.error?'video-error':'video-note';message.textContent=job.error||job.pollError;row.append(message)}
      if(job.status==='unknown'||job.status==='submitting'){
        const note=document.createElement('p');note.className='video-note';note.textContent='未取得任务 ID 前不会自动再次提交。若提交中断，请先核对 APIMart 请求记录，避免重复扣费。';row.append(note);
      }
      const actions=document.createElement('div');actions.className='video-task-actions';
      const button=(label,run)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.onclick=run;actions.append(node)};
      if(job.url)button('播放',()=>{selected=job.id;render();el.player.scrollIntoView({block:'center',behavior:'smooth'})});
      button('修改后重新生成',()=>restore(job));
      if(job.taskId&&['processing','pending'].includes(job.status))button('刷新状态',()=>poll(job.id,true));
      if(job.status==='unknown')button('填写已有任务 ID',()=>{
        const value=window.prompt('从 APIMart 请求记录复制任务 ID；此操作只查询，不会重新生成。')?.trim();
        if(!value)return;if(!/^[a-zA-Z0-9_-]{1,160}$/.test(value)){toast('任务 ID 格式不正确');return}
        update(job.id,{taskId:value,status:'pending',error:''});poll(job.id,true);
      });
      if(['completed','failed','unknown'].includes(job.status))button('移除本地记录',()=>{
        if(!confirm('仅移除这条本地视频记录？不会取消任务或删除上游文件。'))return;
        localStorage.setItem(storeKey,JSON.stringify(read().filter(item=>item.id!==job.id)));render();
      });
      row.append(actions);el.list.append(row);
    }
  }
  function restore(job){
    if(busy)return;
    const body=job.body;el.mode.value=job.mode;el.prompt.value=body.prompt;el.resolution.value=body.resolution;el.duration.value=String(body.duration);el.size.value=body.size;el.format.value=body.output_format;el.audio.checked=body.generate_audio;el.watermark.checked=body.watermark;
    el.images.value=(body.image_urls||[]).join('\n');el.videos.value=(body.video_urls||[]).join('\n');el.audios.value=(body.audio_urls||[]).join('\n');
    el.first.value=body.image_with_roles?.find(item=>item.role==='first_frame')?.url||'';el.last.value=body.image_with_roles?.find(item=>item.role==='last_frame')?.url||'';
    sync();el.prompt.focus();el.form.scrollIntoView({block:'start',behavior:'smooth'});
  }
  async function request(path,options={}){
    const response=await fetch(APIMART_BASE+path,{...options,signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+Settings.getKey(),'Content-Type':'application/json',Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const cause=new Error(data.error?.message||data.message||'请求失败（HTTP '+response.status+'）');cause.status=response.status;throw cause}
    return data;
  }
  function safeVideoUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch(_){return ''}}
  async function poll(jobId,force=false){
    if(!Settings.getKey()||!ready||(!force&&Date.now()-(observed.get(jobId)||0)<5000))return;
    const run=async lock=>{
      if(!lock)return;
      const job=read().find(item=>item.id===jobId);
      if(!job?.taskId||!['pending','processing'].includes(job.status))return;
      observed.set(jobId,Date.now());
      try{
        const raw=await request('/tasks/'+encodeURIComponent(job.taskId)),data=raw.data||raw,status=String(data.status||'').toLowerCase();
        if(['completed','success','succeeded'].includes(status)){
          const videos=data.result?.videos||[],urls=videos.flatMap(video=>Array.isArray(video.url)?video.url:[video.url]).map(safeVideoUrl).filter(Boolean);
          const url=urls[0]||safeVideoUrl(data.result?.video_url||data.video_url);
          if(!url)throw new Error('任务已完成，但接口尚未返回视频链接；将继续查询。');
          update(job.id,{status:'completed',url,progress:100,credits:data.credits_cost,pollError:''});
        }else if(['failed','failure','error','cancelled'].includes(status)){
          update(job.id,{status:'failed',error:generationErrorMessage(data.error?.message||data.fail_reason||'视频任务未完成'),pollError:''});
        }else update(job.id,{status:status==='processing'?'processing':'pending',progress:Math.min(99,Math.max(0,Number(data.progress)||0)),pollError:''});
      }catch(cause){update(job.id,{pollError:'查询暂时失败：'+generationErrorMessage(cause)+'。已保留任务 ID，将继续查询，不会重新提交。'})}
    };
    if(navigator.locks)await navigator.locks.request('mihu-video-poll-'+scope+'-'+jobId,{ifAvailable:true},run);
    else await run(true);
  }
  async function tick(){
    if(!ready||polling)return;polling=true;
    try{
      for(const job of read()){
        if(job.status==='submitting'&&!sending.has(job.id)&&Date.now()-Date.parse(job.createdAt)>90000)update(job.id,{status:'unknown',error:'提交中断，无法确认是否已创建任务。'});
      }
      await Promise.all(read().filter(job=>['pending','processing'].includes(job.status)).map(job=>poll(job.id)));
      render();
    }catch(cause){error(cause.message)}finally{polling=false}
  }
  async function submit(){
    if(busy||!ready)return;
    error();
    if(!Settings.getKey().trim()){error('请先到「输入密钥」保存 APIMart API Key。');return}
    let body;try{body=payload()}catch(cause){error(cause.message);return}
    if(body.duration===-1&&!confirm('自动时长按最多 30 秒预扣积分，实际完成后结算。确定提交？'))return;
    const run=async lock=>{
      if(!lock){error('另一个页面正在提交视频，请稍后再试。');return}
      busy=true;el.fields.disabled=true;el.submit.textContent='正在提交…';
      const job={id:crypto.randomUUID(),mode:el.mode.value,body,createdAt:new Date().toISOString(),status:'submitting',taskId:null};
      sending.add(job.id);
      let persisted=false;
      try{
        localStorage.setItem(storeKey,JSON.stringify([job,...read()]));persisted=true;render();
        const raw=await request('/videos/generations',{method:'POST',body:JSON.stringify(body)});
        const data=Array.isArray(raw.data)?raw.data[0]:raw.data||raw,taskId=data?.task_id||data?.id||raw.task_id;
        if(!taskId)throw new Error('接口未返回任务 ID，请先核对 APIMart 请求记录。');
        update(job.id,{taskId:String(taskId),status:'pending'});toast('视频任务已提交');
      }catch(cause){
        const rejected=cause.status>=400&&cause.status<500;
        if(persisted){try{update(job.id,{status:rejected?'failed':'unknown',error:generationErrorMessage(cause)})}catch(_){error('本地记录无法保存。请到 APIMart 请求记录核对任务，勿重复提交。')}}
        else error('无法保存本地任务记录，未提交生成请求。请检查浏览器存储空间。');
      }finally{sending.delete(job.id);busy=false;el.fields.disabled=false;el.submit.textContent='生成视频';sync()}
    };
    if(navigator.locks)await navigator.locks.request('mihu-video-submit-'+scope,{ifAvailable:true},run);
    else await run(true);
    tick();
  }
  async function upload(input,target,multiple){
    const files=[...input.files];input.value='';if(!files.length||busy)return;
    if(!Settings.getKey()){error('请先保存 API Key 后再上传图片。');return}
    busy=true;el.fields.disabled=true;error();
    try{
      const current=multiple?urls(target.value,30,'参考图片'):[];
      if(current.length+files.length>(multiple?30:1))throw new Error('参考图片数量超出上限。');
      for(const file of files){
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('本地图片需为 PNG / JPEG / WebP，且不超过 20 MB。');
        const bitmap=await createImageBitmap(file),ratio=bitmap.width/bitmap.height;
        const valid=bitmap.width>=300&&bitmap.height>=300&&bitmap.width<=6000&&bitmap.height<=6000&&ratio>=0.4&&ratio<=2.5;bitmap.close();
        if(!valid)throw new Error('图片宽高需为 300–6000px，宽高比需为 0.4–2.5。');
        const result=await Archive.reference(file);current.push(result.url);target.value=current.join('\n');
      }
      toast('参考图片已上传');
    }catch(cause){error(cause.message)}finally{busy=false;el.fields.disabled=false;sync()}
  }
  el.form.onsubmit=event=>{event.preventDefault();submit().catch(cause=>error(cause.message))};
  el.form.addEventListener('input',sync);el.form.addEventListener('change',sync);
  id('videoImageFiles').onchange=event=>upload(event.target,el.images,true);
  id('videoFirstFile').onchange=event=>upload(event.target,el.first,false);
  id('videoLastFile').onchange=event=>upload(event.target,el.last,false);
  el.player.onerror=()=>{id('videoPlaybackError').hidden=false};
  id('videoCopy').onclick=async()=>{try{await navigator.clipboard.writeText(el.player.src);toast('已复制视频链接')}catch(_){toast('复制失败，请打开原视频复制地址')}};
  window.addEventListener('storage',event=>{if(event.key==='apimart_api_key')location.reload();else if(event.key===storeKey){render();tick()}});
  async function init(){
    const key=Settings.getKey().trim();
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key||'no-key'));
    scope=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    storeKey='mihu-video-jobs-v1-'+scope;
    id('videoKeyState').textContent=key?'使用已保存的 Key':'尚未设置 Key';
    ready=true;sync();render();tick();setInterval(tick,5000);
  }
  init().catch(cause=>error('视频页初始化失败：'+cause.message));
  return {payload,refresh:tick};
})();
