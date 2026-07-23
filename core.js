/* ===================== 常量与状态 ===================== */
const MODEL_NAMES={gpt:'Image 2',nano:'NB2',mj:'Midjourney',grok:'Grok Image'};
const ENHANCE_MODEL='gpt-5.6-luna';
const MODEL_MAX_PROMPT={gpt:3000,nano:2000,mj:2000,grok:4000};
const MODEL_RATIOS={
  gpt:['1:1','3:2','4:3','3:4','16:9','9:16'],
  nano:['1:1','3:2','4:3','3:4','2:3','16:9','9:16','4:5','5:4','21:9'],
  mj:['1:1','16:9','9:16','3:2','2:3','4:3'],
  grok:['1:1','16:9','9:16','4:3','3:4','3:2','2:3']
};
const MODEL_RESOLUTIONS={
  gpt:[{v:'1k',l:'1K · 快速'},{v:'2k',l:'2K · 高清'},{v:'4k',l:'4K · 超清'}],
  nano:[{v:'0.5K',l:'0.5K · 预览'},{v:'1K',l:'1K · 标准'},{v:'2K',l:'2K · 高清'},{v:'4K',l:'4K · 超清'}],
  mj:null,
  grok:null
};
const RATIO_ICON_SIZE={
  '1:1':[20,20],'3:2':[24,16],'4:3':[24,18],'3:4':[18,24],'2:3':[16,24],
  '16:9':[28,16],'9:16':[16,28],'4:5':[20,25],'5:4':[25,20],'21:9':[30,13]
};
const GROK_EDIT_SIZES={
  '1:1':'1024x1024',
  '16:9':'1280x720','4:3':'1792x1024','3:2':'1792x1024',
  '9:16':'720x1280','3:4':'1024x1792','2:3':'1024x1792'
};

let activeModel='gpt';
const sharedHistory=[];
let historyLoading=true;
let currentResultUrl=null,currentResultModel=null;
let canvasEditModel='gpt',pendingCanvasEditSource=null;
const canvasItems=[];
let selectedCanvasId=null,canvasItemCounter=0,canvasTopZ=1;
const canvasDrag={id:null,startX:0,startY:0,originX:0,originY:0,pointerId:null,moved:false};
const canvasResize={id:null,startX:0,startWidth:0,ratio:1,pointerId:null};
const modelState={
  gpt:{ratio:'1:1',resolution:'1k',mode:'text',generating:false,originalPrompt:null,promptText:''},
  nano:{ratio:'1:1',resolution:'1K',mode:'text',generating:false,originalPrompt:null,promptText:''},
  mj:{ratio:'1:1',generating:false,originalPrompt:null,promptText:'',version:'8.1',speed:'relax',quality:'1',stylize:100,chaos:0,style:'',iw:1,negativePrompt:'',seed:''},
  grok:{ratio:'1:1',mode:'text',generating:false,originalPrompt:null,promptText:''}
};
const refManagers={};

/* 将输入工作台装入左侧对话栏，保留原有控件 ID 与事件绑定 */
const sidebarComposeSlot=$('.sidebar-compose-slot');
const bottomArea=$('.bottom-area');
if(sidebarComposeSlot&&bottomArea)sidebarComposeSlot.appendChild(bottomArea);

/* ===================== DOM 引用 ===================== */
const els={
  sidebar:$('#sidebar'),sidebarBody:$('#sidebarBody'),sidebarEmpty:$('#sidebarEmpty'),
  historyList:$('#historyList'),historyLoading:$('#historyLoading'),
  collapseSidebar:$('#collapseSidebar'),expandSidebar:$('#expandSidebar'),
  empty:$('#empty'),loading:$('#loading'),loadingModelName:$('#loadingModelName'),
  progressPercent:$('#progressPercent'),progressBar:$('#progressBar'),
  sidebarProgressPercent:$('#sidebarProgressPercent'),sidebarProgressBar:$('#sidebarProgressBar'),
  generationModelName:$('#generationModelName'),generationPrompt:$('#generationPrompt'),statusElapsed:$('#statusElapsed'),
  resultWrap:$('#resultWrap'),resultBackdrop:$('#resultBackdrop'),resultImage:$('#resultImage'),actions:$('#actions'),status:$('#status'),
  canvasLayer:$('#canvasLayer'),canvasToolbar:$('#canvasToolbar'),canvasFileInput:$('#canvasFileInput'),
  uploadCanvasImage:$('#uploadCanvasImage'),editCanvasImage:$('#editCanvasImage'),deleteCanvasImage:$('#deleteCanvasImage'),
  composer:$('#composer'),errorMsg:$('#errorMsg'),
  refRow:$('#refRow'),refBtn:$('#refBtn'),fileInput:$('#fileInput'),
  promptInput:$('#promptInput'),clearPromptBtn:$('#clearPromptBtn'),charCount:$('#charCount'),
  modelBtn:$('#modelBtn'),modelBtnValue:$('#modelBtnValue'),
  resBtn:$('#resBtn'),resBtnValue:$('#resBtnValue'),
  enhanceBtn:$('#enhanceBtn'),restoreBtn:$('#restoreBtn'),sendBtn:$('#sendBtn'),
  modelPop:$('#modelPop'),resPop:$('#resPop'),resPopList:$('#resPopList'),
  modelRatioGrid:$('#modelRatioGrid'),
  modal:$('#modalBackdrop'),apiKey:$('#apiKey'),openSettings:$('#openSettings')
};
function syncSidebarHistoryState(){
  const generationVisible=!els.status.hidden;
  els.historyLoading.hidden=!historyLoading||generationVisible;
  els.historyList.hidden=historyLoading;
  els.sidebarEmpty.style.display=!historyLoading&&!generationVisible&&!sharedHistory.length?'':'none';
}
initCommonPage(els);

/* ===================== 价格参考弹窗 ===================== */
const priceModal=$('#priceModal');
$('#priceLink').onclick=()=>{priceModal.classList.add('open','show')};
$('#closePrice').onclick=()=>{priceModal.classList.remove('open','show')};
priceModal.addEventListener('click',e=>{if(e.target===priceModal)priceModal.classList.remove('open','show')});

/* ===================== 边栏收起/展开 ===================== */
const SIDEBAR_KEY='mihu_sidebar_collapsed';
function setSidebar(collapsed){
  els.sidebar.classList.toggle('collapsed',collapsed);
  localStorage.setItem(SIDEBAR_KEY,collapsed?'1':'0');
}
els.collapseSidebar.onclick=()=>setSidebar(true);
els.expandSidebar.onclick=()=>setSidebar(false);
if(localStorage.getItem(SIDEBAR_KEY)==='1')setSidebar(true);

/* ===================== 弹层管理 ===================== */
let openPop=null;
const _allPops=$$('.pop'),_allBarBtns=$$('.bar-btn');
function closeAllPops(){
  _allPops.forEach(p=>p.classList.remove('open'));
  _allBarBtns.forEach(b=>b.classList.remove('active'));
  openPop=null;
}
function togglePop(pop,anchorBtn){
  if(!pop||!anchorBtn)return;
  const wasOpen=pop.classList.contains('open');
  closeAllPops();
  if(wasOpen)return;
  pop.classList.add('open');
  anchorBtn.classList.add('active');
  openPop=pop;
}
document.addEventListener('click',e=>{
  if(openPop&&!openPop.contains(e.target)&&!e.target.closest('.bar-btn'))closeAllPops();
});

els.modelBtn.onclick=()=>togglePop(els.modelPop,els.modelBtn);

