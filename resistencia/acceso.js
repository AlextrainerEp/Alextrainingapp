
/* Pantalla de acceso: foto de los atletas a pantalla completa, frase arriba y el logo con el formulario
   centrados en el espacio que queda debajo (igual estructura que la app funcional). */
function colocarAcceso(){
  var l=document.getElementById('login');
  var fr=document.querySelector('.frase');
  if(!l||l.classList.contains('oculto')){
    if(fr){ fr.style.top=''; document.documentElement.style.setProperty('--frase-h',fr.offsetHeight+'px'); }
    return;
  }
  var H=window.innerHeight, fAbajo=0;
  if(fr){ fr.style.top='14px'; fAbajo=14+fr.offsetHeight; }
  var cH=l.offsetHeight||420;
  var top=fAbajo+Math.max(12,(H-fAbajo-cH)/2);
  l.style.top=Math.min(top,Math.max(fAbajo+8,H-cH-8))+'px';
}
window.addEventListener('resize',colocarAcceso);
window.addEventListener('load',colocarAcceso);
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(colocarAcceso);
(function(){var l=document.getElementById('login'); if(l&&window.MutationObserver) new MutationObserver(colocarAcceso).observe(l,{attributes:true,childList:true,subtree:true});})();
colocarAcceso();
