/* ===================== 常量与状态 ===================== */
let activeModel='gpt';
const modelState=Object.fromEntries(Object.entries(MODEL_CONFIG).map(([key,config])=>[
  key,
  {ratio:config.ratios[0],...(config.defaultResolution?{resolution:config.defaultResolution}:{}),...(config.defaultQuality?{quality:config.defaultQuality}:{}),...(config.defaultModeration?{moderation:config.defaultModeration}:{}),promptText:''}
]));
const refManagers={};

/* ===================== DOM 引用 ===================== */
const els={
  composer:$('#composer'),errorMsg:$('#errorMsg'),
  refRow:$('#refRow'),refBtn:$('#refBtn'),fileInput:$('#fileInput'),
  oneClickStyleBtn:$('#oneClickStyleBtn'),oneClickStyleInput:$('#oneClickStyleInput'),
  promptInput:$('#promptInput'),clearPromptBtn:$('#clearPromptBtn'),charCount:$('#charCount'),
  enhanceBtn:$('#enhanceBtn'),transparentBgBtn:$('#transparentBgBtn'),sendBtn:$('#sendBtn'),
  creationModelSelect:$('#creationModelSelect'),creationModelIcon:$('#creationModelIcon'),
  creationGptVersionControl:$('#creationGptVersionControl'),creationGptVersionSelect:$('#creationGptVersionSelect'),
  creationRatioSelect:$('#creationRatioSelect'),
  creationResolutionControl:$('#creationResolutionControl'),creationResolutionSelect:$('#creationResolutionSelect'),
  creationQualityControl:$('#creationQualityControl'),creationQualitySelect:$('#creationQualitySelect'),
  creationModerationControl:$('#creationModerationControl'),creationModerationSelect:$('#creationModerationSelect')
};
document.querySelector('#appVersion')?.replaceChildren('V'+APP_VERSION);
els.enhanceBtn?.addEventListener('click',()=>window.optimizeCurrentPrompt?.());
els.transparentBgBtn?.addEventListener('change',()=>{
  if(els.enhanceBtn)els.enhanceBtn.disabled=els.transparentBgBtn.value==='yes';
});
if(els.enhanceBtn&&els.transparentBgBtn)els.enhanceBtn.disabled=els.transparentBgBtn.value==='yes';
initCommonPage();

