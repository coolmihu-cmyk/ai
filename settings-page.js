"use strict";

const settingsInput=$('#settingsApiKey');
settingsInput.value=Settings.getKey();
const balanceEl=$('#settingsAccountBalance');
const keyAvatar=$('#settingsKeyAvatar');

async function refreshKeyAvatar(){
  if(!keyAvatar)return;
  const token=await CloudHistory.token();
  if(!token){keyAvatar.style.backgroundImage='';return}
  const sample=offset=>parseInt(token.slice(offset,offset+2),16)||0;
  const palettes=[['#202326','#f0f1f1','#9ca2a5'],['#31363a','#f6f2e9','#b7afa1'],['#292e34','#eef1f3','#84939c'],['#3a3732','#f5f3ef','#b3a99a']];
  const colors=palettes[sample(0)%palettes.length],x1=16+sample(2)%28,y1=18+sample(4)%28,x2=44+sample(6)%34,y2=38+sample(8)%32;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${colors[1]}"/><circle cx="${x1}" cy="${y1}" r="25" fill="${colors[2]}"/><circle cx="${x2}" cy="${y2}" r="28" fill="${colors[0]}"/><path d="M18 64c12-17 28-20 42-11 8 5 13 13 18 25H18z" fill="${colors[1]}" opacity=".88"/><circle cx="36" cy="42" r="5" fill="${colors[1]}"/><circle cx="59" cy="42" r="5" fill="${colors[1]}"/><path d="M35 56c8 6 17 6 25 0" fill="none" stroke="${colors[1]}" stroke-width="4" stroke-linecap="round"/></svg>`;
  keyAvatar.style.backgroundImage=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

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
    value.textContent=formatBalance(balance)+' Credits';
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
  refreshKeyAvatar();
};
$('#settingsClear').onclick=()=>{
  settingsInput.value='';Settings.setKey('');toast('API Key 已清除');
  refreshAccountBalance();
  refreshKeyAvatar();
};

refreshAccountBalance();
refreshKeyAvatar();

document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter')$('#settingsSave').click();
},{capture:true});
