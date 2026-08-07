"use strict";
(() => {
  const el={prompt:$('#mjPrompt'),count:$('#mjCount'),refs:$('#mjReferences'),addRef:$('#mjAddReference'),refList:$('#mjReferenceList'),version:$('#mjVersion'),speed:$('#mjSpeed'),size:$('#mjSize'),quality:$('#mjQuality'),stylize:$('#mjStylize'),chaos:$('#mjChaos'),weird:$('#mjWeird'),stylizeValue:$('#mjStylizeValue'),chaosValue:$('#mjChaosValue'),weirdValue:$('#mjWeirdValue'),raw:$('#mjRaw'),tile:$('#mjTile'),draft:$('#mjDraft'),hd:$('#mjHd'),negative:$('#mjNegative'),seed:$('#mjSeed'),extra:$('#mjExtra'),error:$('#mjError'),generate:$('#mjGenerate'),translate:$('#mjTranslate')};
  const refs=[];
  const MAX_REF_BYTES=20*1024*1024;
  function setError(message=''){el.error.textContent=message;el.error.hidden=!message}
  function syncCount(){el.count.textContent=el.prompt.value.length}
  function syncSlider(input,output){output.value=input.value;output.textContent=input.value}
  function renderRefs(){
    el.refList.replaceChildren();
    refs.forEach((ref,index)=>{
      const item=document.createElement('span');item.className='mj-reference';
      const image=document.createElement('img');image.src=ref.url;image.alt='参考图';
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='移除参考图';remove.onclick=()=>{refs.splice(index,1);renderRefs()};
      item.append(image,remove);el.refList.appendChild(item);
    });
  }
  async function addReferences(files){
    for(const file of files){
      if(refs.length>=4){setError('最多添加 4 张垫图。');break}
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('仅支持 PNG、JPG 或 WebP 图片。');continue}
      if(file.size>MAX_REF_BYTES){setError('单张垫图不能超过 20MB。');continue}
      refs.push({url:await fileToDataURI(file)});
    }
    renderRefs();
  }
  function versionPayload(){
    const value=el.version.value;
    if(value==='niji7')return {version:'7',niji:true};
    if(value==='niji6')return {version:'6',niji:true};
    return {version:value};
  }
  function buildJob(){
    const prompt=el.prompt.value.trim();
    if(!prompt)throw new Error('请先填写 Midjourney 提示词。');
    const body={prompt,size:el.size.value,speed:el.speed.value,quality:el.quality.value,stylize:Number(el.stylize.value),chaos:Number(el.chaos.value),weird:Number(el.weird.value),raw:el.raw.checked,tile:el.tile.checked,draft:el.draft.checked,hd:el.hd.checked,metadata:{source:'mihu-design-os'}};
    Object.assign(body,versionPayload());
    if(refs.length)body.image_urls=refs.map(ref=>ref.url);
    const negative=el.negative.value.trim(),extra=el.extra.value.trim(),seed=el.seed.value.trim();
    if(negative)body.negative_prompt=negative;
    if(extra)body.extra=extra;
    if(seed){const number=Number(seed);if(!Number.isInteger(number))throw new Error('随机种子必须是整数。');body.seed=number}
    return {id:'active-generation',body,endpoint:'/midjourney/generations',prompt,model:'midjourney',settings:{version:el.version.value,speed:el.speed.value,size:el.size.value,quality:el.quality.value,stylize:body.stylize,chaos:body.chaos,weird:body.weird},createdAt:new Date().toISOString(),taskId:null,maxWaitMs:30*60*1000};
  }
  async function translatePrompt(){
    const original=el.prompt.value.trim();
    if(!original){setError('请先输入要翻译的中文提示词。');el.prompt.focus();return}
    if(!Settings.getKey()){Settings.openPage();toast('请先保存 API Key');return}
    const label=el.translate.textContent;
    el.translate.disabled=true;el.translate.textContent='翻译中…';setError();
    try{
      const translated=await Apimart.chat(Settings.getKey(),{
        temperature:.15,
        messages:[
          {role:'system',content:'You translate Chinese image-generation prompts into precise, natural English for Midjourney. Preserve every concrete subject, count, composition, camera, lighting, material, color and constraint. Output only the final English prompt, with no explanation, labels, quotation marks, or Markdown.'},
          {role:'user',content:original}
        ]
      });
      el.prompt.value=translated.replace(/^[“"']|[”"']$/g,'').trim();
      syncCount();toast('已译为英文提示词');
    }catch(error){
      setError(error.message||'提示词翻译失败，请重试。');
    }finally{el.translate.disabled=false;el.translate.textContent=label}
  }  async function submit(){
    setError();
    if(!Settings.getKey()){Settings.openPage();toast('请先保存 API Key');return}
    el.generate.disabled=true;
    try{
      if(await PendingGeneration.load()){navigateWithLoading('assets.html');return}
      await PendingGeneration.save(buildJob());
      navigateWithLoading('assets.html');
    }catch(error){setError(error.message||'任务准备失败，请重试。')}finally{el.generate.disabled=false}
  }
  el.prompt.addEventListener('input',syncCount);
  el.prompt.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();submit()}});
  el.addRef.onclick=()=>el.refs.click();
  el.refs.onchange=event=>{addReferences(Array.from(event.target.files||[])).catch(error=>setError(error.message));event.target.value=''};
  [[el.stylize,el.stylizeValue],[el.chaos,el.chaosValue],[el.weird,el.weirdValue]].forEach(([input,output])=>input.addEventListener('input',()=>syncSlider(input,output)));
  el.translate.onclick=translatePrompt;
  el.generate.onclick=submit;
  initCommonPage();syncCount();renderRefs();
})();