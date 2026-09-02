const MAX_PAGE_SIZE=60;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function isSiteRequest(request){const origin=request.headers.get('Origin');return !origin||origin==='https://pic.supmihu.cn'}
function historyToken(request){
  const token=request.headers.get('X-History-Key')||'';
  return /^[a-f0-9]{64}$/i.test(token)?token.toLowerCase():null;
}
function historyKV(env){
  if(typeof HISTORY_KV!=='undefined')return HISTORY_KV;
  return env?.HISTORY_KV||globalThis?.HISTORY_KV;
}
function getKV(env,methods=[]){
  const kv=historyKV(env);
  if(!kv)throw new Error('云端历史存储尚未绑定。');
  const missing=methods.filter(method=>typeof kv[method]!=='function');
  if(missing.length)throw new Error('云端历史存储缺少 '+missing.join('、')+' 能力。');
  return kv;
}
function prefix(token){return 'history_'+token+'_'}
function cleanItem(value){
  if(!value||typeof value!=='object'||value.id==null)return null;
  const url=new URL(String(value.url||''));
  if(url.protocol!=='https:'||!(url.hostname==='img.supmihu.cn'||/\.cos\.[a-z0-9-]+\.myqcloud\.com$/i.test(url.hostname)))throw new Error('仅允许同步已归档图片。');
  const createdAt=new Date(value.createdAt||Date.now());
  const id=String(value.id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
  if(!id||Number.isNaN(createdAt.getTime()))throw new Error('历史记录格式无效。');
  return {id,url:url.href,cosKey:String(value.cosKey||'').slice(0,600),archived:true,type:'image',createdAt:createdAt.toISOString(),prompt:String(value.prompt||'').slice(0,3000),model:String(value.model||'gpt').slice(0,64),settings:value.settings&&typeof value.settings==='object'?value.settings:{},editRootId:String(value.editRootId||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),editGroupId:String(value.editGroupId||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100)};
}
function recordKey(token,item){
  const order=String(Math.max(0,9999999999999-new Date(item.createdAt).getTime())).padStart(13,'0');
  const id=String(item.id).replace(/[^a-zA-Z0-9_]/g,'_');
  return prefix(token)+order+'_'+id;
}
function cleanId(value){return String(value??'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)}
function tombstoneKey(token,id){return prefix(token)+'deleted_'+cleanId(id).replace(/-/g,'_')}
function keyName(entry){return typeof entry==='string'?entry:entry?.key||entry?.name}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{'Allow':'GET, POST, DELETE, OPTIONS'}})}

export async function onRequestGet(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const token=historyToken(context.request);if(!token)return json({error:'请先在设置中保存 API Key。'},401);
    const kv=getKV(context.env,['list','get']),url=new URL(context.request.url);
    const cursor=url.searchParams.get('cursor')||undefined;
    const listOptions={prefix:prefix(token),limit:MAX_PAGE_SIZE};
    if(cursor)listOptions.cursor=cursor;
    const listed=await kv.list(listOptions);
    const names=(listed.keys||[]).map(keyName).filter(Boolean);
    const values=await Promise.all(names.map(name=>kv.get(name)));
    const items=values.map(value=>{try{return typeof value==='string'?JSON.parse(value):value}catch(_){return null}}).filter(Boolean);
    return json({items,cursor:listed.cursor||null,complete:listed.complete??listed.list_complete??!listed.cursor});
  }catch(error){console.error('history:get',error);return json({error:error instanceof Error?error.message:'云端历史读取失败。'},400)}
}

export async function onRequestPost(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const token=historyToken(context.request);if(!token)return json({error:'请先在设置中保存 API Key。'},401);
    const item=cleanItem((await context.request.json()).item),kv=getKV(context.env,['get','put']),historyKey=recordKey(token,item);
    if(await kv.get(tombstoneKey(token,item.id)))return json({error:'这条历史记录已经删除。'},409);
    item.historyKey=historyKey;await kv.put(historyKey,JSON.stringify(item));
    return json({item,historyKey});
  }catch(error){console.error('history:post',error);return json({error:error instanceof Error?error.message:'云端历史写入失败。'},400)}
}

export async function onRequestDelete(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const token=historyToken(context.request);if(!token)return json({error:'请先在设置中保存 API Key。'},401);
    const {historyKey,id}=await context.request.json();
    if(historyKey&&(!historyKey.startsWith(prefix(token))||historyKey.includes('_deleted_')))throw new Error('无权删除这条历史记录。');
    const kv=getKV(context.env,['get','put','delete']);
    let current=null;
    if(historyKey){
      const value=await kv.get(historyKey);
      try{current=typeof value==='string'?JSON.parse(value):value}catch(_){current=null}
    }
    const itemId=cleanId(current?.id??id);
    if(!itemId)throw new Error('无法识别要删除的历史记录。');
    const deletedAt=new Date().toISOString(),deletedKey=tombstoneKey(token,itemId);
    await kv.put(deletedKey,JSON.stringify({id:itemId,type:'image',deleted:true,deletedAt,historyKey:deletedKey}));
    if(historyKey)await kv.delete(historyKey);
    return json({ok:true,deletedKey});
  }catch(error){console.error('history:delete',error);return json({error:error instanceof Error?error.message:'云端历史删除失败。'},400)}
}
