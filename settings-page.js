"use strict";

const settingsInput=$('#settingsApiKey');
const settingsStatus=$('#connectionStatus');
const settingsVerify=$('#settingsVerify');
const settingsBalance=$('#connectionBalance');

function renderBalance(account){
  if(!account){settingsBalance.hidden=true;settingsBalance.textContent='';return}
  if(account.unlimited){settingsBalance.textContent='余额 · 无限额度';settingsBalance.hidden=false;return}
  const value=Number(account.remaining);
  if(!Number.isFinite(value)){settingsBalance.hidden=true;settingsBalance.textContent='';return}
  settingsBalance.textContent='余额 · '+new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
  settingsBalance.hidden=false;
}
function updateConnectionStatus(state='pending',account=null){
  const configured=!!Settings.getKey();
  settingsStatus.classList.toggle('configured',configured&&state!=='error');
  settingsStatus.classList.toggle('is-verified',state==='verified');
  settingsStatus.classList.toggle('is-error',state==='error');
  const label=!configured?'未配置':state==='verified'?'连接正常':state==='error'?'连接异常':'待验证';
  settingsStatus.querySelector('span').textContent=label;
  renderBalance(state==='verified'?account:null);
}
settingsInput.value=Settings.getKey();
updateConnectionStatus();

$('#settingsToggleKey').onclick=()=>{
  const show=settingsInput.type==='password';
  settingsInput.type=show?'text':'password';
  $('#settingsToggleKey').textContent=show?'隐藏':'显示';
};
$('#settingsSave').onclick=()=>{
  const key=settingsInput.value.trim();
  if(!key){toast('请填写 API Key');settingsInput.focus();return}
  Settings.setKey(key);updateConnectionStatus('pending');toast('已保存，请测试连接');
};
settingsVerify.onclick=async()=>{
  const key=settingsInput.value.trim();
  if(!key){toast('请先填写 API Key');settingsInput.focus();return}
  const original=settingsVerify.textContent;
  settingsVerify.disabled=true;settingsVerify.textContent='测试中…';
  try{
    const account=await Apimart.verifyKey(key);
    Settings.setKey(key);updateConnectionStatus('verified',account);toast('连接正常，KEY 已保存');
  }catch(error){
    updateConnectionStatus('error');toast(error?.message||'连接测试失败');
  }finally{settingsVerify.disabled=false;settingsVerify.textContent=original}
};
$('#settingsClear').onclick=()=>{
  settingsInput.value='';Settings.setKey('');updateConnectionStatus('pending');toast('API Key 已清除');
};

document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('#settingsSave').click();
},{capture:true});
