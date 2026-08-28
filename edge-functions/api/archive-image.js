const MAX_IMAGE_BYTES=20*1024*1024;
const APIMART_IMAGE_HOSTS=new Set(['upload.apimart.ai','getapib.org']);
const ALLOWED_TYPES=new Map([
  ['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']
]);

const encoder=new TextEncoder();
const toHex=buffer=>Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');
const sha1=async value=>toHex(await crypto.subtle.digest('SHA-1',encoder.encode(value)));
async function hmacSha1(key,value){
  const cryptoKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  return toHex(await crypto.subtle.sign('HMAC',cryptoKey,encoder.encode(value)));
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function sanitizeError(error){return error instanceof Error?error.message:'图片归档失败。'}
function canonicalHeaderValue(value){return encodeURIComponent(String(value).trim().replace(/\s+/g,' '))}
async function cosAuthorization({secretId,secretKey,keyTime,method,pathname,headers}){
  const normalized=Object.entries(headers)
    .map(([name,value])=>[name.toLowerCase(),canonicalHeaderValue(value)])
    .sort(([a],[b])=>a.localeCompare(b));
  const headerList=normalized.map(([name])=>name).join(';');
  const httpHeaders=normalized.map(([name,value])=>name+'='+value).join('&');
  const httpString=method.toLowerCase()+'\n'+pathname+'\n\n'+httpHeaders+'\n';
  const signKey=await hmacSha1(secretKey,keyTime);
  const stringToSign='sha1\n'+keyTime+'\n'+await sha1(httpString)+'\n';
  const signature=await hmacSha1(signKey,stringToSign);
  return 'q-sign-algorithm=sha1&q-ak='+encodeURIComponent(secretId)+'&q-sign-time='+keyTime+'&q-key-time='+keyTime+'&q-header-list='+headerList+'&q-url-param-list=&q-signature='+signature;
}
function makeObjectKey(extension){
  const date=new Date(),year=date.getUTCFullYear(),month=String(date.getUTCMonth()+1).padStart(2,'0'),day=String(date.getUTCDate()).padStart(2,'0');
  const id=crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  return 'generated/'+year+'/'+month+'/'+day+'/'+id+'.'+extension;
}
function readConfig(env){
  const required=['COS_SECRET_ID','COS_SECRET_KEY','COS_BUCKET','COS_REGION','COS_PUBLIC_BASE_URL'];
  const missing=required.filter(name=>!env?.[name]);
  if(missing.length)throw new Error('归档服务尚未配置：'+missing.join('、'));
  return Object.fromEntries(required.map(name=>[name,String(env[name]).trim()]));
}
function validateSourceUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||!APIMART_IMAGE_HOSTS.has(url.hostname))throw new Error('仅允许归档 APIMart 生成的图片。');
  return url;
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{'Allow':'POST, OPTIONS'}})}

export async function onRequestPost(context){
  try{
    const origin=context.request.headers.get('Origin');
    if(origin!=='https://pic.supmihu.cn')return json({error:'不允许跨站归档请求。'},403);
    const {sourceUrl}=await context.request.json();
    const source=validateSourceUrl(sourceUrl);
    const config=readConfig(context.env);
    const sourceResponse=await fetch(source.toString(),{redirect:'manual'});
    if(!sourceResponse.ok)throw new Error('临时图片下载失败（HTTP '+sourceResponse.status+'）。');
    const contentType=(sourceResponse.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
    const extension=ALLOWED_TYPES.get(contentType);
    if(!extension)throw new Error('归档服务仅接受 PNG、JPG 或 WebP 图片。');
    const declaredSize=Number(sourceResponse.headers.get('Content-Length')||0);
    if(declaredSize>MAX_IMAGE_BYTES)throw new Error('图片超过 20MB，无法归档。');
    const image=await sourceResponse.arrayBuffer();
    if(!image.byteLength||image.byteLength>MAX_IMAGE_BYTES)throw new Error('图片超过 20MB，无法归档。');

    const objectKey=makeObjectKey(extension),host=config.COS_BUCKET+'.cos.'+config.COS_REGION+'.myqcloud.com';
    const pathname='/'+objectKey,now=Math.floor(Date.now()/1000),keyTime=now+';'+(now+900);
    const headers={
      'cache-control':'public, max-age=31536000, immutable',
      'content-type':contentType,
      'host':host,
      'x-cos-forbid-overwrite':'true'
    };
    const authorization=await cosAuthorization({secretId:config.COS_SECRET_ID,secretKey:config.COS_SECRET_KEY,keyTime,method:'PUT',pathname,headers});
    const upload=await fetch('https://'+host+pathname,{method:'PUT',headers:{
      'Authorization':authorization,'Cache-Control':headers['cache-control'],'Content-Type':contentType,
      'x-cos-forbid-overwrite':'true'
    },body:image});
    if(!upload.ok)throw new Error('COS 写入失败（HTTP '+upload.status+'）。');
    const base=config.COS_PUBLIC_BASE_URL.replace(/\/+$/,'');
    return json({url:base+'/'+objectKey,key:objectKey,contentType});
  }catch(error){
    console.error('archive-image',error);
    return json({error:sanitizeError(error)},400);
  }
}
