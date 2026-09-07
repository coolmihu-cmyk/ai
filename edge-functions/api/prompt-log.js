const ALLOWED_ORIGIN='https://pic.supmihu.cn';
const ALLOWED_STATUSES=new Set(['submitted','processing','completed','failed']);

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function cleanText(value,max=3000){return String(value??'').trim().slice(0,max)}
function historyToken(request){const token=request.headers.get('X-History-Key')||'';return /^[a-f0-9]{64}$/i.test(token)?token.toLowerCase():null}
function readConfig(env){
  const url=cleanText(env?.SUPABASE_URL,500).replace(/\/+$/,'');
  const key=cleanText(env?.SUPABASE_SECRET_KEY,500);
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key.startsWith('sb_secret_'))throw new Error('提示词日志服务尚未正确配置。');
  return {url,key};
}
function isSiteRequest(request){return request.headers.get('Origin')===ALLOWED_ORIGIN}
function safeParameters(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return{};
  const serialized=JSON.stringify(value);
  return serialized.length<=8000?value:{};
}
async function supabaseRequest(env,path,{method='POST',body,prefer}={}){
  const config=readConfig(env),headers={'apikey':config.key,'Content-Type':'application/json','Accept':'application/json'};
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(config.url+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error('Supabase 写入失败（HTTP '+response.status+'）'+(data?.message?': '+cleanText(data.message,180):''));
  return data;
}

export async function onRequestOptions(){return new Response(null,{status:204,headers:{Allow:'POST, PATCH, OPTIONS'}})}

export async function onRequestPost(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站记录请求。'},403);
    if(!historyToken(context.request))return json({error:'缺少有效的请求身份。'},401);
    const input=await context.request.json(),prompt=cleanText(input.prompt,3000);
    if(!prompt)return json({error:'提示词不能为空。'},400);
    const rows=await supabaseRequest(context.env,'prompt_logs?select=id',{body:{
      task_id:cleanText(input.taskId,200)||null,
      prompt,
      model:cleanText(input.model,100)||null,
      resolution:cleanText(input.resolution,40)||null,
      parameters:safeParameters(input.parameters),
      status:'submitted'
    },prefer:'return=representation'});
    return json({id:Array.isArray(rows)?rows[0]?.id:null});
  }catch(error){console.error('prompt-log:post',error);return json({error:error instanceof Error?error.message:'提示词记录失败。'},500)}
}

export async function onRequestPatch(context){
  try{
    if(!isSiteRequest(context.request))return json({error:'不允许跨站记录请求。'},403);
    if(!historyToken(context.request))return json({error:'缺少有效的请求身份。'},401);
    const input=await context.request.json(),id=Number(input.id);
    if(!Number.isSafeInteger(id)||id<1)return json({error:'日志编号无效。'},400);
    const status=cleanText(input.status,30),patch={};
    if(ALLOWED_STATUSES.has(status))patch.status=status;
    const taskId=cleanText(input.taskId,200);if(taskId)patch.task_id=taskId;
    if(input.errorMessage!==undefined)patch.error_message=cleanText(input.errorMessage,1000)||null;
    if(!Object.keys(patch).length)return json({ok:true});
    await supabaseRequest(context.env,'prompt_logs?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:patch,prefer:'return=minimal'});
    return json({ok:true});
  }catch(error){console.error('prompt-log:patch',error);return json({error:error instanceof Error?error.message:'提示词状态更新失败。'},500)}
}
