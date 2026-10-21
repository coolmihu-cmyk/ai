// Read-only image forwarding: no COS upload or persistent image storage.
export async function onRequestGet({request}){
  let source;try{source=new URL(new URL(request.url).searchParams.get('url')||'')}catch(_){return new Response('图片地址不正确。',{status:400})}
  if(source.protocol!=='https:'||source.hostname!=='img.mosi.cn'||source.port||source.username||source.password)return new Response('仅支持 MOSS 生成图片。',{status:400});
  try{
    const response=await fetch(source.href,{redirect:'manual',referrerPolicy:'no-referrer',headers:{Accept:'image/*'},eo:{timeoutSetting:{connectTimeout:15000,readTimeout:60000,writeTimeout:15000}}});
    if(!response.ok||!response.body)return new Response('图片已过期或暂时无法读取。',{status:response.status===403?410:502,headers:{'Cache-Control':'no-store'}});
    const type=(response.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
    if(!['image/png','image/jpeg','image/webp'].includes(type))return new Response('图片格式不正确。',{status:502});
    return new Response(response.body,{headers:{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }catch(_){return new Response('MOSS 图片读取失败，请稍后重试。',{status:502,headers:{'Cache-Control':'no-store'}})}
}
