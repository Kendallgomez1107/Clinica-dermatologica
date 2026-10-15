// ===== CONFIGURACIÓN =====
// Pega aquí la URL de tu Apps Script (termina en /exec). Vacío = modo demo (datos en este navegador).
const API_URL = 'https://script.google.com/macros/s/AKfycbw9J9-pvw9U5ZwAt6z8kZcbb3kkfBkuk_ou1NPnRgl3eKwpGYAsxdvqRXnkJBGmkAGBjw/exec';

const CATS = ['Cremas','Sueros','Protectores solares','Limpiadores','Otros'];
const SCH = {
  inventario: [['nombre','Producto'],['categoria','Categoría','sel',CATS],['proveedor','Proveedor'],['lote','Lote'],['cantidad','Stock','number'],['minimo','Stock mínimo','number'],['vencimiento','Vencimiento','date'],['costo','Precio de compra (proveedor)','number'],['precio','Precio de venta (clínica)','number']],
  descartes:  [['pid','Producto','inv'],['cantidad','Cantidad retirada','number'],['motivo','Motivo','sel',['Vencido','Dañado','Muestra','Otro']],['fecha','Fecha','date'],['responsable','Responsable'],['perdida','Pérdida','calc']],
  pacientes:  [['nombre','Nombre'],['telefono','Teléfono','tel'],['correo','Correo','email'],['notas','Notas dermatológicas (alergias, tipo de piel)','area'],['proximo','Próximo control','date']],
  visitas: [['fecha','Fecha','date'],['paciente_id','Paciente','pac'],['pid','Producto usado o vendido','inv'],['cantidad','Cantidad','number'],['notas','Notas','area'],['total','Total vendido','calc'],['costo','Costo','calc'],['ganancia','Ganancia','calc']],
  compras: [['fecha','Fecha de recepción','date'],['pid','Producto','inv'],['proveedor','Proveedor'],['lote','Lote'],['cantidad','Cantidad recibida','number'],['vencimiento','Vencimiento del lote','date'],['costo','Precio de compra (por unidad)','number'],['total','Total de la compra','calc']]
};
const TITLES = {panel:'Panel general',inventario:'Inventario y vencimientos',descartes:'Descartes y mermas',pacientes:'Pacientes',visitas:'Visitas y productos',compras:'Compras y recepción de mercancía'};
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const off = n => iso(new Date(Date.now()+n*864e5));
const toast = (m, bad, act) => {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = m;
  if (act){ const b = document.createElement('button'); b.textContent = act[0]; b.className = 'underline ml-3 font-semibold'; b.onclick = () => { t.remove(); act[1](); }; t.appendChild(b); }
  document.body.appendChild(t); setTimeout(() => t.remove(), act ? 8000 : 3200);
};
const SEED = {
  inventario:[
    {id:'a1',nombre:'Crema hidratante CeraVe',categoria:'Cremas',proveedor:'Distribuidora Derma',lote:'L2301',cantidad:12,minimo:5,vencimiento:off(-5),costo:180,precio:320},
    {id:'a2',nombre:'Sérum vitamina C',categoria:'Sueros',proveedor:'Distribuidora Derma',lote:'L2310',cantidad:3,minimo:4,vencimiento:off(25),costo:250,precio:480},
    {id:'a3',nombre:'Protector solar FPS 50',categoria:'Protectores solares',proveedor:'Farma Centro',lote:'L2402',cantidad:20,minimo:6,vencimiento:off(50),costo:150,precio:280},
    {id:'a4',nombre:'Gel limpiador suave',categoria:'Limpiadores',proveedor:'Farma Centro',lote:'L2405',cantidad:15,minimo:5,vencimiento:off(240),costo:90,precio:160}],
  descartes:[], visitas:[], compras:[], pacientes:[{id:'p1',nombre:'María Pérez',telefono:'8888-0000',correo:'maria@correo.com',notas:'Piel sensible. Alergia a fragancias.',historial:off(-20)+' – Protector solar FPS 50'}]
};

let S = {inventario:[],descartes:[],pacientes:[],visitas:[],compras:[]}, tab = 'panel', flt = 'todos', sortK = null, sortD = 1;
let PEND = 0, KEY = sessionStorage.getItem('derma_key') || '';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today = () => iso(new Date());
const days = v => v ? Math.round((new Date(v+'T00:00') - new Date().setHours(0,0,0,0))/864e5) : null;
const IN = 'w-full border rounded-lg px-3 py-2 bg-white';
const money = n => 'C$ ' + (+n || 0).toLocaleString('es', {minimumFractionDigits:2, maximumFractionDigits:2});

const gan = r => (r.costo === '' || r.costo == null || r.precio === '' || r.precio == null) ? null : (+r.precio - +r.costo);
const mar = r => { const g = gan(r); return g === null || !+r.precio ? null : g / +r.precio * 100; };
const ganHtml = r => { const g = gan(r); if (g === null) return '—'; return `<span class="${g < 0 ? 'text-red-700' : 'text-emerald-700'} font-semibold">${money(g)}</span>`; };
const marHtml = r => { const m = mar(r); if (m === null) return '—'; return `<span class="${m < 0 ? 'text-red-700' : 'text-emerald-700'} font-semibold">${m.toFixed(0)} %</span>`; };
const keyOf = i => String(i.nombre || '').trim().toLowerCase();
const byVenc = (a,b) => String(a.vencimiento || '9999').localeCompare(String(b.vencimiento || '9999'));
const usable = i => +i.cantidad > 0 && (days(i.vencimiento) === null || days(i.vencimiento) >= 0);
let G = [], LOW = new Set(), view = 'producto'; const OPEN = new Set();
const isLow = i => LOW.has(keyOf(i));
// Agrupa los lotes por producto. El stock útil no cuenta lotes vencidos.
function groups(){
  const m = {};
  S.inventario.forEach(i => { (m[keyOf(i)] = m[keyOf(i)] || {key:keyOf(i), nombre:i.nombre, lots:[]}).lots.push(i); });
  return Object.values(m).map(g => {
    g.lots.sort(byVenc);
    g.stock = g.lots.filter(usable).reduce((n,l) => n + (+l.cantidad || 0), 0);
    g.vencido = g.lots.filter(l => +l.cantidad > 0 && days(l.vencimiento) !== null && days(l.vencimiento) < 0).reduce((n,l) => n + (+l.cantidad || 0), 0);
    g.minimo = Math.max(0, ...g.lots.map(l => +l.minimo || 0));
    g.low = g.stock <= g.minimo;
    g.next = g.lots.filter(usable)[0] || g.lots.filter(l => +l.cantidad > 0)[0] || g.lots[g.lots.length-1]; // lote que sale primero
    g.ref = g.lots[g.lots.length-1];
    return g;
  });
}
function badge(v){
  const d = days(v);
  if (d === null) return '';
  if (d < 0)   return `<span class="px-2 py-0.5 rounded-full bg-red-600 text-white text-xs">Vencido hace ${-d} d</span>`;
  if (d <= 30) return `<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Vence en ${d} d</span>`;
  if (d <= 60) return `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">Vence en ${d} d</span>`;
  return `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs">Vigente</span>`;
}

// ===== DATOS (Google Sheets vía Apps Script, o localStorage en demo) =====
function askKey(msg){
  return new Promise(res => {
    $('f').dataset.lock = '1'; $('dlg').oncancel = e => e.preventDefault();
    $('f').innerHTML = `<h3 class="font-serif text-xl">Acceso</h3><p class="text-sm">${msg || 'Escribe la clave de acceso.'}</p><input name="k" type="password" required autofocus autocomplete="current-password" class="${IN}"><div class="flex justify-end pt-2"><button class="px-4 py-2 rounded-lg bg-[#b83b5a] text-white font-medium">Entrar</button></div>`;
    $('f').onsubmit = e => { e.preventDefault(); KEY = String(new FormData($('f')).get('k')); sessionStorage.setItem('derma_key', KEY); $('f').dataset.lock = ''; $('dlg').oncancel = null; $('dlg').close(); res(); };
    $('dlg').showModal();
  });
}
async function readSheet(t){
  for (;;){
    if (!KEY) await askKey();
    const d = await (await fetch(`${API_URL}?sheet=${t}&key=${encodeURIComponent(KEY)}`)).json();
    if (d && d.error === 'bloqueado'){ KEY = ''; sessionStorage.removeItem('derma_key'); throw new Error('bloqueado'); }
    if (d && d.error === 'clave'){ KEY = ''; sessionStorage.removeItem('derma_key'); await askKey('Clave incorrecta. Inténtalo de nuevo.'); continue; }
    if (!Array.isArray(d)) throw new Error(d && d.error || 'respuesta inválida');
    return d;
  }
}
async function refresh(){
  if (!API_URL || !KEY || PEND || document.hidden || $('dlg').open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  try {
    const n = {};
    for (const t in S) n[t] = await readSheet(t);
    if (!PEND) { Object.assign(S, n); render(); }
  } catch(e) {}
}
async function load(){
  for (const t in S){
    if (API_URL){ try { S[t] = await readSheet(t); } catch(e){ if (e.message === 'bloqueado'){ toast('Acceso bloqueado por demasiados intentos fallidos. Espera 15 minutos y vuelve a intentar.', 1); break; } toast('No se pudo leer la hoja "'+t+'". Revisa la URL y los permisos.', 1); } }
    else S[t] = JSON.parse(localStorage.getItem('derma_'+t) || 'null') || SEED[t];
  }
  $('mode').textContent = API_URL ? 'Conectado a Google Sheets' : 'Modo demo (sin conexión)';
  $('xlsLbl').hidden = !!API_URL;
  render();
}
async function persist(t, action, row){
  if (!API_URL) return localStorage.setItem('derma_'+t, JSON.stringify(S[t]));
  PEND++; try { const r = await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action,sheet:t,row,key:KEY})}); let d = null; try { d = await r.json(); } catch(_){} if (d && d.error) toast(d.error === 'bloqueado' ? 'No se guardó: acceso bloqueado por intentos fallidos. Espera 15 minutos.' : 'No se guardó: la clave no es válida. Recarga la página e ingrésala de nuevo.', 1); }
  catch(e){ toast('No se pudo guardar en Google Sheets. Intenta de nuevo.', 1); } finally { PEND--; }
}
async function save(t, row, quiet){
  // Salida automática: reparte la cantidad entre los lotes, primero el que vence antes.
  if ((t === 'descartes' || t === 'visitas') && !row.id && String(row.pid).startsWith('g:')){
    const key = row.pid.slice(2), lots = S.inventario.filter(i => keyOf(i) === key && +i.cantidad > 0 && (t === 'descartes' || usable(i))).sort(byVenc);
    let need = +row.cantidad; const avail = lots.reduce((n,l) => n + +l.cantidad, 0);
    if (need > avail) return toast('Solo hay '+avail+' unidades disponibles de este producto'+(t === 'visitas' ? ' (sin contar lotes vencidos)' : '')+'.', 1);
    let n = 0;
    for (const l of lots){ if (need <= 0) break; const q = Math.min(need, +l.cantidad); need -= q; n++; await save(t, {...row, pid:l.id, cantidad:q}, true); }
    return toast(n > 1 ? 'Registrado en '+n+' lotes (primero el que vence antes)' : 'Registro agregado');
  }
  const isNew = !row.id; if (isNew) row.id = 'r'+Date.now()+Math.random().toString(36).slice(2,6);
  if (t === 'visitas'){ const pa = S.pacientes.find(x => x.id === row.paciente_id); row.paciente = pa ? pa.nombre : ''; }
  if (t === 'compras'){
    const base = S.inventario.find(x => x.id === row.pid);
    if (!base) return toast('Elige un producto del inventario.', 1);
    row.cantidad = +row.cantidad; row.costo = +row.costo || 0; row.total = +(row.cantidad * row.costo).toFixed(2); row.lote = String(row.lote).trim();
    let p = S.inventario.find(x => keyOf(x) === keyOf(base) && String(x.lote) === row.lote);
    if (p){ p.cantidad = +p.cantidad + row.cantidad; p.costo = row.costo; if (row.vencimiento) p.vencimiento = row.vencimiento; if (row.proveedor) p.proveedor = row.proveedor; await persist('inventario','update',p); }
    else { p = {...base, id:'r'+Date.now()+Math.random().toString(36).slice(2,6)+'i', lote:row.lote, cantidad:row.cantidad, costo:row.costo, vencimiento:row.vencimiento || '', proveedor:row.proveedor || base.proveedor || ''}; S.inventario.push(p); await persist('inventario','add',p); }
    row.pid = p.id; row.producto = `${p.nombre} (lote ${p.lote})`;
  }
  if (t === 'descartes' || t === 'visitas'){
    const p = S.inventario.find(x => x.id === row.pid);
    if (p){ row.producto = `${p.nombre} (lote ${p.lote})`; if (t === 'descartes') row.perdida = +(+row.cantidad * +(p.costo || 0)).toFixed(2); else { row.total = +(+row.cantidad * +(p.precio || 0)).toFixed(2); row.costo = +(+row.cantidad * +(p.costo || 0)).toFixed(2); row.ganancia = +(row.total - row.costo).toFixed(2); }
      const prev = isNew ? null : S[t].find(x => x.id === row.id), delta = +row.cantidad - (prev ? +prev.cantidad : 0);
      if (delta > +p.cantidad) return toast('Solo hay '+p.cantidad+' unidades en stock de este producto.', 1);
      if (delta){ p.cantidad = +p.cantidad - delta; await persist('inventario','update',p); } }
  }
  const i = S[t].findIndex(x => x.id === row.id);
  i < 0 ? S[t].push(row) : S[t][i] = row;
  await persist(t, isNew ? 'add' : 'update', row); render(); if (!quiet) toast(isNew ? 'Registro agregado' : 'Cambios guardados');
}

// ===== VISTAS =====
function render(){
  G = groups(); LOW = new Set(G.filter(g => g.low).map(g => g.key));
  const inv = S.inventario, ds = inv.filter(i => +i.cantidad > 0).map(i => days(i.vencimiento));
  const stats = [
    ['Productos',G.length,'rose'],
    ['Vencidos',ds.filter(d => d !== null && d < 0).length,'red'],
    ['Vencen en 60 días o menos',ds.filter(d => d !== null && d >= 0 && d <= 60).length,'amber'],
    ['Bajo stock mínimo',G.filter(g => g.low).length,'orange'],
    ['Valor del inventario (costo)',money(inv.reduce((a,i) => a + (+i.cantidad || 0) * (+i.costo || 0), 0)),'emerald'],
    ['Pérdida por mermas este mes',money(S.descartes.filter(d => String(d.fecha).startsWith(today().slice(0,7))).reduce((a,d) => a + (+d.perdida || 0), 0)),'pink'],
    ['Valor de venta del inventario',money(inv.reduce((a,i) => a + (+i.cantidad || 0) * (+i.precio || 0), 0)),'sky'],
    ['Ganancia potencial del stock',money(inv.reduce((a,i) => a + (+i.cantidad || 0) * ((+i.precio || 0) - (+i.costo || 0)), 0)),'emerald'],
    ['Margen promedio',(() => { const v = inv.reduce((a,i) => a + (+i.cantidad || 0) * (+i.precio || 0), 0), g = inv.reduce((a,i) => a + (+i.cantidad || 0) * ((+i.precio || 0) - (+i.costo || 0)), 0); return v ? (g / v * 100).toFixed(0) + ' %' : '—'; })(),'amber']];
  $('stats').innerHTML = stats.map(([l,n,c]) => `<div class="pd border-l-4 border-${c}-400 p-3"><div class="text-xs opacity-80">${l}</div><div class="text-2xl">${n}</div></div>`).join('');
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('title').textContent = TITLES[tab];
  const pn = tab === 'panel';
  $('add').style.display = $('q').style.display = pn ? 'none' : '';
  $('stats').hidden = !pn; $('filters').hidden = $('expire').hidden = $('order').hidden = tab !== 'inventario'; $('report').hidden = !(tab === 'descartes' || tab === 'visitas'); $('sum').hidden = !(tab === 'visitas' || tab === 'compras'); $('quick').hidden = !(tab === 'inventario' || tab === 'descartes');
  $('panel').hidden = !pn; $('tableView').hidden = pn;
  if (pn) return renderPanel();
  $('filters').innerHTML = tab === 'inventario' ? [['producto','Por producto'],['lote','Por lote']].map(([k,l]) => `<button data-v="${k}" class="chip ${view === k ? 'on' : ''}">${l}</button>`).join('') + '<span class="w-3"></span>' + [['todos','Todos',view === 'producto' ? G.length : inv.length],['vencidos','Vencidos',stats[1][1]],['porvencer','Por vencer',stats[2][1]],['bajo','Stock bajo',stats[3][1]]].map(([k,l,n]) => `<button data-f="${k}" class="chip ${flt === k ? 'on' : ''}">${l} · ${n}</button>`).join('') : '';
  const mes = today().slice(0,7), sm = a => a.filter(x => String(x.fecha).startsWith(mes)), sx = (a,k) => a.reduce((n,x) => n + (+x[k] || 0), 0);
  const card = (l,v) => `<div class="pd p-3"><div class="text-xs opacity-80">${l}</div><div class="text-2xl">${v}</div></div>`;
  if (tab === 'visitas'){ const m = sm(S.visitas); $('sum').innerHTML = card('Ventas del mes',money(sx(m,'total'))) + card('Costo de lo entregado',money(sx(m,'costo'))) + card('Ganancia del mes',money(sx(m,'ganancia'))); }
  if (tab === 'compras'){ const m = sm(S.compras); $('sum').innerHTML = card('Compras del mes',money(sx(m,'total'))) + card('Unidades recibidas este mes',sx(m,'cantidad')) + card('Compras registradas',S.compras.length); }
  if (tab === 'inventario' && view === 'producto') return renderGrouped();
  const cols = SCH[tab].filter(c => c[0] !== 'historial');
  const q = $('q').value.toLowerCase();
  let rows = S[tab].filter(r => JSON.stringify(r).toLowerCase().includes(q));
  if (tab === 'inventario') rows.sort((a,b) => String(a.vencimiento).localeCompare(String(b.vencimiento)));
  if (tab === 'descartes' || tab === 'visitas' || tab === 'compras') rows.sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)));
  const FL = {todos:() => true, vencidos:r => +r.cantidad > 0 && days(r.vencimiento) < 0, porvencer:r => { const d = days(r.vencimiento); return +r.cantidad > 0 && d !== null && d >= 0 && d <= 60; }, bajo:r => isLow(r)};
  if (tab === 'inventario') rows = rows.filter(FL[flt]);
  if (sortK) rows.sort((a,b) => sortD * String(a[sortK] ?? '').localeCompare(String(b[sortK] ?? ''), 'es', {numeric:true}));
  const head = cols.map(c => { const k = c[0] === 'pid' ? 'producto' : c[0] === 'paciente_id' ? 'paciente' : c[0]; return `<th data-s="${k}" class="cursor-pointer select-none">${esc(c[1].split(' (')[0])}${sortK === k ? (sortD > 0 ? ' ▲' : ' ▼') : ''}</th>`; }).join('') + (tab === 'inventario' ? '<th>Ganancia / u.</th><th>Margen</th><th>Estado</th>' : '') + '<th></th>';
  const body = rows.map(r => '<tr>' + cols.map(c => {
    let v = c[0] === 'pid' ? r.producto : c[0] === 'paciente_id' ? r.paciente : r[c[0]];
    if (['costo','precio','perdida','total','ganancia'].includes(c[0]) && v !== '' && v != null) v = money(v);
    if (c[0] === 'cantidad' && tab === 'inventario' && isLow(r)) return `<td data-l="${esc(c[1])}" class="text-red-800 font-bold">${esc(v)} ⚠</td>`;
    return `<td data-l="${esc(c[1])}">${esc(v)}</td>`;
  }).join('') + (tab === 'inventario' ? `<td data-l="Ganancia / u.">${ganHtml(r)}</td><td data-l="Margen">${marHtml(r)}</td><td data-l="Estado">${badge(r.vencimiento)}</td>` : '') +
  `<td class="whitespace-nowrap" data-id="${r.id}">` + (tab === 'compras' ? '' : '<button class="act" data-a="edit">Editar</button>') +
  (tab === 'inventario' ? '<button class="act" data-a="disc">Descartar</button>' : '') +
  (tab === 'pacientes' ? '<button class="act" data-a="visit">+ Visita</button>' + (r.telefono ? '<button class="act" data-a="wa">WhatsApp</button>' : '') : '') +
  '<button class="act del" data-a="del">Eliminar</button></td></tr>').join('');
  $('tbl').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="12" class="text-center text-stone-500 py-8">Sin registros. Usa “Nuevo” para agregar el primero.</td></tr>`}</tbody>`;
}

function renderGrouped(){
  const q = $('q').value.toLowerCase();
  const FG = {todos:() => true, vencidos:g => g.vencido > 0, porvencer:g => g.lots.some(l => { const d = days(l.vencimiento); return +l.cantidad > 0 && d !== null && d >= 0 && d <= 60; }), bajo:g => g.low};
  const gs = G.filter(g => JSON.stringify(g.lots).toLowerCase().includes(q)).filter(FG[flt]).sort((a,b) => byVenc(a.next || {}, b.next || {}));
  const m = v => v !== '' && v != null ? money(v) : '';
  const head = ['Producto','Categoría','Proveedor','Lotes','Stock','Stock mínimo','Vence primero','Precio de compra','Precio de venta','Ganancia / u.','Margen','Estado'].map(h => `<th>${h}</th>`).join('') + '<th></th>';
  const body = gs.map(g => {
    const n = g.next, open = OPEN.has(g.key), act = g.lots.filter(l => +l.cantidad > 0).length;
    let h = `<tr class="cursor-pointer" data-g="${esc(g.key)}" title="Clic para ver los lotes"><td data-l="Producto" class="font-medium">${open ? '▾' : '▸'} ${esc(g.nombre)}</td><td data-l="Categoría">${esc(n.categoria)}</td><td data-l="Proveedor">${esc(n.proveedor)}</td><td data-l="Lotes">${act}${g.lots.length > act ? ` <span class="text-xs opacity-60">(+${g.lots.length - act} agotados)</span>` : ''}</td><td data-l="Stock" class="${g.low ? 'text-red-800 font-bold' : ''}">${g.stock}${g.low ? ' ⚠' : ''}${g.vencido ? ` <span class="text-xs font-normal text-red-700">+${g.vencido} vencidas</span>` : ''}</td><td data-l="Stock mínimo">${g.minimo}</td><td data-l="Vence primero">${esc(n.vencimiento)}</td><td data-l="Precio de compra">${m(n.costo)}</td><td data-l="Precio de venta">${m(n.precio)}</td><td data-l="Ganancia / u.">${ganHtml(n)}</td><td data-l="Margen">${marHtml(n)}</td><td data-l="Estado">${badge(n.vencimiento)}</td><td class="whitespace-nowrap text-xs">${open ? 'Ocultar lotes' : 'Ver lotes'}</td></tr>`;
    if (open) h += g.lots.map(l => `<tr class="bg-[#fff4f7] ${+l.cantidad > 0 ? '' : 'opacity-60'}"><td class="pl-8 text-sm">↳ Lote ${esc(l.lote)}</td><td></td><td data-l="Proveedor">${esc(l.proveedor)}</td><td></td><td data-l="Stock">${esc(l.cantidad)}</td><td></td><td>${esc(l.vencimiento)}</td><td>${m(l.costo)}</td><td>${m(l.precio)}</td><td>${ganHtml(l)}</td><td>${marHtml(l)}</td><td>${badge(l.vencimiento)}</td><td class="whitespace-nowrap" data-id="${l.id}"><button class="act" data-a="edit">Editar</button><button class="act" data-a="disc">Descartar</button><button class="act del" data-a="del">Eliminar</button></td></tr>`).join('');
    return h;
  }).join('');
  $('tbl').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || '<tr><td colspan="13" class="text-center text-stone-500 py-8">Sin registros. Usa “Nuevo” para agregar el primero.</td></tr>'}</tbody>`;
}
// Opciones del selector de producto: por producto (salida automática) o por lote.
function invOptions(row, t){
  const lot = l => `${esc(l.nombre)} · lote ${esc(l.lote)} · vence ${esc(l.vencimiento || '—')} · stock ${esc(l.cantidad)}${days(l.vencimiento) !== null && days(l.vencimiento) < 0 ? ' (vencido)' : ''}`;
  if (t === 'compras') return G.map(g => `<option value="${g.ref.id}" ${g.lots.some(l => l.id === row.pid) ? 'selected' : ''}>${esc(g.nombre)} · stock ${g.stock}</option>`).join('');
  if (row.id) return S.inventario.map(l => `<option value="${l.id}" ${l.id === row.pid ? 'selected' : ''}>${lot(l)}</option>`).join('');
  return G.map(g => {
    let ls = g.lots.filter(l => +l.cantidad > 0 || l.id === row.pid); if (!ls.length) ls = [g.ref];
    if (ls.length === 1) return `<option value="${ls[0].id}" ${ls[0].id === row.pid ? 'selected' : ''}>${lot(ls[0])}</option>`;
    const avail = ls.reduce((n,l) => n + (t === 'visitas' && !usable(l) ? 0 : +l.cantidad), 0);
    return `<option value="g:${esc(g.key)}">${esc(g.nombre)} · stock ${avail} — sale primero el lote que vence antes</option>` + ls.map(l => `<option value="${l.id}" ${l.id === row.pid ? 'selected' : ''}>&nbsp;&nbsp;↳ ${lot(l).replace(esc(l.nombre) + ' · ', '')}</option>`).join('');
  }).join('');
}
function openForm(t, row = {}){
  $('f').dataset.lock = ''; $('dlg').oncancel = null;
  if ((t === 'descartes' || t === 'visitas' || t === 'compras') && !S.inventario.length) return toast('Primero agrega productos al inventario.', 1);
  if (t === 'visitas' && !S.pacientes.length) return toast('Primero agrega un paciente.', 1);
  if ((t === 'descartes' || t === 'visitas' || t === 'compras') && !row.id) row = {fecha: today(), ...row};
  $('f').innerHTML = `<h3 class="font-serif text-xl">${row.id ? 'Editar' : 'Nuevo'}: ${TITLES[t].toLowerCase()}</h3>` +
    SCH[t].map(([k,l,ty,opt]) => {
      if (ty === 'calc') return ''; const v = esc(row[k]); let inp;
      if (ty === 'sel') inp = `<select name="${k}" class="${IN}">${opt.map(o => `<option ${o === row[k] ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else if (ty === 'inv') inp = `<select name="${k}" required class="${IN}">${invOptions(row, t)}</select>`;
      else if (ty === 'pac') inp = `<select name="${k}" required class="${IN}">${S.pacientes.map(p => `<option value="${p.id}" ${p.id === row.paciente_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>`;
      else if (ty === 'area') inp = `<textarea name="${k}" rows="3" class="${IN}">${v}</textarea>`;
      else inp = `<input name="${k}" type="${ty || 'text'}" value="${v}" ${ty === 'number' ? 'min="0" step="any"' : ''} ${['tel','email'].includes(ty) || ['costo','precio','proximo','proveedor'].includes(k) ? '' : 'required'} class="${IN}">`;
      return `<label class="block text-sm font-medium">${l}${inp}</label>`;
    }).join('') +
    (t === 'inventario' ? '<p id="gan" class="text-sm font-medium rounded-lg bg-[#fff4f7] text-[#4A1626] px-3 py-2"></p>' : '') +
    `<div class="flex justify-end gap-2 pt-2"><button type="button" id="cancel" class="px-4 py-2 rounded-lg border">Cancelar</button><button class="px-4 py-2 rounded-lg bg-[#b83b5a] text-white font-medium">Guardar</button></div>`;
  $('cancel').onclick = () => $('dlg').close();
  if (t === 'compras'){
    const fill = () => { const p = S.inventario.find(x => x.id === $('f').elements.pid.value); if (p){ $('f').elements.proveedor.value = p.proveedor || ''; $('f').elements.costo.value = p.costo ?? ''; } };
    $('f').elements.pid.onchange = fill; fill();
  }
  if (t === 'inventario'){
    const upd = () => { const d = Object.fromEntries(new FormData($('f'))), c = d.costo, p = d.precio;
      $('gan').innerHTML = (c === '' || p === '') ? 'Escribe el precio de compra y de venta para ver la ganancia.' : (g => `Ganancia por unidad: <b class="${g < 0 ? 'text-red-700' : 'text-emerald-700'}">${money(g)}</b>${+p ? ` · Margen: <b>${(g / +p * 100).toFixed(0)} %</b>` : ''}`)(+p - +c); };
    $('f').oninput = upd; upd();
  } else $('f').oninput = null;
  $('f').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData($('f')));
    $('dlg').close(); await save(t, {...row, ...data});
  };
  $('dlg').showModal();
}

// ===== EVENTOS =====
$('nav').onclick = e => { if (e.target.dataset.t){ tab = e.target.dataset.t; flt = 'todos'; sortK = null; $('q').value = ''; render(); } };
$('q').oninput = render;
$('add').onclick = () => openForm(tab);
$('quick').onclick = () => openForm('descartes');
$('order').onclick = () => {
  const low = G.filter(g => g.low).map(g => ({nombre:g.nombre, proveedor:g.ref.proveedor, cantidad:g.stock, minimo:g.minimo, costo:g.next.costo}));
  if (!low.length) return toast('No hay productos bajo el mínimo.');
  const th = 'style="text-align:left;border-bottom:1px solid #999;padding:4px"', td = 'style="padding:4px;border-bottom:1px solid #ddd"';
  const tbl = `<table style="width:100%;border-collapse:collapse;font:14px Arial"><tr>${['Producto','Proveedor','Stock','Mínimo','Pedir','Costo est.'].map(h => `<th ${th}>${h}</th>`).join('')}</tr>${low.map(p => `<tr>${[p.nombre, p.proveedor || '—', p.cantidad, p.minimo, Math.max(1, +p.minimo * 2 - +p.cantidad), money(Math.max(1, +p.minimo * 2 - +p.cantidad) * (+p.costo || 0))].map(c => `<td ${td}>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  $('f').dataset.lock = '';
  $('f').innerHTML = `<h3 class="font-serif text-xl">Pedido sugerido</h3><p class="text-sm">Productos en el mínimo o por debajo. La cantidad a pedir lleva el stock al doble del mínimo.</p><div class="overflow-x-auto">${tbl}</div><div class="flex justify-end gap-2 pt-2"><button type="button" id="cancel" class="px-4 py-2 rounded-lg border">Cerrar</button><button type="button" id="prt" class="px-4 py-2 rounded-lg bg-[#b83b5a] text-white font-medium">Imprimir</button></div>`;
  $('cancel').onclick = () => $('dlg').close();
  $('prt').onclick = () => { const w = window.open('', '_blank'); if (!w) return toast('El navegador bloqueó la ventana. Permite ventanas emergentes.', 1); w.document.write(`<title>Pedido sugerido</title><h2 style="font-family:Arial">Pedido sugerido · ${today()}</h2>${tbl}`); w.document.close(); w.print(); };
  $('f').onsubmit = e => e.preventDefault();
  $('dlg').showModal();
};
$('report').onclick = () => {
  $('f').dataset.lock = '';
  $('f').innerHTML = `<h3 class="font-serif text-xl">Reporte mensual</h3><label class="block text-sm font-medium">Mes<input type="month" name="m" value="${today().slice(0,7)}" required class="${IN}"></label><div class="flex justify-end gap-2 pt-2"><button type="button" id="cancel" class="px-4 py-2 rounded-lg border">Cancelar</button><button class="px-4 py-2 rounded-lg bg-[#b83b5a] text-white font-medium">Generar</button></div>`;
  $('cancel').onclick = () => $('dlg').close();
  $('f').onsubmit = e => { e.preventDefault(); const m = new FormData($('f')).get('m'); $('dlg').close(); printReport(m); };
  $('dlg').showModal();
};
function printReport(m){
  const ds = S.descartes.filter(d => String(d.fecha).startsWith(m)), vs = S.visitas.filter(v => String(v.fecha).startsWith(m)), cs = S.compras.filter(c => String(c.fecha).startsWith(m));
  const sum = (a, k) => a.reduce((n, x) => n + (+x[k] || 0), 0), por = {};
  ds.forEach(d => { const o = por[d.motivo] = por[d.motivo] || {u:0, p:0}; o.u += +d.cantidad || 0; o.p += +d.perdida || 0; });
  const cel = 'style="padding:5px;border-bottom:1px solid #ddd;text-align:left"';
  const tabla = (head, filas) => `<table style="width:100%;border-collapse:collapse;font:13px Arial;margin-bottom:18px"><tr>${head.map(h => `<th style="padding:5px;border-bottom:2px solid #4A1626;text-align:left">${h}</th>`).join('')}</tr>${filas.map(f => `<tr>${f.map(c => `<td ${cel}>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td ${cel} colspan="${head.length}">Sin registros</td></tr>`}</table>`;
  const w = window.open('', '_blank'); if (!w) return toast('El navegador bloqueó la ventana. Permite ventanas emergentes.', 1);
  w.document.write(`<title>Reporte ${m}</title><body style="font-family:Arial;color:#4A1626;max-width:780px;margin:24px auto"><h2 style="margin:0">Dra. Linda Gómez Icaza · Reporte de ${m}</h2><p>Descartes: <b>${sum(ds,'cantidad')}</b> unidades · Pérdida: <b>${money(sum(ds,'perdida'))}</b> · Visitas: <b>${vs.length}</b> · Productos entregados en visitas: <b>${money(sum(vs,'total'))}</b> · Ganancia de visitas: <b>${money(sum(vs,'ganancia'))}</b> · Compras: <b>${money(sum(cs,'total'))}</b></p><h3>Por motivo</h3>${tabla(['Motivo','Unidades','Pérdida'], Object.entries(por).map(([k,o]) => [k, o.u, money(o.p)]))}<h3>Detalle de descartes</h3>${tabla(['Fecha','Producto','Cantidad','Motivo','Pérdida'], ds.sort((a,b) => String(a.fecha).localeCompare(String(b.fecha))).map(d => [d.fecha, d.producto, d.cantidad, d.motivo, money(d.perdida)]))}`);
  w.document.close(); w.print();
}
$('filters').onclick = e => { if (e.target.dataset.f){ flt = e.target.dataset.f; render(); } if (e.target.dataset.v){ view = e.target.dataset.v; render(); } };
$('expire').onclick = async () => {
  const v = S.inventario.filter(p => days(p.vencimiento) < 0 && +p.cantidad > 0);
  if (!v.length) return toast('No hay productos vencidos con stock.');
  if (!confirm(`Se retirarán ${v.length} producto(s) vencido(s) y se registrarán como descartes. ¿Continuar?`)) return;
  for (const [i, p] of v.entries()){
    const d = {id:'r'+Date.now()+i, pid:p.id, producto:`${p.nombre} (lote ${p.lote})`, cantidad:+p.cantidad, motivo:'Vencido', fecha:today(), responsable:'Retiro automático', perdida:+(+p.cantidad * +(p.costo || 0)).toFixed(2)};
    S.descartes.push(d); p.cantidad = 0; await persist('descartes','add',d); await persist('inventario','update',p);
  }
  render(); toast(v.length + ' producto(s) retirado(s)');
};
$('dlg').onclick = e => { if (e.target === $('dlg') && !$('f').dataset.lock) $('dlg').close(); };
const HEAD = {
  inventario:['id','nombre','categoria','proveedor','lote','cantidad','minimo','vencimiento','costo','precio'],
  descartes:['id','pid','producto','cantidad','motivo','fecha','responsable','perdida'],
  pacientes:['id','nombre','telefono','correo','notas','historial','proximo'],
  visitas:['id','paciente_id','paciente','pid','producto','cantidad','fecha','notas','total','costo','ganancia'],
  compras:['id','pid','producto','proveedor','lote','cantidad','vencimiento','costo','fecha','total']};
$('xls').onclick = () => {
  if (!window.XLSX) return toast('No se pudo cargar la librería de Excel. Revisa tu conexión a internet.', 1);
  const wb = XLSX.utils.book_new();
  for (const t in HEAD){
    const filas = S[t].map(r => HEAD[t].map(k => ['cantidad','minimo','costo','precio','perdida','total','ganancia'].includes(k) && r[k] !== '' && r[k] != null ? +r[k] : (r[k] ?? '')));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD[t], ...filas]), t);
  }
  XLSX.writeFile(wb, `clinica_datos_${today()}.xlsx`);
  toast('Excel descargado');
};
$('xlsIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!window.XLSX) return toast('No se pudo cargar la librería de Excel. Revisa tu conexión a internet.', 1);
  if (!confirm('Se reemplazarán los datos actuales por los del archivo. ¿Continuar?')) return;
  try {
    const wb = XLSX.read(await f.arrayBuffer(), {type:'array', cellDates:true});
    let n = 0;
    for (const t in HEAD){
      const ws = wb.Sheets[t]; if (!ws) continue;
      S[t] = XLSX.utils.sheet_to_json(ws, {raw:false, dateNF:'yyyy-mm-dd', defval:''}).filter(r => String(r.id).trim() !== '');
      n++; await persist(t);
    }
    if (!n) return toast('El archivo no tiene las pestañas inventario, descartes, pacientes o visitas.', 1);
    render(); toast('Datos importados desde Excel');
  } catch (err) { toast('No se pudo leer el archivo de Excel.', 1); }
};
$('tbl').onclick = async e => {
  const gr = e.target.closest('tr[data-g]'); if (gr){ const k = gr.dataset.g; OPEN.has(k) ? OPEN.delete(k) : OPEN.add(k); return render(); }
  if (e.target.dataset.s){ const k = e.target.dataset.s; sortD = sortK === k ? -sortD : 1; sortK = k; return render(); }
  const a = e.target.dataset.a, id = e.target.closest('td')?.dataset.id; if (!a) return;
  const r = S[tab].find(x => x.id === id);
  if (a === 'edit') openForm(tab, r);
  if (a === 'disc') openForm('descartes', {pid: id});
  if (a === 'visit') openForm('visitas', {paciente_id: id});
  if (a === 'wa'){ const n = String(r.telefono).replace(/\D/g, ''); window.open('https://wa.me/' + (n.length === 8 ? '505' + n : n), '_blank'); }
  if (a === 'del'){
    if (tab === 'descartes' || tab === 'visitas'){ const p = S.inventario.find(x => x.id === r.pid); if (p){ p.cantidad = +p.cantidad + +r.cantidad; await persist('inventario','update',p); } }
    if (tab === 'compras'){ const p = S.inventario.find(x => x.id === r.pid); if (p){ if (+p.cantidad < +r.cantidad) return toast('Ya se usaron unidades de este lote; no se puede eliminar la compra.', 1); p.cantidad = +p.cantidad - +r.cantidad; await persist('inventario','update',p); } }
    S[tab] = S[tab].filter(x => x.id !== id); { const t0 = tab; toast('Registro eliminado', 0, ['Deshacer', async () => {
      S[t0].push(r);
      if (t0 === 'descartes' || t0 === 'visitas'){ const p = S.inventario.find(x => x.id === r.pid); if (p){ p.cantidad = Math.max(0, +p.cantidad - +r.cantidad); await persist('inventario','update',p); } }
      if (t0 === 'compras'){ const p = S.inventario.find(x => x.id === r.pid); if (p){ p.cantidad = +p.cantidad + +r.cantidad; await persist('inventario','update',p); } }
      await persist(t0,'add',r); render();
    }]); } await persist(tab,'delete',r); render(); }
};
// ===== PANEL GENERAL =====
let TK = JSON.parse(localStorage.getItem('derma_tareas') || '[]');
const saveTK = () => localStorage.setItem('derma_tareas', JSON.stringify(TK));
const P = (cls, title, body) => `<div class="${cls} col-span-12 ${cls.includes('L5') ? 'lg:col-span-5' : cls.includes('L4') ? 'md:col-span-6 lg:col-span-4' : cls.includes('L6') ? 'md:col-span-6' : 'md:col-span-6 lg:col-span-3'}"><h3 class="font-semibold mb-2">${title}</h3>${body}</div>`;
function renderPanel(){
  const inv = [...S.inventario].filter(i => +i.cantidad > 0).sort((a,b) => String(a.vencimiento).localeCompare(String(b.vencimiento)));
  const list = inv.slice(0,7).map(i => {
    const pct = Math.min(100, Math.round(+i.cantidad / Math.max(1, +i.minimo*3) * 100)), low = isLow(i);
    return `<div class="py-1.5 border-t border-[#4A1626]/15"><div class="flex justify-between gap-2"><span class="truncate font-medium">${esc(i.nombre)} <span class="text-xs font-normal opacity-60">${esc(i.lote)}</span></span>${badge(i.vencimiento)}</div><div class="flex items-center gap-2 mt-1"><div class="h-1.5 flex-1 rounded bg-[#4A1626]/15"><div class="h-1.5 rounded ${low ? 'bg-red-600' : 'bg-[#B83B5A]'}" style="width:${pct}%"></div></div><span class="text-xs">${i.cantidad} u.</span></div></div>`;
  }).join('') || '<p class="text-sm">Aún no hay productos.</p>';
  // Línea: productos registrados en historiales por mes
  const ms = [...Array(6)].map((_,k) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()-5+k, 15).toISOString().slice(0,7); });
  const cn = ms.map(m => S.visitas.filter(v => String(v.fecha).startsWith(m)).length), mx = Math.max(1,...cn);
  const pts = cn.map((c,k) => [25+k*50, 95-c/mx*70]);
  const line = `<svg viewBox="0 0 300 120" class="w-full"><polyline fill="none" stroke="#f4a0b3" stroke-width="2.5" points="${pts.map(p => p.join(',')).join(' ')}"/>${pts.map((p,k) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#f4a0b3"/><text x="${p[0]}" y="115" font-size="10" fill="#f6c6d1" text-anchor="middle">${ms[k].slice(5)}</text><text x="${p[0]}" y="${p[1]-8}" font-size="10" fill="#ffffff" text-anchor="middle">${cn[k]}</text>`).join('')}</svg>`;
  // Ventas y ganancia por mes
  const vm = ms.map(m => S.visitas.filter(v => String(v.fecha).startsWith(m))), sv = (a,k) => a.reduce((n,v) => n + (+v[k] || 0), 0);
  const ven = vm.map(a => sv(a,'total')), gn = vm.map(a => sv(a,'ganancia')), mxg = Math.max(1,...ven,...gn.map(Math.abs));
  const kk = n => Math.abs(n) >= 1000 ? (n/1000).toFixed(1)+'k' : Math.round(n);
  const bars = `<p class="text-sm mb-1">Este mes: ventas <b>${money(ven[5])}</b> · ganancia <b>${money(gn[5])}</b></p><svg viewBox="0 0 300 125" class="w-full">${ms.map((m,i) => { const x = i*50, hv = ven[i]/mxg*75, hg = Math.max(0,gn[i])/mxg*75; return `<rect x="${x+8}" y="${100-hv}" width="15" height="${hv}" rx="2" fill="rgba(255,255,255,.3)"/><rect x="${x+26}" y="${100-hg}" width="15" height="${hg}" rx="2" fill="#f4a0b3"/><text x="${x+33.5}" y="${96-hg}" font-size="9" fill="#ffffff" text-anchor="middle">${kk(gn[i])}</text><text x="${x+25}" y="116" font-size="10" fill="#f6c6d1" text-anchor="middle">${m.slice(5)}</text>`; }).join('')}</svg><div class="flex gap-4 text-xs"><span><span class="inline-block w-2.5 h-2.5 rounded-sm mr-1" style="background:rgba(255,255,255,.3)"></span>Ventas</span><span><span class="inline-block w-2.5 h-2.5 rounded-sm mr-1" style="background:#f4a0b3"></span>Ganancia</span></div>`;
  const cps = [...S.compras].sort((a,b) => String(b.fecha).localeCompare(String(a.fecha))), mesC = today().slice(0,7);
  const compras = `<p class="text-sm mb-1">Compras este mes: <b>${money(cps.filter(c => String(c.fecha).startsWith(mesC)).reduce((n,c) => n + (+c.total || 0), 0))}</b></p>` + (cps.slice(0,5).map(c => `<div class="py-1.5 border-t border-[#4A1626]/15 flex justify-between gap-2"><span class="truncate">${esc(c.producto)}</span><span class="text-xs whitespace-nowrap">${c.cantidad} u. · ${money(c.total)}</span></div>`).join('') || '<p class="text-sm">Aún no hay compras registradas.</p>') + '<button data-go="compras" class="act mt-2">Ver todo</button>';
  // Dona: estado del inventario
  const dd = inv.map(i => days(i.vencimiento)), seg = [['Vigente',dd.filter(d => d === null || d > 60).length,'#22c55e'],['Por vencer',dd.filter(d => d !== null && d >= 0 && d <= 60).length,'#f59e0b'],['Vencido',dd.filter(d => d !== null && d < 0).length,'#ef4444']];
  const tot = inv.length || 1, C = 251.3; let acc = 0;
  const donut = `<div class="flex items-center gap-4"><svg viewBox="0 0 100 100" class="w-28 shrink-0"><circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="16"/>${seg.map(([,n,c]) => { const l = n/tot*C, o = acc; acc += l; return `<circle cx="50" cy="50" r="40" fill="none" stroke="${c}" stroke-width="16" stroke-dasharray="${l} ${C-l}" stroke-dashoffset="${-o}" transform="rotate(-90 50 50)"/>`; }).join('')}<text x="50" y="55" text-anchor="middle" font-size="16" fill="#ffffff">${inv.length}</text></svg><ul class="text-sm space-y-1">${seg.map(([l,n,c]) => `<li><span style="background:${c}" class="inline-block w-2.5 h-2.5 rounded-full mr-1.5"></span>${l}: ${n}</li>`).join('')}</ul></div>`;
  // Calendario de vencimientos
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), first = (new Date(y,m,1).getDay()+6)%7, nd = new Date(y,m+1,0).getDate();
  const ex = {}; inv.forEach(i => { if (i.vencimiento) (ex[i.vencimiento] = ex[i.vencimiento] || []).push(i.nombre); });
  let cal = ['L','M','X','J','V','S','D'].map(d => `<div class="!bg-transparent font-semibold">${d}</div>`).join('') + '<div class="!bg-transparent"></div>'.repeat(first);
  for (let d = 1; d <= nd; d++){
    const k = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, e = ex[k], dy = days(k);
    cal += `<div ${e ? `title="${esc(e.join(', '))}" class="!text-white font-bold ${dy <= 30 ? '!bg-red-600' : '!bg-amber-600'}"` : (d === now.getDate() ? 'class="!bg-[#4A1626] !text-white"' : '')}>${d}</div>`;
  }
  // Tareas y alertas
  const tasks = TK.map((t,i) => `<li class="flex items-center gap-2 py-1"><input type="checkbox" data-tk="${i}" ${t.done ? 'checked' : ''}><span class="flex-1 ${t.done ? 'line-through opacity-60' : ''}">${esc(t.t)}</span><button data-del="${i}" class="opacity-70" aria-label="Quitar tarea">✕</button></li>`).join('') || '<li class="text-sm opacity-80">Sin tareas pendientes.</li>';
  const al = [];
  S.pacientes.forEach(p => { const d = days(p.proximo); if (d !== null && d <= 7) al.push(['bg-[#B83B5A]', `Control de ${p.nombre}: ${d < 0 ? 'atrasado ' + (-d) + ' d' : d === 0 ? 'hoy' : 'en ' + d + ' d'}`]); });
  inv.forEach(i => { const d = days(i.vencimiento);
    if (d !== null && d < 0) al.push(['bg-red-600',`${i.nombre}: vencido, retirar del stock`]);
    else if (d !== null && d <= 60) al.push([d <= 30 ? 'bg-red-600' : 'bg-amber-600',`${i.nombre}: vence en ${d} días`]);
  });
  G.filter(g => g.low).forEach(g => al.push(['bg-orange-600',`${g.nombre}: stock bajo (${g.stock})`]));
  const alertas = al.slice(0,7).map(([c,t]) => `<li class="flex gap-2 py-1 border-t border-[#4A1626]/15"><span class="${c} w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"></span>${esc(t)}</li>`).join('') || '<li class="text-sm">Todo en orden.</li>';
  const dv = inv.map(i => days(i.vencimiento)).filter(d => d !== null && d >= 0);
  const riesgo = inv.filter(i => { const d = days(i.vencimiento); return d !== null && d >= 0 && d <= 60; }).reduce((n,i) => n + +i.cantidad * (+i.costo || 0), 0), perdido = inv.filter(i => days(i.vencimiento) < 0 && days(i.vencimiento) !== null).reduce((n,i) => n + +i.cantidad * (+i.costo || 0), 0);
  const resumen = `<p class="text-sm mb-2">Dinero en riesgo (vence en 60 días o menos): <b>${money(riesgo)}</b>${perdido ? ` · ya vencido: <b class="text-red-700">${money(perdido)}</b>` : ''} <span class="opacity-70">(al costo)</span></p><div class="grid grid-cols-3 gap-2 mb-3">${[['Esta semana',dv.filter(d => d <= 7).length],['8 a 30 días',dv.filter(d => d > 7 && d <= 30).length],['1 a 3 meses',dv.filter(d => d > 30 && d <= 90).length]].map(([l,n]) => `<div class="pd !p-2 text-center"><div class="text-xl">${n}</div><div class="text-xs">${l}</div></div>`).join('')}</div>`;
  $('panel').innerHTML =
    P('pn L5','Inventario',list + '<button data-go="inventario" class="act mt-2">Ver todo</button>') +
    P('pd L4','Productos en visitas (últimos 6 meses)',line) +
    P('pd L3','Estado del inventario',donut) +
    P('pn L5','Próximos vencimientos',`${resumen}<div class="cal">${cal}</div>`) +
    P('pn L4','Tareas pendientes',`<ul>${tasks}</ul><div class="flex gap-2 mt-2"><input id="tkIn" placeholder="Nueva tarea" class="flex-1 rounded-lg px-2 py-1 bg-white border border-[#4A1626]/20"><button data-add class="px-3 rounded-lg bg-[#B83B5A] text-white">Agregar</button></div>`) +
    P('pn L3','Alertas',`<ul class="text-sm">${alertas}</ul>`) +
    P('pd L6','Ventas y ganancia por mes',bars) +
    P('pn L6','Últimas compras',compras);
}
$('panel').onclick = e => {
  const d = e.target.dataset;
  if (d.go){ tab = d.go; render(); }
  if (d.del !== undefined){ TK.splice(+d.del,1); saveTK(); renderPanel(); }
  if (d.add !== undefined){ const v = $('tkIn').value.trim(); if (v){ TK.push({t:v,done:false}); saveTK(); renderPanel(); } }
};
$('panel').onchange = e => { if (e.target.dataset.tk !== undefined){ TK[+e.target.dataset.tk].done = e.target.checked; saveTK(); renderPanel(); } };

load().then(() => setInterval(refresh, 60000));
document.addEventListener('visibilitychange', refresh);
