const IMAGE_HOST=/^(img\.supmihu\.cn|[a-z0-9-]+\.cos\.[a-z0-9-]+\.myqcloud\.com)$/i;
const EXTENSIONS={"image/png":"png","image/jpeg":"jpg","image/webp":"webp"};

function error(message,status){return new Response(JSON.stringify({error:message}),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}

export async function onRequestGet(context){
  try{
    const source=new URL(new URL(context.request.url).searchParams.get('url')||'');
    if(source.protocol!=='https:'||!IMAGE_HOST.test(source.hostname))return error('仅允许下载已归档图片。',400);
    const response=await fetch(source.href,{headers:{Accept:'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'}});
    if(!response.ok||!response.body)return error('图片下载失败（HTTP '+response.status+'）。',response.status||502);
    const contentType=(response.headers.get('Content-Type')||'image/png').split(';')[0].toLowerCase();
    const extension=EXTENSIONS[contentType]||'png';
    return new Response(response.body,{headers:{
      'Content-Type':contentType,
      'Content-Disposition':'attachment; filename="mihu-image-'+Date.now()+'.'+extension+'"',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'
    }});
  }catch(cause){console.error('download-image',cause);return error('图片下载失败。',400)}
}
