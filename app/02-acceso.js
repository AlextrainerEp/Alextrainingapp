
/* Pantalla de acceso: frase arriba, logo de la foto completo debajo y el cuadro de acceso debajo del logo.
   Foto «collage» (1024x1536). Zona del logo en la foto: y 560-900 (con la montaña amarilla), x 205-820, centro x 512. */
var FOTO={w:1024,h:1536,lt:560,lb:900,lw:615,lx:512};
function colocarAcceso(){
  return; // el acceso «Montaña de noche» se coloca solo con CSS
  var W=window.innerWidth, H=window.innerHeight, raiz=document.documentElement, L=FOTO.lb-FOTO.lt;
  var f=document.querySelector('.frase'), c=document.querySelector('.login.card');
  var fAbajo=0;
  if(f){ f.style.top='14px'; fAbajo=14+f.offsetHeight; }
  var cH=c?c.offsetHeight:230;
  var sCubre=Math.max(W/FOTO.w,H/FOTO.h);
  var sAncho=0.92*W/FOTO.lw;                          /* el logo nunca más ancho que la pantalla */
  var sAlto=(H-fAbajo-10-14-cH-10)/L;                 /* que quepan frase + logo + formulario */
  var s=Math.max(0.15,Math.min(sCubre,sAncho,sAlto));
  var lo=fAbajo+10, hi=H-(L*s+14+cH+10);
  var logoTop=Math.min(hi,Math.max(lo,H-(FOTO.h-FOTO.lt)*s));
  if(hi<lo) logoTop=lo;
  raiz.style.setProperty('--bgw',(FOTO.w*s)+'px');
  raiz.style.setProperty('--bgx',(W/2-FOTO.lx*s)+'px');
  raiz.style.setProperty('--bgy',(logoTop-FOTO.lt*s)+'px');
  if(c) c.style.top=(logoTop+L*s+14)+'px';
}
window.addEventListener('resize',colocarAcceso);
window.addEventListener('load',colocarAcceso);
if(window.MutationObserver){ new MutationObserver(function(){ colocarAcceso(); }).observe(document.getElementById('app')||document.body,{childList:true}); }
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(colocarAcceso);
colocarAcceso();
