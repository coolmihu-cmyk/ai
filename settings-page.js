"use strict";

const settingsInput=$('#settingsApiKey');
const settingsStatus=$('#connectionStatus');
const settingsReturnLink=$('#settingsReturnLink');

function updateConnectionStatus(){
  const configured=!!Settings.getKey();
  settingsStatus.classList.toggle('configured',configured);
  settingsStatus.querySelector('span').textContent=configured?'已配置':'未配置';
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
  Settings.setKey(key);updateConnectionStatus();toast('设置已保存');
};
$('#settingsClear').onclick=()=>{
  settingsInput.value='';Settings.setKey('');updateConnectionStatus();toast('API Key 已清除');
};

const returnPath=sessionStorage.getItem('mihu_settings_return');
if(returnPath&&/^(?:index|edit|assets)\.html$/.test(returnPath)){
  settingsReturnLink.href=returnPath;
  settingsReturnLink.textContent='返回上一页';
}

document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('#settingsSave').click();
  if((event.ctrlKey||event.metaKey)&&(['+','-','=','0'].includes(event.key)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(event.code)))event.preventDefault();
},{capture:true});
window.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)event.preventDefault()},{passive:false});
