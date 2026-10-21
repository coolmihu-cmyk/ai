// Fixed project key, intentionally supplied for this free model. Never sent to the browser.
const MOSS_API_KEY='sk-bae83a430fd886c2d3b6780f7fd68efb4a6b724c499a44cb';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
export async function onRequestPost({request}){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'不允许跨站生成请求。'},403);
  let input;try{input=await request.json()}catch(_){return json({error:'请求格式不正确。'},400)}
  if(input.model!=='moss-image-sft-1.0'||typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>4000)return json({error:'请填写 1–4000 字符的提示词，并选择 MOSS SFT。'},400);
  const match=/^(\d{3,4})x(\d{3,4})$/.exec(input.size||'');
  if(!match)return json({error:'图片尺寸不正确。'},400);
  const width=Number(match[1]),height=Number(match[2]);
  if([width,height].some(value=>value<256||value>2048||value%16)||width*height>2097152)return json({error:'图片尺寸超出 MOSS 支持范围。'},400);
  if(input.image_urls?.length)return json({error:'MOSS SFT 仅支持文生图，不接受参考图。'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),295000);
  try{
    const response=await fetch('https://api.mosi.cn/v1/images/generations',{
      method:'POST',headers:{Authorization:'Bearer '+MOSS_API_KEY,'Content-Type':'application/json'},signal:controller.signal,
      eo:{timeoutSetting:{connectTimeout:30000,readTimeout:300000,writeTimeout:30000}},
      body:JSON.stringify({model:'moss-image-sft-1.0',prompt:input.prompt,size:input.size,n:1,response_format:'url',output_watermark:{enabled:false}})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const code=data.error?.code;
      const message=code==='safety_guardrail_blocked'?'生成内容未通过安全审核，请修改提示词。':
        response.status===403?'MOSS 固定密钥不可用或没有模型权限。':
        response.status===429?'MOSS 请求过多或并发已满，请稍后重试。':
        response.status===400?'MOSS 不接受当前提示词或尺寸，请修改后重试。':'MOSS 服务暂时不可用，请稍后再试。';
      return json({error:message},response.status);
    }
    const url=data.data?.[0]?.url;
    if(typeof url!=='string'||!/^https:\/\//i.test(url))return json({error:'MOSS 未返回有效的图片地址。'},502);
    return json({url,usage:data.usage||{}});
  }catch(_){return json({error:'MOSS 连接中断或等待超时，原请求可能仍在生成，请稍后确认，避免立即重复提交。'},504)}
  finally{clearTimeout(timer)}
}
