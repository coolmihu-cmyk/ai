/* ===================== 常量与状态 ===================== */
let activeModel='gpt';
const modelState=Object.fromEntries(Object.entries(MODEL_CONFIG).map(([key,config])=>[
  key,
  {ratio:config.ratios[0],...(config.defaultResolution?{resolution:config.defaultResolution}:{}),promptText:''}
]));
const refManagers={};

/* ===================== DOM 引用 ===================== */
const els={
  composer:$('#composer'),errorMsg:$('#errorMsg'),
  refRow:$('#refRow'),refBtn:$('#refBtn'),fileInput:$('#fileInput'),
  promptInput:$('#promptInput'),clearPromptBtn:$('#clearPromptBtn'),charCount:$('#charCount'),
  enhanceBtn:$('#enhanceBtn'),sendBtn:$('#sendBtn'),
  creationModelSelect:$('#creationModelSelect'),creationModelIcon:$('#creationModelIcon'),
  creationRatioSelect:$('#creationRatioSelect'),
  creationResolutionControl:$('#creationResolutionControl'),creationResolutionSelect:$('#creationResolutionSelect')
};
initCommonPage();

