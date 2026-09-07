const MAX_PAGE_SIZE=256;
const CATEGORIES=new Set(['photography','design','commerce','other']);

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function isSiteRequest(request){const origin=request.headers.get('Origin');return !origin||origin==='https://pic.supmihu.cn'}
function historyToken(request){const token=request.headers.get('X-History-Key')||'';return /^[a-f0-9]{64}$/i.test(token)?token.toLowerCase():null}
function historyKV(env){if(typeof HISTORY_KV!=='undefined')return HISTORY_KV;return env?.HISTORY_KV||globalThis?.HISTORY_KV}
function getKV(env,methods=[]){const kv=historyKV(env);if(!kv)throw new Error('云端参考库尚未绑定。');const missing=methods.filter(method=>typeof kv[method]!=='function');if(missing.length)throw new Error('云端参考库存储缺少 '+missing.join('、')+' 能力。');return kv}
function cleanId(value){return String(value??'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)}
function prefix(token){return 'reference_'+token+'_'}
function itemKey(token,id){return prefix(token)+cleanId(id)}
function tombstoneKey(token,id){return prefix(token)+'deleted_'+cleanId(id)}
function keyName(entry){return typeof entry==='string'?entry:entry?.key||entry?.name}
function cleanDate(value,fallback){const date=new Date(value||fallback);return Number.isNaN(date.getTime())?new Date(fallback).toISOString():date.toISOString()}
function cleanItem(value){
  if(!value||typeof value!=='object')throw new Error('参考记录格式无效。');
  const id=cleanId(value.id);if(!id)throw new Error('参考记录缺少编号。');
  const imageUrl=new URL(String(value.imageUrl||''));if(!/^https?:$/.test(imageUrl.protocol))throw new Error('图片链接仅支持 HTTP 或 HTTPS。');
  const category=CATEGORIES.has(value.category)?value.category:'other';
  const createdAt=cleanDate(value.createdAt,Date.now()),updatedAt=cleanDate(value.updatedAt,createdAt);
  return {id,type:'reference',imageUrl:imageUrl.href.slice(0,2000),prompt:String(value.prompt||'').slice(0,5000),category,createdAt,updatedAt};
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{Allow:'GET, POST, DELETE, OPTIONS'}})}

export async function onRequestGet(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const token=historyToken(context.request);if(!token)return json({error:'请先在设置中保存 API Key。'},401);
    const kv=getKV(context.env,['list','get']),url=new URL(context.request.url),cursor=url.searchParams.get('cursor')||undefined;
    const options={prefix:prefix(token),limit:MAX_PAGE_SIZE};if(cursor)options.cursor=cursor;
    const listed=await kv.list(options),names=(listed.keys||[]).map(keyName).filter(Boolean),values=await Promise.all(names.map(name=>kv.get(name)));
    const items=[],deletedIds=[];
    values.forEach(value=>{try{const entry=typeof value==='string'?JSON.parse(value):value;if(entry?.type==='reference')items.push(entry);if(entry?.type==='reference-deleted'&&entry.id)deletedIds.push(entry.id)}catch(_){}});
    return json({items,deletedIds,cursor:listed.cursor||null,complete:listed.complete??listed.list_complete??!listed.cursor});
  }catch(error){console.error('references:get',error);return json({error:error instanceof Error?error.message:'云端参考读取失败。'},400)}
}

export async function onRequestPost(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const token=historyToken(context.request);if(!token)return json({error:'请先在设置中保存 API Key。'},401);
    const item=cleanItem((await context.request.json()).item),kv=getKV(context.env,['get','put']);
    if(await kv.get(tombstoneKey(token,item.id)))return json({error:'这条参考已删除，无法覆盖。'},409);
    await kv.put(itemKey(token,item.id),JSON.stringify(item));
    return json({item});
  }catch(error){console.error('references:post',error);return json({error:error instanceof Error?error.message:'云端参考保存失败。'},400)}
}

export async function onRequestDelete(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const token=historyToken(context.request);if(!token)return json({error:'请先在设置中保存 API Key。'},401);
    const id=cleanId((await context.request.json()).id);if(!id)throw new Error('无法识别要删除的参考。');
    const kv=getKV(context.env,['put','delete']);
    await kv.put(tombstoneKey(token,id),JSON.stringify({id,type:'reference-deleted',deletedAt:new Date().toISOString()}));
    await kv.delete(itemKey(token,id));
    return json({ok:true});
  }catch(error){console.error('references:delete',error);return json({error:error instanceof Error?error.message:'云端参考删除失败。'},400)}
}
