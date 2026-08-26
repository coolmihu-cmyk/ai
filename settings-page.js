"use strict";

const settingsInput=$('#settingsApiKey');
const settingsStatus=$('#connectionStatus');

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

document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('#settingsSave').click();
},{capture:true});
