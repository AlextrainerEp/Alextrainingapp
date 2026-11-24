// Si el servidor de SheetJS no responde, se carga la versión antigua para no quedarse sin importar Excel
if(typeof XLSX==="undefined"){
  document.write('<scr'+'ipt src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"><\/scr'+'ipt>');
}
