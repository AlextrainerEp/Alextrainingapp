
/* Menú lateral en móvil: se abre con ☰ y se cierra al elegir una opción o pulsar fuera */
(function(){
  var b=document.getElementById('btn-menu'); if(!b) return;
  b.addEventListener('click',function(e){e.stopPropagation();document.body.classList.toggle('menu-abierto');});
  document.querySelectorAll('.tabs-t').forEach(function(n){n.addEventListener('click',function(e){ if(e.target.closest('.tabt,.subt')) document.body.classList.remove('menu-abierto'); });});
  document.addEventListener('click',function(e){ if(document.body.classList.contains('menu-abierto')&&!e.target.closest('.tabs-t,#btn-menu')) document.body.classList.remove('menu-abierto'); });
})();
