"use strict";

const settingsInput=$('#settingsApiKey');
settingsInput.value=Settings.getKey();

$('#settingsToggleKey').onclick=()=>{
  const show=settingsInput.type==='password';
  settingsInput.type=show?'text':'password';
  $('#settingsToggleKey').textContent=show?'隐藏':'显示';
};
$('#settingsSave').onclick=()=>{
  const key=settingsInput.value.trim();
  if(!key){toast('请填写 API Key');settingsInput.focus();return}
  Settings.setKey(key);toast('API Key 已保存');
};
$('#settingsClear').onclick=()=>{
  settingsInput.value='';Settings.setKey('');toast('API Key 已清除');
};

document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('#settingsSave').click();
},{capture:true});
