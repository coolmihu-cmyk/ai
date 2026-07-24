"use strict";

function ensurePriceModal(){
  let modal=$('#priceModal');
  if(modal)modal.remove();
  const wrapper=document.createElement('div');
  wrapper.innerHTML=`
    <div class="modal-backdrop" id="priceModal">
      <div class="modal price-modal">
        <div class="modal-head"><h2>价格说明</h2><button class="close" id="closePrice" type="button">×</button></div>
        <div class="price-list">
          <div class="price-row"><div class="price-name"><div><b>Image 2</b><span>1K 分辨率</span></div></div><div class="price-value">0.0851 <small>Credits</small></div></div>
          <div class="price-row"><div class="price-name"><div><b>Image 2</b><span>2K 分辨率</span></div></div><div class="price-value">0.14 <small>Credits</small></div></div>
          <div class="price-row"><div class="price-name"><div><b>Image 2</b><span>4K 分辨率</span></div></div><div class="price-value">0.21 <small>Credits</small></div></div>
          <div class="price-row"><div class="price-name"><div><b>NB2</b><span>nano-banana-2-ext</span></div></div><div class="price-value">0.3 <small>Credits</small></div></div>
          <div class="price-row"><div class="price-name"><div><b>Grok Image</b><span>grok-imagine-1.5-ext</span></div></div><div class="price-value">0.15 <small>Credits</small></div></div>
        </div>
        <div class="price-note">
          <div class="price-rate"><b>¥7</b> = <b>10</b> Credits（1 Credit ≈ ¥0.7）</div>
          每次生成按所选模型与参数扣费，费用由 APIMart 收取。
        </div>
      </div>
    </div>`;
  modal=wrapper.firstElementChild;document.body.appendChild(modal);return modal;
}

const sitePriceModal=ensurePriceModal();
$$('[data-open-price]').forEach(button=>{
  button.onclick=()=>sitePriceModal.classList.add('open','show');
});
const siteClosePrice=$('#closePrice');
if(siteClosePrice)siteClosePrice.onclick=()=>sitePriceModal.classList.remove('open','show');
sitePriceModal.addEventListener('click',event=>{
  if(event.target===sitePriceModal)sitePriceModal.classList.remove('open','show');
});
$$('[data-open-settings]').forEach(button=>{
  button.onclick=()=>Settings.openModal({modal:$('#modalBackdrop'),apiKey:$('#apiKey')});
});
const siteSettingsModal=$('#modalBackdrop .modal');
if(siteSettingsModal&&!siteSettingsModal.querySelector('.settings-recharge-link')){
  const recharge=document.createElement('a');
  recharge.className='settings-recharge-link';recharge.href='https://apimart.ai/zh';
  recharge.target='_blank';recharge.rel='noopener';
  recharge.innerHTML='<span>前往 APIMart 充值</span><svg class="settings-recharge-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5h11v11M19 5 6 18"/></svg>';
  siteSettingsModal.querySelector('.modal-footer')?.before(recharge);
}
