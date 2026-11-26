const SB_URL="https://xnqksbpwsqdgngaskbpx.supabase.co";
const SB_KEY="sb_publishable_3cFWXykjHyxsdo65c2CZkA_8dM6U-HF";

const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
let S=null; // {access, refresh, user, perfil}

// La sesión se guarda por pestaña (sessionStorage): cada pestaña puede ser un usuario distinto
function guardarSesion(){try{if(S&&S.access)sessionStorage.setItem("alex_s",JSON.stringify({access:S.access,refresh:S.refresh}));else sessionStorage.removeItem("alex_s")}catch(e){}sesionCompartida()}
function leerSesion(){try{return JSON.parse(sessionStorage.getItem("alex_s")||"null")}catch(e){return null}}
function msg(sel,texto,ok){const el=$(sel);if(!el)return;el.textContent=texto;el.className="msg "+(ok?"ok":"err")}
function traducir(m){
  const t={"Invalid login credentials":"Email o contraseña incorrectos","User already registered":"Ya existe una cuenta con ese email","Email not confirmed":"Confirma tu email antes de entrar (revisa tu correo)","Password should be at least 6 characters.":"La contraseña debe tener al menos 6 caracteres","Unable to validate email address: invalid format":"El email no es válido","Email rate limit exceeded":"Demasiados intentos. Espera unos minutos."};
  return t[m]||m;
}
const fechaLocal=d=>`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

/* ---------- Auth y base de datos ---------- */
async function auth(path,body,method="POST",token){
  const r=await fetch(SB_URL+"/auth/v1/"+path,{method,headers:{apikey:SB_KEY,"Content-Type":"application/json",Authorization:"Bearer "+(token||SB_KEY)},body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(traducir(j.msg||j.error_description||j.message||("Error "+r.status)));
  return j;
}
async function refrescar(){
  try{const g=JSON.parse(sessionStorage.getItem("alex_s")||"null");
    if(g&&g.refresh&&g.refresh!==S.refresh&&expDe(g.access)>Date.now()/1000+30){S.access=g.access;S.refresh=g.refresh;sesionCompartida();return}}catch(e){}
  const j=await auth("token?grant_type=refresh_token",{refresh_token:S.refresh});
  S.access=j.access_token;S.refresh=j.refresh_token;guardarSesion();
}
async function db(method,tabla,query="",body,prefer,reintento){
  const h={apikey:SB_KEY,Authorization:"Bearer "+(S&&S.access?S.access:SB_KEY),"Content-Type":"application/json"};
  if(prefer)h.Prefer=prefer;
  const r=await fetch(`${SB_URL}/rest/v1/${tabla}${query}`,{method,headers:h,body:body!==undefined&&body!==null?JSON.stringify(body):undefined});
  if(r.status===401&&S&&S.refresh&&!reintento){await refrescar();return db(method,tabla,query,body,prefer,true)}
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(!r.ok) throw new Error((j&&(j.message||j.hint))||("Error "+r.status));
  return j;
}
const AN_VERSION="v1-2026-11";
// La anamnesis vive en perfil_atleta (atleta y entrenador tienen acceso por RLS)
async function atletaIdDe(userId){
  const r=await db("GET","atletas",`?user_id=eq.${userId}&select=id`);
  return r&&r[0]?r[0].id:null;
}
async function leerAnamnesis(userId){
  const id=await atletaIdDe(userId);
  if(!id) return {};
  const r=await db("GET","perfil_atleta",`?atleta_id=eq.${id}&select=anamnesis`);
  return (r&&r[0]&&r[0].anamnesis)||{};
}
// Devuelve el id del atleta. Si el cliente aún no tiene ficha, reclama la que creó el entrenador con su email o crea una nueva.
async function guardarAnamnesis(userId,data,crear){
  let id=await atletaIdDe(userId);
  if(!id&&crear){
    const libres=await db("GET","atletas",`?user_id=is.null&email=ilike.${encodeURIComponent(S.user.email)}&select=id`).catch(()=>[]);
    if(libres&&libres[0]){
      await db("PATCH","atletas",`?id=eq.${libres[0].id}`,{user_id:userId},"return=minimal");
      id=libres[0].id;
    }else{
      const [n]=await db("POST","atletas","",{user_id:userId,nombre:(S.perfil&&S.perfil.nombre)||"Sin nombre",entrenador_id:null},"return=representation");
      id=n.id;
    }
  }
  if(!id) throw new Error("No se encuentra tu ficha de atleta. Contacta con el entrenador.");
  await db("POST","perfil_atleta","?on_conflict=atleta_id",{atleta_id:id,anamnesis:data},"resolution=merge-duplicates,return=minimal");
  return id;
}
async function cargarPerfil(){
  const u=await auth("user",null,"GET",S.access);
  S.user=u;
  const r=await db("GET","perfiles",`?id=eq.${u.id}&select=*`);
  if(!r||!r.length) throw new Error("Tu cuenta no tiene perfil. Contacta con el entrenador.");
  S.perfil=r[0];
  if(S.perfil.tema) aplicarTema(S.perfil.tema==="oscuro");
}
/* Una sola cuenta para todo: la parte de resistencia usa el mismo proyecto y lee esta misma sesión
   (en el formato de supabase-js), así se pasa de un apartado a otro sin volver a identificarse. */
const SB_CLAVE="sb-"+SB_URL.split("//")[1].split(".")[0]+"-auth-token";
function expDe(t){try{return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).exp}catch(e){return Math.floor(Date.now()/1000)+3600}}
function sesionCompartida(){
  try{
    if(S&&S.access&&S.refresh&&S.user){
      const exp=expDe(S.access);
      sessionStorage.setItem(SB_CLAVE,JSON.stringify({access_token:S.access,refresh_token:S.refresh,token_type:"bearer",expires_in:Math.max(0,exp-Math.floor(Date.now()/1000)),expires_at:exp,user:S.user}));
    } else if(!S) sessionStorage.removeItem(SB_CLAVE);
  }catch(e){}
}
const modulosDe=p=>Array.isArray(p&&p.modulos)?p.modulos:["funcional"];
// La foto la guarda el propio cliente: solo se pinta si es de verdad una imagen,
// para que nadie pueda colar código en la pantalla del entrenador.
function fotoSegura(v){
  const s=String(v??"").trim();
  if(/^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) return s;
  if(/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return "";
}
async function login(email,pw){
  const j=await auth("token?grant_type=password",{email,password:pw});
  S={access:j.access_token,refresh:j.refresh_token};
  await cargarPerfil();guardarSesion();
  if(ALTA_PENDIENTE()){ return pantallaBienvenida(); }
  entrar();
}
// Guía de alta: se muestra una sola vez, al primer acceso tras crear la cuenta
const ALTA_PENDIENTE=()=>{try{return localStorage.getItem("alta_guia")==="1"}catch(e){return false}};
const ALTA_MARCAR=(v)=>{try{v?localStorage.setItem("alta_guia","1"):localStorage.removeItem("alta_guia")}catch(e){}};
async function salir(){await quitarPush();S=null;guardarSesion();try{["strava_code","strava_error","strava_state","ir"].forEach(k=>sessionStorage.removeItem(k))}catch(e){}pantallaLogin()}

/* ---------- Pantallas de acceso ---------- */
function pantallaLogin(){
  document.body.classList.remove("cli");
  $("#app").innerHTML=`<div class="login card">
    <img class="big" src="logo-acceso.png" alt="Alex Training Lab">
    <p class="tagline">Entrenamientos personalizados para conseguir tus objetivos</p>
    <input id="em" type="email" placeholder="Email">
    <input id="pw" type="password" placeholder="Contraseña">
    <button class="gold" id="go" style="width:100%">Entrar</button>
    <p style="text-align:center"><a href="#" id="ir-reg">Crear cuenta de cliente</a><br><a href="#" id="ir-rec">He olvidado la contraseña</a></p>
    <div class="msg" id="m"></div></div>`;
  $("#go").onclick=async()=>{try{await login($("#em").value.trim(),$("#pw").value)}catch(e){msg("#m",e.message,false)}};
  $("#ir-reg").onclick=e=>{e.preventDefault();pantallaRegistro()};
  $("#ir-rec").onclick=e=>{e.preventDefault();pantallaRecuperar()};
}
function pantallaRegistro(paso=1,datos={}){
  document.body.classList.remove("cli");
  const nombres=["Tu cuenta","Confirma tu correo","Qué te espera"];
  const barra=`<div class="pasos">${[1,2,3].map(i=>`<span class="${i<=paso?"on":""}">${i}</span>`).join("")}</div><p class="muted paso-txt">Paso ${paso} de 3 · ${nombres[paso-1]}</p>`;
  const cab=`<img class="big" src="logo-acceso.png" alt="Alex Training Lab">`;
  const redirigir=location.origin+location.pathname;
  if(paso===1){
    $("#app").innerHTML=`<div class="login card">${cab}${barra}
      <input id="rn" placeholder="Nombre" value="${esc(datos.nombre||"")}" autocomplete="given-name">
      <input id="re" type="email" placeholder="Email" value="${esc(datos.email||"")}" autocomplete="email">
      <input id="rp" type="password" placeholder="Contraseña (mín. 6 caracteres)" autocomplete="new-password">
      <input id="rp2" type="password" placeholder="Repite la contraseña" autocomplete="new-password">
      <button class="gold" id="rg" style="width:100%">Continuar</button>
      <p style="text-align:center"><a href="#" id="volver">Volver</a></p>
      <div class="msg" id="m"></div></div>`;
    $("#volver").onclick=e=>{e.preventDefault();pantallaLogin()};
    $("#rg").onclick=async()=>{
      const nombre=$("#rn").value.trim(), email=$("#re").value.trim(), pw=$("#rp").value, pw2=$("#rp2").value;
      if(!nombre) return msg("#m","Escribe tu nombre.",false);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg("#m","Revisa el email: tiene que tener la forma nombre@dominio.",false);
      if(pw.length<6) return msg("#m","La contraseña tiene que tener al menos 6 caracteres.",false);
      if(pw!==pw2) return msg("#m","Las contraseñas no coinciden.",false);
      $("#rg").disabled=true;
      try{
        ALTA_MARCAR(true);
        const j=await auth("signup?redirect_to="+encodeURIComponent(redirigir),{email,password:pw,data:{nombre}});
        if(j.access_token){ S={access:j.access_token,refresh:j.refresh_token}; await cargarPerfil(); guardarSesion(); return pantallaBienvenida(); }
        return pantallaRegistro(2,{email,nombre});
      }catch(e){ ALTA_MARCAR(false); $("#rg").disabled=false; msg("#m",e.message,false); }
    };
    return;
  }
  if(paso===2){
    $("#app").innerHTML=`<div class="login card">${cab}${barra}
      <p class="paso-txt">Te hemos enviado un correo a <b>${esc(datos.email||"tu email")}</b>.</p>
      <p class="muted" style="text-align:center">Pulsa el enlace de ese correo para confirmar tu cuenta. Si no lo ves, mira en spam.</p>
      <button class="gold" id="ya" style="width:100%">Ya lo he confirmado: entrar</button>
      <p style="text-align:center"><a href="#" id="volver">Volver al inicio</a></p>
      <div class="msg" id="m"></div></div>`;
    $("#ya").onclick=()=>{ pantallaLogin(); const em=$("#em"); if(em) em.value=datos.email||""; };
    $("#volver").onclick=e=>{e.preventDefault();pantallaLogin()};
  }
}
// Último paso del alta: qué pasa ahora y dónde empezar
function pantallaBienvenida(){
  ALTA_MARCAR(false);
  document.body.classList.remove("cli");
  const nombre=(S&&S.perfil&&S.perfil.nombre)||"";
  $("#app").innerHTML=`<div class="login card">
    <img class="big" src="logo-acceso.png" alt="Alex Training Lab">
    <div class="pasos"><span class="on">1</span><span class="on">2</span><span class="on">3</span></div>
    <p class="muted paso-txt">Paso 3 de 3 · Qué te espera</p>
    <h3 style="text-align:center">¡Bienvenido${nombre?`, ${esc(nombre)}`:""}!</h3>
    <ol class="guia">
      <li><b>Tu entrenador te asigna tu plan.</b> Verás aquí tus entrenos en cuanto los programe.</li>
      <li><b>Rellena tu anamnesis.</b> Son tus datos y tu historial. Son privados: solo tu entrenador puede verlos.</li>
      <li><b>Registra cada entreno.</b> Tras la sesión, apunta cargas y cómo te has sentido (RPE).</li>
    </ol>
    <button class="gold" id="bv-ana" style="width:100%">Rellenar mi anamnesis</button>
    <p style="text-align:center"><a href="#" id="bv-mas">Más tarde</a></p>
  </div>`;
  $("#bv-ana").onclick=()=>panelCliente("perfil","anamnesis");
  $("#bv-mas").onclick=e=>{e.preventDefault();entrar()};
}
function pantallaRecuperar(){
  document.body.classList.remove("cli");
  $("#app").innerHTML=`<div class="login card">
    <img class="big" src="logo-acceso.png" alt="Alex Training Lab">
    <p class="tagline">Entrenamientos personalizados para conseguir tus objetivos</p>
    <h3>Recuperar contraseña</h3>
    <input id="re" type="email" placeholder="Tu email">
    <button class="gold" id="rr" style="width:100%">Enviar enlace</button>
    <p style="text-align:center"><a href="#" id="volver">Volver</a></p>
    <div class="msg" id="m"></div></div>`;
  $("#volver").onclick=e=>{e.preventDefault();pantallaLogin()};
  $("#rr").onclick=async()=>{
    try{
      const destino=location.origin+location.pathname;
      await auth("recover?redirect_to="+encodeURIComponent(destino),{email:$("#re").value.trim()});
      msg("#m","Si el email existe, te hemos enviado un enlace para cambiar la contraseña.",true);
    }catch(e){msg("#m",e.message,false)}
  };
}
function pantallaNuevaPass(){
  document.body.classList.remove("cli");
  $("#app").innerHTML=`<div class="login card">
    <img class="big" src="logo-acceso.png" alt="Alex Training Lab">
    <p class="tagline">Entrenamientos personalizados para conseguir tus objetivos</p>
    <h3>Nueva contraseña</h3>
    <input id="np" type="password" placeholder="Nueva contraseña (mín. 6 caracteres)">
    <button class="gold" id="nn" style="width:100%">Guardar</button>
    <div class="msg" id="m"></div></div>`;
  $("#nn").onclick=async()=>{
    try{
      await auth("user",{password:$("#np").value},"PUT",S.access);
      msg("#m","Contraseña cambiada. Ya puedes entrar.",true);
      S=null;guardarSesion();setTimeout(pantallaLogin,1500);
    }catch(e){msg("#m",e.message,false)}
  };
}

/* ---------- Estructura común ---------- */
// Mide la cabecera real (cambia según el ancho: el menú puede ocupar una o varias líneas)
function ajustarCabecera(){
  const h=(document.querySelector("header")||{offsetHeight:64}).offsetHeight;
  document.documentElement.style.setProperty("--hdr",h+"px");
  document.documentElement.style.setProperty("--logo-top",(h+30)+"px");
  const f=document.querySelector(".fondo"), l=document.querySelector(".logo-fondo");
  if(f&&l&&document.body.classList.contains("cli")){
    const alto=l.getBoundingClientRect().bottom-f.getBoundingClientRect().top;
    if(alto>0) document.documentElement.style.setProperty("--fondo-h",alto+"px");
  }
}
// Cerrar el menú lateral (móvil) al pulsar fuera de él
document.addEventListener("click",e=>{
  if(document.body.classList.contains("menu-abierto")&&!e.target.closest("#cnav,#menu-btn")) document.body.classList.remove("menu-abierto");
});
window.addEventListener("resize",()=>{if(document.body.classList.contains("cli"))ajustarCabecera()});
let NAV_HEAD="";
// Rellena la barra lateral conservando la cabecera (nombre / perfil)
function navSet(h){
  const n=$("#cnav"); if(!n) return;
  n.innerHTML=NAV_HEAD+h;
  const ip=$("#ir-perfil"); if(ip) ip.onclick=()=>panelCliente("perfil");
}
function shell(inner,ficha){
  const p=(S&&S.perfil)||{};
  const vistaCliente=true;
  document.body.classList.toggle("cli",vistaCliente);
  const fotoCab=fotoSegura(ficha?ficha.foto:(p.rol!=="admin"?p.foto:""));
  const cab=fotoCab?`<button class="foto-hdr" id="ir-foto" title="${ficha?"Perfil del entrenado":"Mi perfil"}"><img src="${esc(fotoCab)}" alt=""></button>`:`<img class="logo" src="logo-acceso.png" alt="" onerror="this.remove()">`;
  let centro;
  if(ficha) centro=`<span class="nombre-cli">${esc(ficha.nombre||"Sin nombre")}</span>`;
  else if(p.rol==="admin") centro=`<span class="t">Panel del entrenador</span>`;
  else centro=`<button class="sec perfil-btn" id="ir-perfil"><span>${esc(p.nombre||"Mi perfil")}</span><small>Perfil</small></button>`;
  // Todo el menú va en la barra lateral: el encabezado solo lleva ☰, logo y Salir
  NAV_HEAD=`<div class="side-head">${centro}</div>`;
  const nav=vistaCliente?'<nav class="cli-nav" id="cnav"></nav>':"";
  $("#app").innerHTML=`<header><button class="menu-btn" id="menu-btn" aria-label="Abrir menú">☰</button>${cab}${nav}<button class="sec" id="salir">Salir</button></header><main class="${vistaCliente?"cli":"adm"}">${inner}</main>`;
  $("#salir").onclick=salir;
  // Menú lateral: en móvil se abre y cierra con el botón ☰; al elegir una opción se cierra
  $("#menu-btn").onclick=e=>{e.stopPropagation();document.body.classList.toggle("menu-abierto")};
  $("#cnav").addEventListener("click",()=>document.body.classList.remove("menu-abierto"));
  const ifo=$("#ir-foto"); if(ifo&&!ficha) ifo.onclick=()=>panelCliente();
  ajustarCabecera();
  // La fila de menú se añade después de crear la cabecera: vuelve a medirla cuando cambie de tamaño
  const hdr=document.querySelector("header");
  if(hdr&&window.ResizeObserver){
    (window._hro||(window._hro=new ResizeObserver(()=>ajustarCabecera()))).observe(hdr);
    const fr=document.querySelector(".fondo .frase"); if(fr) window._hro.observe(fr);
  }
}
/* ---------- Avisos en el móvil (push web) ---------- */
const VAPID_PUB="BLfZ3z5iE2g4aBER5D8BkfOe8HMuFxxIsuiIdsGTPJ-xAYBpM_nOgqGFWf6MvN9yJvuL2VtcNlC1mJsD3mUelqQ";
function pushDisponible(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window}
function esIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
// Instalar en Android/escritorio: el navegador entrega el aviso y lo guardamos para el botón de Perfil
let avisoInstalar=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();avisoInstalar=e});
window.addEventListener("appinstalled",()=>{avisoInstalar=null});
function esInstalada(){return window.matchMedia&&matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function minutosDesdeTexto(t){
  // "53:45" = 53 min 45 s · "1:25:40" = 1 h 25 min 40 s · "53,5" o "53.5" = minutos decimales · "" = sin dato
  const x=String(t??"").trim().replace(",",".");
  if(x==="") return null;
  if(/^\d+:\d{1,2}$/.test(x)){const [m,q]=x.split(":").map(Number); return q>59?NaN:Math.round((m*60+q)/60*100)/100}
  if(/^\d+:\d{1,2}:\d{1,2}$/.test(x)){const [h,m,q]=x.split(":").map(Number); return (m>59||q>59)?NaN:Math.round((h*3600+m*60+q)/60*100)/100}
  const n=Number(x); return Number.isFinite(n)?n:NaN;
}
function minutosAHMS(m){
  if(m==null||m===""||!Number.isFinite(Number(m))) return "";
  const sg=Math.round(Number(m)*60), h=Math.floor(sg/3600), mi=Math.floor(sg%3600/60), se=sg%60;
  const p2=n=>String(n).padStart(2,"0");
  return h>0?`${h}:${p2(mi)}:${p2(se)}`:`${mi}:${p2(se)}`;
}
function esIPhone(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function claveB64(s){const p="=".repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,"+").replace(/_/g,"/"),r=atob(b);return Uint8Array.from([...r].map(c=>c.charCodeAt(0)))}
async function swPush(){
  if(!("serviceWorker" in navigator)) return null;
  try{return await navigator.serviceWorker.register("sw.js")}catch(e){console.warn("sw:",e.message);return null}
}
async function guardarSuscripcion(sub){
  const j=sub.toJSON();
  await db("POST","rpc/registrar_push","",{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth},"return=minimal");
}
async function activarPush(){
  const perm=await Notification.requestPermission();
  if(perm!=="granted") throw new Error("No has permitido los avisos. Puedes activarlos en los ajustes del navegador.");
  await swPush();
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:claveB64(VAPID_PUB)});
  await guardarSuscripcion(sub);
}
async function quitarPush(){
  try{
    if(!pushDisponible()) return;
    const reg=await navigator.serviceWorker.getRegistration(); const sub=reg&&await reg.pushManager.getSubscription();
    if(sub) await db("POST","rpc/quitar_push","",{p_endpoint:sub.endpoint},"return=minimal");
  }catch(e){}
}
async function arrancarPush(){
  try{
    await swPush();
    const ya=document.getElementById("pushbar"); if(ya) ya.remove();
    if(!S||!S.user) return;
    // Si ya estaban permitidos, se vuelve a asociar este móvil con quien ha entrado (por si se comparte el aparato)
    if(pushDisponible()&&Notification.permission==="granted"){
      const reg=await navigator.serviceWorker.ready, sub=await reg.pushManager.getSubscription();
      if(sub) await guardarSuscripcion(sub); else await activarPush();
      return;
    }
    if(Notification.permission==="denied") return;
    try{if(localStorage.getItem("push_no")&&Date.now()-Number(localStorage.getItem("push_no"))<7*864e5) return}catch(e){}
    const ios=esIOS(), inst=esInstalada();
    if(!pushDisponible()&&!(ios&&!inst)) return;
    const b=document.createElement("div"); b.id="pushbar";
    if(ios&&!inst){
      b.innerHTML=`<div><b>🔔 Avisos de mensajes en el iPhone</b><br><small>Pulsa el botón Compartir de Safari y elige «Añadir a pantalla de inicio». Abre la app desde ese icono y activa los avisos.</small></div><button type="button" class="sec" id="pushno">Entendido</button>`;
    }else{
      b.innerHTML=`<div><b>🔔 ¿Quieres avisos de mensajes en el móvil?</b><br><small>Te llegará un aviso con sonido cuando tengas un mensaje nuevo.</small></div><button type="button" id="pushsi">Activar</button><button type="button" class="sec" id="pushno">Ahora no</button>`;
    }
    document.body.appendChild(b);
    const cerrar=()=>{try{localStorage.setItem("push_no",String(Date.now()))}catch(e){}b.remove()};
    b.querySelector("#pushno").onclick=cerrar;
    const si=b.querySelector("#pushsi");
    if(si) si.onclick=async()=>{si.disabled=true;si.textContent="Activando…";try{await activarPush();b.innerHTML="<div><b>✅ Avisos activados</b></div>";setTimeout(()=>b.remove(),2500)}catch(e){b.innerHTML=`<div><b>No se han podido activar</b><br><small>${esc(e.message)}</small></div><button type="button" class="sec" id="pushno2">Cerrar</button>`;b.querySelector("#pushno2").onclick=()=>b.remove()}};
  }catch(e){console.warn("push:",e.message)}
}
function entrar(){
  if(S.perfil.rol==="admin"){
    shell(`<div id="tab"></div>`);
    navSet('<button id="ent">Entrenados</button>');
    $("#ent").onclick=listaClientes;
  } else if(!accesoActivo(S.perfil)) pantallaCaducado();
  else {
    const m=modulosDe(S.perfil);
    let ir="";try{ir=sessionStorage.getItem("ir")||"";sessionStorage.removeItem("ir")}catch(e){}
    if(!m.length) return pantallaSinModulos();
    panelCliente(ir==="strava"?"strava":ir==="mensajes"?"mensajes":"entrenamientos");
  }
  arrancarPush();
}
function pantallaSinModulos(){
  $("#app").innerHTML=`<div class="login card">
    <h2>Tu cuenta está lista</h2>
    <p class="muted">Ya tienes la cuenta creada. Tu entrenador tiene que decirle a la app si entrenas <b>fuerza</b>, <b>running / trail</b> o las dos cosas; en cuanto lo haga, al volver a entrar verás tus entrenamientos.</p>
    <button class="sec" id="sal">Salir</button></div>`;
  $("#sal").onclick=salir;
}
function accesoActivo(p){
  return !p.acceso_hasta || new Date(p.acceso_hasta)>new Date();
}
function pantallaCaducado(){
  const p=S.perfil;
  $("#app").innerHTML=`<div class="login card">
    <h2>Tu acceso ha caducado</h2>
    <p class="muted">${p.acceso_hasta?"Caducó el "+fechaLocal(new Date(p.acceso_hasta))+".":""} Para seguir entrenando, contacta con tu entrenador y renueva por pago o con un bono.</p>
    <button class="sec" id="sal">Salir</button></div>`;
  $("#sal").onclick=salir;
}
function pestanas(ids,fns){
  ids.forEach((id,i)=>{$("#"+id).onclick=()=>{ids.forEach(x=>$("#"+x).classList.remove("on"));$("#"+id).classList.add("on");fns[i]()}});
}

/* ---------- Formato de ejercicio ---------- */
// Forma interna: {cod, ej, ser, rep, int, rpe, rir, prog}. Acepta también los nombres antiguos.
function normEj(e){
  e=e||{};
  let rep=e.rep??e.reps??"", int=e.int??e.intensidad??"";
  // Si en la celda de reps hay texto (p. ej. "8/6/6 lastre 10kg 2 primeras"), ese texto va a Intensidad
  const m=String(rep).match(/^(\d[\d\s+\/\-–.,"']*?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ].*)$/);
  if(m){rep=m[1].trim();int=[m[2].trim(),String(int).trim()].filter(Boolean).join(" · ")}
  const o={cod:e.cod??e.codigo??"",ej:e.ej??e.ejercicio??"",ser:e.ser??e.series??"",rep,int,rpe:e.rpe??e.rpe_objetivo??"",rir:e.rir??e.rir_objetivo??"",prog:e.prog??e.progresion??"",nota:e.nota??"",video:e.video??"",sup:e.sup??""};
  return repartirEj(o);
}
// "Sentadilla goblet 10kg RIR 2-3" → Ejercicio: Sentadilla goblet · Intensidad: 10 kg · RIR obj.: 2-3
// También entiende 3x10, RPE 7-8 y descanso 90 s. Solo rellena recuadros vacíos; no borra nada que ya esté puesto.
function repartirEj(o){
  const N="\\d+(?:[.,]\\d+)?", RANGO=`${N}(?:\\s*(?:-|–|/|a)\\s*${N})?`;
  const sacar=(campo,re)=>{const m=String(o[campo]||"").match(re);if(!m)return null;o[campo]=(o[campo].slice(0,m.index)+" "+o[campo].slice(m.index+m[0].length));return m};
  const limpio=t=>String(t||"").replace(/\s{2,}/g," ").replace(/^[\s,;·\-–@|]+|[\s,;·\-–@|]+$/g,"").trim();
  const sinEsp=t=>t.replace(/\s+/g,"").replace(/a/g,"-");
  for(const campo of ["ej","int","rep"]){
    let m;
    if(!o.rir&&(m=sacar(campo,new RegExp(`\\bRIR\\s*[:=]?\\s*(${RANGO})`,"i")))) o.rir=sinEsp(m[1]);
    if(!o.rpe&&(m=sacar(campo,new RegExp(`\\bRPE\\s*[:=]?\\s*(${RANGO})`,"i")))) o.rpe=sinEsp(m[1]);
  }
  let m;
  if(!o.ser&&!o.rep&&(m=sacar("ej",/(?:^|\s)(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–\/]\s*\d{1,3})?)(?:\s*(?:reps?|repeticiones)\b)?/i))){o.ser=m[1];o.rep=m[2].replace(/\s+/g,"")}
  if((m=sacar("ej",new RegExp(`(?:@\\s*)?(${RANGO})\\s*(kg|kgs|kilos?)\\b`,"i")))){
    const kg=m[1].replace(/\s+/g,"")+" kg";
    if(!o.int) o.int=kg; else if(!/kg/i.test(o.int)) o.int=kg+" · "+o.int;
  }
  if((m=sacar("ej",/\b(?:descanso|desc\.|rec\.|recuperaci[oó]n)\s*[:=]?\s*(\d+\s*(?:s|seg|segundos|min|minutos|''|"|')?)/i))){
    const d="Descanso "+m[1].trim(); o.nota=o.nota?o.nota+" · "+d:d;
  }
  o.ej=limpio(o.ej); o.int=limpio(o.int); o.rep=limpio(o.rep);
  return o;
}

/* ---------- Excel ---------- */
function celdaRaw(ws,a){const c=ws[a];return c?c.v:undefined}
function celdaTxt(ws,a){const c=ws[a];return c?String(c.w??c.v??"").trim():""}
// Columnas de la plantilla de Alex (dos días por fila: izquierda y derecha)
const LADO=[
 {warm:"B",wser:"C",wrep:"D",wint:"E",code:"F",ej:"G",ser:"H",rep:"I",int:"J",rpe:"K",rir:"L",prog:"M",dia:"J",micro:"F"},
 {warm:"P",wser:"Q",wrep:"R",wint:"S",code:"T",ej:"U",ser:"V",rep:"W",int:"X",rpe:"Y",rir:"Z",prog:"AA",dia:"X",micro:"T"}
];
function linkCelda(ws,a){
  const c=ws[a]; if(!c) return "";
  if(c.l&&c.l.Target) return c.l.Target;
  const m=String(c.f||"").match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
  return m?m[1]:"";
}
function leerPlantilla(ws){
  const max=XLSX.utils.decode_range(ws["!ref"]).e.r+1;
  const inicios=[];
  for(let r=1;r<=max;r++) if(celdaTxt(ws,"D"+r).toUpperCase().startsWith("NOMBRE")) inicios.push(r);
  const sesiones=[];
  inicios.forEach((r0,i)=>{
    const fin=(inicios[i+1]??max+1)-1;
    LADO.forEach(L=>{
      const bloques=new Map();
      const ensure=nombre=>{if(!bloques.has(nombre)) bloques.set(nombre,{nombre,ejercicios:[]});return bloques.get(nombre)};
      let warmActual="Calentamiento";
      for(let r=r0+9;r<=fin;r++){
        const wn=celdaTxt(ws,L.warm+r);
        if(wn){
          // Cabecera de bloque: sin series ni reps ni video, y escrita en mayúsculas (o un nombre de bloque conocido).
          // Un ejercicio tipo "Movilidad de tobillo" (en minúsculas) se queda como ejercicio.
          const esCab=!celdaTxt(ws,L.wser+r)&&!celdaTxt(ws,L.wrep+r)&&!linkCelda(ws,L.warm+r)&&
            ((wn===wn.toUpperCase()&&/[A-ZÁÉÍÓÚÑ]/.test(wn))||/^(calentamiento|movilidad|estabilidad|movement skills|parte principal)$/i.test(wn.trim()));
          if(esCab){warmActual=wn;ensure(warmActual)}
          else ensure(warmActual).ejercicios.push(normEj({ej:wn,ser:celdaTxt(ws,L.wser+r),rep:celdaTxt(ws,L.wrep+r),int:celdaTxt(ws,L.wint+r),video:linkCelda(ws,L.warm+r)}));
        }
        const code=celdaTxt(ws,L.code+r), ej=celdaTxt(ws,L.ej+r);
        if(code&&ej){
          const letra=code.replace(/[^A-Za-z]/g,"").charAt(0).toUpperCase()||"·";
          ensure("Parte principal · "+letra).ejercicios.push(normEj({cod:code.replace(/\.$/,""),ej,ser:celdaTxt(ws,L.ser+r),rep:celdaTxt(ws,L.rep+r),int:celdaTxt(ws,L.int+r),rpe:celdaTxt(ws,L.rpe+r),rir:celdaTxt(ws,L.rir+r),prog:celdaTxt(ws,L.prog+r),video:linkCelda(ws,L.ej+r)}));
        }
      }
      if(!bloques.size) return;
      const fv=celdaRaw(ws,L.dia+(r0+2));
      const fecha=fv instanceof Date?fechaLocal(fv):(celdaTxt(ws,L.dia+(r0+2))||"Sin fecha");
      const dia=celdaTxt(ws,L.dia+(r0+1))||"Entrenamiento";
      const micro=celdaTxt(ws,L.micro+(r0+6));
      const todos=[...bloques.values()];
      // Parte principal: un solo bloque, cada ejercicio con su código delante (A1, A2, B1…)
      const principal=todos.filter(b=>b.nombre.startsWith("Parte principal"));
      const bloquesP=principal.length?[{nombre:"Parte principal",ejercicios:principal.flatMap(b=>b.ejercicios)}]:[];
      const orden=[...todos.filter(b=>!b.nombre.startsWith("Parte principal")),...bloquesP];
      sesiones.push({fecha,titulo:dia+(micro?" · Microciclo "+micro:""),bloques:orden});
    });
  });
  return sesiones;
}
async function leerExcel(file){
  if(typeof XLSX==="undefined") throw new Error("No se ha cargado la librería de Excel. Revisa la conexión.");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
  const lote=[];
  for(const hoja of wb.SheetNames){
    const ws=wb.Sheets[hoja];
    if(!ws["!ref"]) continue;
    const plantilla=leerPlantilla(ws);
    if(plantilla.length){lote.push(...plantilla);continue}
    // Hoja genérica: columna Ejercicio opcional; si no existe, cada fila con texto es un ejercicio
    const filas=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""});
    const hi=filas.findIndex(r=>r.some(c=>norm(c)==="ejercicio"));
    if(hi<0){
      const ejs=filas.map(r=>r.filter(c=>String(c).trim()!=="").map(c=>String(c).trim()).join(" · ")).filter(Boolean);
      if(ejs.length) lote.push({fecha:hoja,titulo:hoja,bloques:[{nombre:"General",ejercicios:ejs.map(ej=>normEj({ej}))}]});
      continue;
    }
    const H=filas[hi].map(norm);
    const c=n=>H.findIndex(h=>h.startsWith(n));
    const iF=c("fecha"),iB=c("bloque"),iE=c("ejercicio"),iS=c("series"),iR=c("reps"),iI=c("intensidad"),iP=c("rpe"),iN=c("notas");
    const get=(r,i)=>i>=0?String(r[i]??"").trim():"";
    const porFecha=new Map();
    const rng=XLSX.utils.decode_range(ws["!ref"]);
    for(let k=hi+1;k<filas.length;k++){
      const r=filas[k];
      const ej=get(r,iE);
      if(!ej) continue;
      const video=iE>=0?linkCelda(ws,XLSX.utils.encode_cell({r:rng.s.r+k,c:rng.s.c+iE})):"";
      const fecha=get(r,iF)||hoja;
      if(!porFecha.has(fecha)) porFecha.set(fecha,new Map());
      const bl=porFecha.get(fecha);
      const bn=get(r,iB)||"General";
      if(!bl.has(bn)) bl.set(bn,[]);
      bl.get(bn).push(normEj({ej,ser:get(r,iS),rep:get(r,iR),int:get(r,iI),rpe:get(r,iP),prog:get(r,iN),video}));
    }
    for(const [fecha,bl] of porFecha){
      lote.push({fecha,titulo:fecha===hoja?hoja:`${hoja} · ${fecha}`,bloques:[...bl].map(([nombre,ejercicios])=>({nombre,ejercicios}))});
    }
  }
  // Si un ejercicio aparece en varias sesiones y solo en una tiene enlace, se comparte el enlace por nombre
  const porNombre=new Map();
  lote.forEach(s=>s.bloques.forEach(b=>b.ejercicios.forEach(e=>{const k=norm(e.ej);if(e.video&&!porNombre.has(k))porNombre.set(k,e.video)})));
  lote.forEach(s=>s.bloques.forEach(b=>b.ejercicios.forEach(e=>{if(!e.video&&porNombre.has(norm(e.ej)))e.video=porNombre.get(norm(e.ej))})));
  return lote;
}

/* ---------- Escala RPE (colores de la tabla) ---------- */
function colorRPE(v){
  const n=Math.floor(parseFloat(String(v??"").replace(",",".")));
  if(isNaN(n)) return ["#fff","#1d1f21"];
  if(n>=10) return ["#ff0000","#111"];
  if(n===9) return ["#c00000","#fff"];
  if(n>=7) return ["#ff9900","#111"];
  if(n>=4) return ["#00ff00","#111"];
  if(n>=2) return ["#0b4fc4","#fff"];
  if(n===1) return ["#6d9eeb","#111"];
  return ["#cfe2f3","#111"];
}
function rpeStyle(v){const c=colorRPE(v);return ` style="background:${c[0]};color:${c[1]}"`}
function leyendaRPE(){
  const filas=[
    ["10","Esfuerzo máximo",[10]],
    ["9 · 9,5","Muy duro",[9,9.5]],
    ["7 · 7,5 · 8 · 8,5","Duro",[7,7.5,8,8.5]],
    ["4 · 4,5 · 5 · 5,5 · 6 · 6,5","Moderado",[4,4.5,5,5.5,6,6.5]],
    ["2 · 2,5 · 3 · 3,5","Suave",[2,2.5,3,3.5]],
    ["1 · 1,5","Muy suave",[1,1.5]],
    ["0 · 0,5","Reposo",[0,0.5]]
  ];
  return `<div class="leyenda"><b>Escala RPE (¿cuál es tu sensación de esfuerzo?)</b>${filas.map(([n,t,v])=>{const c=colorRPE(v[0]);return `<div style="background:${c[0]};color:${c[1]}"><span>${n}</span><span>${t}</span></div>`}).join("")}</div>`;
}

/* ---------- Vista de sesión (cliente y entrenador) ---------- */
function urlVideo(u){
  u=String(u||"").trim();
  if(!u) return "";
  if(!/^https?:\/\//i.test(u)) u="https://"+u;
  return /^https?:\/\/[^\s]+$/i.test(u)?u:"";
}
function btnVideo(e){
  const u=urlVideo(e.video);
  return u?`<a class="vid" href="${esc(u)}" target="_blank" rel="noopener">▶ Video explicativo</a>`:`<span class="vid vid-no">Sin vídeo</span>`;
}
// El nombre del ejercicio enlaza directamente al vídeo (si lo tiene)
function nombreVideo(e){
  const u=urlVideo(e.video);
  return u?`<a class="exlink" href="${esc(u)}" target="_blank" rel="noopener">${esc(e.ej)}</a>`:esc(e.ej);
}
// Todos los bloques tienen la misma estructura: Series, Reps, Hechas, Intensidad, RIR y RPE
// Botón de vídeo compacto para las filas de ejercicio
function btnVideoMini(e){
  const u=urlVideo(e.video);
  return u?` <a class="vid vmini" href="${esc(u)}" target="_blank" rel="noopener" title="Video explicativo">▶</a>`:` <span class="vid vid-no vmini" title="Sin vídeo">–</span>`;
}
function esSeguimiento(b){return true}
/** Estado de la última serie: hecha, incompleta o no hecha. */
function estadoSel(k,val,dis){
  const op=[["","–"],["completada","Hecha"],["incompleta","Incompleta"],["no_hecha","No hecha"]];
  return `<select data-k="${k}" data-f="estado" ${dis} aria-label="Estado de la serie">${op.map(([v,t])=>`<option value="${v}"${String(val??"")===v?" selected":""}>${t}</option>`).join("")}</select>`;
}
function pick(k,f,val,color,editable,obj){
  const c=color?colorRPE(val):["#fff","#1d1f21"];
  const vacio=(val===""||val==null);
  const txt=vacio?(obj?`<small class="obj">obj.</small><span class="obj">${esc(String(obj).replace(".",","))}</span>`:"–"):String(val).replace(".",",");
  return `<button type="button" class="pick" data-k="${k}" data-f="${f}" data-v="${esc(val??"")}" data-c="${color?1:0}" ${editable?"":"disabled"} style="background:${c[0]};color:${c[1]}">${txt}</button>`;
}
let hojaPick=null;
function cerrarPicker(){if(hojaPick){hojaPick.remove();hojaPick=null}}
function abrirPicker(btn){
  cerrarPicker();
  const color=btn.dataset.c==="1";
  const esRir=btn.dataset.f==="rir";
  const arr=esRir?[0,1,2,3,4,5]:Array.from({length:21},(_,i)=>i/2);
  const ov=document.createElement("div");
  ov.className="sheet-ov";
  ov.innerHTML=`<div class="sheet"><div class="sheet-t">${esRir?"RIR":"RPE"}</div><div class="sheet-g">
    <button class="pk" data-v="" style="background:#fff">–</button>
    ${arr.map(v=>{const c=color?colorRPE(v):["#f2f2f2","#111"];return `<button class="pk" data-v="${v}" style="background:${c[0]};color:${c[1]}">${String(v).replace(".",",")}</button>`}).join("")}
  </div></div>`;
  ov.onclick=ev=>{
    if(ev.target===ov){cerrarPicker();return}
    const o=ev.target.closest(".pk"); if(!o) return;
    const v=o.dataset.v;
    const c=color?colorRPE(v):["#fff","#1d1f21"];
    btn.dataset.v=v;
    btn.textContent=v===""?"–":v.replace(".",",");
    btn.style.background=c[0];btn.style.color=c[1];
    cerrarPicker();
  };
  document.body.appendChild(ov);
  hojaPick=ov;
}
function sesionHTML(s,editable,conLeyenda=editable,plan=false){
  const R=s.registro||{};
  const dis=editable?"":"disabled";
  const RIR_OPTS=[0,1,2,3,4,5];
  const RPE_OPTS=Array.from({length:21},(_,i)=>i/2);
  const opts=(arr,sel,color)=>`<option value="">–</option>`+arr.map(v=>{const c=color?colorRPE(v):null;return `<option value="${v}"${c?` style="background:${c[0]};color:${c[1]}"`:""}${String(sel??"")===String(v)?" selected":""}>${String(v).replace(".",",")}</option>`}).join("");
  // Agrupa las "Parte principal · A/B/C…" antiguas en una sola, manteniendo las claves de registro originales (bi-ei)
  const grupos=[];
  (s.bloques||[]).forEach((b,bi)=>{
    const esPrin=/^parte principal/i.test(b.nombre||"");
    const items=(b.ejercicios||[]).map((x,ei)=>({x,bi,ei}));
    const ult=grupos[grupos.length-1];
    if(esPrin&&ult&&ult.principal){ult.items.push(...items);return}
    grupos.push({nombre:esPrin?"Parte principal":(b.nombre||""),principal:esPrin,items});
  });
  const cabeza=`<div class="ghead"><span>Ejercicio</span><span>Series</span><span>Reps</span><span>Hechas</span><span>Carga</span><span>RIR</span><span>RPE</span></div>`;
  const bloques=grupos.map(g=>{
    const cab=`<div class="cab">${esc(g.nombre)}</div>`;
    const letra=x=>String((normEj(x).cod)||"").replace(/[^A-Za-z]/g,"").charAt(0).toUpperCase();
    const esResis=x=>{const e=normEj(x);return /['’′]|\bmin\b|\bkm\b|\d\s*h\b/i.test(String(e.rep))||/\bZ\s?[1-8]\b|\bFC\b|min\/km|ritmo/i.test(String(e.int))};
    const tarjeta=({x})=>{const e=normEj(x);const dosis=[e.ser,e.rep].filter(v=>String(v).trim()!=="").map(v=>esc(String(v))).join(" × ");
      const chips=[e.int?`<span class="ec-chip">${esc(e.int)}</span>`:"",e.rir?`<span class="ec-chip">RIR objetivo ${esc(String(e.rir).replace(".",","))}</span>`:"",e.rpe?`<span class="ec-chip">RPE objetivo ${esc(String(e.rpe).replace(".",","))}</span>`:""].join("");
      return `<div class="ecard"><div class="ec-t">${e.cod?`<b>${esc(e.cod)}</b> `:""}${nombreVideo(e)}${btnVideoMini(e)}</div>${dosis?`<div class="ec-main">${dosis}</div>`:""}${chips?`<div class="ec-chips">${chips}</div>`:""}${e.nota?`<div class="ec-nota">📝 ${esc(e.nota)}</div>`:""}${e.prog?`<div class="ec-nota">📈 ${esc(e.prog)}</div>`:""}</div>`};
    const separar=!plan;
    const itemsRes=separar?g.items.filter(it=>esResis(it.x)):[];
    const itemsFza=separar?g.items.filter(it=>!esResis(it.x)):g.items;
    if(itemsRes.length&&!itemsFza.length) return cab+itemsRes.map(tarjeta).join("");
    const gItems=itemsFza;
    const cab2=(!plan&&gItems.length)?`<div class="ghead2"><span>Ejercicio</span><span>Series</span><span>Reps</span><span>Carga</span><span>Estado</span><span>RIR</span><span>RPE</span></div>`:"";
    return cab+itemsRes.map(tarjeta).join("")+cab2+gItems.map(({x,bi,ei},idx)=>{const e=normEj(x),k=bi+"-"+ei,r=R[k]||{};const sep=idx>0&&letra(x)!==letra(gItems[idx-1].x)?" sep":"";
      const dosis=[e.ser,e.rep].filter(v=>String(v).trim()!=="").map(v=>esc(String(v))).join(" × ");
      if(plan){
        const hecho=[r.rir!==undefined&&r.rir!==""?`RIR ${esc(String(r.rir).replace(".",","))}`:"",r.rpe!==undefined&&r.rpe!==""?`RPE ${esc(String(r.rpe).replace(".",","))}`:""].filter(Boolean).join(" · ");
        return `<div class="grow xp${sep}">
      <div class="gname">${e.cod?`<b>${esc(e.cod)}</b> `:""}<input class="pl pl-ej" data-pk="${k}" data-pf="ej" value="${esc(e.ej)}" placeholder="Ejercicio">${btnVideoMini(e)}</div>
      <div class="xpg">
        <div class="xf"><i>Series</i><input class="pl" data-pk="${k}" data-pf="ser" value="${esc(e.ser)}"></div>
        <div class="xf"><i>Reps</i><input class="pl" data-pk="${k}" data-pf="rep" value="${esc(e.rep)}"></div>
        <div class="xf"><i>Intensidad</i><input class="pl pl-int" data-pk="${k}" data-pf="int" value="${esc(e.int)}" placeholder="kg, %, ritmo…"></div>
        <div class="xf"><i>RIR</i><input class="pl" data-pk="${k}" data-pf="rir" inputmode="decimal" value="${esc(e.rir)}"></div>
        <div class="xf"><i>RPE</i><input class="pl" data-pk="${k}" data-pf="rpe" inputmode="decimal" value="${esc(e.rpe)}"></div>
      </div>
      <div class="xf xvid"><i>Vídeo</i><input class="pl pl-vid" type="url" inputmode="url" data-pk="${k}" data-pf="video" value="${esc(e.video)}" placeholder="Enlace del vídeo (vacío = sin vídeo)"></div>
      ${e.nota?`<div class="gsub">📝 ${esc(e.nota)}</div>`:""}${hecho?`<div class="gsub">✅ Lo que hizo: ${hecho}</div>`:""}
    </div>`}
      const kgPlan=/^\s*(\d+(?:[.,]\d+)?)\s*kg\s*$/i.exec(String(e.int??""));   // kg planificados: van en la casilla Kg, no bajo el nombre
      const det=[e.nota?`📝 ${esc(e.nota)}`:"",e.prog?`📈 ${esc(e.prog)}`:""].filter(Boolean).join(" · ");
      return `<div class="grow xr2${sep}">
      <div class="gname">${e.cod?`<b>${esc(e.cod)}</b> `:""}${nombreVideo(e)}${btnVideoMini(e)}</div>
      <input data-k="${k}" data-f="ser" inputmode="numeric" placeholder="${esc(e.ser)}" value="${esc(r.ser)}" ${dis} aria-label="Series hechas">
      <input data-k="${k}" data-f="reps" inputmode="numeric" placeholder="${esc(e.rep)}" value="${esc(r.reps)}" ${dis} aria-label="Reps de la última serie">
      <input data-k="${k}" data-f="int" value="${esc(r.int??(r.kg?r.kg+" kg":""))}" placeholder="${esc(e.int||"kg, gomas, lastre…")}" ${dis} aria-label="Carga: kg, gomas, lastre…">
      ${estadoSel(k,r.estado,dis)}
      ${pick(k,"rir",r.rir,false,editable,e.rir)}
      ${pick(k,"rpe",r.rpe,true,editable,e.rpe)}
      ${det?`<div class="gdet">${det}</div>`:""}
    </div>`}).join("");
  }).join("");
  const hayObj=grupos.some(g=>g.items.some(({x})=>{const e=normEj(x);const res=/['’′]|\bmin\b|\bkm\b|\d\s*h\b/i.test(String(e.rep))||/\bZ\s?[1-8]\b|\bFC\b|min\/km|ritmo/i.test(String(e.int));return !res&&(e.rir||e.rpe)}));
  if(plan) return `<div class="plan-edit">`+bloques+`</div>`+`<p class="obj-ayuda">Puedes escribir directamente en <b>Ejercicio</b>, <b>Series</b>, <b>Reps</b>, <b>Intensidad</b>, <b>Enlace del vídeo</b>, <b>RIR</b> y <b>RPE</b>, y guardar con «Guardar cambios». Para añadir o quitar ejercicios y bloques, usa «Editar».</p>`+`<div class="muted" style="margin-top:10px">Comentario del entrenamiento</div><textarea data-k="s" data-f="com" placeholder="Cómo ha ido la sesión" rows="2">${esc((R.s||{}).com)}</textarea>`;
  return bloques+(hayObj?`<p class="obj-ayuda">En <b>RIR</b> y <b>RPE</b> ves en gris el <b>objetivo</b> que te marca tu entrenador. Tócalo para apuntar lo que has hecho de verdad. En <b>Carga</b> apunta el peso en kg o el material que has usado (gomas, lastre…): con los kilos se calcula tu fuerza estimada.</p>`:"")+`<div class="rpe-tot"><b>RPE total del entrenamiento</b><div class="rpe-tot-pick">${pick("s","rpe",(R.s||{}).rpe,true,editable)}</div></div><div class="rpe-tot"><b>Duración del entrenamiento (min)</b><div class="rpe-tot-pick"><input data-k="s" data-f="min" inputmode="numeric" placeholder="min" value="${esc((R.s||{}).min??"")}" ${dis} style="margin:0;text-align:center;font-weight:700"></div></div><div class="muted" style="margin-top:10px">Comentario del entrenamiento</div><textarea data-k="s" data-f="com" placeholder="Cómo ha ido la sesión" rows="2" ${dis}>${esc((R.s||{}).com)}</textarea>${conLeyenda?`<div style="margin-top:12px">${leyendaRPE()}</div>`:""}`;
}
// Lee lo que el entrenador haya escrito en la tarjeta (ejercicio, series, reps, intensidad)
function leerPlan(raiz,s){
  const bloques=JSON.parse(JSON.stringify(s.bloques||[]));
  const gemelo={ej:"ejercicio",ser:"series",rep:"reps",int:"intensidad",rir:"rir_objetivo",rpe:"rpe_objetivo"};
  raiz.querySelectorAll("[data-pf]").forEach(el=>{
    const p=String(el.dataset.pk||"").split("-"), bi=+p[0], ei=+p[1];
    const b=bloques[bi]; if(!b||!Array.isArray(b.ejercicios)||!b.ejercicios[ei]) return;
    const ej=b.ejercicios[ei], f=el.dataset.pf;
    ej[f]=el.value.trim();
    if(gemelo[f] in ej) delete ej[gemelo[f]];   // evita que quede el nombre antiguo del campo
  });
  return bloques;
}
function leerRegistro(raiz){
  const reg={};
  raiz.querySelectorAll("[data-k]").forEach(el=>{const k=el.dataset.k;reg[k]=reg[k]||{};reg[k][el.dataset.f]=el.classList.contains("pick")?el.dataset.v:el.value});
  // La carga se escribe en «Carga» (kg, gomas, lastre…). Si trae kilos, se guardan también como kg.
  Object.values(reg).forEach(r=>{
    if(r.int===undefined) return;
    const t=String(r.int).replace(",",".");
    const m=t.match(/(\d+(?:\.\d+)?)\s*kg/i)||t.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
    r.kg=m?m[1]:"";
  });
  return reg;
}
function estadisticas(sesiones){
  const rpe=[],rir=[];let reps=0;
  sesiones.forEach(s=>Object.entries(s.registro||{}).forEach(([k,v])=>{
    if(!/^\d+-\d+$/.test(k)) return;
    const p=parseFloat(String(v.rpe).replace(",","."));if(!isNaN(p))rpe.push(p);
    const q=parseFloat(String(v.rir).replace(",","."));if(!isNaN(q))rir.push(q);
    const n=parseInt(v.reps,10);if(!isNaN(n))reps+=n;
  }));
  const media=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):"–";
  return {sesiones:sesiones.length,rpe:media(rpe),rir:media(rir),reps};
}
/* ---------- Mensaje de motivación al completar un entreno ---------- */
const MOTIV={
  general:[
    "Buen trabajo, {nombre}. Cada sesión que cierras suma.",
    "Hecho. Lo que cuenta es la constancia, y hoy la has tenido.",
    "{nombre}, otra sesión completada. Así se construye el progreso.",
    "Sesión terminada. Descansa bien, que toca seguir.",
    "Eso es disciplina: has venido y lo has hecho.",
    "Bien hecho, {nombre}. Lo difícil ya está y lo has cumplido.",
    "Cada entreno completado te acerca al objetivo. Sigue así.",
    "Registrado. Tu cuerpo ya está asimilando el trabajo.",
    "{nombre}, hoy has hecho lo que tocaba. Eso vale mucho.",
    "Un paso más en el plan. Ahora cuida la recuperación.",
    "«{ses}» completado. Lo que hoy pones, mañana se nota.",
    "Otra pieza del plan encajada. Buen trabajo, {nombre}."
  ],
  fuerza:[
    "Fuerza completada, {nombre}. Cada serie cuenta.",
    "Entreno de fuerza hecho. Tus músculos ya lo están notando.",
    "Buen trabajo en el gimnasio. Recupera y vuelve con ganas.",
    "«{ses}» terminado. La fuerza se construye sesión a sesión."
  ],
  running:[
    "Running hecho{kmTxt}. Cada kilómetro cuenta, {nombre}.",
    "Buen rodaje{kmTxt}. La resistencia se construye así.",
    "Sesión de running completada{kmTxt}. Hidrátate y estira un poco.",
    "{nombre}, {ses} registrado{kmTxt}. Sigue la planificación y el progreso llegará."
  ],
  dura:[
    "{nombre}, RPE {rpe}: sesión exigente y la has sacado. Eso es carácter.",
    "Sesión dura completada con RPE {rpe}. Ahora recupera bien, lo has ganado.",
    "Esfuerzo alto y lo has cumplido. Ese es el trabajo que más cuenta.",
    "Con un RPE {rpe} has empujado de verdad. Duerme y come bien esta noche."
  ],
  suave:[
    "Sesión de base hecha. Estos días sostienen todo lo demás.",
    "RPE {rpe}, controlado y bien hecho. Lo fácil también se entrena.",
    "Trabajo tranquilo completado. Guardas energía para la próxima.",
    "Hoy tocaba suave y lo has cumplido, {nombre}."
  ]
};
function motivarCompletado({tipo,rpe,km,ses}){
  const nombre=((S&&S.perfil&&S.perfil.nombre)||"").trim().split(/\s+/)[0]||"";
  const r=Number(String(rpe??"").replace(",","."));
  const tieneRpe=Number.isFinite(r);
  const grupos=[MOTIV.general, tipo==="resis"?MOTIV.running:MOTIV.fuerza];
  if(tieneRpe&&r>=8) grupos.push(MOTIV.dura); else if(tieneRpe&&r<=4) grupos.push(MOTIV.suave);
  let pool=grupos.flat().filter(f=>tieneRpe||!f.includes("{rpe}"));
  // No repetir las últimas frases que ha visto
  let recientes=[]; try{recientes=JSON.parse(localStorage.getItem("motiv_recientes")||"[]")}catch(e){}
  const libres=pool.filter(f=>!recientes.includes(f));
  const elegida=(libres.length?libres:pool)[Math.floor(Math.random()*(libres.length||pool.length))];
  try{localStorage.setItem("motiv_recientes",JSON.stringify([elegida,...recientes].slice(0,6)))}catch(e){}
  const kmN=Number(String(km??"").replace(",","."));
  const txt=elegida
    .replace(/, \{nombre\}/g,nombre?`, ${nombre}`:"").replace(/\{nombre\}, /g,nombre?`${nombre}, `:"").replace(/\{nombre\}/g,nombre)
    .replace(/\{rpe\}/g,tieneRpe?String(r).replace(".",","):"")
    .replace(/\{ses\}/g,ses||"la sesión")
    .replace(/\{kmTxt\}/g,Number.isFinite(kmN)&&kmN>0?` (${String(kmN).replace(".",",")} km)`:"");
  return txt.replace(/\s+([.,])/g,"$1").replace(/\s{2,}/g," ").trim();
}
function mostrarMotivacion(txt){
  let el=document.getElementById("motiv");
  if(!el){el=document.createElement("div");el.id="motiv";el.className="motiv";document.body.appendChild(el)}
  el.innerHTML=`<span class="motiv-emo">${["🔥","💪","🏆","🙌","⭐","🚀","🎯","👏"][Math.floor(Math.random()*8)]}</span><p>${esc(txt)}</p><button class="sec" type="button">Cerrar</button>`;
  el.classList.add("on");
  el.querySelector("button").onclick=()=>el.classList.remove("on");
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove("on"),15000);
}
function tituloSesion(s){
  return `${esc(s.titulo||"Sesión")}${s.fecha&&s.fecha!==s.titulo?` <span class="muted">· ${esc(s.fecha)}</span>`:""}`;
}

/* ---------- Editor de sesión (entrenador) ---------- */
// Biblioteca de ejercicios: solo nombre y enlace de YouTube (los vídeos no se guardan en Supabase)
let BIB=[];
async function cargarBiblioteca(){
  try{BIB=(await db("GET","biblioteca","?order=nombre.asc&select=*"))||[]}catch(e){BIB=[]}
  return BIB;
}
// Rellena los desplegables de biblioteca sin tocar el resto del formulario
function rellenarBib(ov){
  ov.querySelectorAll(".e-bib").forEach(sel=>{
    const v=sel.value;
    sel.innerHTML=BIB.length
      ? `<option value="">— Elegir de la biblioteca —</option>`+BIB.map((b,i)=>`<option value="${i}">${esc(b.nombre)}</option>`).join("")
      : `<option value="">Biblioteca vacía</option>`;
    sel.value=v;
  });
}
/* ---------- Editar una sesión como texto (copiar y pegar) ----------
 * Una línea por ejercicio. Se puede escribir de corrido: «A1 Sentadilla goblet 3x10 10kg RIR 2-3 descanso 90s»
 * o por columnas separadas con | (o pegadas de Excel, con tabuladores):
 * Código | Ejercicio | Series | Reps | Intensidad | RIR | RPE | Progresión | Nota | Vídeo
 * «# Nombre» empieza un bloque. Las líneas que empiezan por // no cuentan. */
const COLS_EJ=["cod","ej","ser","rep","int","rir","rpe","prog","nota","video"];
const esCodigo=t=>/^[A-Z]{1,2}\d{0,2}[a-z]?$/i.test(String(t).trim())&&String(t).trim().length<=4;
function lineaAEj(l){
  let cols=null;
  if(l.includes("\t")) cols=l.split("\t");
  else if(l.includes("|")) cols=l.split("|");
  if(cols){
    cols=cols.map(c=>c.trim());
    const conCod=cols[0]===""||esCodigo(cols[0]);
    const nombres=conCod?COLS_EJ:COLS_EJ.slice(1);
    const o={}; nombres.forEach((k,i)=>{ if(cols[i]!==undefined) o[k]=cols[i]; });
    if(/^\d+(?:[.,]\d+)?$/.test(String(o.int??"").trim())) o.int=String(o.int).trim()+" kg";   // un número solo en la columna de kg son kilos
    return normEj(o);
  }
  // escrito de corrido
  let t=l.trim(), o={};
  const v=t.match(/https?:\/\/\S+/); if(v){o.video=v[0];t=t.replace(v[0]," ")}
  const pr=t.match(/\b(?:progresi[oó]n|prog\.?)\s*:\s*(.+?)(?=\s+\bnota\s*:|$)/i); if(pr){o.prog=pr[1].trim();t=t.replace(pr[0]," ")}
  const no=t.match(/\bnota\s*:\s*(.+)$/i); if(no){o.nota=no[1].trim();t=t.replace(no[0]," ")}
  const c=t.match(/^\s*([A-Z]{1,2}\d{1,2}[a-z]?)[\s.):\-]+/); if(c){o.cod=c[1];t=t.slice(c[0].length)}
  // Series × reps: "3x10", "4 x 8-10", "3×6"
  const sr=t.match(/\b(\d+)\s*[x×]\s*(\d+(?:\s*[-–\/]\s*\d+)*)(?:\s*(?:s|seg)\b)?(?![\w])/i); if(sr){o.ser=sr[1];o.rep=sr[2].replace(/\s+/g,"");t=t.replace(sr[0]," ")}
  // RIR y RPE objetivo: "RIR 2", "RIR 2-3", "RPE 7,5"
  const ri=t.match(/\bRIR\s*(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)/i); if(ri){o.rir=ri[1].replace(/\s+/g,"");t=t.replace(ri[0]," ")}
  const rp=t.match(/\bRPE\s*(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)/i); if(rp){o.rpe=rp[1].replace(/\s+/g,"");t=t.replace(rp[0]," ")}
  // Carga: "10kg", "10 kg", "80%"
  const kgm=t.match(/(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(kg|%)(?![\wáéíóúñ])/i); if(kgm){o.int=kgm[1]+" "+kgm[2];t=t.replace(kgm[0]," ")}
  // Descanso: se guarda como nota
  const de=t.match(/\bdescanso\s*:?\s*\d+\s*(?:s|seg|min|m)?\b/i); if(de){o.nota=[o.nota,de[0].trim()].filter(Boolean).join(" · ");t=t.replace(de[0]," ")}
  o.ej=t.replace(/\s{2,}/g," ").replace(/\s+[-–:|]\s*$/,"").trim();
  return normEj(o);
}
function textoABloques(txt,bloqueInicial){
  const bloques=[]; let actual=null;
  String(txt||"").split(/\r?\n/).forEach(l0=>{
    const l=l0.replace(/\s+$/,"");
    if(!l.trim()||/^\s*\/\//.test(l)) return;
    const b=l.match(/^\s*#+\s*(.*)$/);
    if(b){actual={nombre:b[1].trim()||"Bloque",seguimiento:true,ejercicios:[]};bloques.push(actual);return}
    if(!actual){actual={nombre:bloqueInicial||"Parte principal",seguimiento:true,ejercicios:[]};bloques.push(actual)}
    const e=lineaAEj(l); if(e.ej||e.cod) actual.ejercicios.push(e);
  });
  return bloques;
}
function bloquesATexto(bloques){
  const cel=v=>String(v??"").replace(/[|\n\t]+/g," ").trim();
  return "// Código | Ejercicio | Series | Reps | Kg | RIR | RPE | Progresión | Nota | Vídeo\n"+
    (bloques||[]).map(b=>`# ${b.nombre||"Bloque"}\n`+(b.ejercicios||[]).map(e0=>{
      const e=normEj(e0); const c=COLS_EJ.map(k=>cel(e[k]));
      while(c.length>2&&c[c.length-1]==="") c.pop();
      return c.join(" | ");
    }).join("\n")).join("\n\n");
}
async function copiarTexto(t){
  try{await navigator.clipboard.writeText(t);return true}
  catch(e){const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand("copy")}catch(x){}a.remove();return ok}
}

function abrirEditor(s,alGuardar,opc={}){
  let modoTexto=true;                                   // la edición de sesiones es solo por texto
  let st={titulo:s.titulo||"",fecha:s.fecha||"",bloques:(s.bloques||[]).map(b=>({nombre:b.nombre||"",seguimiento:esSeguimiento(b),ejercicios:(b.ejercicios||[]).map(normEj)}))};
  const ov=document.createElement("div");
  ov.className="modal";
  ov.innerHTML=`<div class="modal-card"><h3>Editar sesión</h3><div id="ed"></div></div>`;
  document.body.appendChild(ov);
  const leer=()=>({
    titulo:ov.querySelector("#e-tit").value.trim(),
    fecha:ov.querySelector("#e-fe").value.trim(),
    bloques:modoTexto?textoABloques(ov.querySelector("#e-txt").value):[...ov.querySelectorAll(".e-bl")].map(bd=>({
      nombre:bd.querySelector(".e-bn").value.trim(),
      seguimiento:true,
      ejercicios:[...bd.querySelectorAll(".e-ex")].map(tr=>{const o={};tr.querySelectorAll("[data-f]").forEach(i=>o[i.dataset.f]=i.value.trim());return normEj(o)})
    }))
  });
  const pintar=()=>{
    ov.querySelector("#ed").innerHTML=`
      <label>Título <input id="e-tit" value="${esc(st.titulo)}"></label>
      <label>Fecha <span class="row" style="gap:8px"><input id="e-fe" value="${esc(st.fecha)}" placeholder="dd/mm/aaaa" style="flex:1"><input type="date" id="e-fe-d" value="${parseFecha(st.fecha)?isoLocal(parseFecha(st.fecha)):""}" style="flex:1" title="Elegir en el calendario"></span></label>
      <div class="row e-modos">
        <button class="sec" data-act="copiar">📋 Copiar sesión</button>
        <button class="sec" data-act="pegar">📥 Pegar sesión</button>
      </div>
      ${modoTexto?`<p class="muted e-ayuda">Una línea por ejercicio. Puedes escribirlo de corrido (<b>A1 Sentadilla goblet 3x10 10kg RIR 2-3 descanso 90s</b>) y cada dato va a su casilla, o por columnas separadas con <b>|</b>. También puedes pegar filas copiadas de Excel. Con <b># Nombre</b> empiezas un bloque.</p>
      <textarea id="e-txt" class="e-txt" rows="18" spellcheck="false">${esc(bloquesATexto(st.bloques))}</textarea>`:`
      <p class="muted e-ayuda">Consejo: si pegas varias líneas (o filas de Excel) en la casilla de un ejercicio, se crean varios ejercicios de golpe.</p>
      ${st.bloques.map((b,bi)=>`<div class="bloque e-bl">
        <div class="row"><input class="e-bn" value="${esc(b.nombre)}" placeholder="Nombre del bloque" style="flex:1;font-weight:700"><button class="sec" data-act="delb" data-bi="${bi}">Borrar bloque</button></div>
        <div class="ses"><table>
          <tr><th>Código</th><th>Ejercicio y vídeo (YouTube)</th><th>Series</th><th>Reps</th><th>Intensidad / kg</th><th>RIR obj.</th><th>RPE obj.</th><th>Progresión</th><th>Nota</th><th></th></tr>
          ${b.ejercicios.map((e,ei)=>`<tr class="e-ex">
            <td><input data-f="cod" value="${esc(e.cod)}"></td>
            <td><select class="e-bib" style="min-width:150px;margin:0 0 4px;padding:6px;font-size:13px"></select>
              <textarea data-f="ej" rows="2" style="min-width:150px;margin:0 0 4px;padding:6px;font-size:14px">${esc(e.ej)}</textarea>
              <input data-f="video" value="${esc(e.video)}" placeholder="Pega aquí el enlace de YouTube" style="min-width:150px;margin:0;padding:6px;font-size:13px"></td>
            <td><input class="n" data-f="ser" value="${esc(e.ser)}"></td>
            <td><textarea data-f="rep" rows="2" style="min-width:130px;margin:0;padding:6px;font-size:14px">${esc(e.rep)}</textarea></td>
            <td><textarea data-f="int" rows="2" style="min-width:130px;margin:0;padding:6px;font-size:14px">${esc(e.int)}</textarea></td>
                        <td><input class="n" data-f="rir" value="${esc(e.rir)}"></td>
            <td><input class="n" data-f="rpe" value="${esc(e.rpe)}"></td>
            <td><textarea data-f="prog" rows="2" style="min-width:130px;margin:0;padding:6px;font-size:14px">${esc(e.prog)}</textarea></td>
            <td><textarea data-f="nota" rows="2" style="min-width:130px;margin:0;padding:6px;font-size:14px">${esc(e.nota)}</textarea></td>
            <td><button class="danger" data-act="dele" data-bi="${bi}" data-ei="${ei}">×</button></td></tr>`).join("")}
        </table></div>
        <button class="sec" style="margin-top:8px" data-act="adde" data-bi="${bi}">+ Ejercicio</button></div>`).join("")}
      <button class="sec" data-act="addb">+ Bloque</button>`}
      <div class="row" style="margin-top:12px"><button class="gold" data-act="guardar">Guardar cambios</button><button class="sec" data-act="cerrar">Cancelar</button><span class="msg" id="e-m"></span></div>
      <p class="muted">Si borras o añades ejercicios, los registros que ya haya hecho el cliente pueden quedar desplazados. Revísalos después.</p>`;
  rellenarBib(ov);
  };
  // Al elegir un ejercicio de la biblioteca, se copian su nombre y su enlace a la fila
  ov.onchange=ev=>{
    if(ev.target.id==="e-fe-d"&&ev.target.value){const [y,m,d]=ev.target.value.split("-");ov.querySelector("#e-fe").value=`${d}/${m}/${y}`;return}
    const sel=ev.target.closest(".e-bib");if(!sel||sel.value==="")return;
    const b=BIB[+sel.value],tr=sel.closest(".e-ex");
    if(b&&tr){
      tr.querySelector('[data-f="ej"]').value=b.nombre||"";
      tr.querySelector('[data-f="video"]').value=b.video||"";
    }
    sel.value="";
  };
  ov.addEventListener("paste",ev=>{
    if(modoTexto)return;
    const fila=ev.target.closest(".e-ex"); if(!fila)return;
    const t=(ev.clipboardData||window.clipboardData).getData("text");
    if(!t||!/[\n\t]/.test(t.trim()))return;          // una sola cosa: pegado normal en la casilla
    ev.preventDefault();
    const bloqueDom=fila.closest(".e-bl"), bi=[...ov.querySelectorAll(".e-bl")].indexOf(bloqueDom), ei=[...bloqueDom.querySelectorAll(".e-ex")].indexOf(fila);
    st=leer();
    const nuevos=textoABloques(t,st.bloques[bi].nombre);
    const vacia=e=>!COLS_EJ.some(k=>String(e[k]||"").trim());
    const lista=st.bloques[bi].ejercicios, quitar=vacia(lista[ei])?1:0;
    lista.splice(quitar?ei:ei+1,quitar,...nuevos[0].ejercicios);
    st.bloques.splice(bi+1,0,...nuevos.slice(1));
    pintar();
    const m=ov.querySelector("#e-m");m.textContent=`Pegados ${nuevos.reduce((n,b)=>n+b.ejercicios.length,0)} ejercicios`;m.className="msg ok";
  });
  ov.onclick=async ev=>{
    const b=ev.target.closest("[data-act]");if(!b)return;
    const a=b.dataset.act,bi=+b.dataset.bi,ei=+b.dataset.ei;
    st=leer();
    if(a==="cerrar"){ov.remove();return}
    const aviso=(t,ok=true)=>{const m=ov.querySelector("#e-m");m.textContent=t;m.className="msg "+(ok?"ok":"err")};
    if(a==="modo-texto"){modoTexto=true;pintar();const t=ov.querySelector("#e-txt");t.focus();return}
    if(a==="modo-tabla"){modoTexto=false;pintar();return}
    if(a==="copiar"){const ok=await copiarTexto(bloquesATexto(st.bloques));aviso(ok?"Sesión copiada. Abre otra sesión y pulsa «📥 Pegar sesión».":"No se pudo copiar; usa el modo Texto y copia con Ctrl+C",ok);return}
    if(a==="pegar"){
      let t="";try{t=await navigator.clipboard.readText()}catch(e){}
      if(!t){modoTexto=true;pintar();aviso("Pega aquí con Ctrl+V (o mantén pulsado y «Pegar» en el móvil)");ov.querySelector("#e-txt").select();return}
      const nb=textoABloques(t); if(!nb.length){aviso("Lo copiado no tiene ejercicios",false);return}
      if(st.bloques.some(b=>b.ejercicios.length)&&!confirm("¿Sustituir los ejercicios de esta sesión por los copiados?"))return;
      st.bloques=nb;pintar();aviso(`Pegados ${nb.reduce((n,b)=>n+b.ejercicios.length,0)} ejercicios. Revisa y pulsa Guardar.`);return;
    }
    if(a==="addb") st.bloques.push({nombre:"Nuevo bloque",ejercicios:[]});
    if(a==="delb"){if(!confirm("¿Borrar este bloque y sus ejercicios?"))return;st.bloques.splice(bi,1)}
    if(a==="adde") st.bloques[bi].ejercicios.push(normEj({}));
    if(a==="dele") st.bloques[bi].ejercicios.splice(ei,1);
    if(a==="guardar"){
      if(modoTexto&&!st.bloques.some(b=>b.ejercicios.length)&&!confirm("La sesión se quedará sin ejercicios. ¿Guardar igualmente?"))return;
      try{await alGuardar(st);ov.remove()}
      catch(e){const m=ov.querySelector("#e-m");m.textContent=e.message;m.className="msg err"}
      return;
    }
    pintar();
  };
  pintar();
  if(modoTexto){
    const t=ov.querySelector("#e-txt");
    if(opc.pegar!==undefined){
      const nb=opc.pegar?textoABloques(opc.pegar):[];
      if(nb.length){t.value=bloquesATexto(nb);const m=ov.querySelector("#e-m");m.textContent=`Pegados ${nb.reduce((n,b)=>n+b.ejercicios.length,0)} ejercicios en lugar de los anteriores. Revisa y pulsa Guardar.`;m.className="msg ok"}
      else{t.value="";const m=ov.querySelector("#e-m");m.textContent="Pega aquí la sesión con Ctrl+V (en el móvil: mantener pulsado → Pegar) y pulsa Guardar.";m.className="msg ok"}
    }
    t.focus();
  }
  cargarBiblioteca().then(()=>rellenarBib(ov));
}

/* ---------- Historial de entrenamientos realizados ---------- */
function hecho(s){
  return Object.values(s.registro||{}).some(v=>v&&Object.entries(v).some(([f,x])=>f!=="estado"&&x!==""&&x!=null));
}
function tabHistorial(ses,cliente=false,res=[]){
  const hechos=ses.filter(hecho);
  const e=estadisticas(hechos);
  const resHechas=res.filter(resHecha).length;
  // Página del entrenado: sesiones planificadas, completadas y RPE medio
  const stats=cliente
    ? `<div class="stat">Sesiones planificadas<b>${ses.length+res.length}</b></div><div class="stat">Sesiones completadas<b>${hechos.length+resHechas}</b></div><div class="stat">RPE medio<b>${e.rpe}</b></div><div class="stat">Racha<b>${rachaSemanas(hechos)} sem.</b></div>`
    : `<div class="stat">Realizados<b>${e.sesiones}</b></div><div class="stat">RPE medio<b>${e.rpe}</b></div><div class="stat">RIR medio<b>${e.rir}</b></div><div class="stat">Reps totales<b>${e.reps}</b></div>`;
  return `<div class="stats${cliente?" cli-stats":""}">${stats}</div>
    ${cliente?'<div id="hist-prog"></div>':""}
    ${cliente
      ? (ses.length+res.length
          ? [...ses.map(s=>({s,f:s.fecha,res:false})),...res.map(p=>({s:p,f:p.fecha,res:true}))]
              .sort((a,b)=>((parseFecha(b.f)||0)-(parseFecha(a.f)||0))).map(({s,res:esRes})=>{
            if(esRes){const h=resHecha(s);return `<details class="card sesion res${h?" hecha":""}"><summary class="dia-sum">${badgeFecha(s)}<h3>${esc(resPartes(s)[0])}</h3><small class="muted">${h?"Hecha ✓":"Pendiente"}</small></summary>
          <div style="margin-top:10px">${s.descripcion?textoClaro(s.descripcion):'<p class="muted">Sin detalles</p>'}</div></details>`}
            const h=hecho(s);return `<details class="card sesion${h?" hecha":""}"><summary class="dia-sum">${badgeFecha(s)}<h3>${nombreEntreno(s)}</h3><small class="muted">${h?"Hecha ✓":"Pendiente"}</small></summary>
          <div style="margin-top:10px">${sesionHTML(s,false)}</div></details>`}).join("")
          : '<p class="muted">Todavía no tienes entrenamientos. Aparecerán aquí en cuanto tu entrenador los programe.</p>')
      : (hechos.length
          ? hechos.map(s=>`<details class="card"><summary><b>${tituloSesion(s)}</b></summary>
          <div style="margin-top:10px">${sesionHTML(s,false)}</div></details>`).join("")
          : '<p class="muted">Todavía no hay entrenamientos realizados. Aparecerán aquí cuando se guarde el registro.</p>')}`;
}
async function tabHistorialCliente(host="#tab"){
  const [ses,res]=await Promise.all([
    db("GET","sesiones",`?cliente_id=eq.${S.user.id}&order=created_at.desc&select=*`),
    sesionesResistencia(S.user.id)
  ]);
  const hechos=ses.filter(hecho);
  $(host).innerHTML=tabHistorial(ses,true,res);
  const cont=$(host).querySelector("#hist-prog");
  const { mapa, orden } = progresoDatos(hechos);
  cont.innerHTML=progresoCargaHTML(mapa,orden,hechos);
  cont.insertAdjacentHTML("beforeend",await recordsRunning(S.user.id));
  const sel=cont.querySelector("#prog-ej"), svg=cont.querySelector("#prog-svg");
  if(sel) sel.onchange=()=>svg.innerHTML=graficoEj(mapa.get(sel.value)||[]);
  if(sel) svg.innerHTML=graficoEj(mapa.get(sel.value)||[]);
  // Running / trail realizados (sesiones de resistencia): se ven aquí y se pueden volver a dejar pendientes
  try{
    const fd=k=>{const [y,m,d]=String(k||"").slice(0,10).split("-");return d?`${d}/${m}/${y}`:"Sin fecha"};
    const at=await db("GET","atletas",`?user_id=eq.${S.user.id}&select=id`);
    const ids=at.map(a=>a.id).join(",");
    const rs=ids?await db("GET","sesiones_planificadas",`?atleta_id=in.(${ids})&estado=eq.hecha&order=fecha.desc&select=*`):[];
    const box=document.createElement("div"); box.id="hist-res";
    box.innerHTML=`<h3 class="hist-tit">🏃 Running / trail realizados (${rs.length})</h3>`+(rs.length?rs.map(p=>{
      const nom=resPartes(p)[0]||"Running";
      const r=p.rpe!=null&&p.rpe!==""?String(p.rpe).replace(".",","):"–";
      const carga=(p.rpe!=null&&p.rpe!==""&&p.duracion_real_min)?Math.round(Number(p.rpe)*Number(p.duracion_real_min)):null;
      return `<details class="card"><summary><b>${fd(p.fecha)}</b> · ${esc(nom)} · RPE ${r}</summary>
        <p class="muted">${p.km_reales?esc(String(p.km_reales))+" km · ":""}${p.duracion_real_min?esc(String(p.duracion_real_min))+" min · ":""}${carga!=null?"sRPE "+carga:""}</p>
        ${p.comentario_entrenador?`<p><b>Comentario del entrenador:</b> ${esc(p.comentario_entrenador)}</p>`:""}
        ${p.notas_atleta?`<p><b>Tus notas:</b> ${esc(p.notas_atleta)}</p>`:""}
        <div class="row"><button class="sec" data-hrev="${p.id}">↩ Dejar pendiente para repetirla</button><span class="muted" data-hrst="${p.id}"></span></div></details>`;
    }).join(""):`<p class="muted">Todavía no hay running realizado.</p>`);
    $(host).appendChild(box);
    box.querySelectorAll("[data-hrev]").forEach(b=>b.onclick=async()=>{
      const st=box.querySelector(`[data-hrst="${b.dataset.hrev}"]`);
      try{await db("PATCH","sesiones_planificadas",`?id=eq.${b.dataset.hrev}`,{estado:"pendiente"},"return=minimal");st.textContent="Vuelve a aparecer como pendiente en Mi entrenamiento"}
      catch(e){st.textContent="Error: "+e.message}
    });
  }catch(e){ /* sin running que mostrar */ }
}

// Semana (lunes) de una sesión; usa la fecha de la sesión o, si no se entiende, la de creación
function claveSemana(s){
  let d=parseFecha(s.fecha||s.titulo);
  d=d?new Date(d):new Date(s.created_at);
  if(isNaN(d)) return null;
  d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7));
  return isoLocal(d);
}
// Racha: semanas seguidas con al menos una sesión completada, contando hacia atrás desde esta semana (o la anterior)
function rachaSemanas(hechos){
  const semanas=new Set(hechos.map(claveSemana).filter(Boolean));
  const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7));
  if(!semanas.has(isoLocal(d))) d.setDate(d.getDate()-7);
  let n=0;
  while(semanas.has(isoLocal(d))){n++; d.setDate(d.getDate()-7)}
  return n;
}
// Carga en kg de una marca del registro (solo cifras seguidas de "kg")
function kgDe(v){
  if(v?.kg!==undefined&&v.kg!==""&&!isNaN(parseFloat(v.kg))) return parseFloat(v.kg);
  const m=String(v?.int??"").replace(",",".").match(/(\d+(?:\.\d+)?)\s*kg/i);
  return m?parseFloat(m[1]):null;
}
// Mejor carga por ejercicio y sesión (cronológico)
function progresoDatos(hechos){
  const mapa=new Map();
  [...hechos].reverse().forEach(s=>{
    Object.entries(s.registro||{}).forEach(([k,v])=>{
      if(!/^\d+-\d+$/.test(k)) return;
      const [bi,ei]=k.split("-").map(Number);
      const e=normEj(((s.bloques||[])[bi]||{}).ejercicios?.[ei]);
      const nombre=(e.ej||"").trim(); const kg=kgDe(v);
      if(!nombre||kg==null) return;
      const lista=mapa.get(nombre)||[];
      const fecha=s.fecha||s.titulo||"";
      const previo=lista.find(p=>p.fecha===fecha);
      if(previo) previo.kg=Math.max(previo.kg,kg); else lista.push({fecha,kg});
      mapa.set(nombre,lista);
    });
  });
  const orden=[...mapa.keys()].sort((a,b)=>mapa.get(b).length-mapa.get(a).length);
  return {mapa,orden};
}
/* ---------- Récords (fuerza y running) ---------- */
const fmtKg=x=>String(Math.round(x*10)/10).replace(".",",");
const fmtRitmo=seg=>{const t=Math.round(seg),m=Math.floor(t/60),x=t%60;return `${m}:${String(x).padStart(2,"0")}`};
// Mejor carga por ejercicio y su 1RM estimado (Epley, solo con 1-10 repeticiones)
function recordsFuerza(hechos){
  const m=new Map();
  [...hechos].reverse().forEach(s=>Object.entries(s.registro||{}).forEach(([k,v])=>{
    if(!/^\d+-\d+$/.test(k)) return;
    const [bi,ei]=k.split("-").map(Number);
    const e=normEj(((s.bloques||[])[bi]||{}).ejercicios?.[ei]);
    const nombre=(e.ej||"").trim(), kg=kgDe(v);
    if(!nombre||kg==null) return;
    const fecha=s.fecha||"", reps=parseInt(v.reps,10);
    const e1=(reps>=1&&reps<=10)?kg*(1+reps/30):null;
    const r=m.get(nombre)||{n:nombre,kg:null,e1:null};
    if(r.kg==null||kg>r.kg.v) r.kg={v:kg,fecha};
    if(e1!=null&&(r.e1==null||e1>r.e1.v)) r.e1={v:Math.round(e1*10)/10,fecha,kg,reps};
    m.set(nombre,r);
  }));
  return [...m.values()].sort((a,b)=>b.kg.v-a.kg.v);
}
function recordsFuerzaHTML(recs){
  if(!recs.length) return `<p class="muted">Todavía no hay cargas registradas en kg.</p>`;
  return `<div class="recs">${recs.map(r=>`<div class="rec"><span>${esc(r.n)}</span><b>${fmtKg(r.kg.v)} kg</b><small class="muted">${esc(r.kg.fecha)}${r.e1?` · 1RM est. ${fmtKg(r.e1.v)} kg`:""}</small></div>`).join("")}</div>`;
}
// Running: distancia máxima, mejor ritmo medio por distancia y mayor desnivel (de las actividades de Strava)
async function recordsRunning(userId){
  let acts=[];
  try{
    const at=await db("GET","atletas",`?user_id=eq.${userId}&select=id`);
    if(at.length) acts=await db("GET","actividades",`?atleta_id=in.(${at.map(a=>a.id).join(",")})&select=fecha,tipo,nombre,distancia_m,duracion_s,desnivel_m`)||[];
  }catch(e){return ""}
  const car=acts.filter(a=>/run|trail/i.test(a.tipo||"")&&a.distancia_m>0);
  if(!car.length) return "";
  const filas=[];
  const mayor=car.reduce((a,b)=>b.distancia_m>a.distancia_m?b:a);
  filas.push(["Distancia más larga",`${(mayor.distancia_m/1000).toFixed(2).replace(".",",")} km`,mayor.fecha]);
  [[5,"Mejor ritmo medio · 5 km o más"],[10,"Mejor ritmo medio · 10 km o más"],[21,"Mejor ritmo medio · 21 km o más"]].forEach(([km,lab])=>{
    const c=car.filter(a=>a.distancia_m>=km*1000&&a.duracion_s).map(a=>({fecha:a.fecha,seg:a.duracion_s/(a.distancia_m/1000)})).sort((a,b)=>a.seg-b.seg)[0];
    if(c) filas.push([lab,`${fmtRitmo(c.seg)} /km`,c.fecha]);
  });
  const desn=car.filter(a=>a.desnivel_m>0);
  if(desn.length){const d=desn.reduce((a,b)=>b.desnivel_m>a.desnivel_m?b:a); filas.push(["Mayor desnivel",`+${Math.round(d.desnivel_m)} m`,d.fecha]);}
  return `<div class="card"><h3>Récords de running</h3><div class="recs">${filas.map(([n,v,f])=>`<div class="rec"><span>${esc(n)}</span><b>${v}</b><small class="muted">${esc(String(f||"").slice(0,10))}</small></div>`).join("")}</div></div>`;
}
function progresoCargaHTML(mapa,orden,hechos=[]){
  if(!orden.length) return `<div class="card"><h3>Progreso</h3><p class="muted">Cuando registres cargas en kg (por ejemplo "40 kg") verás aquí tu evolución y tus récords.</p></div>`;
  return `<div class="card">
    <h3>Récords de fuerza</h3>
    ${recordsFuerzaHTML(recordsFuerza(hechos))}
  </div>
  <div class="card">
    <h3>Progreso de carga</h3>
    <select id="prog-ej">${orden.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>
    <svg id="prog-svg" viewBox="0 0 320 170" class="grafica" role="img" aria-label="Progreso de carga"></svg>
  </div>`;
}
function graficoEj(puntos){
  if(puntos.length<2) return `<text x="160" y="90" text-anchor="middle" class="muted" font-size="13">Hacen falta al menos 2 sesiones con carga</text>`;
  const W=320,H=170,pl=36,pr=12,pt=14,pb=28;
  const vals=puntos.map(p=>p.kg), min=Math.min(...vals), max=Math.max(...vals);
  const lo=min===max?min-5:min-(max-min)*0.15, hi=min===max?max+5:max+(max-min)*0.15;
  const x=i=>pl+i*(W-pl-pr)/(puntos.length-1), y=v=>pt+(hi-v)*(H-pt-pb)/(hi-lo);
  const linea=puntos.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const pts=puntos.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5" fill="#b8860b"><title>${esc(p.fecha)}: ${p.kg} kg</title></circle>`).join("");
  return `<line x1="${pl}" y1="${pt}" x2="${pl}" y2="${H-pb}" stroke="#999"/>
    <line x1="${pl}" y1="${H-pb}" x2="${W-pr}" y2="${H-pb}" stroke="#999"/>
    <text x="4" y="${pt+4}" font-size="10" class="muted">${String(+hi.toFixed(1)).replace(".",",")}</text>
    <text x="4" y="${H-pb}" font-size="10" class="muted">${String(+lo.toFixed(1)).replace(".",",")}</text>
    <path d="${linea}" fill="none" stroke="#b8860b" stroke-width="2.5"/>${pts}
    <text x="${pl}" y="${H-8}" font-size="10" class="muted">${esc(puntos[0].fecha)}</text>
    <text x="${W-pr}" y="${H-8}" font-size="10" text-anchor="end" class="muted">${esc(puntos[puntos.length-1].fecha)} · ${String(puntos[puntos.length-1].kg).replace(".",",")} kg</text>`;
}

// 6. Modo oscuro (aplicado a toda la app)
// Cada cuenta tiene su propio modo: se guarda en su perfil y en caché por usuario en este navegador
function claveTema(){
  return "tema2:"+((typeof S!=="undefined"&&S&&S.user&&S.user.id)||"anon");
}
function aplicarTema(oscuro,guardar){
  document.documentElement.classList.toggle("oscuro",!!oscuro);
  try{localStorage.setItem(claveTema(),oscuro?"oscuro":"claro")}catch(e){}
  if(guardar&&typeof S!=="undefined"&&S&&S.user&&S.perfil){
    S.perfil.tema=oscuro?"oscuro":"claro";
    db("PATCH","perfiles",`?id=eq.${S.user.id}`,{tema:S.perfil.tema},"return=minimal").catch(()=>{});
  }
}
function temaOscuro(){
  try{const t=localStorage.getItem(claveTema()); if(t) return t==="oscuro";}catch(e){}
  if(typeof S!=="undefined"&&S&&S.perfil&&S.perfil.tema) return S.perfil.tema==="oscuro";
  return true;
}
aplicarTema(temaOscuro());

/* ---------- Panel del entrenador ---------- */
/* Resumen de la semana (lunes a domingo) para el panel del entrenador */
async function resumenSemanaEntrenador(cs){
  try{
    const activos=cs.filter(c=>modulosDe(c).length);
    if(!activos.length) return "";
    const lunes=new Date(); lunes.setHours(0,0,0,0); lunes.setDate(lunes.getDate()-((lunes.getDay()+6)%7));
    const domingo=new Date(lunes); domingo.setDate(lunes.getDate()+6);
    const ini=isoLocal(lunes), fin=isoLocal(domingo);
    const ids=activos.map(c=>c.id);
    const [ses,ats]=await Promise.all([
      db("GET","sesiones",`?fecha=gte.${ini}&fecha=lte.${fin}&select=cliente_id,fecha,registro`).catch(()=>[]),
      db("GET","atletas",`?user_id=in.(${ids.join(",")})&select=id,user_id`).catch(()=>[])
    ]);
    const atletaDe={}; (ats||[]).forEach(a=>atletaDe[a.id]=a.user_id);
    const aIds=Object.keys(atletaDe);
    const pls=aIds.length ? await db("GET","sesiones_planificadas",`?atleta_id=in.(${aIds.join(",")})&fecha=gte.${ini}&fecha=lte.${fin}&select=atleta_id,estado`).catch(()=>[]) : [];
    const est={};
    const add=(cid,hecha)=>{ if(!cid) return; const e=est[cid]||(est[cid]={prog:0,hech:0}); e.prog++; if(hecha) e.hech++; };
    (ses||[]).forEach(s=>{
      const hecha=Object.values(s.registro||{}).some(v=>v&&Object.entries(v).some(([k,x])=>k!=="estado"&&x!==""&&x!=null));
      add(s.cliente_id,hecha);
    });
    (pls||[]).forEach(p=>add(atletaDe[p.atleta_id],p.estado==="hecha"));
    const conProg=activos.filter(c=>est[c.id]&&est[c.id].prog);
    const hechos=conProg.filter(c=>est[c.id].hech>0);
    const sinReg=conProg.filter(c=>est[c.id].hech===0);
    const sinProg=activos.length-conProg.length;
    const tp=conProg.reduce((a,c)=>a+est[c.id].prog,0), th=conProg.reduce((a,c)=>a+est[c.id].hech,0);
    const corto=d=>d.slice(5).replace("-","/");
    const nom=c=>`<button class="sem-n" data-c="${c.id}">${esc(c.nombre||"Sin nombre")} <small>${est[c.id].hech}/${est[c.id].prog}</small></button>`;
    return `<div class="card sem-resumen">
      <div class="sem-tit">Esta semana <span class="muted">${corto(ini)} – ${corto(fin)}</span></div>
      <div class="sem-stats"><div><b>${th}/${tp}</b><span>entrenos hechos</span></div><div><b>${hechos.length}</b><span>han entrenado</span></div><div><b>${sinReg.length}</b><span>sin registro</span></div></div>
      ${sinReg.length?`<p class="sem-lista"><span>Sin registro todavía:</span> ${sinReg.map(nom).join(" ")}</p>`:""}
      ${sinProg?`<p class="muted sem-pie">${sinProg} ${sinProg===1?"sin entreno":"sin entrenos"} programado${sinProg===1?"":"s"} esta semana.</p>`:""}
    </div>`;
  }catch(e){ return ""; }
}
async function listaClientes(){
  const cs=await db("GET","perfiles","?rol=eq.cliente&order=nombre.asc&select=id,nombre,foto,modulos");
  const pendiente=c=>!modulosDe(c).length;
  cs.sort((a,b)=>(pendiente(b)-pendiente(a))||String(a.nombre||"").localeCompare(String(b.nombre||"")));
  const nPend=cs.filter(pendiente).length;
  const semanaHTML=await resumenSemanaEntrenador(cs);
  const botonEnt=c=>`<button class="ent-abrir${pendiente(c)?" pendiente":""}" data-c="${c.id}">${fotoSegura(c.foto)?`<img class="ent-av" src="${esc(fotoSegura(c.foto))}" alt="">`:`<span class="ent-av ent-ini">${esc((c.nombre||"?")[0].toUpperCase())}</span>`}<span>${esc(c.nombre||"Sin nombre")}${pendiente(c)?'<small class="pend-chip">⏳ sin asignar</small>':""}</span><span class="badge-msg" data-bc="${c.id}"></span></button>`;
  const norm=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const gruposHTML=q=>{const n=norm(q.trim());const f=cs.filter(c=>!n||norm(c.nombre).includes(n));
    if(!f.length) return `<p class="muted">Ningún entrenado coincide con «${esc(q)}».</p>`;
    return [[f.filter(pendiente),"⏳ Sin asignar"],[f.filter(c=>!pendiente(c)),"Activos"]].filter(([l])=>l.length).map(([l,g])=>`<h3 class="ent-grp">${g} (${l.length})</h3><div class="ent-grid">${l.map(c=>botonEnt(c)).join("")}</div>`).join("");};
  shell(`<div id="tab"><div class="an-panel ent-lista">
    <h2 class="ent-tit">Entrenados (${cs.length})</h2>
    ${semanaHTML}
    ${nPend?`<p class="card pend-aviso">⏳ ${nPend===1?"Hay 1 entrenado nuevo":"Hay "+nPend+" entrenados nuevos"} esperando a que le${nPend===1?"":"s"} digas qué entrena${nPend===1?"":"n"}. Ábrelo${nPend===1?"":"s"} y marca Fuerza, Running / trail o las dos.</p>`:""}
    ${cs.length?"":`<p class="muted">Todavía no hay entrenados. Se registran ellos desde la pantalla de inicio.</p>`}
    <input id="ent-buscar" type="search" class="ent-buscar" placeholder="Buscar entrenado…" aria-label="Buscar entrenado">
    <div id="ent-grupos">${gruposHTML("")}</div>
  </div></div>`);
  navSet('<button class="on">Entrenados</button><button id="rescarga">📈 Carga de todos</button>');
  $("#rescarga").onclick=tabResumenCarga;
  const enlazar=()=>document.querySelectorAll("#ent-grupos [data-c]").forEach(b=>b.onclick=()=>fichaCliente(b.dataset.c));
  enlazar();
  document.querySelectorAll(".sem-resumen [data-c]").forEach(b=>b.onclick=()=>fichaCliente(b.dataset.c));
  $("#ent-buscar").oninput=e=>{$("#ent-grupos").innerHTML=gruposHTML(e.target.value);enlazar()};
  refrescarBadges();
}
async function fichaCliente(id){
  const [c]=await db("GET","perfiles",`?id=eq.${id}&select=*`);
  const ses=await db("GET","sesiones",`?cliente_id=eq.${id}&order=created_at.desc&select=*`);
  shell(`<div id="tab"></div>`,c);
  navSet(`<button id="volver">← Clientes</button><button id="ta" class="on">Entrenamientos</button><button id="tf">📈 Carga</button><button id="tb">Anamnesis</button><button id="tc">Historial</button><button id="td">Mensajes<span class="badge-msg" data-bc="${id}"></span></button>`);
  $("#volver").onclick=listaClientes;

  const verEntrenos=()=>{
    $("#tab").innerHTML=`
      ${accesoHTML(c)}
      <div class="row"><label>Subir hoja de Excel <input type="file" id="xls" accept=".xlsx,.xls,.csv"></label></div>
      <div class="msg" id="m"></div>
      <div id="sub"></div>`;
    tabEntrenosCal("#sub",id,true);
    enlazarAcceso(c);
    $("#xls").onchange=async ev=>{
      const f=ev.target.files[0];if(!f)return;
      try{
        const r=await leerExcelResistencia(f);
        if(r){
          ev.target.value="";
          if(!r.validas.length) throw new Error("Es un Excel de resistencia, pero ninguna fila tiene una fecha válida.");
          const cuenta={};r.validas.forEach(v=>cuenta[v.tipo]=(cuenta[v.tipo]||0)+1);
          const resumen=Object.entries(cuenta).map(([t,n])=>`${n} ${RES_NOMBRE[t]||t}`).join(", ");
          if(!confirm(`Es una planificación de RESISTENCIA: ${r.validas.length} sesiones (${resumen}), del ${r.validas[0].fecha} al ${r.validas[r.validas.length-1].fecha}.\n\nSe cargará en el calendario de Resistencia de ${c.nombre||"este cliente"} con su color por tipo. ¿Continuar?`)) return;
          await importarResistencia(c,r.validas);
          msg("#m",`${r.validas.length} sesiones de resistencia cargadas (${resumen}).`,true);
          tabEntrenosCal("#sub",id,true);
          return;
        }
        let lote=await leerExcel(f);
        if(!lote.length) throw new Error("No encuentro datos en el archivo.");
        const deCarrera=lote.filter(esCarrera);
        if(deCarrera.length){
          const conv=deCarrera.map(aResistencia).filter(x=>x.fecha);
          const cuenta={};conv.forEach(v=>cuenta[v.tipo]=(cuenta[v.tipo]||0)+1);
          const resumen=Object.entries(cuenta).map(([t,n])=>`${n} ${RES_NOMBRE[t]||t}`).join(", ");
          const nF=lote.length-deCarrera.length;
          if(!confirm(`En este Excel hay ${deCarrera.length} sesión(es) de carrera/trail (${resumen})${nF?` y ${nF} de fuerza`:""}.\n\nLas de carrera irán a Resistencia con sus colores${nF?" y las de fuerza a Fuerza":""}. Si ya había sesiones esos días, se sustituyen. ¿Continuar?`)) return;
          if(conv.length) await importarResistencia(c,conv);
          lote=lote.filter(s=>!esCarrera(s));
          if(!lote.length){ev.target.value="";fichaCliente(id);return}
        }
        const fechas=new Set(lote.map(s=>s.fecha));
        const previas=ses.filter(s=>fechas.has(s.fecha));
        if(previas.length){
          const conReg=previas.filter(p=>Object.keys(p.registro||{}).length).length;
          if(!confirm(`Ya hay ${previas.length} sesión(es) con esas fechas${conReg?` (${conReg} con registros del cliente)`:""}. Se sustituirán por las nuevas. ¿Continuar?`)) return;
          await db("DELETE","sesiones",`?id=in.(${previas.map(p=>p.id).join(",")})`,null,"return=minimal");
        }
        await db("POST","sesiones","",lote.map(s=>({cliente_id:id,fecha:s.fecha,titulo:s.titulo,bloques:s.bloques,registro:{}})),"return=minimal");
        fichaCliente(id);
      }catch(err){msg("#m",err.message,false)}
    };
  };
  const verAnam=()=>subTabs([["Valoración inicial",()=>anValoracionEntrenador(c,"ini")],["Anamnesis",()=>anamnesisEntrenador(c)],["Valoración funcional",()=>anValoracionEntrenador(c,"fun")],["Test FMS",()=>anValoracionEntrenador(c,"fms")]]);
  const verHist=async()=>{
    $("#tab").innerHTML=tabHistorial(ses)+'<div id="hist-rec"></div>';
    const box=$("#hist-rec"); if(!box) return;
    const fz=recordsFuerza(ses.filter(hecho));
    const run=await recordsRunning(id).catch(()=>"");
    if(!$("#hist-rec")) return;
    box.innerHTML=`<div class="card"><h3>Récords de fuerza</h3>${recordsFuerzaHTML(fz)}</div>${run}`;
  };
  const verMsgs=()=>tabMensajes(id,true);
  // La planificación por zonas y Strava se abren dentro de «Entrenamientos», no en una pestaña aparte
  const verRes=()=>{
    if(!modulosDe(c).includes("resistencia")){$("#tab").innerHTML=`<div class="card"><h3>Running / trail</h3><p class="muted">${esc(c.nombre||"Este cliente")} todavía no tiene activado el apartado de running. Actívalo en Entrenamientos → «Apartados de la app».</p></div>`;return}
    $("#tab").innerHTML=`<div class="row res-vuelta"><button class="sec" id="res-volver">← Volver al calendario</button><b>🏃 Running / trail de ${esc(c.nombre||"este cliente")}</b></div><div id="res-emb"></div>`;
    $("#res-volver").onclick=()=>{$("#ta").click()};
    embebido("#res-emb","atleta="+id);
  };
  window.__verRes=verRes;
  const verCarga=()=>tabCarga("#tab",id,c.nombre);
  pestanas(["ta","tf","tb","tc","td"],[verEntrenos,verCarga,verAnam,verHist,verMsgs]);
  verEntrenos();
  refrescarBadges();
}


/* ---------- Mensajes entrenador ↔ entrenado (texto y audio) ---------- */
async function subirAudio(blob,clienteId){
  const ext=(blob.type||"").includes("mp4")?"m4a":"webm";
  const path=`${clienteId}/${Date.now()}.${ext}`;
  const r=await fetch(`${SB_URL}/storage/v1/object/audios/${path}`,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+S.access,"Content-Type":blob.type||"audio/webm"},body:blob});
  if(!r.ok) throw new Error("No se pudo subir el audio ("+r.status+")");
  return path;
}
async function urlAudio(path){
  const r=await fetch(`${SB_URL}/storage/v1/object/sign/audios/${path}`,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+S.access,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});
  const j=await r.json();
  return j.signedURL?SB_URL+"/storage/v1"+j.signedURL:"";
}
let grabacion=null;
// Graba con el botón dado: el primer toque empieza, el segundo para y entrega el audio a alParar
function grabarAudio(btn,alParar){
  if(grabacion&&grabacion.state==="recording"){grabacion.stop();return}
  if(!btn.dataset.txt) btn.dataset.txt=btn.textContent;
  navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
    const trozos=[]; const rec=new MediaRecorder(stream); grabacion=rec;
    rec.ondataavailable=e=>{if(e.data&&e.data.size) trozos.push(e.data)};
    rec.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());
      btn.textContent=btn.dataset.txt;
      alParar(new Blob(trozos,{type:rec.mimeType||"audio/webm"}));
    };
    rec.start();
    btn.textContent="⏹ Parar y guardar";
  }).catch(e=>alert("No se pudo usar el micrófono: "+e.message));
}
async function borrarAudio(path){
  await fetch(`${SB_URL}/storage/v1/object/audios/${path}`,{method:"DELETE",headers:{apikey:SB_KEY,Authorization:"Bearer "+S.access}});
}
// WhatsApp de Alex: número en formato internacional sin «+» (ej. 34600111222). Vacío = no se muestra el bloque.
const WA_ALEX="34681855603";
function waBloque(){
  if(!WA_ALEX) return "";
  return `<div class="wa-bloque"><b>💬 Contactar a Alex por WhatsApp</b>
    <a class="wa-btn wa-todo" href="https://wa.me/${WA_ALEX}" target="_blank" rel="noopener">Abrir WhatsApp</a></div>`;
}
// Botón para que el entrenador escriba al cliente por WhatsApp (usa el teléfono de su anamnesis)
function waClienteBloque(pf){
  const tel=String((pf&&pf.anamnesis&&pf.anamnesis.telefono)||"").replace(/\D/g,"");
  const nombre=(pf&&pf.nombre)||"el cliente";
  if(!tel) return `<div class="wa-bloque"><b>💬 WhatsApp</b><p class="muted">${esc(nombre)} no tiene teléfono en su anamnesis.</p></div>`;
  const num=tel.length===9?"34"+tel:tel;
  return `<div class="wa-bloque"><b>💬 WhatsApp de ${esc(nombre)}</b>
    <a class="wa-btn wa-todo" href="https://wa.me/${num}" target="_blank" rel="noopener">Abrir chat en WhatsApp</a></div>`;
}
// Chat interno apagado: el contacto se hace por WhatsApp hasta comprobar que la mensajería funciona bien
const MENSAJERIA_INTERNA=false;
// Solo el botón de WhatsApp (cliente: el tuyo; administrador: el del cliente)
async function tabWhatsApp(clienteId,esAdmin,host="#tab"){
  // Mismo bloque de siempre (wa-bloque), con fondo sólido para que se vea sobre cualquier imagen
  const caja="background:#1d1f22;color:#f2f2f2;border-color:#25d366;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:0 2px 10px rgba(0,0,0,.35);text-align:center;margin:24px 0";
  let num=WA_ALEX, titulo="💬 Contactar a Alex por WhatsApp", boton="Abrir WhatsApp";
  let texto="Hola Alex, soy "+((S&&S.perfil&&S.perfil.nombre)||"")+". Te escribo desde la app de Alex Training Lab.";
  if(esAdmin){
    const pf=(await db("GET","perfiles",`?id=eq.${clienteId}&select=nombre`).catch(()=>[]))[0]||{};
    const a=await leerAnamnesis(clienteId).catch(()=>({}));
    num=String((a&&a.telefono)||"").replace(/\D/g,"");
    if(num.length===9) num="34"+num;
    titulo="💬 WhatsApp de "+esc(pf.nombre||"el cliente");
    boton="Abrir chat en WhatsApp";
    texto="Hola "+(pf.nombre||"")+", soy Alex, tu entrenador. Te escribo desde la app de Alex Training Lab.";
  }
  // Respuestas predeterminadas para el cliente (se abren ya escritas en WhatsApp)
  const rapidas=esAdmin?"":[
    ["No he podido acabar el entrenamiento","Hola Alex, no he podido acabar el entrenamiento de hoy. Te cuento: "],
    ["Tengo una duda","Hola Alex, tengo una duda sobre mi entrenamiento: "],
    ["He terminado el entrenamiento","Hola Alex, he terminado el entrenamiento de hoy. Mis sensaciones: "]
  ].map(([l,t])=>`<a class="wa-btn wa-todo" href="https://wa.me/${num}?text=${encodeURIComponent(t)}" target="_blank" rel="noopener">${l}</a>`).join(" ");
  const html=num
    ? `<div class="wa-bloque" style="${caja}"><b>${titulo}</b> <a class="wa-btn wa-todo" href="https://wa.me/${num}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">${boton}</a>${rapidas?`<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center">${rapidas}</div>`:""}</div>`
    : `<div class="wa-bloque" style="${caja}"><b>${titulo}</b><p style="margin:10px 0 0;color:#b8bec4">Todavía no hay teléfono de contacto.${esAdmin?" Añádelo en la valoración inicial del cliente (campo Teléfono) y vuelve a abrir esta pestaña.":""}</p></div>`;
  $(host).innerHTML=html;
}
async function tabMensajes(clienteId,esAdmin,host="#tab"){
  if(!MENSAJERIA_INTERNA) return tabWhatsApp(clienteId,esAdmin,host);
  const ms=await db("GET","mensajes",`?cliente_id=eq.${clienteId}&order=created_at.asc&select=*`);
  let waAdmin="";
  if(esAdmin){ const pf=(await db("GET","perfiles",`?id=eq.${clienteId}&select=nombre`).catch(()=>[]))[0]||{}; pf.anamnesis=await leerAnamnesis(clienteId).catch(()=>({})); waAdmin=waClienteBloque(pf); }
  const porId=new Map(ms.map(m=>[m.id,m]));
  const urls=await Promise.all(ms.map(m=>m.audio_path?urlAudio(m.audio_path):""));
  const burbujas=ms.map((m,i)=>{
    const mio=esAdmin?m.de_admin:!m.de_admin;
    const puedeBorrar=mio||esAdmin;
    const quien=m.de_admin?"Entrenador":"Entrenado";
    const hora=new Date(m.created_at).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"});
    const cuerpo=m.audio_path
      ? (urls[i]?`<audio controls preload="none" src="${urls[i]}"></audio>`:`<span class="muted">Audio no disponible</span>`)
      : `<div class="txt">${esc(m.texto||"")}</div>`;
    const acc=(mio||puedeBorrar)?`<div class="acc">
        ${mio&&m.audio_path?`<button data-regrabar="${m.id}">Regrabar audio</button>`:""}
        ${mio&&!m.audio_path?`<button data-editar="${m.id}">Editar texto</button>`:""}
        ${puedeBorrar?`<button class="danger" data-borrar="${m.id}">Borrar</button>`:""}
      </div>`:"";
    return `<div class="burbuja ${mio?"mia":"suya"}"><small>${quien} · ${hora}</small>${cuerpo}${acc}</div>`;
  }).join("");
  $(host).innerHTML=`
    ${esAdmin?waAdmin:waBloque()}
    <div class="chat" id="chat">${burbujas||'<p class="muted">Todavía no hay mensajes. Escribe o envía un audio.</p>'}</div>
    <div class="chat-caja">
      <textarea id="txt" rows="2" placeholder="Escribe un mensaje"></textarea>
      <div class="row">
        <button class="gold" id="enviar">Enviar texto</button>
        <button id="grabar">🎤 Grabar audio</button>
      </div>
      <div class="msg" id="mm"></div>
    </div>`;
  const chat=$("#chat"); if(chat){chat.scrollTop=chat.scrollHeight;chat.dataset.cli=clienteId;chat.dataset.admin=esAdmin?"1":"0"}
  await marcarLeidos(clienteId,esAdmin);
  refrescarBadges();

  const insertar=async(datos)=>{
    await db("POST","mensajes","",{cliente_id:clienteId,de_admin:!!esAdmin,...datos},"return=minimal");
    tabMensajes(clienteId,esAdmin,host);
  };
  $("#enviar").onclick=async()=>{
    const t=$("#txt").value.trim();
    if(!t) return;
    try{await insertar({texto:t})}catch(e){msg("#mm",e.message,false)}
  };
  $("#grabar").onclick=ev=>grabarAudio(ev.currentTarget,async blob=>{
    try{
      msg("#mm","Subiendo audio…",true);
      const path=await subirAudio(blob,clienteId);
      await insertar({audio_path:path});
    }catch(e){msg("#mm",e.message,false)}
  });

  document.querySelectorAll("[data-borrar]").forEach(btn=>btn.onclick=async()=>{
    const m=porId.get(btn.dataset.borrar);
    if(!confirm(m.audio_path?"¿Borrar este audio?":"¿Borrar este mensaje?")) return;
    try{
      await db("DELETE","mensajes",`?id=eq.${m.id}`,null,"return=minimal");
      if(m.audio_path) await borrarAudio(m.audio_path);
      tabMensajes(clienteId,esAdmin,host);
    }catch(e){msg("#mm",e.message,false)}
  });

  document.querySelectorAll("[data-editar]").forEach(btn=>btn.onclick=()=>{
    const m=porId.get(btn.dataset.editar);
    const burb=btn.closest(".burbuja");
    burb.querySelector(".txt").outerHTML=`<textarea class="edit-txt" rows="3">${esc(m.texto||"")}</textarea>`;
    btn.outerHTML=`<button class="gold" data-guardar="${m.id}">Guardar</button> <button data-cancelar>Cancelar</button>`;
    burb.querySelector("[data-guardar]").onclick=async()=>{
      const t=burb.querySelector(".edit-txt").value.trim();
      if(!t) return;
      try{
        await db("PATCH","mensajes",`?id=eq.${m.id}`,{texto:t},"return=minimal");
        tabMensajes(clienteId,esAdmin,host);
      }catch(e){msg("#mm",e.message,false)}
    };
    burb.querySelector("[data-cancelar]").onclick=()=>tabMensajes(clienteId,esAdmin,host);
  });

  document.querySelectorAll("[data-regrabar]").forEach(btn=>btn.onclick=()=>{
    const m=porId.get(btn.dataset.regrabar);
    grabarAudio(btn,async blob=>{
      try{
        msg("#mm","Subiendo audio nuevo…",true);
        const nuevo=await subirAudio(blob,clienteId);
        await db("PATCH","mensajes",`?id=eq.${m.id}`,{audio_path:nuevo},"return=minimal");
        await borrarAudio(m.audio_path);
        tabMensajes(clienteId,esAdmin,host);
      }catch(e){msg("#mm",e.message,false)}
    });
  });
}
function tabMensajesCliente(){return tabMensajes(S.user.id,false,"#sub")}

/* ---------- Contador de mensajes sin leer ---------- */
async function sinLeer(){
  const esAdmin=S.perfil.rol==="admin";
  const q=esAdmin
    ? "?de_admin=eq.false&leido=eq.false&select=id,cliente_id"
    : `?cliente_id=eq.${S.user.id}&de_admin=eq.true&leido=eq.false&select=id,cliente_id`;
  return (await db("GET","mensajes",q))||[];
}
// Marca como leídos los mensajes de la otra parte en esta conversación
// Usa la función marcar_leidos de Supabase (ver SQL), porque un PATCH directo puede ser bloqueado en silencio por RLS
async function marcarLeidos(clienteId){
  try{
    await db("POST","rpc/marcar_leidos","",{p_cliente:clienteId});
  }catch(e){console.warn("No se pudieron marcar como leídos los mensajes:",e.message)}
}
// Cliente: un globo en "Mensajes". Entrenador: un globo por cada cliente.
async function refrescarBadges(){
  if(!MENSAJERIA_INTERNA) return;
  if(!S||!S.perfil||!document.querySelector(".badge-msg")) return;
  try{
    // Si la conversación está abierta y la pestaña visible, lo que llega ya se está viendo: se marca como leído
    const ch=document.querySelector("#chat");
    if(ch&&ch.dataset.cli&&document.visibilityState==="visible") await marcarLeidos(ch.dataset.cli,ch.dataset.admin==="1");
    const pend=await sinLeer();
    const pon=(el,n)=>{el.textContent=n||"";el.style.display=n?"inline-block":"none"};
    if(S.perfil.rol==="admin"){
      const porCliente={};
      pend.forEach(m=>{porCliente[m.cliente_id]=(porCliente[m.cliente_id]||0)+1});
      document.querySelectorAll(".badge-msg[data-bc]").forEach(el=>pon(el,porCliente[el.dataset.bc]));
    }else{
      document.querySelectorAll(".badge-msg:not([data-bc])").forEach(el=>pon(el,pend.length));
    }
  }catch(e){}
}
// Refresco cada 30 s (sin Realtime)
setInterval(refrescarBadges,30000);

// Nombre que ve el entrenado: el día de la semana (el título interno sigue guardado)
const DIAS_NOMBRE=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const DIAS_CORTO=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
function nombreEntreno(s){const d=parseFecha(s.fecha);return d?`Entreno ${DIAS_NOMBRE[d.getDay()]}`:"Entreno"}
function diaCorto(s){const d=parseFecha(s.fecha);return d?DIAS_CORTO[d.getDay()]:"Entreno"}
function badgeFecha(s){
  const d=parseFecha(s.fecha);
  return `<span class="fecha-badge">${d?`<b>${d.getDate()}</b><small>${MESES_CAL[d.getMonth()].slice(0,3)}</small>`:"<small>—</small>"}</span>`;
}

/* ---------- Resistencia dentro del calendario y del Excel (app unificada) ---------- */
const RES_COLOR={rodaje:"#1976d2",series:"#d32f2f",tirada:"#2e7d32",fuerza:"#7b1fa2",bici:"#f57c00",test:"#00838f",otro:"#607d8b"};
const RES_NOMBRE={rodaje:"Rodaje",series:"Series",tirada:"Tirada larga",fuerza:"Fuerza",bici:"Bici",test:"Test",otro:"Otro"};
const sinAc=t=>String(t??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
function resFechaCelda(v){
  if(v===null||v===undefined||v==="") return null;
  if(v instanceof Date&&!isNaN(v)) return isoLocal(v);
  if(typeof v==="number"){ if(v<20000||v>80000) return null; return new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5).toISOString().slice(0,10); }
  const d=parseFecha(String(v).trim()); return d?isoLocal(d):null;
}
function resTipo(v){
  const t=sinAc(v);
  if(!t) return "otro";
  if(t.includes("serie")||t.includes("interval")||t.includes("cuesta")||t.includes("fartlek")) return "series";
  if(t.includes("tirada")||t.includes("largo")||t.includes("larga")) return "tirada";
  if(t.includes("rodaje")||t.includes("suave")||t.includes("trote")||t.includes("carrera continua")||t.includes("continua")) return "rodaje";
  if(t.includes("fuerza")||t.includes("gimnasio")||t.includes("gym")) return "fuerza";
  if(t.includes("bici")||t.includes("ciclismo")) return "bici";
  if(t.includes("test")) return "test";
  return "otro";
}
// ¿Es un Excel de resistencia? (columnas Fecha/Día + Tipo, sin columna Ejercicio). Devuelve las sesiones o null.
async function leerExcelResistencia(file){
  if(typeof XLSX==="undefined") return null;
  const libro=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
  const filas=[]; let esRes=false;
  const esF=k=>/^(fecha|dia|date)\b/.test(sinAc(k));
  for(const nombreHoja of libro.SheetNames){
    const ws=libro.Sheets[nombreHoja]; if(!ws["!ref"]) continue;
    const m=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
    const visto=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
    // La plantilla de fuerza de siempre nunca es de resistencia
    try{ if(leerPlantilla(ws).length) continue; }catch(e){}
    const cab=m.slice(0,20).findIndex(f=>f.some(esF)&&f.filter(c=>String(c).trim()!=="").length>=2);
    if(cab<0) continue;
    if(m[cab].some(c=>/^ejercicios?$/.test(sinAc(c)))) continue;
    // ¿Es de resistencia? Tiene columna «Tipo», o el contenido habla de rodajes, series, ritmos, km… y no de ejercicios de gimnasio
    const tieneTipo=m[cab].some(c=>sinAc(c).startsWith("tipo"));
    if(!tieneTipo){
      const texto=sinAc(visto.slice(cab+1).map(f=>f.join(" ")).join(" "));
      const cuenta=re=>(texto.match(re)||[]).length;
      const run=cuenta(/\b(rodaje|rodajes|series de|tirada|fartlek|cuestas?|ritmo|ritmos|z[1-5]\b|zona [1-5]|km\b|kms\b|min\/km|\/km|carrera|trail|trote|bici|ciclismo|rodillo|umbral|tempo run|progresivo|ppm|pulsaciones|continua|vo2|aerobic[oa]|desnivel)/g);
      const fuerza=cuenta(/\b(sentadilla|press|peso muerto|remo|dominadas?|zancadas?|hip thrust|curl|plancha|kettlebell|mancuernas?|barra|rir|goblet|jalon|fondos|gemelos|core)\b/g);
      if(!(run>=2&&run>fuerza)) continue;
    }
    esRes=true;
    const titulos=m[cab].map(c=>String(c??"").trim());
    m.slice(cab+1).forEach((f,n)=>{
      const pares=[], fv=visto[cab+1+n]||[];
      f.forEach((v,i)=>{ if(String(v??"").trim()==="") return; pares.push([titulos[i]||"", esF(titulos[i])||fv[i]===undefined||fv[i]===""?v:fv[i]]); });
      if(pares.length) filas.push(pares);
    });
  }
  if(!esRes) return null;
  const es=(k,...ns)=>ns.some(n=>sinAc(k).startsWith(n));
  const todas=[];
  filas.forEach(pares=>{
    let fecha=null,nombre="",tipoTxt="",dur=null; const principal=[],extra=[];
    pares.forEach(([k,v])=>{
      const txt=String(v instanceof Date?isoLocal(v):v).trim();
      if(es(k,"fecha","dia","date")&&resFechaCelda(v)) fecha=resFechaCelda(v);
      else if(es(k,"nombre","sesion","titulo")) nombre=txt;
      else if(es(k,"tipo")) tipoTxt=txt;
      else if(es(k,"duracion","minutos","min","tiempo")&&Number.isFinite(parseInt(txt,10))) dur=parseInt(txt,10);
      else if(es(k,"descripcion","entrenamiento","detalle")) principal.push(txt);
      else extra.push((k?k+": ":"")+txt);
    });
    const texto=[...principal,...extra].join("\n");
    if(!nombre&&!tipoTxt&&!texto) return;
    if(!fecha&&todas.length&&todas[todas.length-1].fecha){
      const ant=todas[todas.length-1], linea=[nombre,tipoTxt,texto].filter(Boolean).join(" · ");
      ant.desc=ant.desc?ant.desc+"\n"+linea:linea; return;
    }
    todas.push({fecha,tipo:resTipo(tipoTxt||nombre||texto),nombre:nombre||tipoTxt||(principal[0]||texto).split("\n")[0].slice(0,60)||"Sesión",desc:texto,duracion_min:dur});
  });
  todas.forEach(t=>{ if(t.desc===t.nombre) t.desc=""; else if(t.desc.startsWith(t.nombre+"\n")) t.desc=t.desc.slice(t.nombre.length+1); });
  todas.sort((a,b)=>String(a.fecha||"9").localeCompare(String(b.fecha||"9")));
  return {todas,validas:todas.filter(x=>x.fecha)};
}
// Ficha de resistencia del cliente: la suya, una sin cuenta que el entrenador elija, o una nueva
async function asegurarFichaRes(c,preguntar=true){
  const suya=await db("GET","atletas",`?user_id=eq.${c.id}&select=id`);
  if(suya.length) return suya[0].id;
  const libres=await db("GET","atletas","?user_id=is.null&select=id,nombre,email&order=nombre.asc");
  let misma=libres.find(a=>norm(a.nombre)===norm(c.nombre));
  if(!misma&&libres.length&&preguntar){
    const r=prompt(`¿${c.nombre||"Este cliente"} ya tenía ficha de resistencia sin cuenta? Escribe su número para unirla, o déjalo vacío para crear una nueva:\n\n`+libres.map((a,i)=>`${i+1}. ${a.nombre||"Sin nombre"}${a.email?" ("+a.email+")":""}`).join("\n"),"");
    const i=parseInt(r,10); if(i>=1&&i<=libres.length) misma=libres[i-1];
  }
  if(misma){ await db("PATCH","atletas",`?id=eq.${misma.id}`,{user_id:c.id,entrenador_id:S.user.id},"return=minimal"); return misma.id; }
  const [nueva]=await db("POST","atletas","",{user_id:c.id,entrenador_id:S.user.id,nombre:c.nombre||"Sin nombre"},"return=representation");
  return nueva.id;
}
// ¿Esta sesión (con formato de fuerza) es en realidad de carrera/trail/bici?
const RE_CARRERA=/\b(rodaje|carrera|tirada|trail|fartlek|cuestas?|trote|series de|z[1-5]|fc ?\d|km|kms|ritmo|ritmos|bici|rodillo|ciclismo|continua|umbral|progresivo|desnivel)\b/;
const RE_FUERZA=/\b(fuerza|sentadilla|press|peso muerto|remo|dominadas?|zancadas?|hip thrust|curl|plancha|kettlebell|mancuernas?|barra|goblet|jalon|gemelos|estructural|core|pliometria|circuito)\b/;
const textoSesion=s=>sinAc([s.titulo,...(s.bloques||[]).flatMap(b=>[b.nombre,...(b.ejercicios||[]).map(e=>{const x=normEj(e);return [x.ej,x.int,x.nota].join(" ")})])].join(" "));
const esCarrera=s=>{const t=textoSesion(s);return RE_CARRERA.test(t)&&!RE_FUERZA.test(t)};
function aResistencia(s){
  const tit=String(s.titulo||"").replace(/\s*[·\-–]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/,"").trim();
  const lineas=[]; let min=0;
  (s.bloques||[]).forEach(b=>{
    const nb=String(b.nombre||"").trim(); if(nb&&!/^parte principal$/i.test(nb)) lineas.push(nb+":");
    (b.ejercicios||[]).forEach(e0=>{
      const e=normEj(e0), rp=String(e.rep||"").trim(), se=String(e.ser||"").trim();
      const vol=se&&se!=="1"&&rp?`${se} × ${rp}`:(rp||(se&&se!=="1"?se+" series":""));
      const m=rp.match(/^(\d+)\s*(?:'|’|min)/i); if(m) min+=(+m[1])*(se&&+se>1?+se:1);
      const datos=[vol,e.int,e.rir?"RIR "+e.rir:"",e.rpe?"RPE "+e.rpe:"",e.nota,e.prog].filter(Boolean).join(" · ");
      lineas.push((e.ej||"Trabajo")+(datos?": "+datos:""));
    });
  });
  let tipo=resTipo(tit); if(tipo==="otro"||tipo==="fuerza") tipo=resTipo(lineas.join(" ")); if(tipo==="fuerza") tipo="otro";
  const d=parseFecha(s.fecha);
  return {fecha:d?isoLocal(d):null,tipo,nombre:tit||RES_NOMBRE[tipo]||"Sesión",desc:lineas.join("\n"),duracion_min:min||null};
}
async function importarResistencia(c,validas){
  const atletaId=await asegurarFichaRes(c);
  const mods=modulosDe(c);
  if(!mods.includes("resistencia")){ const nuevos=[...mods,"resistencia"]; await db("PATCH","perfiles",`?id=eq.${c.id}`,{modulos:nuevos},"return=minimal"); c.modulos=nuevos; }
  const dias=[...new Set(validas.map(v=>v.fecha))];
  await db("DELETE","sesiones_planificadas",`?atleta_id=eq.${atletaId}&estado=neq.hecha&fecha=in.(${dias.join(",")})`,null,"return=minimal");
  const [bloque]=await db("POST","bloques","",{atleta_id:atletaId,nombre:`Importado de Excel el ${isoLocal(new Date())}`,fecha_inicio:validas[0].fecha,fecha_fin:validas[validas.length-1].fecha},"return=representation");
  await db("POST","sesiones_planificadas","",validas.map(v=>({atleta_id:atletaId,bloque_id:bloque.id,fecha:v.fecha,tipo:v.tipo,descripcion:v.nombre+(v.desc?" — "+v.desc:""),duracion_min:v.duracion_min})),"return=minimal");
}
// Sesiones de resistencia de un cliente (para pintarlas en su calendario)
async function sesionesResistencia(clienteId){
  try{
    const at=await db("GET","atletas",`?user_id=eq.${clienteId}&select=id`);
    if(!at.length) return [];
    const ps=await db("GET","sesiones_planificadas",`?atleta_id=in.(${at.map(a=>a.id).join(",")})&select=*&order=fecha.asc`);
    return ps.filter(p=>p.fecha).map(p=>({...p,_res:true,fecha:String(p.fecha).slice(0,10)}));
  }catch(e){return []}
}
const resHecha=p=>p.estado==="hecha";
// Texto de una sesión de resistencia en líneas claras: "Ritmos: 4:10" → Ritmos en negrita
function textoClaro(t){
  return String(t||"").split(/\n+/).map(l=>l.trim()).filter(Boolean).map(l=>{
    const m=l.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ()\/.]{1,28}):\s*(.+)$/);
    return m?`<div class="tl"><b>${esc(m[1])}:</b> ${esc(m[2])}</div>`:`<div class="tl">${esc(l)}</div>`;
  }).join("");
}
const resPartes=p=>{const d=String(p.descripcion||""),i=d.indexOf(" — ");return i>0?[d.slice(0,i),d.slice(i+3)]:[d||RES_NOMBRE[p.tipo]||"Sesión",""]};
const resChip=p=>{const c=RES_COLOR[p.tipo]||RES_COLOR.otro;return `<span class="cal-chip res${resHecha(p)?" ok":""}" style="background:${c};border-color:${c};touch-action:none;cursor:grab" data-chip="r:${p.id}" title="${esc(resPartes(p)[0])}">${resHecha(p)?"✓ ":""}${esc(RES_NOMBRE[p.tipo]||"Resistencia")}</span>`};
const fmtSeg=seg=>{const m=Math.floor(seg/60),x=Math.round(seg%60);return `${m}:${String(x).padStart(2,"0")}`};
function rangoZonaF(n,zonas){
  const r=zonas.find(z=>z.tipo==="ritmo"&&Number(z.zona)===Number(n)), f=zonas.find(z=>z.tipo==="fc"&&Number(z.zona)===Number(n));
  const partes=[]; if(r) partes.push(`${fmtSeg(r.minimo)}–${fmtSeg(r.maximo)} /km`); if(f) partes.push(`${f.minimo}–${f.maximo} ppm`);
  return partes.length?` (${partes.join(" · ")})`:"";
}
const textoPasoF=(ps,zonas)=>{const r=ps.rep||1;let t=(ps.nombre?ps.nombre+": ":"")+(r>1?`${r} × `:"")+`${ps.cantidad} ${ps.unidad||"min"}`;if(ps.zona)t+=` en Z${ps.zona}`+rangoZonaF(ps.zona,zonas||[]);if(ps.rec&&r>1)t+=` · recuperación ${ps.rec} min`;return t};
const ESTADOS_RES={pendiente:"Pendiente",hecha:"Hecha ✓",omitida:"No la he hecho"};
const resTarjeta=(p,admin,zonas,abierta=false,verOn=false)=>{
  const c=RES_COLOR[p.tipo]||RES_COLOR.otro, [tit,desc]=resPartes(p);
  const sel=(v,o)=>Object.entries(o).map(([k,t])=>`<option value="${k}"${String(v??"")===k?" selected":""}>${t}</option>`).join("");
  const pasos=Array.isArray(p.pasos)&&p.pasos.length?`<ol class="res-pasos">${p.pasos.map(ps=>`<li>${esc(textoPasoF(ps,zonas))}</li>`).join("")}</ol>`:"";
  return `<div class="ses-grupo${verOn?" ver-on":""}"><div class="resumen-ver">${esc(resPartes(p)[1]||"Sin descripción")}</div><details class="card sesion-res" data-res="${p.id}" style="border-left:6px solid ${c};background:${c}14"${abierta?" open":""}><summary class="res-sum"><div class="res-tipo" style="color:${c}">🏃 ${esc(RES_NOMBRE[p.tipo]||"Resistencia")}${p.duracion_min?` · ${p.duracion_min} min`:""}${resHecha(p)?' <span class="res-ok">✓ Hecha</span>':""}</div>
    <h3>${esc(tit)}</h3></summary>
    ${desc?`<div class="res-desc">${textoClaro(desc)}</div>`:""}
    ${pasos}
    ${p.comentario_entrenador&&!admin?`<p class="res-com"><b>Tu entrenador:</b> ${esc(p.comentario_entrenador)}</p>`:""}
    <div class="res-reg">
      <div class="res-reg-t">${admin?"Lo que ha registrado el cliente":"Apunta cómo te ha ido"}</div>
      <div class="res-campos">
        <label>Estado <select data-rf="estado">${sel(p.estado||"pendiente",ESTADOS_RES)}</select></label>
        <label>Esfuerzo (RPE 1-10) <select data-rf="rpe"><option value="">–</option>${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option${String(p.rpe)===String(n)?" selected":""}>${n}</option>`).join("")}</select></label>
        <label>Km <input data-rf="km_reales" inputmode="decimal" value="${esc(p.km_reales??"")}"></label>
        <label>Tiempo (mm:ss o h:mm:ss) <input data-rf="duracion_real_min" inputmode="text" placeholder="53:45 o 1:25:40" value="${esc(minutosAHMS(p.duracion_real_min))}"></label>
      </div>
      <label class="res-notas">Notas ${admin?"del cliente":"para tu entrenador"} <textarea data-rf="notas_atleta" rows="2">${esc(p.notas_atleta||"")}</textarea></label>
      ${admin?`<label class="res-notas">Tu comentario (lo verá el cliente) <textarea data-rf="comentario_entrenador" rows="2">${esc(p.comentario_entrenador||"")}</textarea></label>`:""}
      <div class="row"><button class="gold" data-resguardar="${p.id}">Guardar</button>${admin?`<button class="sec" data-reseditar="${p.id}">Editar sesión</button><button class="danger" data-resborrar="${p.id}">Borrar</button>`:""}<span class="muted" data-resst="${p.id}"></span></div>
    </div>
    ${admin?`<div class="res-editar" data-resform="${p.id}" style="display:none">
      <div class="res-campos"><label>Tipo <select data-re="tipo">${sel(p.tipo||"otro",RES_NOMBRE)}</select></label>
      <label>Duración (min) <input data-re="duracion_min" inputmode="numeric" value="${esc(p.duracion_min??"")}"></label>
      <label>Fecha <input type="date" data-re="fecha" value="${esc(p.fecha)}"></label></div>
      <label class="res-notas">Nombre <input data-re="nombre" value="${esc(tit)}"></label>
      <label class="res-notas">Explicación (una idea por línea; «Ritmos: 4:30» sale en negrita) <textarea data-re="desc" rows="5">${esc(desc)}</textarea></label>
      <div class="row"><button class="gold" data-resguardaredit="${p.id}">Guardar sesión</button></div></div>`:""}
    <div class="row mover"><label>${admin?"Mover o copiar a otro día":"Mover a otro día"} <input type="date" data-mover-in="r:${p.id}"></label><button class="sec" data-mover="r:${p.id}">${admin?"Mover / copiar":"Mover"}</button></div>
  </details></div>`;
};
const resLeyenda=lista=>{
  const tipos=[...new Set(lista.map(p=>p.tipo||"otro"))];
  const todos=["rodaje","series","tirada","fuerza","bici","otro"].filter(t=>t==="fuerza"||tipos.includes(t)||["rodaje","series","tirada"].includes(t));
  return `<div class="res-leyenda">${todos.map(t=>`<span class="leg"><i style="background:${RES_COLOR[t]}"></i>${RES_NOMBRE[t]}</span>`).join("")}</div>`;
};

/* ---------- Resistencia integrada en la página general ---------- */
let reintentosEmbed=0;
function embebido(host,ruta){
  reintentosEmbed=0;
  sesionCompartida(); // la sesión debe estar guardada antes de que el iframe la lea
  const h=$(host);
  h.innerHTML=`<div class="emb-wrap"><p class="muted" style="text-align:center;padding:24px">Cargando…</p></div>`;
  (async()=>{
    // Si la sesión caduca pronto se renueva antes de abrir la otra página (si no, la página interna se queda sin sesión)
    try{if(S&&S.refresh&&expDe(S.access)<Date.now()/1000+600) await refrescar()}catch(e){}
    sesionCompartida();
    const w=h.querySelector(".emb-wrap"); if(!w) return;
    w.innerHTML=`<iframe class="emb" src="../resistencia/?embed=1&${ruta}" title="Resistencia" loading="eager"></iframe>`;
    w.dataset.ruta=ruta;
  })();
}
window.addEventListener("message",ev=>{
  if(ev.origin!==location.origin||!ev.data) return;
  // La página interna (resistencia) pide la sesión: se la damos
  if(ev.data.alexPideSesion){ if(S&&S.access&&ev.source) ev.source.postMessage({alexSesion:{access:S.access,refresh:S.refresh}},location.origin); return; }
  // El iframe no encuentra sesión: se vuelve a guardar y se recarga él solo (una sola vez, sin tener que pulsar F5)
  if((ev.data.alexSinSesion||ev.data.alexSinAcceso)&&reintentosEmbed<2){
    reintentosEmbed++;
    if(S&&S.access) sesionCompartida();
    document.querySelectorAll("iframe.emb").forEach(f=>{if(f.contentWindow===ev.source) f.src=f.src});
    return;
  }
  if(ev.data.alexSinSesion||ev.data.alexSinAcceso){
    document.querySelectorAll("iframe.emb").forEach(f=>{if(f.contentWindow===ev.source){
      const w=f.closest(".emb-wrap");
      w.innerHTML=`<div class="card"><p>No se ha podido abrir esta sección${ev.data.alexSinAcceso?" (sin acceso)":""}.</p><button data-embre>Reintentar</button></div>`;
      w.querySelector("[data-embre]").onclick=async()=>{try{await refrescar()}catch(e){}reintentosEmbed=0;sesionCompartida();w.innerHTML=`<iframe class="emb" src="../resistencia/?embed=1&${w.dataset.ruta||"sec=biblio"}" title="Resistencia"></iframe>`};
    }});
    return;
  }
  if(!ev.data.alexAltura) return;
  document.querySelectorAll("iframe.emb").forEach(f=>{if(f.contentWindow===ev.source) f.style.height=Math.max(500,ev.data.alexAltura+20)+"px"});
});
function panelResEntrenador(sec){
  shell(`<div id="tab"><button class="sec emb-atras" id="volver2">← Volver a Entrenados</button><div id="emb-host"></div></div>`);
  navSet(`<button id="volver">← Clientes</button><button class="on">🏃 Planes y biblioteca</button>`);
  $("#volver").onclick=listaClientes;
  $("#volver2").onclick=listaClientes;
  embebido("#emb-host","sec="+(sec||"biblio"));
}

/* ---------- Calendario de entrenamientos ---------- */
const DIAS_SEM=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MESES_CAL=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
// Fechas de las sesiones (las importadas del Excel y las guardadas en la app).
// Acepta: dd/mm/aaaa, dd-mm-aaaa, dd.mm.aa, dd/mm (año actual), aaaa-mm-dd, "3 de noviembre de 2026",
// y con día de la semana delante ("lunes 3/11/2026"). Si no se reconoce, la sesión queda "sin fecha".
const MESES_ES={ene:0,enero:0,feb:1,febrero:1,mar:2,marzo:2,abr:3,abril:3,may:4,mayo:4,jun:5,junio:5,jul:6,julio:6,ago:7,agosto:7,sep:8,sept:8,septiembre:8,oct:9,octubre:9,nov:10,noviembre:10,dic:11,diciembre:11};
function fechaValida(y,mo,d){
  const x=new Date(y,mo,d);
  return x.getFullYear()===y&&x.getMonth()===mo&&x.getDate()===d?x:null;
}
function parseFecha(txt){
  let s=String(txt||"").trim().toLowerCase();
  if(!s) return null;
  s=s.replace(/^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\.?,?\s+/,"");
  const hoyAno=new Date().getFullYear();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return fechaValida(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if(m){
    let y=m[3]?+m[3]:hoyAno; if(y<100) y+=2000;
    return fechaValida(y,+m[2]-1,+m[1]);
  }
  m=s.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?(?:\s+(?:de\s+)?(\d{4}))?$/);
  if(m&&MESES_ES[m[2]]!==undefined){
    return fechaValida(m[3]?+m[3]:hoyAno,MESES_ES[m[2]],+m[1]);
  }
  return null;
}
const isoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
// Calendario mensual. puedeMover: el entrenador y el cliente pueden cambiar la fecha de una sesión
async function tabCalendario(clienteId,puedeMover,host="#tab"){
  $(host).innerHTML='<div id="cal" class="an-panel cal-wrap"></div>';
  const ses=await db("GET","sesiones",`?cliente_id=eq.${clienteId}&select=*`);
  const hoy=new Date(), hoyIso=isoLocal(hoy);
  // Se abre en el mes de la próxima sesión con fecha (o la última si ya pasaron todas)
  const conFecha=ses.map(s=>({s,d:parseFecha(s.fecha)})).filter(x=>x.d).sort((a,b)=>a.d-b.d);
  const ref=conFecha.find(x=>isoLocal(x.d)>=hoyIso)||conFecha[conFecha.length-1];
  let mes=ref?new Date(ref.d.getFullYear(),ref.d.getMonth(),1):new Date(hoy.getFullYear(),hoy.getMonth(),1);
  let arrastrado=false;
  const moverSesionA=async(id,iso)=>{
    const s=ses.find(x=>x.id===id); if(!s) return;
    const [y,m,dd]=iso.split("-");
    const txt=`${dd}/${m}/${y}`;
    if(s.fecha===txt) return;
    try{
      await db("PATCH","sesiones",`?id=eq.${id}`,{fecha:txt},"return=minimal");
      s.fecha=txt; pintar();
      $("#calDet").innerHTML=`<p class="muted cal-aviso">Sesión movida al ${txt}</p>`;
    }catch(e){$("#calDet").innerHTML=`<p class="cal-aviso" style="color:#c0392b">${esc(e.message)}</p>`}
  };
  const iniciarArrastre=(e,el)=>{
    const id=el.dataset.ses;
    const x0=e.clientX,y0=e.clientY;
    let moviendo=false;
    const celdaBajo=(ev)=>{const b=document.elementFromPoint(ev.clientX,ev.clientY);return b&&b.closest?b.closest(".cal-d[data-dia]"):null};
    let navTimer=null, navDir=0;
    const mover=ev=>{
      if(!moviendo){
        if(Math.hypot(ev.clientX-x0,ev.clientY-y0)<6) return;
        moviendo=true; el.classList.add("arrastrando");
      }
      document.querySelectorAll(".cal-d.destino").forEach(c=>c.classList.remove("destino"));
      const c=celdaBajo(ev); if(c) c.classList.add("destino");
      // Arrastrando sobre ‹ o › el calendario cambia de mes solo, para poder mover la sesión a otro mes
      const bajo=document.elementFromPoint(ev.clientX,ev.clientY);
      const flecha=bajo&&bajo.closest?bajo.closest("#calPrev,#calNext"):null;
      const dir=flecha?(flecha.id==="calPrev"?-1:1):0;
      if(dir!==navDir){
        clearTimeout(navTimer); navTimer=null; navDir=dir;
        if(dir) navTimer=setTimeout(()=>{ mes=new Date(mes.getFullYear(),mes.getMonth()+dir,1); navDir=0; navTimer=null; pintar(); },600);
      }
    };
    const soltar=ev=>{
      clearTimeout(navTimer);
      window.removeEventListener("pointermove",mover);
      window.removeEventListener("pointerup",soltar);
      window.removeEventListener("pointercancel",soltar);
      el.classList.remove("arrastrando");
      document.querySelectorAll(".cal-d.destino").forEach(c=>c.classList.remove("destino"));
      if(!moviendo) return;
      arrastrado=true; setTimeout(()=>arrastrado=false,300);
      const c=celdaBajo(ev);
      if(c) moverSesionA(id,c.dataset.dia);
    };
    window.addEventListener("pointermove",mover);
    window.addEventListener("pointerup",soltar);
    window.addEventListener("pointercancel",soltar);
  };
  const fila=(s,txt)=>`<button class="cal-fila${hecho(s)?" ok":""}" data-ses="${s.id}">${txt}${hecho(s)?' <span class="cal-check">✓</span>':""}</button>`;
  const detalle=id=>{
    const s=ses.find(x=>x.id===id); if(!s) return;
    const d=parseFecha(s.fecha);
    $("#calDet").innerHTML=`<div class="cal-det"><b>${esc(s.titulo||"Sesión")}</b>
      <p class="muted">Fecha actual: ${esc(s.fecha||"sin fecha")}${hecho(s)?" · completada":""}</p>
      ${puedeMover?`<div class="row"><input type="date" id="calFe" value="${d?isoLocal(d):""}"><button class="gold" id="calMover">Mover a esta fecha</button><button class="sec" id="calCerrar">Cerrar</button></div><div class="msg" id="calMsg"></div>`:""}</div>`;
    if(!puedeMover) return;
    $("#calCerrar").onclick=()=>{$("#calDet").innerHTML=""};
    $("#calMover").onclick=async()=>{
      const v=$("#calFe").value;
      if(!v) return msg("#calMsg","Elige una fecha",false);
      const [y,m,dd]=v.split("-");
      const txt=`${dd}/${m}/${y}`;
      try{
        await db("PATCH","sesiones",`?id=eq.${id}`,{fecha:txt},"return=minimal");
        s.fecha=txt; pintar();
      }catch(e){msg("#calMsg",e.message,false)}
    };
  };
  const pintar=()=>{
    const primero=(mes.getDay()+6)%7;
    const ultimo=new Date(mes.getFullYear(),mes.getMonth()+1,0).getDate();
    const celdas=[];
    for(let i=0;i<primero;i++) celdas.push(null);
    for(let d=1;d<=ultimo;d++) celdas.push(new Date(mes.getFullYear(),mes.getMonth(),d));
    while(celdas.length%7) celdas.push(null);
    const porDia=new Map(), delMes=[], sinFecha=[];
    ses.forEach(s=>{
      const d=parseFecha(s.fecha);
      if(!d){sinFecha.push(s);return}
      const k=isoLocal(d);
      if(!porDia.has(k)) porDia.set(k,[]);
      porDia.get(k).push(s);
      if(d.getFullYear()===mes.getFullYear()&&d.getMonth()===mes.getMonth()) delMes.push({s,d});
    });
    delMes.sort((a,b)=>a.d-b.d);
    $("#cal").innerHTML=`
      <div class="cal-head"><button class="sec" id="calPrev">‹</button><b>${MESES_CAL[mes.getMonth()]} ${mes.getFullYear()}</b><button class="sec" id="calNext">›</button></div>
      <div class="cal-grid">${DIAS_SEM.map(d=>`<div class="cal-dh">${d}</div>`).join("")}
        ${celdas.map(d=>{
          if(!d) return `<div class="cal-d vacio"></div>`;
          const k=isoLocal(d), lista=porDia.get(k)||[];
          // Dentro de la casilla: nombre abreviado de cada sesión (máximo 2) y el total si hay más
          const corto=t=>String(t||"Sesión").replace(/Día\s*/i,"D").replace(/Microciclo\s*/i,"M").replace(/\s*·\s*/g,"·");
          const chips=lista.slice(0,2).map(s=>`<button class="cal-chip${hecho(s)?" ok":""}" data-ses="${s.id}" title="${esc(s.titulo||"Sesión")}">${esc(diaCorto(s))}</button>`).join("");
          return `<div data-dia="${k}" class="cal-d${k===isoLocal(hoy)?" hoy":""}${lista.length?" tiene":""}"><span class="cal-num">${d.getDate()}</span>${chips}${lista.length>2?`<span class="cal-mas">+${lista.length-2}</span>`:""}</div>`;
        }).join("")}
      </div>
      <div class="cal-lista">${delMes.length?delMes.map(({s,d})=>fila(s,`<b>${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}</b> ${nombreEntreno(s)}`)).join(""):'<p class="muted">No hay sesiones este mes.</p>'}</div>
      ${sinFecha.length?`<details class="cal-sin"><summary>Sin fecha (${sinFecha.length})</summary>${sinFecha.map(s=>fila(s,esc(s.titulo||"Sesión"))).join("")}</details>`:""}
      <div id="calDet"></div>`;
    $("#calPrev").onclick=()=>{mes=new Date(mes.getFullYear(),mes.getMonth()-1,1);pintar()};
    $("#calNext").onclick=()=>{mes=new Date(mes.getFullYear(),mes.getMonth()+1,1);pintar()};
    document.querySelectorAll("[data-ses]").forEach(b=>{
      b.onclick=()=>{if(!arrastrado) detalle(b.dataset.ses)};
    });
    if(puedeMover) document.querySelectorAll(".cal-lista .cal-fila[data-ses], .cal-sin .cal-fila[data-ses]").forEach(b=>b.addEventListener("pointerdown",e=>iniciarArrastre(e,b)));
  };
  pintar();
}


/* ---------- Entrenamientos del cliente: calendario + día seleccionado ---------- */
// El calendario se puede ocultar (en móvil se oculta solo al elegir un día con entreno) y se recuerda
let CAL_OCULTO=false;
const pantallaPequena=()=>window.innerWidth<760||window.innerHeight<720;
let RES_ACTIVA=false;
async function tabEntrenosCal(host="#sub",clienteId=S.user.id,admin=false,irA=null,avisoIni=""){
  if(clienteId===S.user.id) await cicloSeguro();
  const [todas,resis]=await Promise.all([db("GET","sesiones",`?cliente_id=eq.${clienteId}&order=created_at.desc&select=*`),sesionesResistencia(clienteId)]);
  let zonasRes=[];
  if(admin){try{const [pf]=await db("GET","perfiles",`?id=eq.${clienteId}&select=modulos`);RES_ACTIVA=modulosDe(pf).includes("resistencia")}catch(e){RES_ACTIVA=false}}
  if(resis.length){try{zonasRes=await db("GET","zonas",`?atleta_id=eq.${resis[0].atleta_id}&select=*`)}catch(e){}}
  const hoy=new Date(), hoyIso=isoLocal(hoy);
  const conF=todas.map(s=>({s,d:parseFecha(s.fecha)})).filter(x=>x.d);
  const resF=resis.map(p=>({s:p,d:new Date(p.fecha+"T00:00:00")}));
  const esHecha=t=>t._res?resHecha(t):hecho(t);
  const pendFut=[...conF,...resF].filter(x=>!esHecha(x.s)&&isoLocal(x.d)>=hoyIso).sort((a,b)=>a.d-b.d)[0];
  const ultimo=[...conF,...resF].sort((a,b)=>b.d-a.d)[0];
  const ref=pendFut||ultimo;
  let mes=new Date((ref?ref.d:hoy).getFullYear(),(ref?ref.d:hoy).getMonth(),1);
  let diaSel=ref?isoLocal(ref.d):hoyIso;
  if(irA){const di=new Date(irA+"T00:00:00");if(!isNaN(di)){diaSel=irA;mes=new Date(di.getFullYear(),di.getMonth(),1)}}
  let arrastrado=false;
  let aviso=avisoIni||"";
  let modoSel=false; const selDias=new Set(); let verBorrado=false; let verSemana=false;
  const lunesDe=k=>{const d=new Date(k+"T00:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));return isoLocal(d)};
  const txtDia=k=>{const [y2,m2,d2]=k.split("-");return `${d2}/${m2}/${y2}`};
  let deshacer=null;
  const porDia=new Map();
  const meterRes=()=>resis.forEach(p=>porDia.set(p.fecha,[...(porDia.get(p.fecha)||[]),p]));
  conF.forEach(({s,d})=>{const k=isoLocal(d);porDia.set(k,[...(porDia.get(k)||[]),s])});
  meterRes();
  const sinFecha=todas.filter(s=>!parseFecha(s.fecha));
  const editando=new Set(); let abrirId=null; let listaVer=null;
  const fmtD=k=>k?k.split("-").reverse().join("/"):"Sin fecha";
  const panelLista=(modo)=>{
    const quiere=modo==="hechas";
    const items=[
      ...conF.map(({s,d})=>({k:isoLocal(d),s})),
      ...todas.filter(s=>!parseFecha(s.fecha)).map(s=>({k:"",s})),
      ...resis.map(p=>({k:String(p.fecha).slice(0,10),s:p}))
    ].filter(x=>esHecha(x.s)===quiere).sort((a,b)=>quiere?(b.k||"").localeCompare(a.k||""):(a.k||"9").localeCompare(b.k||"9"));
    const filas=items.map(({k,s})=>{
      let nom,det="";
      if(s._res){
        nom=resPartes(s)[0]||"Running";
        if(!quiere&&s.duracion_min) det=`${s.duracion_min} min previstos`;
        if(quiere){const r=s.rpe!=null&&s.rpe!==""?String(s.rpe).replace(".",","):"–";det=`<span class="rpe-tag">RPE ${r}</span>${s.km_reales?` · ${s.km_reales} km`:""}${s.duracion_real_min?` · ${s.duracion_real_min} min`:""}`}
      }else{
        nom=s.titulo||"Sesión";
        if(!quiere){const nombres=(s.bloques||[]).flatMap(b=>(b.ejercicios||[]).map(x=>normEj(x).ej)).filter(Boolean);det=nombres.length?`<div class="rpe-ejs">${nombres.map(n=>`<span>${esc(n)}</span>`).join("")}</div>`:`<span class="muted">Sin ejercicios todavía</span>`;}
        if(quiere){
          const ejs=[];
          Object.entries(s.registro||{}).forEach(([key,v])=>{
            if(!/^\d+-\d+$/.test(key)||!v) return;
            const [bi,ei]=key.split("-").map(Number), ex=(s.bloques||[])[bi]&&s.bloques[bi].ejercicios&&s.bloques[bi].ejercicios[ei];
            const r=parseFloat(String(v.rpe).replace(",","."));
            if(!isNaN(r)) ejs.push({n:ex?normEj(ex).ej:"Ejercicio",r});
          });
          const med=ejs.length?(ejs.reduce((q,x)=>q+x.r,0)/ejs.length):null;
          det=med==null?`<span class="muted">Sin RPE registrado</span>`:`<span class="rpe-tag">RPE medio ${String(Math.round(med*10)/10).replace(".",",")}</span><div class="rpe-ejs">${ejs.map(x=>`<span>${esc(x.n)} <b>${String(x.r).replace(".",",")}</b></span>`).join("")}</div>`;
        }
      }
      return `<div class="lista-fila"><div class="lista-info"><b>${fmtD(k)}</b> · ${esc(nom)}<div>${det}</div></div>${k?`<button class="sec" data-iradia="${k}">Ver día</button>`:""}</div>`;
    }).join("");
    return `<div class="card lista-panel"><div class="row" style="justify-content:space-between"><h3>${quiere?"✅ Entrenos realizados":"⏳ Entrenos pendientes"} (${items.length})</h3><button class="sec" data-cerrarlista>✕</button></div>${filas||`<p class="muted">${quiere?"Todavía no hay entrenos realizados.":"No quedan entrenos pendientes."}</p>`}</div>`;
  };

  const resumenFuerza=s=>{const ejs=(s.bloques||[]).flatMap(b=>(b.ejercicios||[]).map(x=>normEj(x))).filter(e=>e.ej);
    return esc(ejs.map(e=>[e.ej,[e.ser,e.rep].filter(v=>String(v??"").trim()!=="").join(" × ")].filter(Boolean).join(" — ")).join("\n")||"Sin ejercicios")};
  const tarjeta=(s,abierta)=>{const ed=admin&&editando.has(String(s.id));return `<div class="ses-grupo${verSet.has(String(s.id))?" ver-on":""}"><div class="resumen-ver">${resumenFuerza(s)}</div><details class="card sesion${hecho(s)?" hecha":""}${ed?" editando":""}" data-sid="${s.id}"${(abierta||String(s.id)===abrirId)?" open":""}><summary class="dia-sum" data-arr="${s.id}">${badgeFecha(s)}<h3>${nombreEntreno(s)}</h3></summary>
      ${admin?(ed?`<div class="row e-modos ses-barra"><button class="gold" data-edtxt="${s.id}">✏️ Editar como texto</button><button class="sec" data-ed="${s.id}">▦ Editar en tabla</button><button class="sec" data-copses="${s.id}">📋 Copiar sesión</button><button class="sec" data-pegses="${s.id}">📥 Pegar sesión</button><span class="muted" data-bst="${s.id}"></span></div>`:`<div class="row e-modos ses-barra"><button class="gold" data-editar="${s.id}">✏️ Editar</button><button class="sec" data-copses="${s.id}">📋 Copiar</button><span class="muted" data-bst="${s.id}"></span></div>`):""}
      ${sesionHTML(s,true,true,ed)}
      <div class="row"><button data-save="${s.id}">${admin?"Guardar cambios":"Guardar registro"}</button>${admin?`${ed?`<button class="sec" data-cerrar="${s.id}">✔ Cerrar edición</button>`:""}<button class="danger" data-del="${s.id}">Borrar</button>`:""}<span class="muted" data-st="${s.id}"></span></div>
      <div class="row mover"><label>${admin?"Mover o copiar a otro día":"Mover a otro día"} <input type="date" data-mover-in="${s.id}"></label><button class="sec" data-mover="${s.id}">${admin?"Mover / copiar":"Mover"}</button></div></details></div>`};
  const moverA=async(id,val)=>{
    const esRes=String(id).startsWith("r:"), rid=esRes?String(id).slice(2):String(id);
    const item=esRes?resis.find(x=>String(x.id)===rid):todas.find(x=>String(x.id)===rid);
    if(!item||!val) return;
    const [ny,nm,nd]=val.split("-");
    const txt=`${nd}/${nm}/${ny}`;
    const origen=esRes?String(item.fecha).slice(0,10):(parseFecha(item.fecha)?isoLocal(parseFecha(item.fecha)):"");
    if(origen===val){aviso="La sesión ya está en ese día";pintar();return}
    let accion="mover";
    if(admin){
      accion=await preguntarMoverCopiar(esRes?resPartes(item)[0]:(item.titulo||"Sesión"),txt);
      if(!accion) return;
    }
    try{
      if(esRes){
        if(accion==="mover") await db("PATCH","sesiones_planificadas",`?id=eq.${rid}`,{fecha:val},"return=minimal");
        else{
          const nueva={atleta_id:item.atleta_id,fecha:val,tipo:item.tipo,descripcion:item.descripcion,duracion_min:item.duracion_min,estado:"pendiente"};
          if(item.bloque_id) nueva.bloque_id=item.bloque_id;
          if(item.pasos) nueva.pasos=item.pasos;
          await db("POST","sesiones_planificadas","",nueva,"return=minimal");
        }
      }else{
        if(accion==="mover") await db("PATCH","sesiones",`?id=eq.${rid}`,{fecha:txt},"return=minimal");
        else await db("POST","sesiones","",{cliente_id:clienteId,fecha:txt,titulo:item.titulo,bloques:item.bloques,registro:{}},"return=minimal");
      }
      await tabEntrenosCal(host,clienteId,admin,val,(accion==="mover"?"Sesión movida al ":"Sesión copiada al ")+txt);
    }catch(e){aviso="No se pudo "+accion+": "+e.message; pintar()}
  };
  const borrarSesiones=async(lista,txt)=>{
    try{
      const trozos=(ids,n=80)=>{const r=[];for(let i=0;i<ids.length;i+=n)r.push(ids.slice(i,i+n));return r};
      for(const t of trozos(lista.filter(x=>!x._res).map(x=>x.id))) await db("DELETE","sesiones",`?id=in.(${t.join(",")})`,null,"return=minimal");
      for(const t of trozos(lista.filter(x=>x._res).map(x=>x.id))) await db("DELETE","sesiones_planificadas",`?id=in.(${t.join(",")})`,null,"return=minimal");
      ULTIMO_BORRADO={clienteId,lista:lista.map(x=>JSON.parse(JSON.stringify(x))),cuando:Date.now()};
      await tabEntrenosCal(host,clienteId,admin);
      const c=$(host);
      if(c) c.insertAdjacentHTML("afterbegin",`<p class="cal-aviso card">✓ ${esc(txt)} <button class="sec" id="deshacer-b">↶ Deshacer</button></p>`);
      const bd=$("#deshacer-b");
      if(bd) bd.onclick=async()=>{bd.disabled=true;bd.textContent="Restaurando…";
        try{await restaurarBorradas(clienteId);await tabEntrenosCal(host,clienteId,admin,null,"Sesiones restauradas")}
        catch(e){bd.disabled=false;bd.textContent="↶ Deshacer";alert("No se pudo restaurar: "+e.message)}};
    }catch(e){aviso="No se pudo borrar: "+e.message;pintar()}
  };
  // Ver despliega el resumen de la sesión; Abrir y Editar abren la tarjeta
  const verSet=new Set();
  // Acciones al pasar el cursor por una sesión del calendario (Ver / Abrir / Editar)
  const popCal=t=>{const pid=t._res?"r:"+t.id:String(t.id);
    return `<span class="cal-pop"><button type="button" data-pv="ver" data-pid="${pid}">👁 Ver</button><button type="button" data-pv="abrir" data-pid="${pid}">↗ Abrir</button>${admin?`<button type="button" data-pv="editar" data-pid="${pid}">✏️ Editar</button>`:""}</span>`};
  const cw=(t,html)=>`<span class="cal-cw">${html}${popCal(t)}</span>`;
  const pintar=()=>{
    const y=mes.getFullYear(), mo=mes.getMonth();
    const primer=(new Date(y,mo,1).getDay()+6)%7;
    const dias=new Date(y,mo+1,0).getDate();
    const celdas=[];
    for(let i=0;i<primer;i++) celdas.push('<div class="cal-d vacio"></div>');
    for(let d=1;d<=dias;d++){
      const k=isoLocal(new Date(y,mo,d));
      const lista=porDia.get(k)||[];
      const todasHechas=lista.length&&lista.every(esHecha);
      const chips=lista.slice(0,2).map(t=>{
        if(t._res) return cw(t,resChip(t));
        const tp=esCarrera(t)?aResistencia(t).tipo:"fuerza", col=RES_COLOR[tp]||RES_COLOR.otro;
        return cw(t,`<button type="button" class="cal-chip res${hecho(t)?" ok":""}" style="background:${col};border-color:${col}" data-chip="${t.id}" title="${esc(t.titulo||"Sesión")}">${hecho(t)?"✓ ":""}${esc(RES_NOMBRE[tp]||"Fuerza")}</button>`);
      }).join("");
      celdas.push(`<div class="cal-d cal-dia${k===hoyIso?" hoy":""}${lista.length?" tiene":""}${k===diaSel&&!modoSel?" sel":""}${selDias.has(k)?" selb":""}" data-dia="${k}"><span class="cal-num">${d}</span>${cicloMarca(k,clienteId)}${chips}${lista.length>2?`<span class="cal-mas">+${lista.length-2}</span>`:""}</div>`);
    }
    const delDia=porDia.get(diaSel)||[];
    const [ay,am,ad]=diaSel.split("-");
    const pend=todas.filter(s=>!hecho(s)).length+resis.filter(p=>!resHecha(p)).length, hechas=todas.length+resis.length-pend;
    const proxTxt=pendFut?String(pendFut.d.getDate()).padStart(2,"0")+"/"+String(pendFut.d.getMonth()+1).padStart(2,"0"):"—";
    const cont=$(host);
    const msgAviso=aviso; aviso="";
    const selSes=[...selDias].flatMap(k=>porDia.get(k)||[]);
    const carreraTodas=todas.filter(esCarrera), carreraF=carreraTodas.filter(t=>!Object.keys(t.registro||{}).length), carreraConReg=carreraTodas.length-carreraF.length;
    const nF=selSes.filter(x=>!x._res).length, nR=selSes.filter(x=>x._res).length;
    cont.innerHTML=`
      ${msgAviso?`<p class="cal-aviso card">${esc(msgAviso)}</p>`:""}
      ${clienteId===S.user.id?panelCicloHTML():""}
      ${admin?`<div class="row res-acceso"><button class="sec" data-plantillas>📋 Crear plan con una plantilla (iniciación fuerza, asfalto o trail)</button></div>`:""}
      ${admin&&RES_ACTIVA?`<div class="row res-acceso"><button class="sec" data-irres>🏃 Planificar running / trail (pasos por zona, Strava, tests)</button></div>`:""}
      ${admin?`<div class="borrado-bar row">
        <button class="${modoSel?"gold":"sec"}" data-selmodo>${modoSel?"✓ Seleccionando días…":"☑ Seleccionar días para borrar"}</button>
        <button class="sec" data-borrado>🗑 Borrar varias…</button>
        <button class="sec" data-semana>📅 Copiar semana…</button></div>
        ${verSemana?`<div class="card borrado-panel">
          <h3>Copiar o mover una semana entera</h3>
          <p class="muted">Se copian todas las sesiones de la semana del día elegido (de lunes a domingo), manteniendo cada una en su mismo día.</p>
          <div class="row"><label>Semana de origen (lunes ${esc(txtDia(lunesDe(diaSel)))}) <input type="date" id="sOrig" value="${esc(diaSel)}"></label>
          <label>Pegar en la semana de <input type="date" id="sDest"></label></div>
          <label class="mod-chk"><input type="checkbox" id="sMover"> Mover en vez de copiar (vacía la semana de origen)</label>
          <div class="row"><button class="gold" data-copiarsem>Copiar semana</button><button class="sec" data-cerrarsem>Cancelar</button></div>
          <div class="msg" id="sMsg"></div></div>`:""}
        ${modoSel?`<div class="card sel-bar"><span>${selDias.size?`<b>${selDias.size}</b> día(s) · <b>${selSes.length}</b> sesión(es)${nF&&nR?` (${nF} fuerza, ${nR} resistencia)`:""}`:"Toca los días del calendario que quieras borrar."}</span>
          <button class="sec" data-selmes>Todo el mes</button>
          <button class="danger" data-borrarsel${selSes.length?"":" disabled"}>Borrar seleccionadas</button>
          <button class="sec" data-cancelsel>Cancelar</button></div>`:""}
        ${verBorrado?`<div class="card borrado-panel">
          <h3>Borrar varias sesiones</h3>
          <div class="row"><label>Qué <select id="bQue"><option value="todo">Fuerza y resistencia</option><option value="f">Solo fuerza</option><option value="r">Solo resistencia</option></select></label>
          <label>Cuáles <select id="bCual"><option value="todas">Todas</option><option value="desde">Desde una fecha</option><option value="entre">Entre dos fechas</option></select></label></div>
          <div class="row" id="bFechas" style="display:none"><label>Desde <input type="date" id="bDesde" value="${hoyIso}"></label><label id="bHastaL">Hasta <input type="date" id="bHasta"></label></div>
          <label class="mod-chk"><input type="checkbox" id="bConservar" checked> Conservar las ya completadas por el cliente</label>
          <div class="row"><button class="danger" data-borrarvarias>Borrar</button><button class="sec" data-cerrarborrado>Cancelar</button></div>
          <div class="msg" id="bMsg"></div></div>`:""}`:""}
      ${admin&&carreraF.length?`<div class="card conv-bar"><span>🏃 Hay <b>${carreraF.length}</b> sesión(es) de carrera/trail guardadas como fuerza${carreraConReg?` (${carreraConReg} ya registradas por el cliente se quedan como están)`:""}.</span><button class="gold" data-convertir>Pasarlas a Resistencia</button></div>`:""}
      ${admin?`<div class="row res-acceso"><button class="sec" data-vercarga>📈 Ver carga de entrenamiento de este atleta</button></div>`:""}
      <div class="resumen resumen-click"><div data-lista="pend" class="${listaVer==="pend"?"on":""}"><b>${pend}</b><small>pendientes</small></div><div data-lista="hechas" class="${listaVer==="hechas"?"on":""}"><b>${hechas}</b><small>completadas</small></div><div><b>${proxTxt}</b><small>próximo entreno</small></div></div>
      ${listaVer?panelLista(listaVer):""}
      ${CAL_OCULTO&&!modoSel?`<div class="cal-wrap card cal-mini">
        <button class="sec" data-diaant title="Entreno anterior" aria-label="Entreno anterior">‹</button>
        <button class="cal-mini-ver" data-calver>📅 <b>${+ad} ${MESES_CAL[+am-1]}</b><span>Ver calendario ▼</span></button>
        <button class="sec" data-diasig title="Entreno siguiente" aria-label="Entreno siguiente">›</button>
      </div>`:`<div class="cal-wrap card">
        <div class="cal-head"><button class="sec" data-prev>‹</button><b>${MESES_CAL[mo]} ${y}</b><button class="sec" data-next>›</button></div>
        <div class="cal-grid">${DIAS_SEM.map(d=>`<div class="cal-dh">${d}</div>`).join("")}${celdas.join("")}</div>
        ${resLeyenda(resis)}
        ${modoSel?"":`<button class="sec cal-ocultar" data-calocultar>▲ Ocultar calendario</button>`}
      </div>`}
      <h2 class="dia-tit">${+ad} de ${MESES_CAL[+am-1]}</h2>
      ${admin?`<div class="row dia-acc"><button class="gold" data-nuevaday>＋ Crear entrenamiento en este día</button><button class="sec" data-pegday>📥 Cargar sesión copiada</button></div>`:""}
      ${delDia.length?delDia.map(s=>s._res?resTarjeta(s,admin,zonasRes,abrirId==="r:"+String(s.id),verSet.has("r:"+String(s.id))):tarjeta(s,false)).join(""):'<p class="muted">Día sin entrenamiento. Toca otro día del calendario.</p>'}
      ${sinFecha.length?`<details class="card"><summary><b>Sin fecha (${sinFecha.length})</b></summary>${sinFecha.map(s=>tarjeta(s,false)).join("")}</details>`:""}`;
    const irTitulo=()=>{const t=cont.querySelector(".dia-tit");if(t)t.scrollIntoView({block:"start",behavior:"smooth"})};
    if(cont.querySelector("[data-prev]")){
      cont.querySelector("[data-prev]").onclick=()=>{mes=new Date(y,mo-1,1);pintar()};
      cont.querySelector("[data-next]").onclick=()=>{mes=new Date(y,mo+1,1);pintar()};
    }
    if(clienteId===S.user.id) enlazarCiclo();
    const oc=cont.querySelector("[data-calocultar]"); if(oc) oc.onclick=()=>{CAL_OCULTO=true;pintar();irTitulo()};
    const cv=cont.querySelector("[data-calver]"); if(cv) cv.onclick=()=>{CAL_OCULTO=false;pintar()};
    // ‹ › en la barra pequeña: salta al entreno anterior o siguiente
    const saltar=dir=>{
      const dias=[...porDia.keys()].filter(k=>(porDia.get(k)||[]).length).sort();
      const k=dir<0?dias.filter(d=>d<diaSel).pop():dias.find(d=>d>diaSel);
      if(!k){aviso=dir<0?"No hay entrenos anteriores":"No hay más entrenos programados";pintar();return}
      diaSel=k;const [yy,mm]=k.split("-");mes=new Date(+yy,+mm-1,1);pintar();
    };
    const da=cont.querySelector("[data-diaant]"); if(da) da.onclick=()=>saltar(-1);
    const ds=cont.querySelector("[data-diasig]"); if(ds) ds.onclick=()=>saltar(1);
    cont.querySelectorAll("[data-dia]").forEach(b=>b.onclick=()=>{
      if(modoSel){const k=b.dataset.dia;if(!(porDia.get(k)||[]).length)return;selDias.has(k)?selDias.delete(k):selDias.add(k);pintar();return}
      diaSel=b.dataset.dia;
      const conEntreno=(porDia.get(diaSel)||[]).length>0;
      if(conEntreno&&pantallaPequena()){CAL_OCULTO=true;pintar();irTitulo();return}
      pintar()});
    if(admin&&cont.querySelector("[data-convertir]")) cont.querySelector("[data-convertir]").onclick=async()=>{
      const conv=carreraF.map(aResistencia).filter(x=>x.fecha);
      const cuenta={};conv.forEach(v=>cuenta[v.tipo]=(cuenta[v.tipo]||0)+1);
      if(!confirm(`Se pasarán ${conv.length} sesión(es) a Resistencia (${Object.entries(cuenta).map(([t,n])=>`${n} ${RES_NOMBRE[t]||t}`).join(", ")}), con su color y su registro de carrera. ¿Continuar?`)) return;
      try{
        const [c]=await db("GET","perfiles",`?id=eq.${clienteId}&select=*`);
        await importarResistencia(c,conv);
        await db("DELETE","sesiones",`?id=in.(${carreraF.map(t=>t.id).join(",")})`,null,"return=minimal");
        await tabEntrenosCal(host,clienteId,admin);
        const h=$(host); if(h) h.insertAdjacentHTML("afterbegin",`<p class="cal-aviso card">✓ ${conv.length} sesión(es) pasadas a Resistencia</p>`);
      }catch(e){aviso="No se pudo convertir: "+e.message;pintar()}
    };
    if(admin){
      const q=sel=>cont.querySelector(sel);
      q("[data-selmodo]").onclick=()=>{modoSel=!modoSel;selDias.clear();verBorrado=false;if(modoSel)CAL_OCULTO=false;pintar()};
      q("[data-borrado]").onclick=()=>{verBorrado=!verBorrado;verSemana=false;modoSel=false;selDias.clear();pintar()};
      q("[data-semana]").onclick=()=>{verSemana=!verSemana;verBorrado=false;modoSel=false;selDias.clear();pintar()};
      if(q("[data-irres]")) q("[data-irres]").onclick=()=>{if(window.__verRes) window.__verRes()};
      if(q("[data-plantillas]")) q("[data-plantillas]").onclick=async()=>{
        let c=null;
        try{[c]=await db("GET","perfiles",`?id=eq.${clienteId}&select=id,nombre,modulos`)}catch(e){}
        if(!c) c={id:clienteId,nombre:""};
        plPanel(c,(n,ini)=>tabEntrenosCal(host,clienteId,admin,ini,`Plan creado: ${n} sesión(es) añadidas`));
      };
      if(verSemana){
        q("[data-cerrarsem]").onclick=()=>{verSemana=false;pintar()};
        q("[data-copiarsem]").onclick=async()=>{
          const o=q("#sOrig").value,d=q("#sDest").value,mover=q("#sMover").checked,m=q("#sMsg");
          if(!o||!d){m.textContent="Elige las dos semanas";m.className="msg err";return}
          const lo=lunesDe(o),ld=lunesDe(d);
          if(lo===ld){m.textContent="Son la misma semana";m.className="msg err";return}
          const dias=Array.from({length:7},(_,i)=>{const x=new Date(lo+"T00:00:00");x.setDate(x.getDate()+i);return isoLocal(x)});
          const lista=dias.flatMap(k=>porDia.get(k)||[]);
          if(!lista.length){m.textContent="Esa semana no tiene sesiones";m.className="msg err";return}
          const desplaza=k=>{const x=new Date(k+"T00:00:00");x.setDate(x.getDate()+Math.round((new Date(ld)-new Date(lo))/86400000));return isoLocal(x)};
          m.textContent=(mover?"Moviendo ":"Copiando ")+lista.length+" sesión(es)…";m.className="msg";
          try{
            for(const x of lista){
              const kOrig=x._res?String(x.fecha).slice(0,10):isoLocal(parseFecha(x.fecha));
              const nueva=desplaza(kOrig);
              if(x._res){
                if(mover) await db("PATCH","sesiones_planificadas",`?id=eq.${x.id}`,{fecha:nueva},"return=minimal");
                else{const n2={atleta_id:x.atleta_id,fecha:nueva,tipo:x.tipo,descripcion:x.descripcion,duracion_min:x.duracion_min,estado:"pendiente"};
                  if(x.bloque_id)n2.bloque_id=x.bloque_id; if(x.pasos)n2.pasos=x.pasos;
                  await db("POST","sesiones_planificadas","",n2,"return=minimal")}
              }else{
                const [y3,m3,d3]=nueva.split("-"), txtF=`${d3}/${m3}/${y3}`;
                if(mover) await db("PATCH","sesiones",`?id=eq.${x.id}`,{fecha:txtF},"return=minimal");
                else await db("POST","sesiones","",{cliente_id:clienteId,fecha:txtF,titulo:x.titulo,bloques:x.bloques,registro:{}},"return=minimal");
              }
            }
            await tabEntrenosCal(host,clienteId,admin,ld,`Semana ${mover?"movida":"copiada"}: ${lista.length} sesión(es) al ${txtDia(ld)}`);
          }catch(e){m.textContent="No se pudo: "+e.message;m.className="msg err"}
        };
      }
      if(modoSel){
        q("[data-cancelsel]").onclick=()=>{modoSel=false;selDias.clear();pintar()};
        q("[data-selmes]").onclick=()=>{for(const k of porDia.keys()){const [yy,mm]=k.split("-");if(+yy===y&&+mm-1===mo)selDias.add(k)}pintar()};
        q("[data-borrarsel]").onclick=()=>{
          if(!confirm(`¿Borrar ${selSes.length} sesión(es) de ${selDias.size} día(s)?${selSes.some(esHecha)?"\nAlgunas ya están completadas: se perderán también sus registros.":""}`))return;
          borrarSesiones(selSes,`${selSes.length} sesión(es) borradas`);
        };
      }
      if(verBorrado){
        const ajustar=()=>{const v=q("#bCual").value;q("#bFechas").style.display=v==="todas"?"none":"";q("#bHastaL").style.display=v==="entre"?"":"none"};
        q("#bCual").onchange=ajustar; ajustar();
        q("[data-cerrarborrado]").onclick=()=>{verBorrado=false;pintar()};
        q("[data-borrarvarias]").onclick=()=>{
          const que=q("#bQue").value, cual=q("#bCual").value, d=q("#bDesde").value, h=q("#bHasta").value, conservar=q("#bConservar").checked;
          if(cual!=="todas"&&!d) return msg("#bMsg","Elige la fecha de inicio",false);
          if(cual==="entre"&&(!h||h<d)) return msg("#bMsg","Elige una fecha final igual o posterior",false);
          const iso=t=>t._res?t.fecha:(parseFecha(t.fecha)?isoLocal(parseFecha(t.fecha)):null);
          const lista=[...(que==="r"?[]:todas),...(que==="f"?[]:resis)].filter(t=>{
            if(conservar&&esHecha(t)) return false;
            if(cual==="todas") return true;
            const f=iso(t); if(!f) return false;
            return f>=d&&(cual==="desde"||f<=h);
          });
          if(!lista.length) return msg("#bMsg","No hay sesiones que cumplan eso.",false);
          const nf=lista.filter(x=>!x._res).length, nr=lista.length-nf;
          if(!confirm(`Se van a borrar ${lista.length} sesión(es): ${nf} de fuerza y ${nr} de resistencia.\nNo se puede deshacer. ¿Continuar?`)) return;
          borrarSesiones(lista,`${lista.length} sesión(es) borradas (${nf} fuerza, ${nr} resistencia)`);
        };
      }
    }

    cont.querySelectorAll("[data-lista]").forEach(d=>d.onclick=()=>{listaVer=listaVer===d.dataset.lista?null:d.dataset.lista;pintar()});
    cont.querySelectorAll("[data-cerrarlista]").forEach(b=>b.onclick=()=>{listaVer=null;pintar()});
    cont.querySelectorAll("[data-pv]").forEach(b=>b.onclick=ev=>{
      ev.stopPropagation();
      const accion=b.dataset.pv, pid=b.dataset.pid;
      const esRes=pid.startsWith("r:"), rid=esRes?pid.slice(2):pid;
      const item=esRes?resis.find(x=>String(x.id)===rid):todas.find(x=>String(x.id)===rid);
      if(!item) return;
      const k=esRes?String(item.fecha).slice(0,10):isoLocal(parseFecha(item.fecha));
      if(!k) return;
      const [yy,mm]=k.split("-");
      diaSel=k; mes=new Date(+yy,+mm-1,1); listaVer=null;
      if(accion==="editar"&&!esRes) editando.add(rid);
      if(accion==="ver"){verSet.has(pid)?verSet.delete(pid):verSet.add(pid);abrirId=null}else abrirId=pid;   // «Ver» muestra/oculta el resumen; «Abrir» y «Editar» abren la tarjeta
      pintar();
      setTimeout(()=>{
        const el=cont.querySelector(esRes?`[data-res="${rid}"]`:`[data-sid="${rid}"]`); if(!el) return;
        el.scrollIntoView({block:"center",behavior:"smooth"});
        if(accion==="ver"){el.classList.add("resaltada");setTimeout(()=>el.classList.remove("resaltada"),1600)}
        if(accion==="editar"&&esRes) cont.querySelector(`[data-reseditar="${rid}"]`)?.click();
      },60);
    });
    cont.querySelectorAll("[data-iradia]").forEach(b=>b.onclick=()=>{const k=b.dataset.iradia;diaSel=k;const [yy,mm]=k.split("-");mes=new Date(+yy,+mm-1,1);listaVer=null;pintar();setTimeout(()=>{const c=cont.querySelector(".card.sesion");if(c)c.scrollIntoView({behavior:"smooth",block:"start"})},50)});
    cont.querySelectorAll("[data-vercarga]").forEach(b=>b.onclick=()=>{const tf=document.getElementById("tf");if(tf)tf.click()});
    cont.querySelectorAll("[data-editar]").forEach(b=>b.onclick=()=>{editando.add(String(b.dataset.editar));abrirId=String(b.dataset.editar);pintar()});
    cont.querySelectorAll("[data-cerrar]").forEach(b=>b.onclick=()=>{editando.delete(String(b.dataset.cerrar));abrirId=String(b.dataset.cerrar);pintar()});
    cont.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.save, st=cont.querySelector(`[data-st="${id}"]`);
      try{
        const card=b.closest(".card");
        const s=todas.find(x=>String(x.id)===String(id));
        const leido=leerRegistro(card), reg={...((s&&s.registro)||{})};
        Object.keys(leido).forEach(k=>{reg[k]={...(reg[k]||{}),...leido[k]}});
        // El registro (kg, RIR, RPE…) se guarda también desde la tabla de edición; los campos no tocados conservan su valor
        const cambios={registro:reg};
        if(admin&&s&&card.querySelector(".xp")) cambios.bloques=leerPlan(card,s);
        await db("PATCH","sesiones",`?id=eq.${id}`,cambios,"return=minimal");
        if(s){if(cambios.registro) s.registro=reg; if(cambios.bloques) s.bloques=cambios.bloques}
        if(!admin&&hecho({registro:reg})){
          const rs=Object.values(reg).map(v=>parseFloat(String(v&&v.rpe).replace(",","."))).filter(x=>Number.isFinite(x));
          const rpeM=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null;
          mostrarMotivacion(motivarCompletado({tipo:"fuerza",rpe:rpeM,ses:s&&s.titulo}));
        }
        if(!admin&&hecho({registro:reg})){st.textContent="Completado ✓ · pasa al historial";setTimeout(()=>tabEntrenosCal(host,clienteId,admin),1000)}
        else{st.textContent="Guardado ✓"; if(admin&&cambios.registro&&hecho({registro:reg})) setTimeout(()=>tabEntrenosCal(host,clienteId,admin),800)}
      }catch(e){st.textContent="Error: "+e.message}
    });
    // Mover con la fecha elegida (ambas pestañas)
    // Sesiones de resistencia: guardar registro (cliente) o comentario/edición (entrenador)
    cont.querySelectorAll("[data-resguardar]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.resguardar, card=cont.querySelector(`[data-res="${id}"]`), st=cont.querySelector(`[data-resst="${id}"]`);
      const v=f=>{const el=card.querySelector(`[data-rf="${f}"]`);return el?el.value.trim():undefined};
      const num=t=>{if(t===""||t===undefined)return null;const n=Number(String(t).replace(",","."));return Number.isFinite(n)?n:NaN};
      const cambios={estado:v("estado"),rpe:num(v("rpe")),km_reales:num(v("km_reales")),duracion_real_min:(()=>{const q=minutosDesdeTexto(v("duracion_real_min"));return q===null?null:q})(),notas_atleta:v("notas_atleta")||null};
      if(admin) cambios.comentario_entrenador=v("comentario_entrenador")||null;
      if([cambios.km_reales,cambios.duracion_real_min].some(Number.isNaN)){st.textContent="Km y minutos tienen que ser números";return}
      try{
        const pr=resis.find(x=>x.id===id)||{};
        await db("PATCH","sesiones_planificadas",`?id=eq.${id}`,cambios,"return=minimal");
        Object.assign(pr,cambios);
        if(!admin&&cambios.estado==="hecha") mostrarMotivacion(motivarCompletado({tipo:"resis",rpe:cambios.rpe,km:cambios.km_reales,ses:resPartes(pr)[0]}));
        aviso=admin?"Sesión guardada":(cambios.estado==="hecha"?"¡Bien hecho! Sesión registrada ✓":"Guardado ✓"); pintar();
      }catch(e){st.textContent="Error: "+e.message}
    });
    if(admin){
      cont.querySelectorAll("[data-reseditar]").forEach(b=>b.onclick=()=>{
        const p=resis.find(x=>String(x.id)===String(b.dataset.reseditar)); if(!p) return;
        abrirEditorRes(p,zonasRes,async cambios=>{
          await db("PATCH","sesiones_planificadas",`?id=eq.${p.id}`,cambios,"return=minimal");
          await tabEntrenosCal(host,clienteId,admin,cambios.fecha,"Sesión guardada");
        });
      });
      cont.querySelectorAll("[data-resguardaredit]").forEach(b=>b.onclick=async()=>{
        const id=b.dataset.resguardaredit, f=cont.querySelector(`[data-resform="${id}"]`), g=k=>f.querySelector(`[data-re="${k}"]`).value.trim();
        const nombre=g("nombre")||RES_NOMBRE[g("tipo")]||"Sesión", desc=g("desc");
        const cambios={tipo:g("tipo"),duracion_min:g("duracion_min")?parseInt(g("duracion_min"),10):null,fecha:g("fecha"),descripcion:nombre+(desc?" — "+desc:"")};
        try{await db("PATCH","sesiones_planificadas",`?id=eq.${id}`,cambios,"return=minimal");await tabEntrenosCal(host,clienteId,admin)}
        catch(e){alert(e.message)}
      });
      cont.querySelectorAll("[data-resborrar]").forEach(b=>b.onclick=async()=>{
        if(!confirm("¿Borrar esta sesión de resistencia?"))return;
        try{await db("DELETE","sesiones_planificadas",`?id=eq.${b.dataset.resborrar}`,null,"return=minimal");await tabEntrenosCal(host,clienteId,admin)}
        catch(e){alert(e.message)}
      });
    }
    cont.querySelectorAll("[data-mover]").forEach(b=>b.onclick=()=>{
      const id=b.dataset.mover, val=cont.querySelector(`[data-mover-in="${id}"]`).value;
      if(!val){aviso="Elige una fecha en el selector";pintar();return}
      moverA(id,val);
    });
    // Arrastrar la cabecera de una sesión hasta el día del calendario (mismo sistema que la versión publicada)
    cont.querySelectorAll("[data-arr],[data-chip]").forEach(el=>{
      el.addEventListener("click",ev=>{if(arrastrado){ev.preventDefault();ev.stopPropagation()}});
      el.addEventListener("pointerdown",e=>{
        if(e.button!==undefined&&e.button!==0) return;
        const id=el.dataset.arr||el.dataset.chip, x0=e.clientX, y0=e.clientY;
        let moviendo=false, navTimer=null, navDir=0;
        const celdaBajo=ev=>{const b=document.elementFromPoint(ev.clientX,ev.clientY);return b&&b.closest?b.closest(".cal-d[data-dia]"):null};
        const mover=ev=>{
          if(!moviendo){
            if(Math.hypot(ev.clientX-x0,ev.clientY-y0)<6) return;
            moviendo=true; el.classList.add("arrastrando");
          }
          cont.querySelectorAll(".cal-d.destino").forEach(c=>c.classList.remove("destino"));
          const c=celdaBajo(ev); if(c) c.classList.add("destino");
          // Si se mantiene sobre ‹ o › unos 0,6 s, el calendario cambia de mes sin soltar la sesión
          const bajo=document.elementFromPoint(ev.clientX,ev.clientY);
          const flecha=bajo&&bajo.closest?bajo.closest("[data-prev],[data-next]"):null;
          // Bordes del calendario: arrastrar a la derecha pasa al mes siguiente y a la izquierda al anterior
          const g=cont.querySelector(".cal-grid"), gr=g?g.getBoundingClientRect():null;
          const borde=gr?(ev.clientX>gr.right-30?1:(ev.clientX<gr.left+30?-1:0)):0;
          const dir=flecha?(flecha.hasAttribute("data-prev")?-1:1):borde;
          if(dir!==navDir){
            clearTimeout(navTimer); navTimer=null; navDir=dir;
            if(dir) navTimer=setTimeout(()=>{ mes=new Date(mes.getFullYear(),mes.getMonth()+dir,1); navTimer=null; pintar(); },600);
          }
        };
        const soltar=ev=>{
          clearTimeout(navTimer);
          window.removeEventListener("pointermove",mover);
          window.removeEventListener("pointerup",soltar);
          window.removeEventListener("pointercancel",soltar);
          el.classList.remove("arrastrando");
          cont.querySelectorAll(".cal-d.destino").forEach(c=>c.classList.remove("destino"));
          if(!moviendo) return;
          arrastrado=true; setTimeout(()=>arrastrado=false,300);
          const c=celdaBajo(ev);
          if(c) moverA(id,c.dataset.dia);
          else { aviso="Suelta la sesión sobre un día del calendario"; pintar(); }
        };
        window.addEventListener("pointermove",mover);
        window.addEventListener("pointerup",soltar);
        window.addEventListener("pointercancel",soltar);
      });
    });
    if(admin){
      const nuevaEnDia=opc=>{
        const [yy,mm,dd]=diaSel.split("-");
        const nueva={titulo:"",fecha:`${dd}/${mm}/${yy}`,bloques:[]};
        abrirEditor(nueva,async st=>{
          await db("POST","sesiones","",{cliente_id:clienteId,fecha:st.fecha,titulo:st.titulo,bloques:st.bloques,registro:{}},"return=minimal");
          const di=parseFecha(st.fecha);
          await tabEntrenosCal(host,clienteId,admin,di?isoLocal(di):diaSel,"Entreno creado en el calendario");
        },opc);
      };
      const bn=cont.querySelector("[data-nuevaday]"); if(bn) bn.onclick=()=>nuevaEnDia({texto:true});
      const bp=cont.querySelector("[data-pegday]"); if(bp) bp.onclick=async()=>{let t="";try{t=await navigator.clipboard.readText()}catch(e){}nuevaEnDia({texto:true,pegar:t})};
      const editarSes=(id,opc)=>{
        const s=todas.find(x=>x.id===id);
        abrirEditor(s,async st=>{
          await db("PATCH","sesiones",`?id=eq.${s.id}`,{titulo:st.titulo,fecha:st.fecha,bloques:st.bloques},"return=minimal");
          fichaCliente(clienteId);
        },opc);
      };
      cont.querySelectorAll("[data-ed]").forEach(b=>b.onclick=()=>editarSes(b.dataset.ed));
      cont.querySelectorAll("[data-edtxt]").forEach(b=>b.onclick=()=>editarSes(b.dataset.edtxt,{texto:true}));
      cont.querySelectorAll("[data-copses]").forEach(b=>b.onclick=async()=>{
        const s=todas.find(x=>x.id===b.dataset.copses), st=cont.querySelector(`[data-bst="${s.id}"]`);
        const ok=await copiarTexto(bloquesATexto(s.bloques)); st.textContent=ok?"✓ Copiada. Abre otra sesión y pulsa «📥 Pegar sesión».":"No se pudo copiar";
      });
      cont.querySelectorAll("[data-pegses]").forEach(b=>b.onclick=async()=>{
        let t="";try{t=await navigator.clipboard.readText()}catch(e){}
        editarSes(b.dataset.pegses,{texto:true,pegar:t});
      });
      cont.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{
        if(!confirm("¿Borrar esta sesión? Se pierden también los registros del cliente.")) return;
        try{await db("DELETE","sesiones",`?id=eq.${b.dataset.del}`,null,"return=minimal");fichaCliente(clienteId)}
        catch(err){alert(err.message)}
      });
    }
  };
  pintar();
}

/* ---------- Acceso del entrenado: prueba, pago o bono ---------- */
function accesoHTML(c){
  const hasta=c.acceso_hasta?new Date(c.acceso_hasta):null;
  const activo=accesoActivo(c);
  const opt=(v,t)=>`<option value="${v}"${c.plan===v?" selected":""}>${t}</option>`;
  return `<div class="card acceso-box"><h3>Acceso del entrenado</h3>
    <p class="muted">${hasta?`Plan: ${esc(c.plan||"—")} · ${activo?"activo hasta":"caducó el"} ${fechaLocal(hasta)}`:"Sin límite de acceso"}</p>
    <div class="row">
      <label>Plan <select id="acPlan"><option value="">—</option>${opt("prueba","Prueba")}${opt("pago","Pago")}${opt("bono","Bono")}</select></label>
      <label>Acceso hasta <input type="date" id="acHasta" value="${hasta?isoLocal(hasta):""}"></label>
    </div>
    <div class="row">
      <button class="sec" id="acPrueba">Dar 7 días de prueba</button>
      <button class="gold" id="acGuardar">Guardar acceso</button>
      <button class="sec" id="acSin">Quitar límite</button>
    </div>
    <h3 style="margin-top:16px">Apartados de la app</h3>
    ${modulosDe(c).length?`<p class="muted">Marca lo que tiene contratado. Solo verá los apartados marcados.</p>`:`<p class="pend-aviso" style="margin:6px 0 10px">⏳ <b>Sin asignar.</b> Hasta que marques fuerza, running o las dos, ${esc(c.nombre||"este entrenado")} solo ve una pantalla de espera al entrar.</p>`}
    <div class="row mod-row">
      <label class="mod-chk"><input type="checkbox" id="mFun"${modulosDe(c).includes("funcional")?" checked":""}> Funcional (fuerza)</label>
      <label class="mod-chk"><input type="checkbox" id="mRes"${modulosDe(c).includes("resistencia")?" checked":""}> Resistencia (running / trail)</label>
      <button class="gold" id="mGuardar">Guardar apartados</button>
    </div>
    <div class="msg" id="acMsg"></div></div>`;
}
function enlazarAcceso(c){
  const guardar=async(plan,fechaIso)=>{
    try{
      const acceso_hasta=fechaIso?new Date(fechaIso+"T23:59:59").toISOString():null;
      await db("PATCH","perfiles",`?id=eq.${c.id}`,{plan:plan||null,acceso_hasta},"return=minimal");
      c.plan=plan||null; c.acceso_hasta=acceso_hasta;
      fichaCliente(c.id);
    }catch(e){msg("#acMsg",e.message,false)}
  };
  $("#acPrueba").onclick=()=>{
    const f=new Date(Date.now()+7*86400000);
    guardar("prueba",isoLocal(f));
  };
  $("#acGuardar").onclick=()=>{
    const f=$("#acHasta").value;
    if(!f){msg("#acMsg","Elige una fecha de caducidad",false);return}
    guardar($("#acPlan").value,f);
  };
  $("#acSin").onclick=()=>guardar($("#acPlan").value,null);
  $("#mGuardar").onclick=async()=>{
    const modulos=[...($("#mFun").checked?["funcional"]:[]),...($("#mRes").checked?["resistencia"]:[])];
    try{
      await db("PATCH","perfiles",`?id=eq.${c.id}`,{modulos},"return=minimal");
      c.modulos=modulos;
      if(modulos.includes("resistencia")){
        await asegurarFichaRes(c);
      }
      msg("#acMsg","Apartados guardados: "+(modulos.length?modulos.map(x=>x==="funcional"?"Funcional":"Resistencia").join(" y "):"ninguno"),true);
    }catch(e){msg("#acMsg",e.message,false)}
  };
}

/* ---------- Panel del cliente ---------- */
function subTabs(lista,ini=0){
  $("#tab").innerHTML=`<div class="tabs">${lista.map((n,i)=>`<button id="sb${i}" class="${i===ini?"on":""}">${n[0]}</button>`).join("")}</div><div id="sub"></div>`;
  pestanas(lista.map((_,i)=>"sb"+i),lista.map(n=>n[1]));
  lista[ini][1]();
}
function tabEntrenosCliente(){subTabs([["Mi entrenamiento",tabEntrenos],["Historial",tabHistorialCliente]])}
function tabPerfilCliente(){subTabs([["Foto y contraseña",tabPerfil],["Anamnesis",tabAnamnesis]])}
async function valoracionVisible(){
  try{
    const r=await db("GET","valoraciones",`?cliente_id=eq.${S.user.id}&visible=eq.true&select=datos,actualizada`);
    return (r&&r[0])||null;
  }catch(e){return {__error:e.message}}
}
// Pinta los datos de una valoración (solo lectura)
function valoracionHTML(datos){
  // Muestra todas las preguntas de la valoración con sus respuestas (solo lectura)
  return anResumenHTML(datos||{},ANAM_VAL,false);
}
// Valoración inicial o funcional del cliente: puede editarla mientras el entrenador la tenga compartida
function listaDe(k){return k==="ini"?ANAM_INI:k==="fun"?ANAM_FUN:ANAM_FMS}
function tabValoracionCliente(v,k,host="#sub"){
  const titulo={ini:"Valoración inicial",fun:"Valoración funcional",fms:"Test FMS"}[k];
  $(host).innerHTML=`<div class="an-panel"><p class="muted">${titulo}${v.actualizada?" · Última actualización: "+anFecha(v.actualizada):""}. Puedes modificarla cuando quieras.</p>
    <div id="vcForm"></div>
    <div class="row" style="margin-top:10px"><button class="gold" id="guardarVc">Guardar</button></div><div class="msg" id="mvc"></div></div>`;
  const form=anForm($("#vcForm"),listaDe(k),v.datos||{},false);
  $("#guardarVc").onclick=async()=>{
    try{
      // Se mezcla con lo que haya en la fila (la otra página y los flags del entrenador)
      const [f]=await db("GET","valoraciones",`?cliente_id=eq.${S.user.id}&select=datos`);
      const nuevo={...((f&&f.datos)||{}),...anCollect(form)};
      const r=await db("PATCH","valoraciones",`?cliente_id=eq.${S.user.id}`,{datos:nuevo,actualizada:new Date().toISOString()},"return=representation");
      if(!r||!r.length) throw new Error("No se pudo guardar. Pide a tu entrenador que la comparta de nuevo.");
      v.datos=nuevo; v.actualizada=r[0].actualizada;
      msg("#mvc","Guardado ✓",true);
    }catch(e){msg("#mvc",e.message,false)}
  };
}
// Anamnesis del cliente (dentro de su perfil): respuestas en solo lectura y botón para rellenar o editar
function anamnesisCliente(){
  const a=S.perfil.anamnesis||{};
  const llena=Object.keys(a).some(k=>!["consent","actualizada","valoracion","_vis"].includes(k));
  $("#sub").innerHTML=`<div class="an-panel">${llena?anResumenHTML(a,ANAM_CLI)+anAntigua(a):'<p class="muted">Todavía no has rellenado la anamnesis.</p>'}
    ${a.actualizada?`<p class="muted">Última actualización: ${anFecha(a.actualizada)}</p>`:""}
    <div class="row" style="margin-top:10px"><button class="gold" id="anEditar">${llena?"Editar anamnesis":"Rellenar anamnesis"}</button></div></div>`;
  $("#anEditar").onclick=()=>tabAnamnesis();
}
async function panelCliente(tab,sub){
  // Todo el panel del cliente está en su perfil; el menú va en la barra superior
  const val=await valoracionVisible();
  const err=val&&val.__error;
  const vis=(val&&val.datos&&val.datos._vis)||{};
  try{
    S.perfil.anamnesis=await leerAnamnesis(S.user.id);
  }catch(e){}
  const anaOn=((S.perfil.anamnesis||{})._vis||{}).ana!==false;
  const subs=[];
  if(val&&vis.ini===true) subs.push(["Valoración inicial",()=>tabValoracionCliente(val,"ini","#sub")]);
  if(anaOn) subs.push(["Anamnesis",anamnesisCliente]);
  if(val&&vis.fun===true) subs.push(["Valoración funcional",()=>tabValoracionCliente(val,"fun","#sub")]);
  if(val&&vis.fms===true) subs.push(["Test FMS",()=>tabValoracionCliente(val,"fms","#sub")]);
  // subTabs() sustituye todo #tab por su barra de subpestañas; al volver a otra pestaña principal
  // hay que restaurar #tab, si no el contenido se pinta dentro de la barra de valoración.
  const limpiarTab=()=>{$("#tab").innerHTML=`<div id="sub"></div>`};
  const verEntrenosCli=()=>{limpiarTab();
    $("#sub").insertAdjacentHTML("beforebegin",'<div id="cli-hoy"></div><div id="cli-bien"></div><div id="cli-rpe"></div>');
    hoyCliente("#cli-hoy");
    tarjetaBienestar("#cli-bien");
    avisoRPE("#cli-rpe",(f)=>tabEntrenosCal("#sub",S.user.id,false,f));
    return tabEntrenosCal("#sub")};
  const misMods=modulosDe(S.perfil);
  const soloRes=misMods.includes("resistencia")&&!misMods.includes("funcional");
  const lista=[[soloRes?"Mis carreras":"Entrenamientos",verEntrenosCli],["Mi carga",()=>{limpiarTab();return tabCargaCliente("#sub")}],["Historial",()=>{limpiarTab();return tabHistorialCliente("#sub")}]];
  if(subs.length) lista.push(["Valoración inicial",()=>subTabs(subs)]);
  if(misMods.includes("resistencia")) lista.push(["Strava y zonas",()=>{limpiarTab();embebido("#sub","tab=strava")}]);
  lista.push(["WhatsApp",()=>{limpiarTab();return tabWhatsApp(S.user.id,false,"#sub")}],["Foto y contraseña",()=>{limpiarTab();return tabPerfil()}]);
  const claves={strava:"Strava y zonas",entrenamientos:lista[0][0],calendario:lista[0][0],carga:"Mi carga",historial:"Historial",valoracion:"Valoración inicial",mensajes:"WhatsApp",anamnesis:"Valoración inicial",perfil:"Foto y contraseña"};
  const key=tab==="perfil"?(sub||"perfil"):(tab||"entrenamientos");
  const iconos={"Strava y zonas":"🔗","Entrenamientos":"🏋️","Mis carreras":"🏃","Mi carga":"📈","Historial":"🕘","Valoración inicial":"📋","WhatsApp":"💬","Foto y contraseña":"👤"};
  shell(`<div id="tab"><div id="sub"></div></div>`);
  let idx=lista.findIndex(n=>n[0]===claves[key]);
  if(idx<0) idx=0;
  const ids=lista.map((_,i)=>"cn"+i);
  navSet(lista.map((n,i)=>`<button id="${ids[i]}" class="${i===idx?"on":""}"><span class="ico">${iconos[n[0]]||""}</span>${n[0]}${n[0]==="Mensajes"?'<span class="badge-msg"></span>':""}</button>`).join(""));
  pestanas(ids,lista.map(n=>n[1]));
  refrescarBadges();
  if(err) $("#tab").insertAdjacentHTML("afterbegin",`<div class="an-panel"><p class="muted">No se pudo cargar tu valoración (${esc(err)}). Avísale a tu entrenador.</p></div>`);
  lista[idx][1]();
}
/* ---------- Seguimiento del ciclo menstrual · fase 1 (solo fechas y fase, sin síntomas) ----------
   Solo lo ve la propia atleta (RLS en ciclos y ciclo_config). Son estimaciones a partir de las fechas
   registradas: no confirman la ovulación ni miden hormonas. No modifica las cargas de entrenamiento. */
const CICLO={activo:false,consentido:false,duracion:28,regs:[],reglas:{}};
const FASES_CICLO={menstrual:"Menstrual",folicular:"Folicular",ovulatoria:"Ovulatoria",lutea:"Lútea"};
const diaN=iso=>{const [y,m,d]=iso.split("-").map(Number);return Math.round(Date.UTC(y,m-1,d)/86400000)};
const sumaDiasIso=(iso,n)=>new Date((diaN(iso)+n)*86400000).toISOString().slice(0,10);
const difDiasIso=(a,b)=>diaN(b)-diaN(a);
const fmtIso=iso=>`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
// Duración media de los últimos 6 ciclos registrados (descarta valores fuera de 21-45 días)
function cicloMedia(){
  const ini=Object.keys(CICLO.reglas).sort(), l=[];
  for(let i=1;i<ini.length;i++){const d=difDiasIso(ini[i-1],ini[i]); if(d>=21&&d<=45) l.push(d)}
  const u=l.slice(-6);
  return u.length?Math.round(u.reduce((a,b)=>a+b,0)/u.length):CICLO.duracion;
}
// Inicios de regla: los registrados y los 6 siguientes previstos
function cicloInicios(){
  const ini=Object.keys(CICLO.reglas).sort(); if(!ini.length) return [];
  const L=cicloMedia(), out=[...ini]; let ult=ini[ini.length-1];
  for(let k=0;k<6;k++){ult=sumaDiasIso(ult,L);out.push(ult)}
  return out;
}
// Fase de una fecha ISO: {fase, dia, ovIso} o null si no hay datos para esa fecha
function faseEn(iso){
  const ini=cicloInicios(); if(!ini.length||iso<ini[0]) return null;
  let i=0; while(i+1<ini.length&&ini[i+1]<=iso) i++;
  const inicio=ini[i];
  const largo=i+1<ini.length?difDiasIso(inicio,ini[i+1]):cicloMedia();
  const dia=difDiasIso(inicio,iso)+1;
  if(dia>largo) return null;
  const regla=CICLO.reglas[inicio]||5;
  const ov=Math.max(largo-14,regla+2); // ovulación estimada: unos 14 días antes del inicio de la siguiente regla
  let fase;
  if(dia<=regla) fase="menstrual";
  else if(Math.abs(dia-ov)<=1) fase="ovulatoria";
  else if(dia<ov) fase="folicular";
  else fase="lutea";
  return {fase,dia,ovIso:sumaDiasIso(inicio,ov-1)};
}
async function cargarCiclo(){
  const id=S.user.id;
  const [cfg,regs]=await Promise.all([
    db("GET","ciclo_config",`?cliente_id=eq.${id}&select=activo,duracion_media,consentimiento`),
    db("GET","ciclos",`?cliente_id=eq.${id}&select=id,inicio,duracion_regla&order=inicio.asc`)]);
  CICLO.activo=!!(cfg&&cfg[0]&&cfg[0].activo);
  CICLO.consentido=!!(cfg&&cfg[0]&&cfg[0].consentimiento);
  CICLO.duracion=(cfg&&cfg[0]&&cfg[0].duracion_media)||28;
  CICLO.regs=regs||[];
  CICLO.reglas={};
  CICLO.regs.forEach(r=>CICLO.reglas[r.inicio]=r.duracion_regla||5);
}
// Si las tablas aún no existen, la función se desactiva sin romper la pestaña
async function cicloSeguro(){try{await cargarCiclo()}catch(e){CICLO.activo=false;CICLO.consentido=false;CICLO.reglas={};CICLO.regs=[]}}
// Marca de la casilla del calendario: solo en el calendario de la propia atleta
function cicloMarca(iso,clienteId){
  if(!CICLO.activo||clienteId!==S.user.id) return "";
  const f=faseEn(iso); if(!f) return "";
  const ov=f.ovIso===iso;
  return `<span class="ciclo-strip fase-${f.fase}${ov?" ov":""}" title="Fase ${FASES_CICLO[f.fase]}${ov?" · ovulación estimada":""}"></span>`;
}
function panelCicloHTML(){
  if(!CICLO.activo) return "";
  const hoyIso=isoLocal(new Date());
  const f=faseEn(hoyIso);
  const ini=cicloInicios();
  const proxRegla=ini.find(x=>x>hoyIso);
  const ovProx=f&&f.ovIso>=hoyIso?f.ovIso:(proxRegla?(faseEn(proxRegla)||{}).ovIso:null);
  const registros=CICLO.regs.slice(-4).reverse().map(r=>`<span class="ciclo-chip">${fmtIso(r.inicio)}<button class="ciclo-x" data-cdel="${r.id}" title="Borrar este registro">✕</button></span>`).join("");
  const cabeza=f?`<span class="ciclo-pill">${FASES_CICLO[f.fase]} · día ${f.dia}</span>`:"";
  const kpis=f?`<div class="ciclo-kpis">
      <div class="ciclo-kpi"><small>Ovulación estimada</small><b>${ovProx?fmtIso(ovProx):"—"}</b></div>
      <div class="ciclo-kpi"><small>Próxima regla prevista</small><b>${proxRegla?fmtIso(proxRegla):"—"}</b></div>
    </div>`:`<p class="ciclo-aviso">Registra la fecha de inicio de tu última regla para ver tus fases.</p>`;
  return `<details class="card ciclo-card${f?" fase-"+f.fase:""}" open>
    <summary class="ciclo-head"><b>Ciclo menstrual</b>${cabeza}</summary>
    ${kpis}
    <p class="ciclo-nota">Estimación según tus fechas. No confirma la ovulación ni mide hormonas.</p>
    <div class="ciclo-form">
      <div class="ciclo-form-t">Registrar inicio de regla</div>
      <div class="ciclo-form-r">
        <label>Fecha <input type="date" id="cicloFe" value="${hoyIso}"></label>
        <label>Días <input type="number" id="cicloDur" min="1" max="10" value="5"></label>
        <button class="gold" id="cicloReg">Registrar</button>
      </div>
      <div class="msg" id="cicloMsg"></div>
    </div>
    ${registros?`<div class="ciclo-regs"><small>Últimos registros</small><div>${registros}</div></div>`:""}
  </details>`;
}
function enlazarCiclo(){
  const r=document.getElementById("cicloReg"); if(!r) return;
  r.onclick=async()=>{
    const fe=document.getElementById("cicloFe").value;
    const dur=Number(document.getElementById("cicloDur").value)||5;
    if(!fe) return msg("#cicloMsg","Elige la fecha de inicio",false);
    if(dur<1||dur>10) return msg("#cicloMsg","Los días de regla deben estar entre 1 y 10",false);
    try{
      await db("POST","ciclos","?on_conflict=cliente_id,inicio",{cliente_id:S.user.id,inicio:fe,duracion_regla:dur},"resolution=merge-duplicates,return=minimal");
      await cargarCiclo(); tabEntrenosCal("#sub");
    }catch(e){msg("#cicloMsg",e.message,false)}
  };
  document.querySelectorAll("[data-cdel]").forEach(b=>b.onclick=async()=>{
    try{
      await db("DELETE","ciclos",`?id=eq.${b.dataset.cdel}`,undefined,"return=minimal");
      await cargarCiclo(); tabEntrenosCal("#sub");
    }catch(e){msg("#cicloMsg",e.message,false)}
  });
}
// Activación voluntaria en el perfil de la atleta
function cicloConfigHTML(){
  return `<h3>Seguimiento del ciclo</h3>
    <label class="row ciclo-cons"><input type="checkbox" id="cicloCons" ${CICLO.consentido?"checked":""}> <span>Acepto que la app guarde las fechas de mi regla y muestre mi fase. Son <b>datos de salud</b>: solo los veo yo, y puedo retirar este consentimiento o borrar todos mis datos cuando quiera.</span></label>
    <label class="row"><input type="checkbox" id="cicloOn" ${CICLO.activo?"checked":""}> Mostrar mi fase del ciclo en entrenos y calendario</label>
    <p class="muted">No cambia tus cargas de entrenamiento. Tu entrenador no ve estos datos.</p>
    <button type="button" class="sec danger" id="cicloBorrar">Borrar todos mis datos del ciclo</button>
    <div class="msg" id="cicloCfgMsg"></div>`;
}
async function enlazarCicloCfg(){
  await cicloSeguro();
  const box=$("#cicloCfg"); if(!box) return;
  box.innerHTML=cicloConfigHTML();
  const cb=$("#cicloOn"), con=$("#cicloCons"), bor=$("#cicloBorrar");
  cb.onchange=async()=>{
    const quiere=cb.checked;
    if(quiere&&!con.checked){ cb.checked=false; return msg("#cicloCfgMsg","Antes marca la casilla de consentimiento para activar el seguimiento.",false); }
    if(!quiere&&!confirm("¿Dejar de mostrar tu fase? Tus fechas se conservan hasta que las borres.")){ cb.checked=true; return; }
    try{
      await db("POST","ciclo_config","?on_conflict=cliente_id",{cliente_id:S.user.id,activo:quiere,duracion_media:CICLO.duracion||28,consentimiento:quiere?new Date().toISOString():null},"resolution=merge-duplicates,return=minimal");
      await cicloSeguro();
      msg("#cicloCfgMsg",quiere?"Seguimiento activado":"Seguimiento desactivado",true);
    }catch(e){cb.checked=!quiere;msg("#cicloCfgMsg",e.message,false)}
  };
  con.onchange=()=>{ if(!con.checked&&cb.checked){ con.checked=true; msg("#cicloCfgMsg","Para retirar el consentimiento, desactiva primero el seguimiento.",false); } };
  bor.onclick=async()=>{
    if(!confirm("Vas a borrar TODOS tus datos del ciclo (fechas y configuración). No se puede deshacer. ¿Continuar?")) return;
    try{
      await db("DELETE","ciclos",`?cliente_id=eq.${S.user.id}`,undefined,"return=minimal");
      await db("DELETE","ciclo_config",`?cliente_id=eq.${S.user.id}`,undefined,"return=minimal");
      await cicloSeguro();
      await enlazarCicloCfg();
      msg("#cicloCfgMsg","Datos del ciclo borrados",true);
    }catch(e){msg("#cicloCfgMsg",e.message,false)}
  };
}
async function tabEntrenos(host="#tab"){
  // Solo las sesiones pendientes: las completadas pasan al historial
  const todas=await db("GET","sesiones",`?cliente_id=eq.${S.user.id}&order=created_at.desc&select=*`);
  const ses=todas.filter(s=>!hecho(s));
  const hechas=todas.length-ses.length;
  const hoyIso=isoLocal(new Date());
  const prox=ses.map(s=>({s,d:parseFecha(s.fecha)})).filter(x=>x.d&&isoLocal(x.d)>=hoyIso).sort((a,b)=>a.d-b.d)[0];
  const resumen=`<div class="resumen"><div><b>${ses.length}</b><small>pendientes</small></div><div><b>${hechas}</b><small>completadas</small></div><div><b>${prox?String(prox.d.getDate()).padStart(2,"0")+"/"+String(prox.d.getMonth()+1).padStart(2,"0"):"—"}</b><small>próximo entreno</small></div></div>`;
  $(host).innerHTML=resumen+(ses.length
    ? ses.map(s=>`<details class="card sesion${hecho(s)?" hecha":""}"><summary class="dia-sum">${badgeFecha(s)}<h3>${nombreEntreno(s)}</h3></summary>
        ${sesionHTML(s,true)}
        <div class="row"><button data-save="${s.id}">Guardar registro</button><span class="muted" data-st="${s.id}"></span></div></details>`).join("")
    : `<p class="muted">No tienes entrenamientos pendientes. Los completados están en el Historial.</p>`);
  document.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.save;
    const st=document.querySelector(`[data-st="${id}"]`);
    try{
      const reg=leerRegistro(b.closest(".card"));
      await db("PATCH","sesiones",`?id=eq.${id}`,{registro:reg},"return=minimal");
      if(hecho({registro:reg})){
        const rs=Object.values(reg).map(v=>parseFloat(String(v&&v.rpe).replace(",","."))).filter(x=>Number.isFinite(x));
        const rpeM=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null;
        const sesObj=ses.find(x=>String(x.id)===String(id));
        mostrarMotivacion(motivarCompletado({tipo:"fuerza",rpe:rpeM,ses:sesObj&&sesObj.titulo}));
        st.textContent="Entrenamiento completado ✓ · pasa al historial";
        setTimeout(()=>tabEntrenos(host),1200);
      } else st.textContent="Guardado ✓";
    }catch(e){st.textContent="Error: "+e.message}
  });
}
/* ---------- Anamnesis ---------- */
// Preguntas de la ficha antigua: se siguen mostrando si un cliente ya las tenía rellenas
const ANAM_OLD=[["objetivo","Objetivo"],["experiencia","Experiencia deportiva"],["lesiones","Lesiones"],["salud","Salud (enfermedades relevantes)"],["medicacion","Medicación"],["disponibilidad","Disponibilidad horaria"],["observaciones","Observaciones"]];
const AN_CONSENT="Acepto el tratamiento de mis datos";
const ANAM_CLI=[
 {n:"Datos personales",f:[
  {row:[{k:"nacimiento",t:"date",l:"Fecha de nacimiento",req:1},{k:"dni",t:"text",l:"DNI",req:1},{k:"telefono",t:"tel",l:"Teléfono",req:1}]},
  {k:"sexo",t:"radio",l:"Sexo",req:1,o:["Hombre","Mujer"]},
  {row:[{k:"direccion",t:"text",l:"Dirección de las sesiones"},{k:"profesion",t:"text",l:"Profesión"}]},
  {k:"emergencia",t:"text",l:"Contacto de emergencia (nombre y teléfono)"},
  {k:"origen",t:"radio",l:"¿Cómo has conocido Alex Training Lab?",req:1,o:["Búsqueda en Google","Redes sociales","Anuncio en redes sociales","Ha oído hablar de nosotros","Recomendación de otro cliente"],otro:1}
 ]},
 {n:"Historial de actividad física",f:[
  {k:"act_actual",t:"radio",l:"¿En la actualidad practicas algún deporte o actividad física?",req:1,o:["Sí","No"]},
  {when:"act_actual=Sí",f:[
   {k:"act_tipo",t:"text",l:"¿Qué tipo de deporte o actividad física realizas?"},
   {k:"act_tiempo",t:"text",l:"¿Cuánto tiempo llevas practicándola de forma continuada y con qué frecuencia?"},
   {k:"act_detalle",t:"area",l:"¿Cómo la realizas? (duración, volumen, intensidad, ejercicios, descansos…)"}
  ]},
  {k:"act_pasada",t:"radio",l:"¿Has practicado en el pasado algún deporte o actividad que no hagas ahora?",req:1,o:["Sí","No"]},
  {when:"act_pasada=Sí",f:[
   {k:"pas_tipo",t:"text",l:"¿Qué deporte o actividad física practicabas?"},
   {row:[{k:"pas_sin",t:"text",l:"¿Cuánto tiempo llevas sin practicarla?"},{k:"pas_tiempo",t:"text",l:"¿Durante cuánto tiempo y con qué frecuencia?"}]},
   {k:"pas_detalle",t:"area",l:"¿Cómo la realizabas? (duración, volumen, intensidad, ejercicios, descansos…)"}
  ]},
  {k:"fuerza_exp",t:"radio",l:"Experiencia con entrenamiento de fuerza",o:["Ninguna","Menos de 6 meses","6 meses a 2 años","Más de 2 años"]},
  {k:"entrenador_previo",t:"area",l:"¿Has tenido entrenador antes? ¿Qué funcionó y qué no?"}
 ]},
 {n:"Objetivos",f:[
  {k:"objetivos",t:"checks",l:"¿Cuál o cuáles son tus principales objetivos?",req:1,o:["Rendimiento deportivo","Salud","Pérdida de peso","Ganancia de masa muscular","Recuperación de lesiones","Aumento de la condición física","Preparación de pruebas físicas"],otro:1},
  {k:"obj_desc",t:"area",l:"Describe los objetivos principales y secundarios que quieres conseguir"}
 ]},
 {n:"Salud",f:[
  {k:"patologias",t:"checks",l:"¿Has tenido o tienes alguna de estas patologías?",o:["Operación reciente","Hipertensión arterial","Hipotensión arterial","Cardiopatía","Desvanecimientos, mareos","Diabetes","Colesterol alto","Convulsiones","Neumopatía","Ataque al corazón","Respiración entrecortada en reposo o con esfuerzo leve","Dolores torácicos","Palpitaciones o taquicardia","Calambres musculares frecuentes","Dolor o malestar en pecho, mandíbula, brazos u otras zonas","Fatiga inusual con actividades normales"],otro:1},
  {t:"alert"},
  {k:"medicacion_actual",t:"area",l:"Medicación actual o diagnósticos relevantes"},
  {k:"fuma",t:"radio",l:"¿Fumas?",req:1,o:["Sí","No"]},
  {when:"fuma=Sí",f:[{k:"fuma_cant",t:"text",l:"¿Cuánto al día?"}]},
  {row:[{k:"sueno_h",t:"select",l:"¿Cuántas horas duermes al día?",req:1,o:["0","1","2","3","4","5","6","7","8","9","10","Más de 10"]},{k:"alcohol",t:"select",l:"¿Consumes alcohol?",o:["No","Sí","Fin de semana","Diario"]}]},
  {k:"sueno_cal",t:"radio",l:"¿Cómo es la calidad de tu sueño?",req:1,o:["Mala","Regular","Buena"],otro:1},
  {k:"estres",t:"scale",l:"Nivel de estrés habitual",n:10,s:1,ends:["Bajo","Muy alto"]}
 ]},
 {n:"Historial de lesiones",f:[
  {k:"les_actual",t:"radio",l:"¿Padeces o has padecido recientemente alguna lesión?",req:1,o:["Sí","No"]},
  {when:"les_actual=Sí",f:[
   {row:[{k:"les_que",t:"text",l:"¿De qué lesión se trata?"},{k:"les_cuando",t:"text",l:"¿Hace cuánto te lesionaste?"}]},
   {k:"les_fase",t:"radio",l:"¿En qué fase de la lesión te encuentras?",o:["Fase aguda","Fase preoperatoria","Fase postoperatoria","Recuperación funcional","Readaptación deportiva"],otro:1},
   {row:[{k:"les_trat_act",t:"radio",l:"¿Recibes tratamiento actualmente?",o:["Sí","No"]},{k:"les_trat_pas",t:"radio",l:"¿Lo has recibido en el pasado?",o:["Sí","No"]}]},
   {k:"les_trat_tipo",t:"text",l:"Tipo y frecuencia del tratamiento"},
   {k:"les_detalle",t:"area",l:"Aspectos importantes de la lesión"},
   {k:"dolor",t:"scale",l:"Intensidad del dolor habitual",n:11,s:0,ends:["Sin dolor","Máximo"]}
  ]},
  {k:"les_pasado",t:"radio",l:"¿Has tenido lesiones en el pasado?",req:1,o:["Sí","No"]},
  {when:"les_pasado=Sí",f:[
   {k:"les_pas_cuales",t:"area",l:"¿Cuáles?"},
   {k:"les_pas_molesta",t:"radio",l:"¿Alguna puede darte problemas o molestias al hacer actividad física ahora?",o:["Sí","No"]},
   {when:"les_pas_molesta=Sí",f:[{k:"les_pas_detalle",t:"area",l:"¿Cuáles y qué problemas te pueden ocasionar?"}]}
  ]}
 ]},
 {n:"Estilo de vida",f:[
  {k:"trabajo",t:"radio",l:"Tipo de trabajo",o:["Sedentario","De pie","Físicamente exigente","Turnos o viajes"]},
  {row:[{k:"sentado",t:"text",l:"Horas sentado al día"},{k:"pasos",t:"text",l:"Pasos diarios aproximados"}]}
 ]},
 {n:"Declaración y consentimiento",f:[
  {t:"p",h:"Declaro que la información facilitada es veraz y que comunicaré cualquier cambio en mi estado de salud. Entiendo que el ejercicio físico conlleva riesgos y que debo avisar al entrenador si noto dolor, mareo o malestar durante las sesiones."},
  {t:"p",h:"Autorizo el tratamiento de mis datos personales, incluidos los de salud, con la única finalidad de diseñar y supervisar mi programa de entrenamiento. No se cederán a terceros salvo obligación legal. Puedo pedir en cualquier momento el acceso, la rectificación o la supresión de mis datos."},
  {k:"consentimientos",t:"checks",l:"Consentimientos",req:1,o:[AN_CONSENT,"Acepto fotos o vídeos de técnica para mi seguimiento"]}
 ]}
];
// Bloque que rellena el entrenador en la primera sesión
const REG_FIJAS=[["fecha","Fecha","date"],["pi","Prensión I","num"],["pd","Prensión D","num"]];
const REG_DEF=[["g","Globet 8 kg"],["f","Flexiones 10"],["e1","Ejercicio 1"],["e2","Ejercicio 2"],["e3","Ejercicio 3"],["e4","Ejercicio 4"],["e5","Ejercicio 5"]];
const FMS_VIDEO="https://www.youtube-nocookie.com/embed/KkxFRFs-XVU";
const FMS_MAX=21;
const FMS=[
 {id:"sent",video:"Zt93U1_lbp0",n:"Sentadilla profunda con brazos estirados",lado:false,
  para:"Coordinación, core estable y movilidad de tobillos, rodillas, caderas, cintura escapular y hombros.",
  material:"Palo o tubo de PVC.",
  pasos:["Pies a la altura de los hombros y paralelos entre sí.","Apoya el palo en la cabeza con los codos a 90º para ver dónde van las manos; después estira los brazos para levantar el palo.","Con la mirada al frente, desciende lo más profundo que puedas con los talones pegados al suelo.","Evita que las rodillas se metan hacia dentro. El palo debe mantenerse paralelo al suelo."],
  pts:["Ejecución perfecta sin ayuda: caderas por debajo de las rodillas, torso paralelo a la tibia, rodillas rectas y palo horizontal sobre los pies.","Para ejecutarla necesitas elevar los talones o curvar la zona lumbar.","No puedes realizarla ni con ayuda para elevar los talones.","Hay dolor."]},
 {id:"valla",video:"s5lvjkYrM_I",n:"Paso de valla",lado:true,
  para:"Compensaciones y asimetrías en la locomoción, junto con la estabilidad del core y del glúteo medio.",
  material:"Palo o tubo de PVC y un obstáculo ligeramente inferior a la altura de tus rodillas (una cinta adhesiva en el marco de una puerta sirve).",
  pasos:["Sujeta el palo por detrás de la cabeza, apoyado en la nuca, encima de los hombros.","Empieza con los pies juntos y paralelos, con la punta alineada con la vertical de la cinta.","Manteniendo la postura recta, levanta una pierna por encima de la cinta y toca con el talón el otro lado. No flexiones ni eleves la pierna de apoyo.","Sin perder la postura recta de la espalda, vuelve a la posición inicial."],
  pts:["Tobillo, rodillas y caderas alineados y sin compensar con la zona lumbar. El palo se mantiene paralelo al suelo y no tocas la cinta.","Rompes la alineación de tobillo, rodilla y cadera, compensas con la zona lumbar o el palo toca el marco de la puerta.","Pierdes el equilibrio, el palo no permanece horizontal o tocas la cinta con el pie.","Hay dolor."]},
 {id:"estocada",video:"zm_jSAaIQIM",n:"Estocada en línea (zancada)",lado:true,
  para:"Estabilidad, equilibrio y movilidad del tren inferior (cadera, rodillas y tobillos).",
  material:"Palo o tubo de PVC y una línea recta en el suelo con cinta adhesiva o tiza, de la longitud de la distancia entre tu rodilla y el suelo.",
  pasos:["Coge el palo por detrás de la espalda, en vertical: una mano en la zona lumbar y la otra detrás del cuello.","Coloca un pie con la punta al final de la línea y da un paso hasta que el talón del otro pie marque el inicio de la línea.","Sin mover los pies, baja el cuerpo hasta tocar el suelo con la rodilla de atrás, sin elevar el talón del pie delantero.","Vuelve a la posición inicial impulsándote con el pie adelantado. El palo debe permanecer en contacto con la cabeza y la espalda. Repite con el otro lado."],
  pts:["Ejecución perfecta: sin perder la alineación, sin flexionar el tronco, sin levantar el talón y con estabilidad y equilibrio.","Compensas flexionando el tronco, lo que se nota porque el palo se separa del cuerpo.","Pierdes el equilibrio.","Hay dolor."]},
 {id:"hombros",video:"2bi5uCRHJz4",n:"Movilidad de hombros",lado:true,
  para:"Movilidad articular de hombros, escápulas y columna torácica.",
  material:"Palo o tubo de PVC y cinta métrica.",
  pasos:["Con la mirada al frente y los pies juntos, intenta juntar las manos detrás de la espalda.","Una mano baja por detrás de la cabeza y la otra sube por la espalda. Mantén los puños cerrados.","Mide la distancia entre las puntas de los dedos (o usa el palo como referencia)."],
  pts:["Se tocan o hay menos de una mano de distancia.","Existe una distancia inferior a una mano y media.","La distancia es superior a una mano y media.","Hay dolor."]},
 {id:"pierna",video:"t9AsBEtlSJk",n:"Elevación activa de pierna estirada",lado:true,
  para:"Estabilidad del core y flexión y extensión de cadera.",
  material:"Palo o tubo de PVC (lo sostiene quien te evalúa).",
  pasos:["Túmbate boca arriba con las piernas juntas y los brazos estirados, con las palmas hacia arriba.","Eleva una pierna lo que puedas, sin flexionar el tobillo ni la rodilla. La cadera y la otra pierna deben permanecer inmóviles, pegadas al suelo.","Quien te evalúa coloca el palo marcando la vertical del talón."],
  pts:["El palo baja entre la mitad del muslo y la cadera.","El palo queda en la mitad inferior del muslo.","El palo queda por debajo de la rodilla.","Hay dolor."]},
 {id:"flexion",video:"CWb38D76DCw",n:"Estabilidad del tronco en flexión",lado:false,
  para:"Estabilidad y fortaleza del core, y capacidad de moverte sin compensaciones y con la columna en posición neutra.",
  material:"Ninguno.",
  pasos:["Tumbado boca abajo, apoya las manos a una anchura similar o ligeramente superior a la de los hombros. Los pulgares quedan a la altura de la frente (hombres) o de la barbilla (mujeres).","Con piernas y tronco totalmente estirados, realiza una flexión estirando los brazos."],
  pts:["Ejecución perfecta sin doblar el cuerpo, usando de forma sincronizada hombros y caderas.","Para una buena técnica, baja ligeramente la posición de las manos: el pulgar a la altura de la barbilla (hombres) o de los hombros (mujeres).","No eres capaz de realizar el ejercicio manteniendo la posición firme del tronco.","Hay dolor."]},
 {id:"rotacion",video:"gyt46-TEPcA",n:"Estabilidad con rotación",lado:true,
  para:"Estabilidad de hombros, tronco y pelvis en movimiento combinado de extremidad superior e inferior. Muy útil para escaladores.",
  material:"Cinta adhesiva para marcar una línea recta de unos 1 metro en el suelo.",
  pasos:["Colócate a cuatro patas simétricamente sobre la cinta, con el torso recto y paralelo al suelo. Muslos y brazos perpendiculares al suelo y al tronco.","Estira a la vez una pierna y un brazo del mismo lado, manteniendo el tronco horizontal y la columna neutra.","Intenta tocar con el codo la rodilla a mitad de recorrido, sin perder la estabilidad del tronco.","Si no puedes con el brazo y la pierna del mismo lado, prueba con extremidades de lados distintos; en ese caso, el contacto codo-rodilla se hace en la vertical de la cinta. Evalúa ambos lados."],
  pts:["Ejecución perfecta, con pierna y brazo del mismo lado.","Ejecución perfecta, pero con las extremidades de distintos lados.","No consigues ninguno de los anteriores por pérdida de equilibrio o falta de movilidad.","Hay dolor."]}
];
FMS.forEach((t,i)=>t.orden=i+1);
let anAdminMode=false;
const ANAM_INI=[
 {n:"Datos generales y pruebas",f:[
  {row:[{k:"peso",t:"text",l:"Peso (kg)"},{k:"altura",t:"text",l:"Altura (cm)"}]},
  {row:[{k:"cadera",t:"text",l:"Cadera (cm)"},{k:"fc_reposo",t:"text",l:"FC en reposo (ppm)"}]},
  {t:"tests",rows:[
   ["Sentadilla con brazos arriba (compensaciones)","t_sentadilla"],
   ["Flexiones máximas (o inclinadas)","t_flexiones"],
   ["Plancha frontal (s)","t_plancha"],
   ["Sentarse y levantarse de silla en 30 s","t_silla"],
   ["Fuerza de agarre con dinamómetro (kg, mejor de 3)",["agarre_dcha","Dcha."],["agarre_izda","Izda."]],
   ["Movilidad de tobillo, rodilla a la pared (cm)",["tobillo_dcho","Dcho."],["tobillo_izdo","Izdo."]],
   ["Movilidad de hombro","t_hombro"],
   ["Test cardiovascular (6 min marcha o escalón)","t_cardio"]
  ]}
 ]}
];
const ANAM_FMS=[
 {n:"Test FMS",f:[{t:"fms"}]}
];
const ANAM_FUN=[
 {n:"Movilidad",f:[{t:"pares",cols:["Izquierda (cm)","Derecha (cm)"],rows:[["Dorsiflexión tobillo","tobillo_i","tobillo_d"],["Movilidad hombro","hombro_i","hombro_d"]]}]},
 {n:"Estabilidad",f:[
  {t:"grid",o:["Positivo","Negativo"],rows:[["Trendelenburg izquierda","trend_i"],["Trendelenburg derecha","trend_d"]]},
  {t:"grid",o:["Sí","No"],rows:[["Rotary: báscula cadera","rot_bascula"],["Rotary: arquea lumbar","rot_arquea"],["Rotary: retrae escápulas","rot_escapulas"]]}
 ]},
 {n:"Sentadilla overhead",f:[{t:"grid",o:["Sí","No"],rows:[
  ["Anterior: rota ext. cadera","va_rot_cadera"],["Anterior: prona tobillo","va_prona_tobillo"],["Anterior: valgo rodillas","va_valgo_rodillas"],
  ["Lateral: inclina torso","vl_inclina_torso"],["Lateral: flexión lumbar","vl_flexion_lumbar"],["Lateral: extiende hombro","vl_extiende_hombro"],
  ["Posterior: prona tobillo","vp_prona_tobillo"],["Posterior: báscula cadera","vp_bascula_cadera"]]}]},
 {n:"Sentadilla a una pierna y salto",f:[{t:"grid",o:["Sí","No"],rows:[["Single leg squat: valgo izq.","sl_valgo_i"],["Single leg squat: valgo der.","sl_valgo_d"],["Drop jump: valgo","dj_valgo"]]}]},
 {n:"Fuerza y progresión",f:[
  {row:[{k:"edad",t:"num",l:"Edad (años)"},{k:"sexo",t:"radio",l:"Sexo",o:["Hombre","Mujer"]}]},
  {t:"registro"},
  {t:"progreso"},
  {t:"grip"}
 ]},
 {n:"Observaciones",f:[
  {k:"observaciones_val",t:"area",l:"Observaciones y prioridades"}
 ]}
];
const ANAM_VAL=[...ANAM_INI,...ANAM_FUN];

function regIds(v){const s=(v&&v.reg_ids)||"";return s?s.split(",").filter(Boolean):REG_DEF.map(d=>d[0])}
function regNombre(v,id){const n=v&&v["regn_"+id];if(n)return n;const d=REG_DEF.find(x=>x[0]===id);return d?d[1]:"Columna"}
// Ajusta la altura de las celdas de texto al contenido para que no se corte nada
function anFitTA(root){(root||document).querySelectorAll(".an-reg textarea").forEach(t=>{t.style.height="auto";t.style.height=(t.scrollHeight+2)+"px"})}
document.addEventListener("input",ev=>{if(ev.target.closest&&ev.target.closest(".an-reg")&&ev.target.tagName==="TEXTAREA"){ev.target.style.height="auto";ev.target.style.height=(ev.target.scrollHeight+2)+"px"}});
function anRegTabla(form,el,src,admin){
  const ids=regIds(src);
  const celda=(name,t,lab,value)=>t==="text"
    ?`<textarea name="${name}" rows="2" aria-label="${esc(lab)}">${esc(value??"")}</textarea>`
    :`<input type="${t==="num"?"number":t}"${t==="num"?' inputmode="decimal" step="any"':""} name="${name}" value="${esc(value??"")}" aria-label="${esc(lab)}">`;
  const cab=ids.map(id=>admin
    ?`<th><textarea name="regn_${id}" rows="2" aria-label="Nombre de la columna" class="rn">${esc(regNombre(src,id))}</textarea><button type="button" class="rm" data-rm="${id}" aria-label="Quitar columna">×</button></th>`
    :`<th>${esc(regNombre(src,id))}<input type="hidden" name="regn_${id}" value="${esc(regNombre(src,id))}"></th>`).join("");
  const head=`<tr><th>Nº</th>${REG_FIJAS.map(c=>`<th>${c[1]}</th>`).join("")}${cab}</tr>`;
  let body="";
  for(let i=0;i<=12;i++){
    body+=`<tr><td>${i?i:"Ini."}</td>${REG_FIJAS.map(c=>`<td>${celda(`r${i}_${c[0]}`,c[2],c[1]+" "+(i?"fila "+i:"inicial"),src[`r${i}_${c[0]}`])}</td>`).join("")}${ids.map(id=>`<td>${celda(`r${i}_${id}`,"text",regNombre(src,id)+" fila "+i,src[`r${i}_${id}`])}</td>`).join("")}</tr>`;
  }
  el.innerHTML=`<input type="hidden" name="reg_ids" value="${esc(ids.join(","))}"><div class="an-scroll"><table class="an-grid an-reg"><thead>${head}</thead><tbody>${body}</tbody></table></div>${admin?`<div class="an-addcol"><button type="button" data-addcol>+ Añadir columna</button></div>`:""}`;
  requestAnimationFrame(()=>anFitTA(el));
  if(admin){
    el.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{const c=anCollect(form);c.reg_ids=regIds(c).filter(x=>x!==b.dataset.rm).join(",");anRegTabla(form,el,c,true)});
    el.querySelector("[data-addcol]").onclick=()=>{const c=anCollect(form);const id="x"+Date.now().toString(36);c.reg_ids=[...regIds(c),id].join(",");c["regn_"+id]="Nueva columna";anRegTabla(form,el,c,true)};
  }
}

function anLab(fd){return esc(fd.l)+(fd.req?' <span class="an-req">*</span>':"")}
function anField(fd){
  if(fd.row) return `<div class="an-row">${fd.row.map(anField).join("")}</div>`;
  if(fd.when) return `<div class="an-cond" data-when="${esc(fd.when)}">${fd.f.map(anField).join("")}</div>`;
  switch(fd.t){
    case "select":
      return `<div class="an-f" data-k="${fd.k}"><label>${anLab(fd)}<select name="${fd.k}"><option value="">Elige una opción</option>${fd.o.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></label></div>`;
    case "text":case "date":case "tel":
      return `<div class="an-f" data-k="${fd.k}"><label>${anLab(fd)}<input type="${fd.t}" name="${fd.k}" autocomplete="off"></label></div>`;
    case "area":
      return `<div class="an-f" data-k="${fd.k}"><label>${anLab(fd)}<textarea name="${fd.k}" rows="2"></textarea></label></div>`;
    case "radio":case "checks":case "scale":{
      const opts=fd.t==="scale"?Array.from({length:fd.n},(_,i)=>String(fd.s+i)):fd.o.slice();
      if(fd.otro) opts.push("Otro");
      const type=fd.t==="checks"?"checkbox":"radio";
      return `<div class="an-f" data-k="${fd.k}"><div class="an-q">${anLab(fd)}</div>
        <div class="${fd.t==="scale"?"an-scale":"an-chips"}">${opts.map(o=>`<label><input type="${type}" name="${fd.k}" value="${esc(o)}"${fd.t==="scale"?` aria-label="${esc(o)}"`:""}>${esc(o)}</label>`).join("")}</div>
        ${fd.t==="scale"?`<div class="an-ends"><span>${esc(fd.ends[0])}</span><span>${esc(fd.ends[1])}</span></div>`:""}
        ${fd.otro?`<div class="an-otro" data-when="${fd.k}=Otro"><input type="text" name="${fd.k}_otro" placeholder="Especifica"></div>`:""}</div>`;
    }
    case "num":
      return `<div class="an-f" data-k="${fd.k}"><label>${anLab(fd)}<input type="number" inputmode="decimal" step="any" name="${fd.k}" autocomplete="off"></label></div>`;
    case "fms":
      return `<div class="fms-wrap"><iframe class="fms-iframe" src="${FMS_VIDEO}" loading="lazy" allowfullscreen title="Vídeo explicativo de la batería FMS"></iframe>
        ${FMS.map((t,i)=>`<details class="fms-card">
          <summary><span class="fms-num">${i+1}</span><span class="fms-nombre">${esc(t.n)}</span><span class="fms-sum" data-sum="${t.id}"></span></summary>
          <div class="fms-body">
            <p>${esc(t.para)}</p>
            <p class="muted"><b>Material:</b> ${esc(t.material)}</p>
            <ol>${t.pasos.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
            <iframe class="fms-iframe" src="https://www.youtube-nocookie.com/embed/${t.video}" loading="lazy" allowfullscreen title="Vídeo: ${esc(t.n)}"></iframe>
            <div class="fms-pts-box">${t.pts.map((x,j)=>`<div class="fms-pt"><span class="fms-n fms-v${3-j}">${3-j}</span><span>${esc(x)}</span></div>`).join("")}</div>
            ${fmsFila(anAdminMode?"fms_":"cli_",t)}
            <div class="fms-vid" data-fv="${t.id}"></div>
          </div>
        </details>`).join("")}
        ${anAdminMode?`<div class="fms-final"><h4>Resumen general <span class="muted">(solo entrenador)</span></h4>
          <p class="muted">Puntúa después de revisar los vídeos. El cliente no ve esta columna.</p>
          <table class="an-grid"><thead><tr><th>Test</th><th>Cliente (D / I)</th><th>Final D</th><th>Final I</th></tr></thead><tbody>${FMS.map(t=>`<tr><td>${esc(t.n)}</td><td><span data-cs="${t.id}" class="fms-sv">–</span></td><td>${fmsSc("fin_"+t.id+"_d")}</td><td>${t.lado?fmsSc("fin_"+t.id+"_i"):"–"}</td></tr>`).join("")}</tbody></table></div>`:""}</div>`;
    case "grid":
      return `<div class="an-scroll"><table class="an-grid"><thead><tr><th></th>${fd.o.map(o=>`<th>${esc(o)}</th>`).join("")}</tr></thead><tbody>${fd.rows.map(([l,k])=>`<tr><td>${esc(l)}</td>${fd.o.map(o=>`<td><input type="radio" name="${k}" value="${esc(o)}" aria-label="${esc(l+": "+o)}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "pares":
      return `<div class="an-scroll"><table class="an-grid"><thead><tr><th></th>${fd.cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${fd.rows.map(([l,a,b])=>`<tr><td>${esc(l)}</td><td><input type="number" inputmode="decimal" step="any" name="${a}" aria-label="${esc(l+" izquierda")}"></td><td><input type="number" inputmode="decimal" step="any" name="${b}" aria-label="${esc(l+" derecha")}"></td></tr>`).join("")}</tbody></table></div>`;
    case "registro":
      return `<div class="an-regwrap" data-reg></div>`;
    case "progreso":
      return `<div class="prog-wrap" data-prog></div>`;
    case "grip":
      return `<div class="an-f grip-res muted"></div>`;
    case "alert": return `<div class="an-alert"></div>`;
    case "p": return `<p class="muted">${esc(fd.h)}</p>`;
    case "tests":
      return `<div class="ses"><table class="an-tests">${fd.rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${typeof r[1]==="string"
        ?`<input type="text" name="${r[1]}" aria-label="${esc(r[0])}">`
        :`<div class="an-pair">${r.slice(1).map(x=>`<label>${esc(x[1])} <input type="text" name="${x[0]}" aria-label="${esc(r[0]+" "+x[1])}"></label>`).join("")}</div>`}</td></tr>`).join("")}</table></div>`;
  }
  return "";
}
function anCollect(form){
  const v={};
  form.querySelectorAll("[name]").forEach(c=>{
    if(c.type==="checkbox"){v[c.name]=v[c.name]||[];if(c.checked)v[c.name].push(c.value)}
    else if(c.type==="radio"){if(!(c.name in v))v[c.name]="";if(c.checked)v[c.name]=c.value}
    else v[c.name]=c.value.trim();
  });
  return v;
}
function anApply(form,v){
  form.querySelectorAll("[name]").forEach(c=>{
    const x=v[c.name];
    if(x===undefined)return;
    if(c.type==="checkbox")c.checked=Array.isArray(x)&&x.includes(c.value);
    else if(c.type==="radio")c.checked=x===c.value;
    else c.value=x??"";
  });
}
const anVacio=x=>x==null||x===""||(Array.isArray(x)&&!x.length);
function anCumple(when,v){const [k,val]=when.split("=");const x=v[k];return Array.isArray(x)?x.includes(val):x===val}
function anAviso(v){
  const n=(v.patologias||[]).length;
  return n?`Ha marcado ${n} ${n===1?"patología":"patologías"}: pedir valoración o autorización médica antes de la primera sesión.`:"";
}
const GRIP={
  Hombre:[[18,24,41.4,51.2],[25,29,43.3,59.4],[30,34,36.4,56.4],[35,39,39.7,54.3],[40,44,39.9,54.4],[45,49,35.8,48.2],[50,54,39,52.3],[55,59,32.4,47.8],[60,64,30.4,44.9],[65,69,31.5,45.8],[70,74,29.3,41.2],[75,79,25.9,36.6],[80,85,21.5,34.6]],
  Mujer:[[18,24,22.4,33.8],[25,29,25.4,33.6],[30,34,23.9,33],[35,39,24.5,33],[40,44,26.5,33.8],[45,49,25.2,34.4],[50,54,24.6,32.7],[55,59,20.7,30.2],[60,64,19.2,28.1],[65,69,19.3,25],[70,74,19.5,23.9],[75,79,15.7,22.4],[80,85,16.6,21.8]]
};
// Nivel de fuerza de agarre según edad y sexo (tablas de la hoja)
function gripNivel(v,kg){
  const tabla=GRIP[v.sexo], edad=parseInt(v.edad,10), x=parseFloat(String(kg??"").replace(",","."));
  if(!tabla||isNaN(edad)||isNaN(x)) return null;
  const fila=edad<=24?tabla[0]:edad>=80?tabla[tabla.length-1]:tabla.find(r=>edad>=r[0]&&edad<=r[1]);
  return x<fila[2]?{t:"Baja",c:"nv-b"}:x>fila[3]?{t:"Alta",c:"nv-a"}:{t:"Media",c:"nv-m"};
}
const numTxt=x=>{const n=parseFloat(String(x??"").replace(",",".")); return isNaN(n)?null:n};
// Tabla de progresión: agarre (con nivel), sentadilla y flexiones según los registros
function progresoHTML(v){
  const ids=regIds(v);
  const cS=ids.find(id=>/sentadilla|globet|squat/i.test(regNombre(v,id)));
  const cF=ids.find(id=>/flexi|push/i.test(regNombre(v,id)));
  const filas=[];
  for(let i=0;i<=12;i++){
    const f={i,fecha:v[`r${i}_fecha`],pi:v[`r${i}_pi`],pd:v[`r${i}_pd`],s:cS?v[`r${i}_${cS}`]:"",fl:cF?v[`r${i}_${cF}`]:""};
    if([f.fecha,f.pi,f.pd,f.s,f.fl].some(x=>!anVacio(x))) filas.push(f);
  }
  if(!filas.length) return `<p class="muted">Cuando anotes registros en la tabla de arriba, aquí verás la progresión.</p>`;
  const base=filas.find(f=>f.i===0)||filas[0];
  const bI=numTxt(base.pi), bD=numTxt(base.pd), bS=numTxt(base.s), bF=numTxt(base.fl);
  const dif=(now,b,i)=>{const n=numTxt(now); if(!i||n==null||b==null||n===b) return ""; const d=+(n-b).toFixed(1); return `<small class="${d>0?"up":"down"}">${d>0?"+":""}${d}</small>`};
  const nivel=kg=>{const g=gripNivel(v,kg); return g?`<span class="nv ${g.c}">${g.t}</span>`:""};
  const agarre=(kg,b,i)=>anVacio(kg)?"–":`${esc(kg)} kg ${nivel(kg)} ${dif(kg,b,i)}`;
  const txt=x=>anVacio(x)?"–":esc(x)+" "+dif(x,null,false);
  const fecha=x=>anVacio(x)?"–":esc(String(x).split("-").reverse().join("/"));
  return `<div class="an-scroll"><table class="an-grid prog"><thead><tr><th>Nº</th><th>Fecha</th><th>Agarre I</th><th>Agarre D</th><th>${esc(cS?regNombre(v,cS):"Sentadilla")}</th><th>${esc(cF?regNombre(v,cF):"Flexiones")}</th></tr></thead><tbody>${
    filas.map(f=>`<tr><td>${f.i?f.i:"Ini."}</td><td>${fecha(f.fecha)}</td><td>${agarre(f.pi,bI,f.i)}</td><td>${agarre(f.pd,bD,f.i)}</td><td>${f.i&&numTxt(f.s)!=null?esc(f.s)+" "+dif(f.s,bS,true):txt(f.s)}</td><td>${f.i&&numTxt(f.fl)!=null?esc(f.fl)+" "+dif(f.fl,bF,true):txt(f.fl)}</td></tr>`).join("")
  }</tbody></table></div>`;
}
function gripTexto(v){
  const tabla=GRIP[v.sexo], edad=parseInt(v.edad,10);
  if(!tabla||isNaN(edad)) return "Indica edad y sexo para ver la clasificación de prensión manual.";
  const fila=edad<=24?tabla[0]:edad>=80?tabla[tabla.length-1]:tabla.find(r=>edad>=r[0]&&edad<=r[1]);
  const mano=(nombre,raw)=>{
    const x=parseFloat(String(raw??"").replace(",","."));
    if(isNaN(x)) return `${nombre}: sin datos`;
    const c=x<fila[2]?"Baja":x>fila[3]?"Alta":"Media";
    return `${nombre}: ${String(x).replace(".",",")} kg → ${c}`;
  };
  return `Rango ${fila[0]}-${fila[1]} años · ${mano("Izquierda",v.r0_pi)} · ${mano("Derecha",v.r0_pd)}`;
}
function anRefrescar(form){
  const v=anCollect(form);
  const pg=form.querySelector("[data-prog]");
  if(pg) pg.innerHTML=progresoHTML(v);
  const gr=form.querySelector(".grip-res");
  if(gr) gr.textContent=gripTexto(v);
  form.querySelectorAll("[data-when]").forEach(el=>{el.hidden=!anCumple(el.dataset.when,v)});
  const al=form.querySelector(".an-alert");
  if(al){const n=(v.patologias||[]).length;al.hidden=!n;al.classList.toggle("on",n>0);al.textContent=n?`Has marcado ${n} ${n===1?"patología":"patologías"}. Antes de empezar, tu entrenador te pedirá una valoración médica.`:""}
  form.querySelectorAll(".an-f.miss").forEach(f=>{if(!anVacio(v[f.dataset.k]))f.classList.remove("miss")});
}
function anFaltan(form,lista){
  const v=anCollect(form);let n=0;
  (function rec(fs){fs.forEach(fd=>{
    if(fd.row)return rec(fd.row);
    if(fd.when)return rec(fd.f);
    if(!fd.req)return;
    const el=form.querySelector(`.an-f[data-k="${fd.k}"]`);
    if(!el||el.closest("[data-when][hidden]"))return;
    const m=anVacio(v[fd.k]);el.classList.toggle("miss",m);if(m)n++;
  })})(lista.flatMap(s=>s.f));
  return n;
}
function fmsFila(pre,t){return `<div class="fms-row">${t.lado?`<div class="fms-line"><span class="fms-lbl">Derecha</span>${fmsSc(pre+t.id+"_d")}</div><div class="fms-line"><span class="fms-lbl">Izquierda</span>${fmsSc(pre+t.id+"_i")}</div>`:`<div class="fms-line"><span class="fms-lbl">Puntuación</span>${fmsSc(pre+t.id+"_d")}</div>`}</div>`}
function fmsSc(name){return `<span class="fms-chips-row">${[3,2,1,0].map(n=>`<label class="fms-chip fms-v${n}"><input type="radio" name="${name}" value="${n}"><span>${n}</span></label>`).join("")}</span>`}
// Batería FMS dentro de la valoración: el entrenador puntúa; el cliente sube o graba su vídeo
function fmsResumenCorto(t,v,pre){
  const d=v[pre+t.id+"_d"], i=v[pre+t.id+"_i"];
  if(t.lado) return anVacio(d)&&anVacio(i)?"":`D ${anVacio(d)?"–":d} · I ${anVacio(i)?"–":i}`;
  return anVacio(d)?"":`${d}/3`;
}
function anFmsPintar(form,vals,admin){
  form.querySelectorAll("[data-cs]").forEach(el=>{
    const t=FMS.find(x=>x.id===el.dataset.cs); const d=vals["cli_"+t.id+"_d"], i=vals["cli_"+t.id+"_i"];
    el.textContent=t.lado?`${anVacio(d)?"–":d} / ${anVacio(i)?"–":i}`:(anVacio(d)?"–":d);
  });
  form.querySelectorAll("[data-sum]").forEach(el=>{
    const t=FMS.find(x=>x.id===el.dataset.sum); el.textContent=fmsResumenCorto(t,vals,admin?"fms_":"cli_");
  });
  form.querySelectorAll("[data-fv]").forEach(el=>{
    const id=el.dataset.fv, path=vals["fmsv_"+id];
    const ver=path?`<button type="button" class="vid" data-fvver="${esc(path)}">▶ Ver vídeo</button>`:"";
    if(admin){el.innerHTML=ver||`<span class="muted">Sin vídeo del cliente</span>`;return}
    el.innerHTML=`${ver}<label class="vidup">🎥 ${path?"Cambiar vídeo":"Grabar o subir vídeo"}<input type="file" accept="video/*" data-fvfile="${id}" style="display:none"></label><span class="muted fv-msg"></span>`;
  });
}
async function subirVideoFms(clienteId,testId,file){
  const ext=((file.name.split(".").pop()||"mp4").toLowerCase().replace(/[^a-z0-9]/g,""))||"mp4";
  const path=`${clienteId}/${testId}-${Date.now()}.${ext}`;
  const r=await fetch(`${SB_URL}/storage/v1/object/videos/${path}`,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+S.access,"Content-Type":file.type||"video/mp4"},body:file});
  if(!r.ok) throw new Error("No se pudo subir el vídeo ("+r.status+"). Comprueba que no pesa más de 50 MB.");
  return path;
}
async function firmarVideoFms(path){
  const r=await fetch(`${SB_URL}/storage/v1/object/sign/videos/${path}`,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+S.access,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});
  const j=await r.json(); return j.signedURL?SB_URL+"/storage/v1"+j.signedURL:"";
}
document.addEventListener("change",async ev=>{
  const inp=ev.target;
  if(!inp.dataset||!inp.dataset.fvfile) return;
  const file=inp.files&&inp.files[0]; if(!file) return;
  const box=inp.closest(".fms-vid"), m=box.querySelector(".fv-msg"), id=inp.dataset.fvfile;
  if(file.size>50*1024*1024){m.textContent="El vídeo supera 50 MB.";return}
  try{
    m.textContent="Subiendo…";
    const path=await subirVideoFms(S.user.id,id,file);
    const [f]=await db("GET","valoraciones",`?cliente_id=eq.${S.user.id}&select=datos`);
    const nuevo={...((f&&f.datos)||{}),["fmsv_"+id]:path};
    await db("PATCH","valoraciones",`?cliente_id=eq.${S.user.id}`,{datos:nuevo,actualizada:new Date().toISOString()},"return=minimal");
    box.querySelectorAll("[data-fvver]").forEach(b=>b.remove());
    box.insertAdjacentHTML("afterbegin",`<button type="button" class="vid" data-fvver="${esc(path)}">▶ Ver vídeo</button>`);
    box.querySelector(".vidup").firstChild.textContent="🎥 Cambiar vídeo";
    m.textContent="Vídeo guardado ✓";
  }catch(e){m.textContent=e.message}
  inp.value="";
});
document.addEventListener("change",ev=>{
  const m=ev.target.name&&ev.target.name.match(/^(fms|cli)_(.+)_(d|i)$/);
  if(!m) return;
  const card=ev.target.closest(".fms-card"); if(!card) return;
  const t=FMS.find(x=>x.id===m[2]); if(!t) return;
  const vals={};
  card.querySelectorAll("input[type=radio]:checked").forEach(r=>vals[r.name]=r.value);
  const el=card.querySelector("[data-sum]"); if(el) el.textContent=fmsResumenCorto(t,vals,m[1]+"_");
});
document.addEventListener("click",async ev=>{
  const b=ev.target.closest&&ev.target.closest("[data-fvver]");
  if(!b) return;
  try{const u=await firmarVideoFms(b.dataset.fvver); if(!u) throw new Error("No se pudo abrir el vídeo"); window.open(u,"_blank","noopener")}
  catch(e){alert(e.message)}
});

function anForm(cont,lista,vals,numerar=true,opts={}){
  anAdminMode=!!opts.admin;
  cont.innerHTML=`<form class="anam" novalidate>${lista.map((s,i)=>`<div class="cab">${numerar?(i+1)+". ":""}${esc(s.n)}</div>${s.f.map(anField).join("")}`).join("")}</form>`;
  const form=cont.querySelector("form");
  form.querySelectorAll("[data-reg]").forEach(el=>anRegTabla(form,el,vals||{},!!opts.admin));
  if(form.querySelector(".fms-wrap")) anFmsPintar(form,vals||{},!!opts.admin);
  anApply(form,vals||{});anRefrescar(form);
  form.addEventListener("input",()=>anRefrescar(form));
  form.addEventListener("change",()=>anRefrescar(form));
  form.addEventListener("submit",e=>e.preventDefault());
  return form;
}
function anTexto(v,k){
  let x=v[k];
  const otro=o=>o==="Otro"&&v[k+"_otro"]?"Otro: "+v[k+"_otro"]:o;
  return Array.isArray(x)?x.map(otro).join(", "):otro(x);
}
function anResumenHTML(v,lista,numerar=true){
  return lista.map((s,i)=>{
    let filas="";
    (function rec(fs){fs.forEach(fd=>{
      if(fd.row)return rec(fd.row);
      if(fd.when){if(anCumple(fd.when,v))rec(fd.f);return}
      if(fd.t==="tests")fd.rows.forEach(r=>{
        const val=typeof r[1]==="string"?v[r[1]]:r.slice(1).filter(x=>v[x[0]]).map(x=>x[1]+" "+v[x[0]]).join(" · ");
        if(!anVacio(val))filas+=`<tr><th>${esc(r[0])}</th><td>${esc(val)}</td></tr>`;
      });
      else if(fd.t==="fms")FMS.forEach(t=>{
        const sc=(k)=>anVacio(v[k])?"–":v[k];
        const linea=t.lado?`D ${sc("fms_"+t.id+"_d")} · I ${sc("fms_"+t.id+"_i")}`:`${sc("fms_"+t.id+"_d")}`;
        const fin=t.lado?`D ${sc("fin_"+t.id+"_d")} · I ${sc("fin_"+t.id+"_i")}`:`${sc("fin_"+t.id+"_d")}`;
        const hay=["fms_"+t.id+"_d","fms_"+t.id+"_i","cli_"+t.id+"_d","cli_"+t.id+"_i","fin_"+t.id+"_d","fin_"+t.id+"_i"].some(k=>!anVacio(v[k]));
        if(!hay&&!v["fmsv_"+t.id]) return;
        const cli=t.lado?`D ${sc("cli_"+t.id+"_d")} · I ${sc("cli_"+t.id+"_i")}`:`${sc("cli_"+t.id+"_d")}`;
        filas+=`<tr><th>${esc(t.n)}</th><td>Test: ${linea} · Cliente: ${cli} · Final: ${fin}${v["fmsv_"+t.id]?" · vídeo del cliente":""}</td></tr>`;
      });
      else if(fd.t==="grid")fd.rows.forEach(([l,k])=>{if(!anVacio(v[k]))filas+=`<tr><th>${esc(l)}</th><td>${esc(v[k])}</td></tr>`});
      else if(fd.t==="pares")fd.rows.forEach(([l,a,b])=>{if(!anVacio(v[a])||!anVacio(v[b]))filas+=`<tr><th>${esc(l)}</th><td>Izq. ${esc(v[a]||"–")} · Der. ${esc(v[b]||"–")}</td></tr>`});
      else if(fd.t==="registro"){
        const cols=[...REG_FIJAS.map(c=>[c[1],c[0]]),...regIds(v).map(id=>[regNombre(v,id),id])];
        for(let i=0;i<=12;i++){
          const partes=cols.map(([l,k])=>[l,v[`r${i}_${k}`]]).filter(x=>!anVacio(x[1])).map(x=>x[0]+": "+x[1]);
          if(partes.length)filas+=`<tr><th>${i?"Fila "+i:"Inicial"}</th><td>${esc(partes.join(" · "))}</td></tr>`;
        }
      }
      else if(fd.k){const val=anTexto(v,fd.k);if(!anVacio(val))filas+=`<tr><th>${esc(fd.l)}</th><td>${esc(val).replace(/\n/g,"<br>")}</td></tr>`}
    })})(s.f);
    return filas?`<div class="cab">${numerar?(i+1)+". ":""}${esc(s.n)}</div><div class="ses"><table class="an-res">${filas}</table></div>`:"";
  }).join("");
}
function anAntigua(a){
  const filas=ANAM_OLD.filter(([k])=>a&&a[k]).map(([k,l])=>`<p><b>${l}:</b> ${esc(a[k])}</p>`).join("");
  return filas?`<details class="bloque"><summary><b>Respuestas de la ficha anterior</b></summary>${filas}</details>`:"";
}
const anFecha=iso=>{try{return fechaLocal(new Date(iso))}catch(e){return""}};

// Cliente: rellena y guarda su ficha (Perfil → Anamnesis)
function tabAnamnesis(){
  const a=S.perfil.anamnesis||{};
  $("#sub").innerHTML=`<div class="an-panel">${anAntigua(a)}
    <p class="muted">Los campos con <span class="an-req">*</span> son obligatorios. Puedes guardar y completarla más tarde.${a.actualizada?" Última actualización: "+anFecha(a.actualizada)+".":""}</p>
    <div id="anBox"></div>
    <div class="row" style="margin-top:10px"><button class="gold" id="guardarA">Guardar anamnesis</button></div><div class="msg" id="m"></div></div>`;
  const form=anForm($("#anBox"),ANAM_CLI,a);
  $("#guardarA").onclick=async()=>{
    const v=anCollect(form);
    const faltan=anFaltan(form,ANAM_CLI);
    if(!(v.consentimientos||[]).includes(AN_CONSENT)){
      form.querySelector('.an-f[data-k="consentimientos"]').scrollIntoView({behavior:"smooth",block:"center"});
      return msg("#m","Para guardar tienes que aceptar el tratamiento de tus datos (último bloque).",false);
    }
    try{
      // Se conserva lo que haya guardado el entrenador (valoración) y las respuestas antiguas
      const previa=await leerAnamnesis(S.user.id);
      const data={...v,consent:true,actualizada:new Date().toISOString()};
      ANAM_OLD.forEach(([k])=>{if(previa[k])data[k]=previa[k]});
      if(previa.valoracion)data.valoracion=previa.valoracion;
      if(previa._vis)data._vis=previa._vis;
      const atletaId=await guardarAnamnesis(S.user.id,data,true);
      await db("POST","consentimientos","?on_conflict=atleta_id,tipo,version_texto",{atleta_id:atletaId,tipo:"datos_salud",version_texto:AN_VERSION},"resolution=ignore-duplicates,return=minimal");
      S.perfil.anamnesis=data;
      msg("#m",faltan?`Guardado ✓ · Te faltan ${faltan} campos obligatorios, marcados en rojo.`:"Guardado ✓",true);
      if(!faltan) setTimeout(()=>panelCliente("valoracion"),900);
    }catch(e){msg("#m",e.message,false)}
  };
}

// Entrenador: ve las respuestas y rellena la valoración inicial
function anRespuestasEntrenador(c){
  const a=c.anamnesis;
  if(!a){$("#sub").innerHTML=`<div class="an-panel"><p class="muted">Todavía no ha rellenado la anamnesis.</p></div>`;return}
  const aviso=anAviso(a);
  const nueva=Object.keys(a).some(k=>!ANAM_OLD.some(([o])=>o===k)&&!["consent","valoracion","actualizada","_vis"].includes(k));
  $("#sub").innerHTML=`<div class="an-panel">${aviso?`<div class="an-alert on">${esc(aviso)}</div>`:""}
    ${a.actualizada?`<p class="muted">Actualizada el ${anFecha(a.actualizada)}</p>`:""}
    ${nueva?anResumenHTML(a,ANAM_CLI):`<p class="muted">Todavía no ha rellenado la ficha nueva.</p>`}
    ${anAntigua(a)}</div>`;
}
async function anValoracionEntrenador(c,k="ini"){
  const [fila]=await db("GET","valoraciones",`?cliente_id=eq.${c.id}&select=datos,visible,actualizada`);
  const datos=(fila&&fila.datos)||{};
  $("#sub").innerHTML=`<div class="an-panel"><p class="muted">${fila&&fila.actualizada?"Última actualización: "+anFecha(fila.actualizada)+".":"Sin rellenar todavía."}</p>
    <label class="row"><input type="checkbox" id="vis" ${(datos._vis||{})[k]===true?"checked":""}> Mostrar al cliente</label>
    <div id="anVal"></div>
    <div class="row" style="margin-top:10px"><button class="gold" id="guardarV">Guardar</button></div><div class="msg" id="mv"></div></div>`;
  const form=anForm($("#anVal"),listaDe(k),datos,false,{admin:true});
  // El interruptor se aplica al momento, sin pulsar Guardar
  $("#vis").onchange=async()=>{
    try{
      const [f]=await db("GET","valoraciones",`?cliente_id=eq.${c.id}&select=datos`);
      const prev=(f&&f.datos)||{};
      const _vis={...(prev._vis||{}),[k]:$("#vis").checked};
      await db("POST","valoraciones","?on_conflict=cliente_id",{cliente_id:c.id,datos:{...prev,_vis},visible:_vis.ini===true||_vis.fun===true||_vis.fms===true},"resolution=merge-duplicates,return=minimal");
      msg("#mv",$("#vis").checked?"Visible para el cliente ✓":"Oculta para el cliente ✓",true);
    }catch(e){msg("#mv",e.message,false)}
  };
  $("#guardarV").onclick=async()=>{
    try{
      const [f]=await db("GET","valoraciones",`?cliente_id=eq.${c.id}&select=datos`);
      const prev=(f&&f.datos)||{};
      const _vis={...(prev._vis||{}),[k]:$("#vis").checked};
      const nuevo={...prev,...anCollect(form),_vis};
      await db("POST","valoraciones","?on_conflict=cliente_id",{cliente_id:c.id,datos:nuevo,visible:_vis.ini===true||_vis.fun===true||_vis.fms===true,actualizada:new Date().toISOString()},"resolution=merge-duplicates,return=minimal");
      msg("#mv","Guardado ✓",true);
    }catch(e){msg("#mv",e.message,false)}
  };
}
// Entrenador: anamnesis (respuestas) con interruptor para que el cliente pueda rellenarla
async function anamnesisEntrenador(c){
  const a=await leerAnamnesis(c.id);
  c.anamnesis=Object.keys(a).length?a:null;
  anRespuestasEntrenador(c);
  const on=(a._vis||{}).ana!==false;
  $("#sub").insertAdjacentHTML("afterbegin",`<div class="an-panel"><label class="row"><input type="checkbox" id="visA" ${on?"checked":""}> Mostrar al cliente (puede rellenar la anamnesis)</label><div class="msg" id="mvA"></div></div>`);
  $("#visA").onchange=async()=>{
    try{
      const cur=await leerAnamnesis(c.id);
      await guardarAnamnesis(c.id,{...cur,_vis:{...(cur._vis||{}),ana:$("#visA").checked}});
      msg("#mvA","Guardado ✓",true);
    }catch(e){msg("#mvA",e.message,false)}
  };
}
// Entrenador: vista de solo lectura de la valoración ya cumplimentada
async function anValoracionVer(c){
  const [fila]=await db("GET","valoraciones",`?cliente_id=eq.${c.id}&select=datos,visible,actualizada`);
  if(!fila){$("#sub").innerHTML=`<div class="an-panel"><p class="muted">Todavía no hay valoración inicial.</p></div>`;return}
  $("#sub").innerHTML=`<div class="an-panel"><p class="muted">${fila.visible?"Visible para el cliente":"Oculta para el cliente"}${fila.actualizada?" · Actualizada el "+anFecha(fila.actualizada):""}</p>${valoracionHTML(fila.datos)}</div>`;
}

function tabPerfil(){
  const p=S.perfil;
  const instalar=!esInstalada()&&avisoInstalar?`<div class="card"><b>📲 Instalar la app</b><p class="muted" style="margin:6px 0 10px">Ábrela desde el icono de tu pantalla de inicio, como una app más.</p><button type="button" id="instalar-app">Instalar</button></div>`:(!esInstalada()&&esIPhone()?`<div class="card"><b>📲 Instalar la app</b><p class="muted" style="margin:6px 0 0">En iPhone: pulsa el botón Compartir de Safari (el cuadrado con una flecha hacia arriba) y luego «Añadir a pantalla de inicio».</p></div>`:"");
  $("#sub").innerHTML=`${instalar}<div class="row">${fotoSegura(p.foto)?`<img class="avatar" style="width:90px;height:90px" src="${esc(fotoSegura(p.foto))}" alt="">`:`<span class="muted">Sin foto</span>`}
    <label>Foto de perfil <input type="file" id="foto" accept="image/*"></label></div>
    <h3>Apariencia</h3>
    <label class="row"><input type="checkbox" id="oscuro" ${temaOscuro()?"checked":""}> Modo oscuro</label>
    <div id="cicloCfg"></div>
    <h3>Cambiar contraseña</h3>
    <input id="np" type="password" placeholder="Nueva contraseña (mín. 6 caracteres)">
    <button id="cp">Cambiar contraseña</button>
    <div class="msg" id="m"></div>`;
  enlazarCicloCfg();
  $("#foto").onchange=async ev=>{
    const f=ev.target.files[0];if(!f)return;
    try{
      const d=await fotoAJPG(f);
      await db("PATCH","perfiles",`?id=eq.${S.user.id}`,{foto:d},"return=minimal");
      S.perfil.foto=d;panelCliente("perfil");
    }catch(e){msg("#m",e.message,false)}
  };
  $("#oscuro").onchange=ev=>aplicarTema(ev.target.checked,true);
  const ib=$("#instalar-app");
  if(ib) ib.onclick=async()=>{ if(!avisoInstalar) return; avisoInstalar.prompt(); try{await avisoInstalar.userChoice}catch(e){} avisoInstalar=null; ib.closest(".card")?.remove(); };
  $("#cp").onclick=async()=>{
    try{
      await auth("user",{password:$("#np").value},"PUT",S.access);
      msg("#m","Contraseña cambiada ✓",true);$("#np").value="";
    }catch(e){msg("#m",e.message,false)}
  };
}
function fotoAJPG(file){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement("canvas");c.width=c.height=240;
      const s=Math.min(img.width,img.height),x=(img.width-s)/2,y=(img.height-s)/2;
      c.getContext("2d").drawImage(img,x,y,s,s,0,0,240,240);
      res(c.toDataURL("image/jpeg",0.8));
    };
    img.onerror=rej;
    img.src=URL.createObjectURL(file);
  });
}

/* ---------- Ojo para ver la contraseña (todos los campos password) ---------- */
function anadirOjos(){
  document.querySelectorAll('input[type=password]:not([data-ojo])').forEach(inp=>{
    inp.dataset.ojo="1";
    const w=document.createElement("span"); w.className="pw-wrap";
    inp.parentNode.insertBefore(w,inp); w.appendChild(inp);
    const b=document.createElement("button");
    b.type="button"; b.className="pw-ojo"; b.textContent="👁";
    b.title="Mostrar contraseña"; b.setAttribute("aria-label","Mostrar contraseña");
    b.onclick=()=>{
      const ver=inp.type==="password";
      inp.type=ver?"text":"password";
      b.classList.toggle("on",ver);
      b.title=ver?"Ocultar contraseña":"Mostrar contraseña";
      b.setAttribute("aria-label",b.title);
    };
    w.appendChild(b);
  });
}
new MutationObserver(anadirOjos).observe(document.body,{childList:true,subtree:true});

/* ---------- Arranque ---------- */
function textoErrorEnlace(code,desc){
  if(code==="otp_expired"||/expired|invalid/i.test(desc||"")) return "El enlace del correo ha caducado o ya se había usado. Si ya confirmaste tu cuenta, entra con tu email y contraseña. Si no, vuelve a crear la cuenta para recibir un enlace nuevo.";
  return "No se ha podido completar el acceso desde el enlace del correo"+(desc?": "+desc:".")+" Prueba a entrar con tu email y contraseña.";
}
async function init(){
  const h=new URLSearchParams(location.hash.slice(1));
  const q=new URLSearchParams(location.search);
  if(q.get("ir")){try{sessionStorage.setItem("ir",q.get("ir"))}catch(e){} history.replaceState(null,"",location.pathname+location.hash);}
  // Enlace del correo con error (caducado, ya usado…): avisar con un mensaje claro
  const errCode=h.get("error_code")||q.get("error_code"), errDesc=h.get("error_description")||q.get("error_description");
  if(h.get("error")||q.get("error")||errCode){
    history.replaceState(null,"",location.pathname);
    pantallaLogin();msg("#m",textoErrorEnlace(errCode,errDesc),false);return;
  }
  // Vuelta desde el correo de confirmación de cuenta: entrar directamente en la app
  if(h.get("access_token")&&h.get("type")!=="recovery"){
    S={access:h.get("access_token"),refresh:h.get("refresh_token")};
    history.replaceState(null,"",location.pathname);
    try{
      await cargarPerfil();guardarSesion();
      if(h.get("type")==="signup"&&S.perfil.rol!=="admin") return panelCliente("perfil","anamnesis");
      return entrar();
    }catch(e){S=null;guardarSesion();pantallaLogin();msg("#m","Tu cuenta está confirmada, pero no se ha podido abrir: "+e.message+" Entra con tu email y contraseña.",false);return;}
  }
  if(h.get("type")==="recovery"&&h.get("access_token")){
    S={access:h.get("access_token"),refresh:h.get("refresh_token")};
    history.replaceState(null,"",location.pathname);
    return pantallaNuevaPass();
  }
  const g=leerSesion();
  if(g&&g.access){
    S={access:g.access,refresh:g.refresh};
    try{await cargarPerfil();return entrar()}
    catch(e){
      try{await refrescar();await cargarPerfil();return entrar()}
      catch(e2){S=null;guardarSesion()}
    }
  }
  pantallaLogin();
}
document.addEventListener("change",ev=>{
  if(ev.target.matches&&ev.target.matches('select[data-f="rpe"]')){const c=colorRPE(ev.target.value);ev.target.style.background=c[0];ev.target.style.color=c[1]}
});
document.addEventListener("click",ev=>{
  const b=ev.target.closest&&ev.target.closest("button.pick");
  if(b&&!b.disabled){abrirPicker(b);return}
});
init().catch(()=>pantallaLogin());
