const MAX_IMAGE_BYTES=20*1024*1024;
const ALLOWED_TYPES=new Map([['image/png','png'],['image/jpeg','jpg'],['image/webp','webp']]);
const encoder=new TextEncoder();
const toHex=buffer=>Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');
const sha1=async value=>toHex(await crypto.subtle.digest('SHA-1',encoder.encode(value)));
const sha256=async value=>toHex(await crypto.subtle.digest('SHA-256',value));
async function hmacSha1(key,value){const cryptoKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-1'},false,['sign']);return toHex(await crypto.subtle.sign('HMAC',cryptoKey,encoder.encode(value)))}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function historyToken(request){const token=request.headers.get('X-History-Key')||'';return /^[a-f0-9]{64}$/i.test(token)?token.toLowerCase():null}
function readConfig(env){const required=['COS_SECRET_ID','COS_SECRET_KEY','COS_BUCKET','COS_REGION','COS_PUBLIC_BASE_URL'];const missing=required.filter(name=>!env?.[name]);if(missing.length)throw new Error('归档服务尚未配置：'+missing.join('、'));return Object.fromEntries(required.map(name=>[name,String(env[name]).trim()]))}
function canonicalHeaderValue(value){return encodeURIComponent(String(value).trim().replace(/\s+/g,' '))}
async function cosAuthorization({secretId,secretKey,keyTime,method,pathname,headers}){const normalized=Object.entries(headers).map(([name,value])=>[name.toLowerCase(),canonicalHeaderValue(value)]).sort(([a],[b])=>a.localeCompare(b));const headerList=normalized.map(([name])=>name).join(';');const httpHeaders=normalized.map(([name,value])=>name+'='+value).join('&');const httpString=method.toLowerCase()+'\n'+pathname+'\n\n'+httpHeaders+'\n';const signKey=await hmacSha1(secretKey,keyTime);const stringToSign='sha1\n'+keyTime+'\n'+await sha1(httpString)+'\n';const signature=await hmacSha1(signKey,stringToSign);return 'q-sign-algorithm=sha1&q-ak='+encodeURIComponent(secretId)+'&q-sign-time='+keyTime+'&q-key-time='+keyTime+'&q-header-list='+headerList+'&q-url-param-list=&q-signature='+signature}
function makeObjectKey(extension,token,contentHash){return 'references/key-'+token+'/'+contentHash+'.'+extension}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{'Allow':'POST, OPTIONS'}})}
export async function onRequestPost(context){
  try{
    if(context.request.headers.get('Origin')!=='https://pic.supmihu.cn')return json({error:'不允许跨站上传参考图。'},403);
    const token=historyToken(context.request);if(!token)throw new Error('请先在设置中保存 API Key 后再上传参考图。');
    const form=await context.request.formData(),file=form.get('file');
    if(!file||typeof file.arrayBuffer!=='function')throw new Error('没有收到参考图片。');
    const contentType=(file.type||'').toLowerCase(),extension=ALLOWED_TYPES.get(contentType);
    if(!extension)throw new Error('仅支持 PNG、JPG 或 WebP 图片。');
    if(file.size>MAX_IMAGE_BYTES)throw new Error('图片超过 20MB，无法上传。');
    const content=await file.arrayBuffer(),contentHash=await sha256(content),config=readConfig(context.env),objectKey=makeObjectKey(extension,token,contentHash),host=config.COS_BUCKET+'.cos.'+config.COS_REGION+'.myqcloud.com',pathname='/'+objectKey,now=Math.floor(Date.now()/1000),keyTime=now+';'+(now+900);
    const headers={'cache-control':'public, max-age=31536000, immutable','content-type':contentType,'host':host,'x-cos-forbid-overwrite':'true'};
    const authorization=await cosAuthorization({secretId:config.COS_SECRET_ID,secretKey:config.COS_SECRET_KEY,keyTime,method:'PUT',pathname,headers});
    const upload=await fetch('https://'+host+pathname,{method:'PUT',headers:{Authorization:authorization,'Cache-Control':headers['cache-control'],'Content-Type':contentType,'x-cos-forbid-overwrite':'true'},body:content});
    if(!upload.ok&&![409,412].includes(upload.status))throw new Error('COS 写入失败（HTTP '+upload.status+'）。');
    return json({url:config.COS_PUBLIC_BASE_URL.replace(/\/+$/,'')+'/'+objectKey,key:objectKey,contentType,deduplicated:!upload.ok});
  }catch(error){console.error('upload-reference-image',error);return json({error:error instanceof Error?error.message:'参考图上传失败。'},400)}
}
