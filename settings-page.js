"use strict";

const settingsInput=$('#settingsApiKey');
settingsInput.value=Settings.getKey();
const balanceEl=$('#settingsAccountBalance');

function formatBalance(value){
  return new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
}

async function refreshAccountBalance(){
  const key=Settings.getKey().trim();
  const value=balanceEl?.querySelector('strong');
  if(!value)return;
  if(!key){
    balanceEl.dataset.state='idle';
    value.textContent='—';
    return;
  }
  balanceEl.dataset.state='loading';
  value.textContent='读取中';
  try{
    const balance=await Apimart.getUserBalance(key);
    balanceEl.dataset.state='ready';
    value.textContent=formatBalance(balance);
  }catch(error){
    balanceEl.dataset.state='error';
    value.textContent='暂不可用';
  }
}

$('#settingsToggleKey').onclick=()=>{
  const show=settingsInput.type==='password';
  settingsInput.type=show?'text':'password';
  $('#settingsToggleKey').textContent=show?'隐藏':'显示';
};
$('#settingsSave').onclick=()=>{
  const key=settingsInput.value.trim();
  if(!key){toast('请填写 API Key');settingsInput.focus();return}
  Settings.setKey(key);toast('API Key 已保存');refreshAccountBalance();
};
$('#settingsClear').onclick=()=>{
  settingsInput.value='';Settings.setKey('');toast('API Key 已清除');
  refreshAccountBalance();
};

refreshAccountBalance();

document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('#settingsSave').click();
},{capture:true});
