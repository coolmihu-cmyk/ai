const APIMART_ORIGIN='https://api.apimart.ai';
const PROXY_PREFIX='/api/apimart';

function json(data,status){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}

function upstreamPath(request){
  const url=new URL(request.url);
  const path=url.pathname.slice(PROXY_PREFIX.length);
  if(!/^\/v1\/[A-Za-z0-9_./-]+$/.test(path))return null;
  return path+url.search;
}

export async function onRequest(context){
  const {request}=context;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Allow':'GET, POST, OPTIONS'}});
  if(!['GET','POST'].includes(request.method))return json({error:'Unsupported request method.'},405);
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))return json({error:'Missing API key.'},401);
  const path=upstreamPath(request);
  if(!path)return json({error:'Disallowed APIMart request path.'},404);
  const headers=new Headers({Authorization:authorization,Accept:request.headers.get('Accept')||'application/json'});
  const contentType=request.headers.get('Content-Type');
  if(contentType)headers.set('Content-Type',contentType);
  try{
    const upstream=await fetch(APIMART_ORIGIN+path,{method:request.method,headers,body:request.method==='POST'?request.body:undefined});
    const responseHeaders=new Headers({'Cache-Control':'no-store'});
    const upstreamContentType=upstream.headers.get('Content-Type');
    if(upstreamContentType)responseHeaders.set('Content-Type',upstreamContentType);
    const requestId=upstream.headers.get('X-Request-Id')||upstream.headers.get('Request-Id');
    if(requestId)responseHeaders.set('X-Request-Id',requestId);
    return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  }catch(_){
    return json({error:{message:'暂时无法连接图片服务，请稍后重试。'}},502);
  }
}