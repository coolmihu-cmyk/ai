const PREFIX='public_reference_';
const MAX_PAGE_SIZE=256;
const CATEGORIES=new Set(['photography','design','commerce','other']);

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function isSiteRequest(request){const origin=request.headers.get('Origin');return !origin||origin==='https://pic.supmihu.cn'}
function kv(env){const store=(typeof HISTORY_KV!=='undefined'&&HISTORY_KV)||env?.HISTORY_KV||globalThis?.HISTORY_KV;if(!store)throw new Error('公共参考库存储尚未绑定。');return store}
function keyName(entry){return typeof entry==='string'?entry:entry?.key||entry?.name}
function cleanId(value){return String(value??'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)}
function cleanDate(value,fallback){const date=new Date(value||fallback);return Number.isNaN(date.getTime())?new Date(fallback).toISOString():date.toISOString()}
function cleanItem(value){
  if(!value||typeof value!=='object')throw new Error('参考记录格式无效。');
  const id=cleanId(value.id);if(!id)throw new Error('参考记录缺少编号。');
  const imageUrl=new URL(String(value.imageUrl||''));if(!/^https?:$/.test(imageUrl.protocol))throw new Error('图片链接仅支持 HTTP 或 HTTPS。');
  const createdAt=cleanDate(value.createdAt,Date.now()),updatedAt=cleanDate(value.updatedAt,createdAt);
  return {id,type:'public-reference',imageUrl:imageUrl.href.slice(0,2000),prompt:String(value.prompt||'').slice(0,5000),category:CATEGORIES.has(value.category)?value.category:'other',createdAt,updatedAt};
}
function admin(context){const expected=String(context.env?.PUBLIC_REFERENCE_ADMIN_TOKEN||'').trim();if(!expected)throw new Error('公共参考库管理口令尚未配置。');if(context.request.headers.get('X-Public-Reference-Admin')!==expected){const error=new Error('管理口令无效。');error.status=401;throw error}}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{Allow:'GET, POST, DELETE, OPTIONS'}})}
export async function onRequestGet(context){
  try{if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);const store=kv(context.env),url=new URL(context.request.url),cursor=url.searchParams.get('cursor')||undefined,options={prefix:PREFIX,limit:MAX_PAGE_SIZE};if(cursor)options.cursor=cursor;const listed=await store.list(options),names=(listed.keys||[]).map(keyName).filter(Boolean),values=await Promise.all(names.map(name=>store.get(name))),items=[];values.forEach(value=>{try{const item=typeof value==='string'?JSON.parse(value):value;if(item?.type==='public-reference')items.push(item)}catch(_){}});return json({items,cursor:listed.cursor||null,complete:listed.complete??listed.list_complete??!listed.cursor})}
  catch(error){console.error('public-references:get',error);return json({error:error instanceof Error?error.message:'公共参考读取失败。'},400)}
}
export async function onRequestPost(context){
  try{if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);admin(context);const item=cleanItem((await context.request.json()).item),store=kv(context.env);await store.put(PREFIX+item.id,JSON.stringify(item));return json({item})}
  catch(error){console.error('public-references:post',error);return json({error:error instanceof Error?error.message:'公共参考保存失败。'},error?.status||400)}
}
export async function onRequestDelete(context){
  try{if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);admin(context);const id=cleanId((await context.request.json()).id);if(!id)throw new Error('无法识别要删除的公共参考。');await kv(context.env).delete(PREFIX+id);return json({ok:true})}
  catch(error){console.error('public-references:delete',error);return json({error:error instanceof Error?error.message:'公共参考删除失败。'},error?.status||400)}
}
