"use strict";
const APIMART_BASE='https://api.apimart.ai/v1';
// 每次完成一次改动并提交时递增。
const APP_VERSION='154.0';
const DB_NAME='mihu-design-os',DB_VERSION=2,STORE_NAME='images',JOB_STORE_NAME='generation-jobs';
const HISTORY_BACKUP_KEY='mihu-history-backup-v1';
const PROMPT_ANALYSIS_MODEL='gpt-5.6-luna';
const IMAGE_REVERSE_MODEL='gemini-2.5-flash';
const MODEL_CONFIG={
  gpt:{
    name:'GPT Image2',icon:'icon/model-gpt-chatgpt.svg',promptLimit:3000,
    ratios:['auto','1:1','3:2','2:3','4:3','3:4','16:9','9:16'],
    resolutions:[{v:'1k',l:'快速',price:'0.085积分/张'},{v:'2k',l:'高清',price:'0.14积分/张'},{v:'4k',l:'超清',price:'0.21积分/张'}],
    defaultResolution:'1k',generationModel:'gpt-image-2',editModel:'gpt-image-2'
  },
  seedream:{
    name:'Seedream 5 PRO',icon:'icon/model-sd5-jimeng.svg',promptLimit:3000,
    ratios:['auto','1:1','4:3','3:4','16:9','9:16','3:2','2:3','2:1','1:2','21:9'],
    resolutions:[{v:'1K',l:'标准',price:'0.2925积分/张'},{v:'1.5K',l:'推荐',price:'0.2925积分/张'},{v:'2K',l:'高清',price:'0.585积分/张'}],
    defaultResolution:'1.5K',generationModel:'seedream-5-0-pro'
  },
  nano:{
    name:'Nano Banana PRO',icon:'icon/model-nbpro-banana.svg',promptLimit:2000,
    ratios:['auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'],
    resolutions:[{v:'1K',l:'标准',price:'0.3积分/张'},{v:'2K',l:'高清',price:'0.3积分/张'},{v:'4K',l:'超清',price:'0.4积分/张'}],
    defaultResolution:'1K',generationModel:'gemini-3-pro-image-preview',editModel:'gemini-3-pro-image-preview'
  }
};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const COS_THUMBNAIL_RULE='imageMogr2/thumbnail/600x/format/webp/interlace/0/quality/80';
const ImageDelivery={
  isArchivedUrl(sourceUrl){
    if(!sourceUrl)return false;
    try{
      const host=new URL(sourceUrl,location.href).hostname.toLowerCase();
      return host==='img.supmihu.cn'||/\.cos\.[a-z0-9-]+\.myqcloud\.com$/.test(host);
    }catch(_){return false}
  },
  thumbnail(sourceUrl){
    if(!sourceUrl)return sourceUrl;
    try{
      const url=new URL(sourceUrl,location.href);
      if(!this.isArchivedUrl(url.href)||url.search)return sourceUrl;
      url.search=COS_THUMBNAIL_RULE;
      return url.href;
    }catch(_){return sourceUrl}
  }
};

let pageTransitionTimer=0;
function ensurePageTransitionLoader(){
  let loader=document.querySelector('.page-transition-loader');
  if(loader)return loader;
  loader=document.createElement('div');
  loader.className='page-transition-loader';
  loader.setAttribute('role','status');
  loader.setAttribute('aria-label','页面加载中');
  loader.setAttribute('aria-live','polite');
  loader.innerHTML='<span class="page-transition-loader-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z"/></svg></span>';
  document.body.appendChild(loader);
  return loader;
}
function showPageTransition(){
  ensurePageTransitionLoader();
  document.documentElement.classList.add('page-is-transitioning');
}
function hidePageTransition(){
  clearTimeout(pageTransitionTimer);
  document.documentElement.classList.remove('page-is-transitioning');
}
function navigateWithLoading(url){
  if(!url)return;
  showPageTransition();
  clearTimeout(pageTransitionTimer);
  pageTransitionTimer=setTimeout(()=>{location.href=url},90);
}

function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)}
function formatDuration(ms){const t=Math.max(0,Math.floor(ms/1000)),m=Math.floor(t/60),s=t%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function fileToDataURI(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
function openImage(url){if(!url)return;const w=window.open(url,'_blank');if(w)w.opener=null;else toast('浏览器拦截了弹出窗口，请允许后重试')}
async function downloadImage(url){
  if(!url)return;
  try{
    const endpoint=new URL('/api/download-image',location.origin);endpoint.searchParams.set('url',url);
    const response=await fetch(endpoint.href);
    if(!response.ok)throw new Error('下载请求失败');
    const blob=await response.blob();
    const type=blob.type.split('/')[1]||'png';
    const extension=type==='jpeg'?'jpg':type;
    const objectUrl=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=objectUrl;link.download='mihu-image-'+Date.now()+'.'+extension;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }catch(error){console.warn('图片下载失败',error);toast('下载失败，请稍后重试')}
}
function showError(el,msg){if(!el)return;el.textContent=msg;el.style.display='block'}
function hideError(el){if(!el)return;el.style.display='none';el.textContent=''}
const APP_RAIL_ITEMS=[
  {key:'index',href:'index.html',title:'创意',icon:'icon/chuangzuo.svg'},
  {key:'assets',href:'assets.html',title:'资产',icon:'icon/folder.svg'},
  {key:'reference',href:'reference.html',title:'参考',icon:'icon/reference-library.svg'},
  {key:'settings',href:'settings.html',title:'设置',icon:'icon/shezhi.svg'}
];
function renderAppRails(){
  document.querySelectorAll('[data-app-rail]').forEach(rail=>{
    const current=rail.dataset.current||'';
    const items=APP_RAIL_ITEMS.map(item=>{
      const active=item.key===current;
      return '<a class="rail-item'+(active?' active':'')+'" href="'+item.href+'"'+(active?' aria-current="page"':'')+' title="'+item.title+'"><img class="rail-icon" src="'+item.icon+'" alt="" aria-hidden="true"><span>'+item.title+'</span></a>';
    }).join('');
    rail.innerHTML='<a class="rail-brand" href="index.html" title="Pic.supmihu.cn"><img src="logo.png" alt=""></a><div class="rail-nav">'+items+'</div>';
  });
}

const Settings={
  getKey(){return localStorage.getItem('apimart_api_key')||''},
  setKey(k){localStorage.setItem('apimart_api_key',k)},
  getCurrentPage(){
    const page=location.pathname.split('/').pop()||'index.html';
    return /^(index|reference|assets|mj)\.html$/.test(page)?page:'index.html';
  },
  openPage(){
    if(location.pathname.endsWith('/settings.html'))return;
    sessionStorage.setItem('mihu_settings_return',this.getCurrentPage());
    navigateWithLoading('settings.html');
  },
  openModal(){this.openPage()}
};

const CloudHistory={
  async token(){
    const apiKey=Settings.getKey().trim();
    if(!apiKey||!crypto?.subtle)return null;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mihu-history-v1:'+apiKey));
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  },
  async request(path,{method='GET',body}={}){
    const token=await this.token();
    if(!token)throw new Error('请先在设置中保存 API Key。');
    const headers={'Accept':'application/json','X-History-Key':token};
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'云端历史请求失败。');
    return data;
  },
  async list(cursor){return this.request('/api/history'+(cursor?'?cursor='+encodeURIComponent(cursor):''))},
  async save(item){return this.request('/api/history',{method:'POST',body:{item}})},
  async remove(historyKey,id){return this.request('/api/history',{method:'DELETE',body:{historyKey,id}})}
};

const Apimart={
  async getUserBalance(apiKey,signal){
    const key=String(apiKey||'').trim();
    if(!key)throw new Error('请先在设置中保存 API Key。');
    const res=await fetch(APIMART_BASE+'/user/balance',{
      method:'GET',signal,
      headers:{'Authorization':'Bearer '+key,'Accept':'application/json'}
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.success!==true){
      const error=new Error(data.error?.message||data.message||'账户积分余额读取失败。');
      error.status=res.status;
      throw error;
    }
    const credits=Number(data.remain_credits);
    if(!Number.isFinite(credits))throw new Error('账户积分余额格式异常。');
    return credits;
  },
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
  async analyzeImage(apiKey,{imageUrl,instruction,model=IMAGE_REVERSE_MODEL,signal}){
    const matched=/^data:([^;]+);base64,([\s\S]+)$/i.exec(imageUrl||'');
    if(!matched)throw new Error('图片读取失败，请重新选择图片。');
    const res=await fetch('https://api.apimart.ai/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
      method:'POST',signal,
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[
        {text:instruction+' 请分析这张图片并按要求输出结果。'},
        {inline_data:{mime_type:matched[1],data:matched[2]}}
      ]}]})
    });
    const json=await res.json().catch(()=>({}));
    if(!res.ok){
      const error=new Error('图片分析失败（HTTP '+res.status+'）'+((json.error?.message||json.message)?': '+(json.error?.message||json.message).slice(0,180):''));
      error.status=res.status;
      throw error;
    }
    const candidates=json.candidates||json.data?.candidates||[];
    const output=(candidates[0]?.content?.parts||[]).map(part=>part.text||'').join('\n').trim();
    if(!output)throw new Error('图片分析未返回提示词。');
    return output;
  },
  async submitTask(apiKey,body,endpoint,signal){
    const url=endpoint?APIMART_BASE+endpoint:APIMART_BASE+'/images/generations';
    const res=await fetch(url,{method:'POST',signal,headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
    if(!res.ok){const t=await res.text();let m;try{const j=JSON.parse(t);m=j.error?.message||j.message||t}catch(e){m=t}throw new Error('提交失败（HTTP '+res.status+'）'+(m?': '+m.slice(0,400):''))}
    const json=await res.json();
    const taskId=json.data?.[0]?.task_id||json.data?.task_id||json.data?.id||json.task_id||json.id;
    if(!taskId)throw new Error('接口未返回 task_id。返回内容：'+JSON.stringify(json).slice(0,400));
    return taskId;
  },
  async pollTask(apiKey,taskId,onProgress,signal,maxWaitMs=300000){
    const maxWait=Math.max(300000,Math.min(Number(maxWaitMs)||300000,30*60*1000)),pollInterval=2500,start=performance.now();
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
        const result=d.result||{};
        const urls=[result.grid_image_url,...(Array.isArray(result.images)?result.images.flatMap(image=>Array.isArray(image?.url)?image.url:image?.url):[]),...(Array.isArray(result.image_urls)?result.image_urls:[]),d.grid_image_url,...(Array.isArray(d.image_urls)?d.image_urls:[])].filter(url=>typeof url==='string'&&url);
        if(urls.length)return urls[0];
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

const Archive={
  isAvailable(){
    return location.protocol==='https:'&&location.hostname.toLowerCase()==='pic.supmihu.cn';
  },
  async image(sourceUrl,item){
    const token=await CloudHistory.token();
    if(!token)throw new Error('请先在设置中保存 API Key 后再归档图片。');
    const headers={'Content-Type':'application/json','Accept':'application/json'};
    headers['X-History-Key']=token;
    const response=await fetch('/api/archive-image',{method:'POST',headers,body:JSON.stringify({sourceUrl,item})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.url)throw new Error(data.error||'图片归档失败。');
    return data;
  },
  async reference(file){
    const token=await CloudHistory.token();
    if(!token)throw new Error('请先在设置中保存 API Key 后再上传参考图。');
    const form=new FormData();form.append('file',file,file.name||'reference-image');
    const response=await fetch('/api/upload-reference-image',{method:'POST',headers:{'X-History-Key':token,'Accept':'application/json'},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.url)throw new Error(data.error||'参考图上传失败。');
    return data;
  }
};

const History={
  openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});if(!db.objectStoreNames.contains(JOB_STORE_NAME))db.createObjectStore(JOB_STORE_NAME,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})},
  readBackup(){
    try{
      const items=JSON.parse(localStorage.getItem(HISTORY_BACKUP_KEY)||'[]');
      return Array.isArray(items)?items:[];
    }catch(_){return[]}
  },
  writeBackup(items){
    try{
      const recent=(Array.isArray(items)?items:[])
        .filter(item=>item?.id!=null)
        .sort((a,b)=>this.itemTime(b)-this.itemTime(a))
        .slice(0,200);
      localStorage.setItem(HISTORY_BACKUP_KEY,JSON.stringify(recent));
    }catch(error){console.warn('历史记录备用存储失败',error)}
  },
  backupSave(item){
    const items=this.readBackup().filter(existing=>String(existing.id)!==String(item.id));
    items.push(item);
    this.writeBackup(items);
  },
  backupDelete(ids){
    const keys=new Set(ids.map(id=>String(id)));
    this.writeBackup(this.readBackup().filter(item=>!keys.has(String(item.id))));
  },
  async save(item){
    this.backupSave(item);
    try{
      const db=await this.openDB();
      await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
      db.close();
      return true;
    }catch(error){
      console.warn('IndexedDB 历史记录保存失败，已保留备用副本',error);
      return true;
    }
  },
  itemTime(item){
    const createdAt=new Date(item?.createdAt||0).getTime();
    if(Number.isFinite(createdAt)&&createdAt>0)return createdAt;
    const idTime=Number(item?.id);
    return Number.isFinite(idTime)?idTime:0;
  },
  async deleteMany(ids){
    if(!ids.length)return;
    try{
      const db=await this.openDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readwrite');
        const store=tx.objectStore(STORE_NAME);
        for(const id of ids){
          store.delete(id);
          const numericId=Number(id);
          if(Number.isSafeInteger(numericId)&&String(numericId)===String(id))store.delete(typeof id==='number'?String(id):numericId);
        }
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      db.close();
    }finally{
      this.backupDelete(ids);
    }
  },
  async load(modelFilter){
    let all=[];
    try{
      const db=await this.openDB();
      all=await new Promise((resolve,reject)=>{
        const req=db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      db.close();
    }catch(error){console.warn('IndexedDB 历史记录读取失败，使用备用副本',error)}
    const merged=new Map();
    for(const item of this.readBackup())if(item?.id!=null)merged.set(String(item.id),item);
    for(const item of all)if(item?.id!=null)merged.set(String(item.id),item);
    let items=[...merged.values()].sort((a,b)=>this.itemTime(b)-this.itemTime(a));
    this.writeBackup(items);
    if(modelFilter)items=items.filter(item=>item.model===modelFilter);
    return items;
  },
  async validate(items,{concurrency=3}={}){
    const queue=Array.isArray(items)?[...items]:[];
    if(!queue.length)return[];
    const invalid=[],workerCount=Math.min(Math.max(1,Number(concurrency)||1),queue.length);
    let cursor=0;
    const worker=async()=>{
      while(cursor<queue.length){
        const item=queue[cursor++];
        const available=await this.isAvailable(item.url);
        if(available)continue;
        invalid.push(item);
      }
    };
    await Promise.all(Array.from({length:workerCount},worker));
    return invalid;
  },
  async clear(){
    localStorage.removeItem(HISTORY_BACKUP_KEY);
    try{const db=await this.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){}
  },
  async delete(id){try{await this.deleteMany([id]);return true}catch(e){return false}},
  async isAvailable(url){
    if(!url||url.startsWith('data:'))return!!url;
    return new Promise(resolve=>{
      const img=new Image(),t=setTimeout(()=>{img.src='';resolve(false)},12000);
      img.onload=()=>{clearTimeout(t);resolve(img.naturalWidth>0)};
      img.onerror=()=>{clearTimeout(t);resolve(false)};
      img.src=url;
    });
  }
};

const PendingGeneration={
  notify(){window.dispatchEvent(new Event('mihu-pending-generation-change'))},
  async save(job){
    const db=await History.openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(JOB_STORE_NAME,'readwrite');
      tx.objectStore(JOB_STORE_NAME).put(job);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
    db.close();this.notify();return job;
  },
  async loadAll({includeEditor=false}={}){
    try{
      const db=await History.openDB();
      const jobs=await new Promise((resolve,reject)=>{
        const req=db.transaction(JOB_STORE_NAME).objectStore(JOB_STORE_NAME).getAll();
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      db.close();
      return jobs
        .filter(job=>includeEditor||job.scope!=='editor')
        .sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    }catch(_){return []}
  },
  async load(){
    const jobs=await this.loadAll();
    return jobs[0]||null;
  },
  async count(){return (await this.loadAll()).length},
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
      db.close();this.notify();return true;
    }catch(_){return false}
  }
};

const GenerationExecutionLock=(()=>{
  const key='mihu-generation-execution-lock',ttl=45000;
  const owner=sessionStorage.getItem('mihu-generation-lock-owner')||('tab-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  sessionStorage.setItem('mihu-generation-lock-owner',owner);
  const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};
  async function fallback(callback){
    const lease=read();
    if(lease&&lease.owner!==owner&&lease.expiresAt>Date.now())return false;
    const refresh=()=>localStorage.setItem(key,JSON.stringify({owner,expiresAt:Date.now()+ttl}));
    refresh();
    if(read()?.owner!==owner)return false;
    const heartbeat=setInterval(refresh,Math.floor(ttl/3));
    try{await callback();return true}
    finally{clearInterval(heartbeat);if(read()?.owner===owner)localStorage.removeItem(key)}
  }
  return {
    async run(callback){
      if(navigator.locks?.request){
        let acquired=false;
        await navigator.locks.request(key,{ifAvailable:true},async lock=>{
          if(!lock)return;
          acquired=true;await callback();
        });
        return acquired;
      }
      return fallback(callback);
    }
  };
})();

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
      const img=document.createElement('img');img.src=ImageDelivery.thumbnail(entry.url);img.alt='参考图 '+(i+1);
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
    async persist(){
      const urls=[];
      for(const entry of state.files){
        if(entry.remote){urls.push(entry.url);continue}
        if(!Archive.isAvailable()){urls.push(await fileToDataURI(entry.file));continue}
        const uploaded=await Archive.reference(entry.file);
        if(entry.url)URL.revokeObjectURL(entry.url);
        entry.url=uploaded.url;entry.remote=true;entry.file={name:entry.file.name||'reference-image',size:entry.file.size||0,type:uploaded.contentType||entry.file.type};urls.push(uploaded.url);
      }
      render();return urls;
    },
    getDataURIs(){return Promise.all(state.files.map(e=>e.remote?e.url:fileToDataURI(e.file)))},
    getAll(){return state.files.map(e=>({file:e.file,dataUrl:e.url}))},
    isEmpty(){return state.files.length===0},
    count(){return state.files.length}
  };
}

function initCommonPage(){
  // 无 Key 也可浏览作品、历史和参考；仅在实际调用接口时再提示配置。
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

renderAppRails();
ensurePageTransitionLoader();
document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('a[href]');
  if(!link||link.hasAttribute('download')||link.dataset.noPageTransition!==undefined)return;
  if(link.target&&link.target.toLowerCase()!=='_self')return;
  let target;
  try{target=new URL(link.href,location.href)}catch(_){return}
  if(target.origin!==location.origin||!/^https?:$/.test(target.protocol))return;
  const current=location.pathname+location.search+location.hash;
  const next=target.pathname+target.search+target.hash;
  if(next===current)return;
  if(target.pathname===location.pathname&&target.search===location.search&&target.hash)return;
  event.preventDefault();
  navigateWithLoading(target.href);
});
window.addEventListener('beforeunload',showPageTransition);
window.addEventListener('pageshow',hidePageTransition);

/* 资产和设置工作区仅在实际滚动时显示滚动条 */
document.querySelectorAll('.assets-shell,.reference-shell,.settings-shell').forEach(shell=>{
  let hideScrollbarTimer=0;
  shell.addEventListener('scroll',()=>{
    shell.classList.add('is-scrolling');
    clearTimeout(hideScrollbarTimer);
    hideScrollbarTimer=setTimeout(()=>shell.classList.remove('is-scrolling'),700);
  },{passive:true});
});
