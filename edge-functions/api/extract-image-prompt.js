const MAX_IMAGE_BYTES=20*1024*1024;
const ALLOWED_IMAGE_HOSTS=new Set(['upload.apimart.ai','getapib.org','img.supmihu.cn']);
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function isSiteRequest(request){const origin=request.headers.get('Origin');return !origin||origin==='https://pic.supmihu.cn'}
function sourceUrl(value){
  const url=new URL(String(value||''));
  if(url.protocol!=='https:'||!ALLOWED_IMAGE_HOSTS.has(url.hostname))throw new Error('仅允许提取本站归档或 APIMart 图片。');
  return url;
}
function base64(buffer){
  const bytes=new Uint8Array(buffer),chunk=0x8000;let binary='';
  for(let offset=0;offset<bytes.length;offset+=chunk)binary+=String.fromCharCode(...bytes.subarray(offset,offset+chunk));
  return btoa(binary);
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{'Allow':'POST, OPTIONS'}})}

export async function onRequestPost(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站访问。'},403);
    const authorization=context.request.headers.get('Authorization')||'';
    if(!/^Bearer\s+\S+$/i.test(authorization))return json({error:'请先在设置中保存 API Key。'},401);
    const {sourceUrl:rawSource,model,instruction}=await context.request.json();
    if(model!=='gemini-2.5-flash')throw new Error('不支持的图片分析模型。');
    const source=sourceUrl(rawSource),imageResponse=await fetch(source.toString(),{redirect:'manual'});
    if(!imageResponse.ok)throw new Error('原图下载失败（HTTP '+imageResponse.status+'）。');
    const mimeType=(imageResponse.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
    if(!ALLOWED_TYPES.has(mimeType))throw new Error('仅支持 PNG、JPG 或 WebP 图片。');
    const declaredSize=Number(imageResponse.headers.get('Content-Length')||0);
    if(declaredSize>MAX_IMAGE_BYTES)throw new Error('图片超过 20MB，无法提取提示词。');
    const image=await imageResponse.arrayBuffer();
    if(!image.byteLength||image.byteLength>MAX_IMAGE_BYTES)throw new Error('图片超过 20MB，无法提取提示词。');
    const response=await fetch('https://api.apimart.ai/v1beta/models/gemini-2.5-flash:generateContent',{
      method:'POST',headers:{'Authorization':authorization,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[
        {text:String(instruction||'').slice(0,4000)+' 请分析这张图片并按要求输出结果。'},
        {inline_data:{mime_type:mimeType,data:base64(image)}}
      ]}]})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error('图片分析失败（HTTP '+response.status+'）'+((data.error?.message||data.message)?'：'+String(data.error?.message||data.message).slice(0,180):''));
    const output=(data.candidates||data.data?.candidates||[])[0]?.content?.parts?.map(part=>part.text||'').join('\n').trim();
    if(!output)throw new Error('图片分析未返回提示词。');
    return json({prompt:output});
  }catch(error){
    console.error('extract-image-prompt',error);
    return json({error:error instanceof Error?error.message:'原图提示词提取失败。'},400);
  }
}
