"use strict";
const APIMART_BASE='https://api.apimart.ai/v1';
const DB_NAME='mihu-design-os',DB_VERSION=2,STORE_NAME='images',JOB_STORE_NAME='generation-jobs';
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);

function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000)}
function formatDuration(ms){const t=Math.max(0,Math.floor(ms/1000)),m=Math.floor(t/60),s=t%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)})}
function fileToDataURI(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
function openImage(url){if(!url)return;const w=window.open(url,'_blank');if(w)w.opener=null;else toast('浏览器拦截了弹出窗口，请允许后重试')}
function showError(el,msg){if(!el)return;el.textContent=msg;el.style.display='block'}
function hideError(el){if(!el)return;el.style.display='none';el.textContent=''}

const Settings={
  getKey(){return localStorage.getItem('apimart_api_key')||''},
  setKey(k){localStorage.setItem('apimart_api_key',k)},
  getCurrentPage(){
    const page=location.pathname.split('/').pop()||'index.html';
    return /^(index|edit|assets)\.html$/.test(page)?page:'index.html';
  },
  openPage(){
    if(location.pathname.endsWith('/settings.html'))return;
    sessionStorage.setItem('mihu_settings_return',this.getCurrentPage());
    location.href='settings.html';
  },
  initModal(els){
    if(!els.modal)return;
    els.apiKey.value=this.getKey();
    $('#toggleKey').onclick=()=>{const show=els.apiKey.type==='password';els.apiKey.type=show?'text':'password';$('#toggleKey').textContent=show?'隐藏':'显示'};
    $('#clearKey').onclick=()=>{els.apiKey.value='';this.setKey('');toast('密钥已清除')};
    $('#saveSettings').onclick=()=>{const k=els.apiKey.value.trim();if(!k){toast('请填写 API Key');return}this.setKey(k);this.closeModal(els);toast('API Key 已保存')};
    $('#cancelSettings').onclick=()=>this.closeModal(els);
    $('#closeSettings').onclick=()=>this.closeModal(els);
    els.modal.addEventListener('click',e=>{if(e.target===els.modal)this.closeModal(els)});
  },
  openModal(){this.openPage()},
  closeModal(els){if(els.modal){els.modal.classList.remove('open');els.modal.classList.remove('show')}}
};

const Apimart={
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
  async trim(){const db=await this.openDB();const all=await new Promise((resolve,reject)=>{const req=db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});const stale=all.sort((a,b)=>b.id-a.id).slice(20);if(stale.length)await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');for(const item of stale)tx.objectStore(STORE_NAME).delete(item.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()},
  async load(modelFilter){try{const db=await this.openDB();const all=await new Promise((resolve,reject)=>{const req=db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();let recent=all.sort((a,b)=>b.id-a.id).slice(0,20);if(modelFilter)recent=recent.filter(x=>x.model===modelFilter);const checks=await Promise.all(recent.map(async item=>({item,available:await this.isAvailable(item.url)})));const valid=checks.filter(x=>x.available).map(x=>x.item);const staleIds=checks.filter(x=>!x.available).map(x=>x.item.id);if(staleIds.length){try{const db2=await this.openDB();await new Promise((resolve,reject)=>{const tx=db2.transaction(STORE_NAME,'readwrite');for(const id of staleIds)tx.objectStore(STORE_NAME).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db2.close();console.log('[历史] 清理失效图片',staleIds.length,'条')}catch(e){}}return valid}catch(e){return[]}},
  async clear(){try{const db=await this.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){}},
  async delete(id){try{const db=await this.openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();return true}catch(e){return false}},
  async isAvailable(url){
    if(!url||url.startsWith('data:image/'))return!!url;
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
      return jobs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||null;
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

const Progress={
  timer:null,
  setBars(els,p,label){
    const value=Math.max(0,Math.min(100,Number(p)||0));
    if(els.progressBar)els.progressBar.style.width=value+'%';
    if(els.progressPercent&&label)els.progressPercent.textContent=label;
    if(els.sidebarProgressBar)els.sidebarProgressBar.style.width=value+'%';
    if(els.sidebarProgressPercent)els.sidebarProgressPercent.textContent=Math.round(value)+'%';
  },
  start(els,state){state.progressStartedAt=performance.now();state.useRealProgress=false;state.realProgress=0;state.progressStatus='preparing';this.show(els,state)},
  show(els,state){this.stop();if(els.progressBar){els.progressBar.style.transition='none';void els.progressBar.offsetWidth;els.progressBar.style.transition='width .45s ease'}this.render(els,state);if(!state.useRealProgress)this.timer=setInterval(()=>this.render(els,state),1000)},
  render(els,state){if(state.useRealProgress){const p=Math.max(0,Math.min(100,Number(state.realProgress)||0));const phase=state.progressStatus==='queued'||state.progressStatus==='pending'?'等待算力接入':p>=95?'视觉矩阵成形':'链路回传';this.setBars(els,p,phase+' · '+p+'%');return}const p=this.estimate(performance.now()-(state.progressStartedAt||performance.now()));this.setBars(els,p,'神经演算 · '+p+'%')},
  updateReal(els,state,percent,status){state.useRealProgress=true;state.realProgress=Math.max(0,Math.min(100,Number(percent)||0));state.progressStatus=status||'processing';this.stop();this.render(els,state)},
  estimate(ms){const s=ms/1000;if(s<=10)return Math.floor(4+s/10*16);if(s<=60)return Math.floor(20+(s-10)/50*40);if(s<=180)return Math.floor(60+(s-60)/120*28);return Math.min(96,Math.floor(88+(1-Math.exp(-(s-180)/120))*8))},
  finish(els,state,success){this.stop();const duration=state.progressStartedAt?performance.now()-state.progressStartedAt:0;if(success){state.useRealProgress=true;state.realProgress=100;state.progressStatus='completed';this.setBars(els,100,'视觉矩阵已固化 · 100%')}else this.setBars(els,0,'准备中…');return duration},
  reset(els){this.stop();this.setBars(els,0,'准备中…')},
  stop(){if(this.timer){clearInterval(this.timer);this.timer=null}}
};

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

function initCommonPage(els){
  Settings.initModal(els);
  if(els.openSettings)els.openSettings.onclick=()=>Settings.openModal(els);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')Settings.closeModal(els)});
  ensureNotificationPermission();
  if(!Settings.getKey())setTimeout(()=>Settings.openModal(els),350);
}

/* 资产和设置工作区仅在实际滚动时显示滚动条 */
document.querySelectorAll('.assets-shell,.settings-shell').forEach(shell=>{
  let hideScrollbarTimer=0;
  shell.addEventListener('scroll',()=>{
    shell.classList.add('is-scrolling');
    clearTimeout(hideScrollbarTimer);
    hideScrollbarTimer=setTimeout(()=>shell.classList.remove('is-scrolling'),700);
  },{passive:true});
});
