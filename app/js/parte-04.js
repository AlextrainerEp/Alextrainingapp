/* Menú lateral: paso al apartado de resistencia (entrenador, y clientes que lo tengan activado) */
(function(){
  function ponerOtraApp(){
    try{ if(!(S&&S.perfil&&S.perfil.rol==="admin")) return; }catch(e){ return; }
    var n=document.getElementById('cnav');
    var esAdmin=S.perfil.rol==="admin";
    if(!esAdmin) return;
    if(n&&!n.querySelector('.otra-app')){ n.insertAdjacentHTML('beforeend','<button class="otra-app" type="button">🏃 Planes y biblioteca</button>'); n.querySelector('.otra-app').onclick=function(){panelResEntrenador("biblio")}; }
  }
  var app=document.getElementById('app');
  if(app&&window.MutationObserver) new MutationObserver(ponerOtraApp).observe(app,{childList:true,subtree:true});
})();
