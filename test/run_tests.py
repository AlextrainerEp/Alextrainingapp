"""Pruebas automáticas de Alex Training Lab.
Uso:  python3 tests/run_tests.py            (desde la carpeta base/)
Requiere: Python 3, Node.js y Playwright con Chrome (executable_path abajo).
Cada prueba imprime OK o FALLO; el código de salida es 1 si algo falla."""
import asyncio, json, os, re, subprocess, sys, tempfile
import shutil, glob
from playwright.async_api import async_playwright

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(BASE, "app", "index.html")
RES = os.path.join(BASE, "resistencia", "index.html")
CHROME = os.environ.get("CHROME_PATH") or ("/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None)
resultados = []

def registrar(nombre, ok, detalle=""):
    resultados.append((nombre, ok))
    print(("OK    " if ok else "FALLO ") + nombre + (f"  ({detalle})" if detalle and not ok else ""))

def inline_js(path):
    s = open(path, encoding="utf-8").read()
    partes = re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", s, re.S)
    for f in sorted(glob.glob(os.path.join(os.path.dirname(path), "js", "*.js"))):
        partes.append(open(f, encoding="utf-8").read())
    return "\n;\n".join(partes)

def copia_app_con_wa():
    # copia de la app con el número de WhatsApp puesto en el archivo JS que lo define
    d = tempfile.mkdtemp()
    shutil.copytree(os.path.dirname(APP), d, dirs_exist_ok=True)
    for f in [os.path.join(d, "index.html")] + glob.glob(os.path.join(d, "js", "*.js")):
        t = open(f, encoding="utf-8").read()
        if 'const WA_ALEX=""' in t:
            open(f, "w", encoding="utf-8").write(t.replace('const WA_ALEX="";', 'const WA_ALEX="34600111222";'))
    return os.path.join(d, "index.html")

# ---------- 1. Archivos ----------
def pruebas_archivos():
    for nombre, ruta in [("app", APP), ("resistencia", RES)]:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8")
        tmp.write(inline_js(ruta)); tmp.close()
        r = subprocess.run(["node", "--check", tmp.name], capture_output=True, text=True)
        os.unlink(tmp.name)
        registrar(f"sintaxis JS de {nombre}", r.returncode == 0, r.stderr[:200])
    # manifiesto válido y service worker con sintaxis correcta
    for carpeta, mf in [("app", "manifest.webmanifest"), ("resistencia", "manifest.json")]:
        ruta = os.path.join(BASE, carpeta, mf)
        try:
            m = json.load(open(ruta, encoding="utf-8")); ok = bool(m.get("icons"))
        except Exception as e:
            ok, m = False, {}
        registrar(f"manifiesto {carpeta}/{mf}", ok)
        for ic in m.get("icons", []):
            registrar(f"icono {carpeta}/{ic['src']} existe", os.path.exists(os.path.join(BASE, carpeta, ic["src"])))
    for carpeta in ["app", "resistencia"]:
        r = subprocess.run(["node", "--check", os.path.join(BASE, carpeta, "sw.js")], capture_output=True, text=True)
        registrar(f"sintaxis sw.js de {carpeta}", r.returncode == 0)
    # imágenes referenciadas en el HTML deben existir en su carpeta
    for carpeta, ruta in [("app", APP), ("resistencia", RES)]:
        html = open(ruta, encoding="utf-8").read()
        css_extra = os.path.join(os.path.dirname(ruta), "css", "app.css")
        if os.path.exists(css_extra):
            css_txt = open(css_extra, encoding="utf-8").read()
            for u in sorted(set(re.findall(r'url\(["\']?([^"\')]+)["\']?\)', css_txt))):
                if u.startswith(("http", "data:")): continue
                registrar(f"{carpeta} css url {u} existe", os.path.exists(os.path.normpath(os.path.join(os.path.dirname(css_extra), u))),
                          "ruta relativa a css/ incorrecta")
            html += css_txt
        for f in sorted(glob.glob(os.path.join(os.path.dirname(ruta), "js", "*.js"))):
            html += open(f, encoding="utf-8").read()
        refs = set(re.findall(r'["\'(]([A-Za-z0-9_\-]+\.(?:png|jpg|jpeg|webp|svg|mjs))["\')]', html))
        for f in sorted(refs):
            registrar(f"{carpeta} referencia {f} existe", os.path.exists(os.path.join(BASE, carpeta, f)),
                      "falta en la carpeta: súbelo junto al index.html")

# ---------- 2. Comportamiento en el navegador ----------
SIN_RED = re.compile(r"(cdn|supabase|fonts\.|googleapis|jsdelivr|unpkg)", re.I)

async def con_pagina(p, ruta, fn):
    b = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = await b.new_page(viewport={"width": 390, "height": 844})
    errores = []
    pg.on("pageerror", lambda e: errores.append(str(e)))
    await pg.goto("file://" + ruta)
    await pg.wait_for_timeout(800)
    try:
        return await fn(pg, errores)
    finally:
        await b.close()

STUB_S = "S={access:'x',refresh:'x',user:{id:'u1'},perfil:{nombre:'Ana',rol:'cliente',modulos:['funcional']}};"

async def pruebas_navegador(p):
    async def alta(pg, errores):
        await pg.evaluate("auth=async()=>({}); pantallaRegistro();")
        await pg.wait_for_timeout(150)
        await pg.fill("#rn", "Ana"); await pg.fill("#re", "ana@x.es")
        await pg.fill("#rp", "123"); await pg.fill("#rp2", "123")
        await pg.click("#rg"); await pg.wait_for_timeout(120)
        txt = await pg.evaluate("document.querySelector('#m').textContent")
        return "6 caracteres" in txt and not errores
    registrar("alta: rechaza contraseñas cortas", await con_pagina(p, APP, alta))

    async def historial(pg, errores):
        await pg.evaluate("""()=>{%s
          db=async(m,t)=>{ if(t==='sesiones') return [
            {id:1,fecha:'10/11/2026',bloques:[{ejercicios:[{ej:'A',ser:3,rep:'8'}]}],registro:{}},
            {id:2,fecha:'20/11/2026',bloques:[{ejercicios:[{ej:'B',ser:3,rep:'5'}]}],registro:{'0-0':{kg:60,reps:'5'}}}];
            if(t==='atletas') return [{id:'at1'}]; return []; };
          document.body.insertAdjacentHTML('beforeend','<div id=tab></div>'); }""" % STUB_S)
        await pg.evaluate("tabHistorialCliente('#tab')"); await pg.wait_for_timeout(400)
        n = await pg.evaluate("document.querySelectorAll('#tab details.sesion').length")
        return n == 2 and not errores
    registrar("historial del entrenado muestra planificados y hechos", await con_pagina(p, APP, historial))

    async def wa(pg, errores):
        tmp = copia_app_con_wa()
        await pg.goto("file://" + tmp); await pg.wait_for_timeout(600)
        await pg.evaluate("""()=>{%s db=async()=>[]; urlAudio=async()=>'';
          document.body.insertAdjacentHTML('beforeend','<div id=sub></div>'); tabMensajes('u1',false,'#sub'); }""" % STUB_S)
        await pg.wait_for_timeout(300)
        n = await pg.evaluate("document.querySelectorAll('.wa-btn').length")
        return n == 1 and not errores
    registrar("WhatsApp: botón de WhatsApp con número configurado", await con_pagina(p, APP, wa))

    async def ciclo(pg, errores):
        await pg.evaluate("""()=>{%s window.__c=[]; db=async(m,t,q,body)=>{__c.push([m,t]); return t==='ciclo_config'&&m==='GET'?[{activo:false}]:[]};
          document.body.insertAdjacentHTML('beforeend','<div id=cicloCfg></div>'); enlazarCicloCfg(); }""" % STUB_S)
        await pg.wait_for_timeout(250)
        await pg.evaluate("document.getElementById('cicloOn').click()"); await pg.wait_for_timeout(120)
        activo = await pg.evaluate("document.getElementById('cicloOn').checked")
        guardo = await pg.evaluate("__c.some(x=>x[0]==='POST')")
        return activo is False and guardo is False and not errores
    registrar("ciclo: no se activa sin consentimiento", await con_pagina(p, APP, ciclo))

    async def bienestar_resumen(pg, errores):
        await pg.evaluate("""()=>{%s db=async(m,t)=>{ if(t==='sesiones') return [{cliente_id:'a',fecha:'2026-11-23',registro:{'0-0':{kg:'10'}}},{cliente_id:'b',fecha:'2026-11-24',registro:{}}];
          if(t==='atletas') return []; return []; };
          window.__r=null; }""" % STUB_S)
        html = await pg.evaluate("resumenSemanaEntrenador([{id:'a',nombre:'Ana',modulos:['funcional']},{id:'b',nombre:'Berta',modulos:['funcional']}])")
        return "sem-resumen" in html and "Berta" in html and not errores
    registrar("resumen semanal del entrenador", await con_pagina(p, APP, bienestar_resumen))

    async def res_carga(pg, errores):
        # La app de resistencia depende de Supabase por CDN; si no hay red, solo comprobamos que no hay error de sintaxis.
        return not errores or all(SIN_RED.search(e) or "supabase" in e.lower() or "Failed" in e for e in errores)
    registrar("resistencia: carga sin errores propios", await con_pagina(p, RES, res_carga))

async def main():
    pruebas_archivos()
    async with async_playwright() as p:
        await pruebas_navegador(p)
    fallos = [n for n, ok in resultados if not ok]
    print(f"\n{len(resultados)-len(fallos)} de {len(resultados)} pruebas correctas")
    sys.exit(1 if fallos else 0)

if __name__ == "__main__":
    asyncio.run(main())
