"use strict";
const APIMART_BASE='https://api.apimart.ai/v1';
const DB_NAME='mihu-design-os',DB_VERSION=2,STORE_NAME='images',JOB_STORE_NAME='generation-jobs';
const HISTORY_RETENTION_MS=72*60*60*1000;
const PROMPT_ANALYSIS_MODEL='gpt-5.6-luna';
const MODEL_CONFIG={
  gpt:{
    name:'Image 2',icon:'icon/model-image2.svg',promptLimit:3000,
    ratios:['1:1','3:2','4:3','3:4','16:9','9:16'],
    resolutions:[{v:'1k',l:'1K · 快速'},{v:'2k',l:'2K · 高清'},{v:'4k',l:'4K · 超清'}],
    defaultResolution:'1k',generationModel:'gpt-image-2',editModel:'gpt-image-2'
  },
  nano:{
    name:'NB2',icon:'icon/model-nb2.svg',promptLimit:2000,
    ratios:['1:1','3:2','4:3','3:4','2:3','16:9','9:16','4:5','5:4','21:9'],
    resolutions:[{v:'0.5K',l:'0.5K · 预览'},{v:'1K',l:'1K · 标准'},{v:'2K',l:'2K · 高清'},{v:'4K',l:'4K · 超清'}],
    defaultResolution:'1K',generationModel:'nano-banana-2-ext',editModel:'nano-banana-2-ext'
  },
  grok:{
    name:'Grok',icon:'icon/model-grok.svg',promptLimit:4000,
    ratios:['1:1','16:9','9:16','4:3','3:4','3:2','2:3'],resolutions:null,
    generationModel:'grok-imagine-1.5-ext',editModel:'grok-imagine-1.5-edit-ext',
    editSizes:{
      '1:1':'1024x1024','16:9':'1280x720','4:3':'1792x1024','3:2':'1792x1024',
      '9:16':'720x1280','3:4':'1024x1792','2:3':'1024x1792'
    }
  }
};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);

function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)}
function formatDuration(ms){const t=Math.max(0,Math.floor(ms/1000)),m=Math.floor(t/60),s=t%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function fileToDataURI(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
function openImage(url){if(!url)return;const w=window.open(url,'_blank');if(w)w.opener=null;else toast('浏览器拦截了弹出窗口，请允许后重试')}
function showError(el,msg){if(!el)return;el.textContent=msg;el.style.display='block'}
function hideError(el){if(!el)return;el.style.display='none';el.textContent=''}

const Settings={
  getKey(){return localStorage.getItem('apimart_api_key')||''},
  setKey(k){localStorage.setItem('apimart_api_key',k)},
  getCurrentPage(){
    const page=location.pathname.split('/').pop()||'index.html';
    return /^(index|video|edit|assets)\.html$/.test(page)?page:'index.html';
  },
  openPage(){
    if(location.pathname.endsWith('/settings.html'))return;
    sessionStorage.setItem('mihu_settings_return',this.getCurrentPage());
    location.href='settings.html';
  },
  openModal(){this.openPage()}
};

const Apimart={
  async chat(apiKey,{messages,model=PROMPT_ANALYSIS_MODEL,temperature=.35,signal}){
    const res=await fetch(APIMART_BASE+'/chat/completions',{
      method:'POST',signal,
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({model,messages,temperature,stream:false})
    });
    if(!res.ok){
      let detail='';
      try{
        const data=await res.json();
        detail=data.error?.message||data.message||'';
      }catch(_){try{detail=await res.text()}catch(__){}}
      const error=new Error('聊天请求失败（HTTP '+res.status+'）'+(detail?': '+detail.slice(0,180):''));
      error.status=res.status;
      throw error;
    }
    const json=await res.json();
    const content=(json.choices||json.data?.choices)?.[0]?.message?.content?.trim();
    if(!content)throw new Error('接口未返回文本内容');
    return content;
  },
  async submitTask(apiKey,body,endpoint,signal){
    const url=endpoint?APIMART_BASE+endpoint:APIMART_BASE+'/images/generations';
    const res=await fetch(url,{method:'POST',signal,headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
    if(!res.ok){const t=await res.text();let m;try{const j=JSON.parse(t);m=j.error?.message||j.message||t}catch(e){m=t}throw new Error('提交失败（HTTP '+res.status+'）'+(m?': '+m.slice(0,400):''))}
    const json=await res.json();
    const taskId=json.data?.[0]?.task_id||json.data?.task_id||json.task_id;
    if(!taskId)throw new Error('接口未返回 task_id。返回内容：'+JSON.stringify(json).slice(0,400));
    return taskId;
  },
  async pollTask(apiKey,taskId,onProgress,signal){
    const maxWait=300000,pollInterval=2500,start=performance.now();
    while(true){
      if(signal?.aborted)throw new DOMException('请求超时','AbortError');
      if(performance.now()-start>maxWait)throw new DOMException('请求超时','AbortError');
      const res=await fetch(APIMART_BASE+'/tasks/'+taskId,{method:'GET',signal,headers:{'Authorization':'Bearer '+apiKey,'Accept':'application/json'}});
      if(!res.ok){const t=await res.text();throw new Error('查询任务失败（HTTP '+res.status+')'+(t?': '+t.slice(0,300):''))}
      const json=await res.json();
      const d=json.data||json;
      const status=d.status,progress=d.progress||0;
      if(onProgress)onProgress(status,progress);
      if(status==='completed'){
        const imgs=d.result?.images;
        if(imgs&&imgs.length>0){
          const url=imgs[0].url;
          if(Array.isArray(url))return url[0];
          if(typeof url==='string')return url;
        }
        throw new Error('任务完成但未找到图片 URL');
      }
      if(status==='failed'){const e=d.error;throw new Error('生成失败：'+(e?.message||JSON.stringify(d).slice(0,300)))}
      if(status==='cancelled')throw new Error('任务已取消');
      await new Promise(r=>setTimeout(r,pollInterval));
    }
  },
  async generate({apiKey,body,endpoint,onProgress,onSubmitted,signal}){
    let lastErr,retries=2;
    for(let i=0;i<=retries;i++){
      try{
        const taskId=await this.submitTask(apiKey,body,endpoint,signal);
        if(onSubmitted)onSubmitted(taskId);
        return await this.pollTask(apiKey,taskId,onProgress,signal);
      }catch(e){
        lastErr=e;
        const msg=e.message||'';
        const is502=msg.includes('502')||msg.includes('Bad gateway')||msg.includes('origin')||msg.includes('all channels failed');
        if(i<retries&&is502){
          const wait=60;
          console.warn('[APIMart] 502 重试 '+(i+1)+'/'+retries+' 等待 '+wait+'s…');
          if(onProgress){
            for(let s=wait;s>0;s--){
              if(signal?.aborted)break;
              onProgress('retrying',0,'链路失谐 · '+s+'s 后重构（'+(i+1)+'/'+retries+'）');
              await new Promise(r=>setTimeout(r,1000));
            }
          }else{
            await new Promise(r=>setTimeout(r,wait*1000));
          }
          if(signal?.aborted)throw new DOMException('请求超时','AbortError');
          continue;
        }
        if(is502){
          const err=new Error('模型服务器暂时不可用（502），已重试 '+retries+' 次仍失败。请稍后再试，或切换其他模型。');
          err.original=e;
          throw err;
        }
        throw e;
      }
    }
    throw lastErr;
  }
};

const History={
  openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});if(!db.objectStoreNames.contains(JOB_STORE_NAME))db.createObjectStore(JOB_STORE_NAME,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})},
  async save(item){try{const db=await this.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();await this.trim()}catch(e){toast('历史记录保存失败')}},
  itemTime(item){
    const createdAt=new Date(item?.createdAt||0).getTime();
    if(Number.isFinite(createdAt)&&createdAt>0)return createdAt;
    const idTime=Number(item?.id);
    return Number.isFinite(idTime)?idTime:0;
  },
  async deleteMany(ids){
    if(!ids.length)return;
    const db=await this.openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      for(const id of ids)tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();
  },
  async trim(){
    const db=await this.openDB();
    const all=await new Promise((resolve,reject)=>{
      const req=db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    db.close();
    const cutoff=Date.now()-HISTORY_RETENTION_MS;
    const staleIds=all.filter(item=>this.itemTime(item)<cutoff).map(item=>item.id);
    await this.deleteMany(staleIds);
  },
  async load(modelFilter){
    try{
      const db=await this.openDB();
      const all=await new Promise((resolve,reject)=>{
        const req=db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      db.close();
      const cutoff=Date.now()-HISTORY_RETENTION_MS;
      const expiredIds=all.filter(item=>this.itemTime(item)<cutoff).map(item=>item.id);
      let recent=all.filter(item=>this.itemTime(item)>=cutoff).sort((a,b)=>b.id-a.id);
      if(modelFilter)recent=recent.filter(item=>item.model===modelFilter);
      if(expiredIds.length)this.deleteMany(expiredIds).catch(()=>{});
      return recent;
    }catch(_){return[]}
  },
  async validate(items,{concurrency=3,onInvalid}={}){
    const queue=Array.isArray(items)?[...items]:[];
    if(!queue.length)return[];
    const invalid=[],workerCount=Math.min(Math.max(1,Number(concurrency)||1),queue.length);
    let cursor=0;
    const worker=async()=>{
      while(cursor<queue.length){
        const item=queue[cursor++];
        const available=await this.isAvailable(item.url,item.type);
        if(available)continue;
        invalid.push(item);
        try{onInvalid?.(item)}catch(_){}
      }
    };
    await Promise.all(Array.from({length:workerCount},worker));
    if(invalid.length)await this.deleteMany([...new Set(invalid.map(item=>item.id))]);
    return invalid;
  },
  async clear(){try{const db=await this.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){}},
  async delete(id){try{const db=await this.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return true}catch(e){return false}},
  async isAvailable(url,type='image'){
    if(!url||url.startsWith('data:'))return!!url;
    if(type==='video'){
      return new Promise(resolve=>{
        const video=document.createElement('video');
        const finish=available=>{
          clearTimeout(timer);
          video.onloadedmetadata=null;
          video.onerror=null;
          video.removeAttribute('src');
          video.load();
          resolve(available);
        };
        const timer=setTimeout(()=>finish(false),12000);
        video.preload='metadata';
        video.onloadedmetadata=()=>finish(video.duration>0);
        video.onerror=()=>finish(false);
        video.src=url;
      });
    }
    return new Promise(resolve=>{
      const img=new Image(),t=setTimeout(()=>{img.src='';resolve(false)},12000);
      img.onload=()=>{clearTimeout(t);resolve(img.naturalWidth>0)};
      img.onerror=()=>{clearTimeout(t);resolve(false)};
      img.src=url;
    });
  }
};

const PendingGeneration={
  async save(job){
    const db=await History.openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(JOB_STORE_NAME,'readwrite');
      tx.objectStore(JOB_STORE_NAME).put(job);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();return job;
  },
  async load(){
    try{
      const db=await History.openDB();
      const jobs=await new Promise((resolve,reject)=>{
        const req=db.transaction(JOB_STORE_NAME).objectStore(JOB_STORE_NAME).getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      db.close();
      return jobs
        .filter(job=>job.scope!=='editor')
        .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||null;
    }catch(_){return null}
  },
  async loadById(id){
    try{
      const db=await History.openDB();
      const job=await new Promise((resolve,reject)=>{
        const req=db.transaction(JOB_STORE_NAME).objectStore(JOB_STORE_NAME).get(id);
        req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
      });
      db.close();return job;
    }catch(_){return null}
  },
  async delete(id){
    try{
      const db=await History.openDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(JOB_STORE_NAME,'readwrite');
        tx.objectStore(JOB_STORE_NAME).delete(id);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      db.close();return true;
    }catch(_){return false}
  }
};

async function ensureNotificationPermission(){if(!('Notification' in window)||Notification.permission!=='default'||localStorage.getItem('apimart_notification_asked')==='1')return;localStorage.setItem('apimart_notification_asked','1');try{await Notification.requestPermission()}catch(e){}}
function notifyGenerated(modelName){if(!('Notification' in window)||Notification.permission!=='granted')return;try{const n=new Notification('图片生成完成',{body:modelName+' 已完成生成，点击查看结果。',tag:'mdos-image-ready',renotify:true});n.onclick=()=>{window.focus();n.close()}}catch(e){}}

function createReferenceManager(els,maxFiles=10,maxBytes=10*1024*1024,maxTotal=50*1024*1024){
  const types=new Set(['image/jpeg','image/png','image/webp']);
  const state={files:[]};
  els=els||{};
  function render(){
    if(!els.grid)return;
    els.grid.innerHTML='';
    state.files.forEach((entry,i)=>{
      const item=document.createElement('div');item.className='reference-item';item.title=entry.file.name||'参考图 '+(i+1);
      const img=document.createElement('img');img.src=entry.url;img.alt='参考图 '+(i+1);
      const rm=document.createElement('button');rm.type='button';rm.className='reference-remove';rm.title='移除';rm.textContent='×';rm.onclick=e=>{e.stopPropagation();remove(i)};
      item.append(img,rm);els.grid.appendChild(item);
    });
    els.grid.classList.toggle('has-files',state.files.length>0);
    if(els.count)els.count.textContent=state.files.length+' / '+maxFiles;
    if(els.dropzone){
      els.dropzone.classList.toggle('is-compact',state.files.length>0);
      const strong=els.dropzone.querySelector('strong');
      if(strong)strong.textContent=state.files.length?'继续添加（还可添加 '+(maxFiles-state.files.length)+' 张）':'点击或拖入参考图';
      els.dropzone.style.display=state.files.length>=maxFiles?'none':'block';
    }
  }
  function remove(i){const[r]=state.files.splice(i,1);if(r?.url&&!r.remote)URL.revokeObjectURL(r.url);if(els.fileInput)els.fileInput.value='';render();if(els.error)hideError(els.error)}
  function add(fileList){
    const incoming=[...(fileList||[])];if(!incoming.length)return;if(els.error)hideError(els.error);
    let remaining=maxFiles-state.files.length,totalBytes=state.files.reduce((s,e)=>s+(e.file?.size||0),0),hitMax=false;
    if(remaining<=0){if(els.error)showError(els.error,'最多只能上传 '+maxFiles+' 张参考图。');return}
    const accepted=[],errors=[];
    for(const file of incoming){
      if(!remaining){hitMax=true;break}
      if(!types.has(file.type)){errors.push((file.name||'文件')+'：格式不支持');continue}
      if(file.size>maxBytes){errors.push((file.name||'文件')+'：超过 10MB');continue}
      if(totalBytes+file.size>maxTotal){errors.push((file.name||'文件')+'：总大小超过 50MB');continue}
      accepted.push({file,url:URL.createObjectURL(file)});totalBytes+=file.size;remaining--;
    }
    state.files.push(...accepted);render();if(els.fileInput)els.fileInput.value='';
    if(hitMax)errors.push('已达到 '+maxFiles+' 张上限');
    if(errors.length&&els.error)showError(els.error,errors.slice(0,3).join('；')+(errors.length>3?'；还有更多未添加':''));
    return Promise.resolve();
  }
  if(els.dropzone&&els.fileInput){
    els.dropzone.onclick=()=>els.fileInput.click();
    els.fileInput.onchange=e=>add(e.target.files);
    ['dragenter','dragover'].forEach(n=>els.dropzone.addEventListener(n,e=>{e.preventDefault();els.dropzone.classList.add('drag')}));
    ['dragleave','drop'].forEach(n=>els.dropzone.addEventListener(n,e=>{e.preventDefault();els.dropzone.classList.remove('drag')}));
    els.dropzone.addEventListener('drop',e=>add(e.dataTransfer.files));
  }
  render();
  function addRemote(url,name='画布图片'){
    if(!url||state.files.length>=maxFiles)return false;
    state.files.push({file:{name,size:0,type:'image/remote'},url,remote:true});render();return true;
  }
  return {
    state,add,addFiles:add,addRemote,remove,render,
    clear(){state.files.forEach(e=>{if(e.url&&!e.remote)URL.revokeObjectURL(e.url)});state.files=[];if(els.fileInput)els.fileInput.value='';render()},
    getDataURIs(){return Promise.all(state.files.map(e=>e.remote?e.url:fileToDataURI(e.file)))},
    getAll(){return state.files.map(e=>({file:e.file,dataUrl:e.url}))},
    isEmpty(){return state.files.length===0},
    count(){return state.files.length}
  };
}

function initCommonPage(){
  if(!Settings.getKey())setTimeout(()=>Settings.openPage(),350);
}

function lockPageZoom(){
  if(window.__mihuZoomLocked)return;
  window.__mihuZoomLocked=true;
  const prevent=event=>event.preventDefault();
  window.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey)event.preventDefault();
  },{passive:false});
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey))return;
    if(['+','-','=','0'].includes(event.key)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(event.code))event.preventDefault();
  },{capture:true});
  document.addEventListener('gesturestart',prevent,{passive:false});
  document.addEventListener('gesturechange',prevent,{passive:false});
  document.addEventListener('gestureend',prevent,{passive:false});
}
lockPageZoom();

/* 资产和设置工作区仅在实际滚动时显示滚动条 */
document.querySelectorAll('.assets-shell,.settings-shell,.video-shell').forEach(shell=>{
  let hideScrollbarTimer=0;
  shell.addEventListener('scroll',()=>{
    shell.classList.add('is-scrolling');
    clearTimeout(hideScrollbarTimer);
    hideScrollbarTimer=setTimeout(()=>shell.classList.remove('is-scrolling'),700);
  },{passive:true});
});
