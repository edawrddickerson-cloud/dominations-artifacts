/* Align the artifact with the five rendered stat rows, including wrapped names. */
(() => {
  'use strict';
  const result=document.getElementById('scanner-result'),column=document.querySelector('.scanner-artwork-column'),artwork=column?.querySelector('.scanner-artwork'),refresh=document.getElementById('scanner-image-refresh');
  if(!result || !artwork || !window.ResizeObserver)return;
  function align() {
    if(!result.querySelector('.scanner-perk'))return;
    const refreshHeight=refresh && !refresh.hidden?refresh.getBoundingClientRect().height+parseFloat(getComputedStyle(refresh).marginBottom):0;
    column.style.paddingTop='0px';artwork.style.height=Math.max(0,result.getBoundingClientRect().height-refreshHeight)+'px';
  }
  const observer=new ResizeObserver(align);
  observer.observe(result);
  if(refresh)observer.observe(refresh);
})();
