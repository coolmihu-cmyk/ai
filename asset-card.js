/* Shared result-card rendering and image actions for home and assets. */
function assetImageIcon(name){
  const image=document.createElement('img');image.src='icon/asset-'+name+(['redo','compare'].includes(name)?'.png':'.svg');image.alt='';image.setAttribute('aria-hidden','true');return image;
}
function assetInfoDate(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return '日期未知';
  return date.getFullYear()+'.'+String(date.getMonth()+1).padStart(2,'0')+'.'+String(date.getDate()).padStart(2,'0')+' '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}
function assetInfoButton(item,expiry){
  const settings=item.settings||{},model=(typeof ASSET_MODEL_NAMES==='undefined'?MODEL_CONFIG[item.model]?.name:ASSET_MODEL_NAMES[item.model])||item.model||'图片模型',ratio=settings.ratio||settings.size||'自动',resolution=String(settings.resolution||'—').toUpperCase(),quality=settings.quality?String(settings.quality).toUpperCase():'',moderation=settings.moderation||'',date=assetInfoDate(item.createdAt);
  const info=document.createElement('button');info.type='button';info.className='asset-info '+(expiry.archived?'is-archived':'is-warning');info.setAttribute('aria-label','查看图片信息：模型 '+model+'，比例 '+ratio+'，分辨率 '+resolution+(quality?'，质量 '+quality:'')+(moderation?'，审核 '+moderation:'')+'，生成日期 '+date);info.setAttribute('aria-expanded','false');
  info.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25"></circle><path d="M12 10.6v5.2M12 7.7h.01"></path></svg>';
  const tooltip=document.createElement('span');tooltip.className='asset-info-tooltip';
  const rows=[['模型',model],['比例',ratio],['分辨率',resolution],...(quality?[['质量',quality]]:[]),...(moderation?[['审核强度',moderation]]:[]),['生成日期',date]];
  for(const [label,value] of rows){const row=document.createElement('span'),key=document.createElement('b'),content=document.createElement('span');key.textContent=label;content.textContent=value;row.append(key,content);tooltip.append(row)}
  info.append(tooltip);
  info.onclick=event=>{event.preventDefault();event.stopPropagation();const open=!info.classList.contains('is-open');info.classList.toggle('is-open',open);info.setAttribute('aria-expanded',String(open))};
  return info;
}

function createAssetResultCard(item,{className='',expired=false,meta=null,actions=[],managedLoading=false,onImageError}={}){
  const card=document.createElement('article');card.className='asset-card'+(expired?' is-expired':'')+(className?' '+className:'');card.dataset.assetId=item.id;
  const media=document.createElement('button');media.type='button';media.className='asset-media';media.title='在新标签页打开图片';media.setAttribute('aria-label','查看生成图片');
  const image=document.createElement('img');image.alt=item.prompt||'生成图片';image.loading='lazy';image.decoding='async';
  if(managedLoading){image.dataset.src=ImageDelivery.thumbnail(item.url);image.dataset.original=ImageDelivery.displayUrl(item.url);image.className='is-loading'}
  else{image.src=ImageDelivery.thumbnail(item.url);image.onerror=()=>{image.hidden=true;media.textContent='图片暂时无法读取';onImageError?.()}}
  media.append(image);media.onclick=()=>openImage(item.url);card.append(media);if(meta)card.append(meta);
  const controls=document.createElement('div');controls.className='asset-actions';
  for(const action of actions){
    const button=document.createElement('button');button.type='button';button.className=action.className;button.title=action.label;button.setAttribute('aria-label',action.label);
    button.append(assetImageIcon(action.icon));button.onclick=()=>action.run(button);controls.append(button);
  }
  card.append(controls);return card;
}
async function deleteGeneratedRecords(items,button){
  button.disabled=true;
  try{
    const cloud=items.filter(item=>item.historyKey||ImageDelivery.isArchivedUrl(item.url));
    if(cloud.length&&await CloudHistory.token())await Promise.all(cloud.map(item=>CloudHistory.remove(item.historyKey||'',item.id)));
    const results=await Promise.all(items.map(item=>History.delete(item.id)));
    if(results.some(result=>!result))throw new Error('删除失败');
    GenerationQueue.notify();toast('已删除记录和文件');return true;
  }catch(error){console.warn('历史删除失败',error);button.disabled=false;toast('删除失败，请稍后重试');return false}
}
function openAssetWorkspaceAction(item,action){sessionStorage.setItem('mihu_asset_action',JSON.stringify({id:String(item.id),action}));navigateWithLoading('assets.html')}
const assetCompare=(()=>{
  const layer=document.createElement('div');
  layer.className='asset-compare-layer';layer.hidden=true;
  layer.innerHTML='<section class="asset-compare-dialog" role="dialog" aria-modal="true" aria-labelledby="assetCompareTitle"><header><div><span>IMAGE COMPARE</span><h2 id="assetCompareTitle">原图与生成图对比</h2></div><button type="button" class="asset-compare-close" aria-label="关闭对比">×</button></header><div class="asset-compare-stage" style="--asset-compare-position:50%"><img class="asset-compare-original" alt="原图"><img class="asset-compare-generated" alt="生成图"><div class="asset-compare-divider" aria-hidden="true"><i></i></div><span class="asset-compare-label is-original">原图</span><span class="asset-compare-label is-generated">生成图</span><input class="asset-compare-range" type="range" min="0" max="100" value="50" aria-label="拖动分隔线比较原图和生成图"></div><p>拖动中线查看原图与生成图的差异</p></section>';
  document.body.append(layer);
  const dialog=layer.querySelector('.asset-compare-dialog'),stage=layer.querySelector('.asset-compare-stage'),original=layer.querySelector('.asset-compare-original'),generated=layer.querySelector('.asset-compare-generated'),range=layer.querySelector('.asset-compare-range'),close=layer.querySelector('.asset-compare-close');
  let lastFocus=null;
  const setPosition=value=>{const numeric=Number(value),position=Math.max(0,Math.min(100,Number.isFinite(numeric)?numeric:50));stage.style.setProperty('--asset-compare-position',position+'%');range.value=String(position)};
  const fitStage=()=>{
    if(!generated.naturalWidth||!generated.naturalHeight)return;
    const ratio=generated.naturalWidth/generated.naturalHeight;
    const compact=window.matchMedia('(max-width:640px)').matches;
    const outerSpace=compact?20:48,dialogPadding=compact?26:36,dialogChrome=compact?106:134;
    const maxStageWidth=Math.min(864,Math.max(96,window.innerWidth-outerSpace-dialogPadding));
    const maxStageHeight=Math.max(96,window.innerHeight-outerSpace-dialogChrome);
    const stageWidth=Math.max(96,Math.min(maxStageWidth,Math.floor(maxStageHeight*ratio)));
    stage.style.aspectRatio=generated.naturalWidth+'/'+generated.naturalHeight;
    dialog.style.setProperty('--asset-compare-dialog-width',Math.ceil(stageWidth+dialogPadding)+'px');
    stage.style.setProperty('--asset-compare-stage-width',stageWidth+'px');
  };
  const closeDialog=()=>{layer.hidden=true;document.body.classList.remove('asset-compare-open');original.removeAttribute('src');generated.removeAttribute('src');dialog.style.removeProperty('--asset-compare-dialog-width');stage.style.removeProperty('--asset-compare-stage-width');lastFocus?.focus?.()};
  close.onclick=closeDialog;layer.addEventListener('click',event=>{if(event.target===layer)closeDialog()});range.addEventListener('input',()=>setPosition(range.value));
  generated.addEventListener('load',fitStage);window.addEventListener('resize',()=>{if(!layer.hidden)fitStage()});
  window.addEventListener('keydown',event=>{if(!layer.hidden&&event.key==='Escape'){event.preventDefault();closeDialog()}});
  return {open(originalUrl,generatedUrl,trigger){lastFocus=trigger;setPosition(50);dialog.style.removeProperty('--asset-compare-dialog-width');stage.style.removeProperty('--asset-compare-stage-width');original.src=ImageDelivery.displayUrl(originalUrl);generated.src=ImageDelivery.displayUrl(generatedUrl);layer.hidden=false;document.body.classList.add('asset-compare-open');requestAnimationFrame(()=>{fitStage();range.focus()})}};
})();
