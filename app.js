// Configurar la URL del WebApp de Apps Script aquí
const API_URL = 'https://script.google.com/macros/s/AKfycbzNVc-5NU3DkeClA9Y8M_pVRYJd3s2gpfVFgQ1OjWSH3BHL6ikvNL7Y4UBQnr8TQowx8Q/exec';

async function api(action, payload = {}) {
  const params = new URLSearchParams({ action, ...payload });
  const url = `${API_URL}?${params.toString()}`;
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en la API: ${res.status} - ${errText}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

function $(sel, root=document){ return root.querySelector(sel); }

function ordenarCajasNumericamente(cajas) {
  return [...cajas].sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return String(a).localeCompare(String(b));
  });
}

async function cargarCatalogos(){
  const sel = document.getElementById('selCategoria');
  const selCaja = document.getElementById('selCaja');
  const selEstado = document.getElementById('selEstado');
  try {
    const data = await api('catalogos');
    const cats = data.categorias || [];
    const cajas = data.cajas || [];
    const estados = data.estados || [];
    
    const cajasOrdenadas = ordenarCajasNumericamente(cajas);
    
    if (sel) sel.innerHTML = `<option value="">Todas las categorías</option>` + cats.map(v=>`<option value="${v}">${v}</option>`).join('');
    if (selCaja) selCaja.innerHTML = `<option value="">Todas las cajas</option>` + cajasOrdenadas.map(v=>`<option value="${v}">${v}</option>`).join('');
    if (selEstado) selEstado.innerHTML = `<option value="">Todos los estados</option>` + estados.map(v=>`<option value="${v}">${v}</option>`).join('');
  } catch(err){
    console.error('Error cargando catálogos:', err);
  }
}

let __crossBusy = false;
let __crossTimer = null;
async function actualizarFiltrosCruzados(origin){
  // Cancelar llamada pendiente
  if (__crossTimer) clearTimeout(__crossTimer);
  
  // Debounce de 100ms
  __crossTimer = setTimeout(async ()=> {
    if (__crossBusy) return;
    __crossBusy = true;
    
    const selCat = document.getElementById('selCategoria');
    const selCaja = document.getElementById('selCaja');
    const selEst = document.getElementById('selEstado');
    
    // Indicador visual: deshabilitar selects, botones y cambiar cursor
    if (selCat) selCat.disabled = true;
    if (selCaja) selCaja.disabled = true;
    if (selEst) selEst.disabled = true;
    const btnBuscar = document.getElementById('btnBuscar');
    const btnReset = document.getElementById('btnReset');
    const btnPrint = document.getElementById('btnPrint');
    if (btnBuscar) btnBuscar.disabled = true;
    if (btnReset) btnReset.disabled = true;
    if (btnPrint) btnPrint.disabled = true;
    
    // Deshabilitar todos los botones "Ver" de la tabla
    const botonesVer = document.querySelectorAll('button.view');
    botonesVer.forEach(btn => btn.disabled = true);
    
    document.body.style.cursor = 'wait';
    
    // GUARDAR valores ANTES de modificar los selects
    const cat = selCat?.value.trim() || '';
    const caja = selCaja?.value.trim() || '';
    const estado = selEst?.value.trim() || '';
  
  try {
    // Obtener catálogos filtrados del backend
    const data = await api('catalogos_filtrados', { cat, caja, estado });
    
    const arrCat = (data.categorias || []);
    const arrCaja = (data.cajas || []);
    const arrEst = (data.estados || []);
    
    const cajasOrdenadas = ordenarCajasNumericamente(arrCaja);
    
    // Actualizar select de categorías (si no es el origen)
    if (selCat && origin !== 'cat'){
      selCat.innerHTML = `<option value="">Todas las categorías</option>` + arrCat.map(v=>`<option value="${v}">${v}</option>`).join('');
      // Restaurar valor si sigue disponible
      if (cat && arrCat.map(String).includes(cat)) {
        selCat.value = cat;
      }
    }
    
    // Actualizar select de cajas (si no es el origen)
    if (selCaja && origin !== 'caja'){
      selCaja.innerHTML = `<option value="">Todas las cajas</option>` + cajasOrdenadas.map(v=>`<option value="${v}">${v}</option>`).join('');
      // Restaurar valor si sigue disponible (convertir a string para comparar)
      if (caja && cajasOrdenadas.map(String).includes(caja)) {
        selCaja.value = caja;
      }
    }
    
    // Actualizar select de estados (si no es el origen)
    if (selEst && origin !== 'estado'){
      selEst.innerHTML = `<option value="">Todos los estados</option>` + arrEst.map(v=>`<option value="${v}">${v}</option>`).join('');
      // Restaurar valor si sigue disponible
      if (estado && arrEst.map(String).includes(estado)) {
        selEst.value = estado;
      }
    }
    } catch(e){
      console.error('ERROR en filtrado cruzado:', e);
      // En caso de error, restaurar opciones por defecto
      if (selCat && origin !== 'cat') selCat.innerHTML = `<option value="">Todas las categorías</option>`;
      if (selCaja && origin !== 'caja') selCaja.innerHTML = `<option value="">Todas las cajas</option>`;
      if (selEst && origin !== 'estado') selEst.innerHTML = `<option value="">Todos los estados</option>`;
    } finally {
      // Restaurar estado visual: habilitar selects, botones y restaurar cursor
      if (selCat) selCat.disabled = false;
      if (selCaja) selCaja.disabled = false;
      if (selEst) selEst.disabled = false;
      if (btnBuscar) btnBuscar.disabled = false;
      if (btnReset) btnReset.disabled = false;
      if (btnPrint) btnPrint.disabled = false;
      
      // Habilitar todos los botones "Ver" de la tabla
      const botonesVer = document.querySelectorAll('button.view');
      botonesVer.forEach(btn => btn.disabled = false);
      
      document.body.style.cursor = 'default';
      __crossBusy = false;
    }
  }, 100); // Fin del setTimeout
}

async function cargarLibros(){
  const q = $('#q').value.trim();
  const cat = document.getElementById('selCategoria')?.value.trim() || '';
  const caja = document.getElementById('selCaja')?.value.trim() || '';
  const estado = document.getElementById('selEstado')?.value.trim() || '';
  const tabla = $('#tabla');
  
  // Bloquear todos los elementos durante la carga
  const qInput = $('#q');
  const selCat = document.getElementById('selCategoria');
  const selCaja = document.getElementById('selCaja');
  const selEst = document.getElementById('selEstado');
  const btnBuscar = document.getElementById('btnBuscar');
  const btnReset = document.getElementById('btnReset');
  const btnPrint = document.getElementById('btnPrint');
  
  if (qInput) qInput.disabled = true;
  if (selCat) selCat.disabled = true;
  if (selCaja) selCaja.disabled = true;
  if (selEst) selEst.disabled = true;
  if (btnBuscar) btnBuscar.disabled = true;
  if (btnReset) btnReset.disabled = true;
  if (btnPrint) btnPrint.disabled = true;
  document.body.style.cursor = 'wait';
  
  try {
    tabla.innerHTML = '<p style="text-align:center;padding:2rem;">Cargando...</p>';
    const data = await api('search_libros', { q, cat, caja, estado });
    __currentItems = data.items || [];
    
    // Ordenar por título automáticamente
    __sortColumn = 'titulo';
    __sortDirection = 'asc';
    const sorted = [...__currentItems].sort((a, b) => {
      const valA = String(a.titulo || '').toLowerCase();
      const valB = String(b.titulo || '').toLowerCase();
      return valA.localeCompare(valB);
    });
    
    renderTabla(sorted);
  } catch (err) {
    tabla.innerHTML = '';
    alert(err.message || 'Error buscando');
    console.error('Error buscando libros:', err);
  } finally {
    // Desbloquear todos los elementos
    if (qInput) qInput.disabled = false;
    if (selCat) selCat.disabled = false;
    if (selCaja) selCaja.disabled = false;
    if (selEst) selEst.disabled = false;
    if (btnBuscar) btnBuscar.disabled = false;
    if (btnReset) btnReset.disabled = false;
    if (btnPrint) btnPrint.disabled = false;
    document.body.style.cursor = 'default';
  }
}

function actualizarEstadisticas(items){
  const total = items.length;
  let disponibles = 0;
  let prestados = 0;
  
  items.forEach(x => {
    const estado = x.estado || x.estadoprestado || x['estado prestado'] || '';
    const estadoNorm = String(estado).toLowerCase().trim();
    
    if (estadoNorm === 'disponible') {
      disponibles++;
    } else if (estado && estadoNorm !== 'disponible') {
      prestados++;
    }
  });
  
  // Verificar si hay filtros activos
  const q = $('#q')?.value.trim() || '';
  const cat = document.getElementById('selCategoria')?.value.trim() || '';
  const caja = document.getElementById('selCaja')?.value.trim() || '';
  const estado = document.getElementById('selEstado')?.value.trim() || '';
  const hayFiltros = q || cat || caja || estado;
  
  // Cambiar el label según si hay filtros o no
  const labelTotal = document.querySelector('.stat-label');
  if (labelTotal) {
    labelTotal.textContent = hayFiltros ? 'Resultados:' : 'Total de libros:';
  }
  
  // Mostrar filtros aplicados
  const filtrosDiv = $('#filtrosAplicados');
  if (filtrosDiv) {
    if (hayFiltros) {
      const filtros = [];
      if (q) filtros.push(`Búsqueda: "${q}"`);
      if (cat) filtros.push(`Categoría: ${cat}`);
      if (caja) filtros.push(`Caja: ${caja}`);
      if (estado) filtros.push(`Estado: ${estado}`);
      filtrosDiv.textContent = 'Filtros aplicados: ' + filtros.join(' | ');
    } else {
      filtrosDiv.textContent = '';
    }
  }
  
  const statTotal = $('#statTotal');
  const statDisponibles = $('#statDisponibles');
  const statPrestados = $('#statPrestados');
  
  if (statTotal) statTotal.textContent = total;
  if (statDisponibles) statDisponibles.textContent = disponibles;
  if (statPrestados) statPrestados.textContent = prestados;
}

function renderTabla(items){
  // Actualizar estadísticas
  actualizarEstadisticas(items);
  
  const el = $('#tabla');
  const rows = items.map(x=> {
    const estado = x.estado || x.estadoprestado || x['estado prestado'] || '';
    const estadoNorm = String(estado).toLowerCase().trim();
    
    // Si es "disponible" → verde
    // Si es "prestado" o tiene un nombre de usuario (no vacío y no "disponible") → rojo
    let estadoClass = '';
    if (estadoNorm === 'disponible') {
      estadoClass = 'estado-disponible';
    } else if (estado && estadoNorm !== 'disponible') {
      // Cualquier otro valor (prestado, nombre de usuario, etc.) → rojo
      estadoClass = 'estado-prestado';
    }
    
    return `<tr>
      <td>${esc(x.titulo)}</td>
      <td>${esc(x.categoria)}</td>
      <td>${esc(x.caja)}</td>
      <td><span class="estado-badge ${estadoClass}">${esc(estado)}</span></td>
      <td class="actions">
        <button class="secondary view" data-id="${x.id}">Ver</button>
      </td>
    </tr>`;
  }).join('');
  
  const sortIcon = (col) => {
    if (__sortColumn !== col) return ' ↕';
    return __sortDirection === 'asc' ? ' ↑' : ' ↓';
  };
  
  el.innerHTML = `<table>
    <thead><tr>
      <th class="sortable" data-column="titulo">Título${sortIcon('titulo')}</th>
      <th class="sortable" data-column="categoria">Categoría${sortIcon('categoria')}</th>
      <th class="sortable" data-column="caja">Caja${sortIcon('caja')}</th>
      <th class="sortable" data-column="estado">Estado${sortIcon('estado')}</th>
      <th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  
  // Añadir event listeners a las cabeceras
  el.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const column = th.dataset.column;
      ordenarPor(column);
    });
  });
  
  el.querySelectorAll('button.view').forEach(b=> b.addEventListener('click', async ()=> {
    b.disabled = true;
    await verLibro(b.dataset.id);
    b.disabled = false;
  }));
}

function ordenarPor(column){
  // Si es la misma columna, cambiar dirección
  if (__sortColumn === column) {
    __sortDirection = __sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    __sortColumn = column;
    __sortDirection = 'asc';
  }
  
  // Ordenar los items
  const sorted = [...__currentItems].sort((a, b) => {
    let valA = a[column] || '';
    let valB = b[column] || '';
    
    // Para caja, intentar ordenar numéricamente
    if (column === 'caja') {
      const numA = parseInt(valA);
      const numB = parseInt(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return __sortDirection === 'asc' ? numA - numB : numB - numA;
      }
    }
    
    // Ordenamiento alfabético
    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();
    
    if (__sortDirection === 'asc') {
      return valA.localeCompare(valB);
    } else {
      return valB.localeCompare(valA);
    }
  });
  
  renderTabla(sorted);
}

function esc(v){ return (v==null? '': String(v)).replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }

function mostrarDocumento(markdown, dialogId, contentId) {
  const dlg = document.getElementById(dialogId);
  const content = document.getElementById(contentId);
  
  if (!dlg || !content) return;
  
  // Convertir Markdown básico a HTML
  let html = markdown
    // Encabezados
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Negrita
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Listas con viñetas
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Listas numeradas
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Líneas horizontales
    .replace(/^---$/gm, '<hr>')
    // Párrafos (líneas no vacías que no son otros elementos)
    .split('\n\n')
    .map(block => {
      if (block.startsWith('<h') || block.startsWith('<li') || block.startsWith('<hr')) {
        return block;
      }
      if (block.trim() === '') return '';
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    })
    .join('\n');
  
  // Envolver listas consecutivas en ul/ol
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, match => {
    return '<ul>' + match + '</ul>';
  });
  
  content.innerHTML = html;
  dlg.showModal();
}

$('#btnBuscar').addEventListener('click', cargarLibros);
$('#q').addEventListener('keydown', e=> { if(e.key==='Enter'){ cargarLibros(); }});

const btnHelp = document.getElementById('btnHelp');
if (btnHelp) btnHelp.addEventListener('click', async ()=> {
  try {
    const response = await fetch('README.md');
    const markdown = await response.text();
    mostrarDocumento(markdown, 'dlgHelp', 'helpContent');
  } catch(err) {
    console.error('Error cargando README:', err);
  }
});

const linkLicense = document.getElementById('linkLicense');
if (linkLicense) linkLicense.addEventListener('click', async (e)=> {
  e.preventDefault();
  try {
    const response = await fetch('LICENSE.md');
    const markdown = await response.text();
    mostrarDocumento(markdown, 'dlgLicense', 'licenseContent');
  } catch(err) {
    console.error('Error cargando LICENSE:', err);
  }
});

const linkPrivacy = document.getElementById('linkPrivacy');
if (linkPrivacy) linkPrivacy.addEventListener('click', async (e)=> {
  e.preventDefault();
  try {
    const response = await fetch('PRIVACY.md');
    const markdown = await response.text();
    mostrarDocumento(markdown, 'dlgPrivacy', 'privacyContent');
  } catch(err) {
    console.error('Error cargando PRIVACY:', err);
  }
});

const btnPrint = document.getElementById('btnPrint');
if (btnPrint) btnPrint.addEventListener('click', ()=> {
  // Cambiar el título del documento para incluir fecha y hora
  const ahora = new Date();
  const año = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  const hora = String(ahora.getHours()).padStart(2, '0');
  const minuto = String(ahora.getMinutes()).padStart(2, '0');
  const fecha = `${año}${mes}${dia}`;
  const horaFormato = `${hora}${minuto}`;
  const tituloOriginal = document.title;
  document.title = `Colección de Libros Alcácer ${fecha} ${horaFormato}`;
  
  window.print();
  
  // Restaurar título original después de un pequeño delay
  setTimeout(() => {
    document.title = tituloOriginal;
  }, 100);
});

let __currentLibroId = null;
let __currentItems = [];
let __sortColumn = null;
let __sortDirection = 'asc';

async function verLibro(id){
  const dlg = $('#dlg');
  const f = $('#frmLibro');
  
  try {
    // Mostrar diálogo con indicador de carga
    f.reset();
    $('#dlgTitle').textContent = 'Cargando...';
    // Mostrar mensaje en el campo de título
    const tituloField = f.querySelector('textarea[name="titulo"]');
    if (tituloField) tituloField.value = 'Cargando información...';
    // Limpiar campos de préstamo y devolución
    const prestadoA = $('#prestadoA');
    const confirmarDevolucion = $('#confirmarDevolucion');
    if (prestadoA) prestadoA.value = '';
    if (confirmarDevolucion) confirmarDevolucion.value = '';
    
    // Limpiar portada y resumen anteriores
    limpiarPortadaYResumen();
    
    // Deshabilitar todos los elementos del formulario
    deshabilitarFormulario(true);
    
    dlg.showModal();
    document.body.style.cursor = 'wait';
    
    // Guardar ID del libro actual
    __currentLibroId = id;
    
    // Obtener datos del libro
    const data = await api('get_libro', { id });
    
    // Actualizar título
    $('#dlgTitle').textContent = 'Información del Libro';
    
    // Llenar campos con la información del libro
    for (const [k,v] of Object.entries(data)){
      if (k === 'estado') continue; // Saltear estado, lo manejamos aparte
      const el = f.querySelector(`[name="${k}"]`);
      if (el) el.value = v==null? '' : v;
    }
    
    // Mostrar estado con badge de color
    const estadoDisplay = $('#estadoDisplay');
    if (estadoDisplay) {
      const estado = data.estado || data.estadoprestado || data['estado prestado'] || '';
      const estadoNorm = String(estado).toLowerCase().trim();
      
      let estadoClass = '';
      if (estadoNorm === 'disponible') {
        estadoClass = 'estado-disponible';
      } else if (estado && estadoNorm !== 'disponible') {
        estadoClass = 'estado-prestado';
      }
      
      estadoDisplay.innerHTML = estado ? `<span class="estado-badge ${estadoClass}">${esc(estado)}</span>` : '';
    }
    
    // Mostrar nombre de la persona si ya está prestado
    if (data.prestadoa && prestadoA) {
      prestadoA.value = data.prestadoa;
    }
    
    // Mostrar portada del libro
    mostrarPortada(data.urldelaimagen || data.urldela || data.imagen || '');
    
    // Mostrar resumen del libro
    mostrarResumen(data.resumen || data.descripcion || data.sinopsis || '');
    
    // Habilitar todos los elementos del formulario
    deshabilitarFormulario(false);
    
  } catch(err){ 
    dlg.close();
    alert(err.message); 
  } finally {
    document.body.style.cursor = 'default';
  }
}

function limpiarPortadaYResumen(){
  // Limpiar portada (sin mostrar mensaje durante la carga)
  const portadaContainer = $('#portadaLibro');
  if (portadaContainer) {
    portadaContainer.innerHTML = '';
    portadaContainer.className = 'portada-placeholder';
  }
  
  // Limpiar resumen (sin mostrar mensaje durante la carga)
  const resumenContainer = $('#resumenLibro');
  if (resumenContainer) {
    resumenContainer.textContent = '';
    resumenContainer.classList.add('sin-contenido');
  }
  
  // Limpiar estado
  const estadoDisplay = $('#estadoDisplay');
  if (estadoDisplay) {
    estadoDisplay.innerHTML = '';
  }
}

function deshabilitarFormulario(deshabilitar){
  const f = $('#frmLibro');
  if (!f) return;
  
  // Deshabilitar/habilitar todos los inputs y textareas
  const inputs = f.querySelectorAll('input:not([readonly]), textarea:not([readonly])');
  inputs.forEach(input => {
    input.disabled = deshabilitar;
  });
  
  // Deshabilitar/habilitar todos los botones
  const botones = f.querySelectorAll('button');
  botones.forEach(btn => {
    btn.disabled = deshabilitar;
  });
}

function mostrarResumen(texto){
  const resumenContainer = $('#resumenLibro');
  if (!resumenContainer) return;
  
  if (!texto || texto.trim() === '') {
    resumenContainer.textContent = 'Sin resumen';
    resumenContainer.classList.add('sin-contenido');
  } else {
    resumenContainer.textContent = texto.trim();
    resumenContainer.classList.remove('sin-contenido');
  }
}

function mostrarPortada(url){
  const portadaContainer = $('#portadaLibro');
  if (!portadaContainer) return;
  
  // Limpiar contenido anterior
  portadaContainer.innerHTML = '';
  portadaContainer.className = 'portada-placeholder';
  
  if (!url || url.trim() === '') {
    // Sin URL, mostrar texto
    portadaContainer.textContent = 'Sin portada';
    return;
  }
  
  // Crear imagen
  const img = document.createElement('img');
  img.src = url.trim();
  img.alt = 'Portada del libro';
  
  // Manejar error de carga
  img.onerror = function(){
    portadaContainer.innerHTML = '';
    portadaContainer.textContent = 'Sin portada';
  };
  
  // Manejar carga exitosa
  img.onload = function(){
    portadaContainer.innerHTML = '';
    portadaContainer.className = '';
    portadaContainer.appendChild(img);
  };
}

function actualizarFilaEnTabla(libroId, data){
  // Buscar la fila en la tabla que corresponde al libro
  const tabla = $('#tabla');
  if (!tabla) return;
  
  const filas = tabla.querySelectorAll('tbody tr');
  filas.forEach(fila => {
    const btnVer = fila.querySelector('button.view');
    if (btnVer && btnVer.dataset.id === libroId) {
      // Actualizar las celdas de la fila
      const celdas = fila.querySelectorAll('td');
      if (celdas.length >= 4) {
        // Actualizar Estado (columna 4, índice 3)
        celdas[3].textContent = data.estado || data.estadoprestado || data['estado prestado'] || '';
      }
    }
  });
}

async function registrarPrestamo(){
  const prestadoA = $('#prestadoA');
  const nombrePersona = prestadoA?.value.trim();
  
  if (!nombrePersona) {
    alert('Por favor ingresa el nombre de la persona');
    return;
  }
  
  if (!__currentLibroId) {
    alert('Error: No se ha seleccionado ningún libro');
    return;
  }
  
  const btnRegistrar = $('#btnRegistrarPrestamo');
  const f = $('#frmLibro');
  
  try {
    // Deshabilitar botón y cambiar cursor
    if (btnRegistrar) btnRegistrar.disabled = true;
    document.body.style.cursor = 'wait';
    
    // Registrar préstamo en el backend
    await api('registrar_prestamo', { 
      id: __currentLibroId, 
      prestadoa: nombrePersona 
    });
    
    alert('Préstamo registrado correctamente');
    
    // Recargar información del libro para actualizar el estado
    const data = await api('get_libro', { id: __currentLibroId });
    
    // Actualizar todos los campos del diálogo con la información actualizada
    for (const [k,v] of Object.entries(data)){
      const el = f.querySelector(`[name="${k}"]`);
      if (el) el.value = v==null? '' : v;
    }
    
    // Actualizar campo de prestado a
    if (data.prestadoa && prestadoA) {
      prestadoA.value = data.prestadoa;
    }
    
    // Actualizar la fila en la tabla
    actualizarFilaEnTabla(__currentLibroId, data);
    
  } catch(err) {
    alert('Error al registrar préstamo: ' + err.message);
  } finally {
    if (btnRegistrar) btnRegistrar.disabled = false;
    document.body.style.cursor = 'default';
  }
}

async function registrarDevolucion(){
  const confirmarInput = $('#confirmarDevolucion');
  const confirmacion = confirmarInput?.value.trim().toUpperCase();
  
  if (confirmacion !== 'DEVOLVER') {
    alert('Por favor escribe "DEVOLVER" para confirmar la devolución');
    return;
  }
  
  if (!__currentLibroId) {
    alert('Error: No se ha seleccionado ningún libro');
    return;
  }
  
  const btnDevolucion = $('#btnRegistrarDevolucion');
  const f = $('#frmLibro');
  const prestadoA = $('#prestadoA');
  
  try {
    // Deshabilitar botón y cambiar cursor
    if (btnDevolucion) btnDevolucion.disabled = true;
    document.body.style.cursor = 'wait';
    
    // Registrar devolución en el backend
    await api('registrar_devolucion', { 
      id: __currentLibroId
    });
    
    alert('Devolución registrada correctamente');
    
    // Recargar información del libro para actualizar el estado
    const data = await api('get_libro', { id: __currentLibroId });
    
    // Actualizar todos los campos del diálogo con la información actualizada
    for (const [k,v] of Object.entries(data)){
      const el = f.querySelector(`[name="${k}"]`);
      if (el) el.value = v==null? '' : v;
    }
    
    // Limpiar campos de préstamo y devolución
    if (prestadoA) prestadoA.value = data.prestadoa || '';
    if (confirmarInput) confirmarInput.value = '';
    
    // Actualizar la fila en la tabla
    actualizarFilaEnTabla(__currentLibroId, data);
    
  } catch(err) {
    alert('Error al registrar devolución: ' + err.message);
  } finally {
    if (btnDevolucion) btnDevolucion.disabled = false;
    document.body.style.cursor = 'default';
  }
}

window.addEventListener('load', async ()=>{
  // Deshabilitar todos los controles al inicio
  const q = document.getElementById('q');
  const selCat = document.getElementById('selCategoria');
  const selCaja = document.getElementById('selCaja');
  const selEst = document.getElementById('selEstado');
  const btnBuscar = document.getElementById('btnBuscar');
  const btnReset = document.getElementById('btnReset');
  const btnPrint = document.getElementById('btnPrint');
  
  if (q) q.disabled = true;
  if (selCat) selCat.disabled = true;
  if (selCaja) selCaja.disabled = true;
  if (selEst) selEst.disabled = true;
  if (btnBuscar) btnBuscar.disabled = true;
  if (btnReset) btnReset.disabled = true;
  if (btnPrint) btnPrint.disabled = true;
  document.body.style.cursor = 'wait';
  
  // Cargar catálogos
  await cargarCatalogos();
  
  // Habilitar controles después de cargar
  if (q) q.disabled = false;
  if (selCat) selCat.disabled = false;
  if (selCaja) selCaja.disabled = false;
  if (selEst) selEst.disabled = false;
  if (btnBuscar) btnBuscar.disabled = false;
  if (btnReset) btnReset.disabled = false;
  if (btnPrint) btnPrint.disabled = false;
  document.body.style.cursor = 'default';
  
  // Registrar listeners para filtrado cruzado
  
  if (selCat) {
    selCat.addEventListener('change', ()=> {
      setTimeout(()=> actualizarFiltrosCruzados('cat'), 0);
    });
  }
  if (selCaja) {
    selCaja.addEventListener('change', ()=> {
      setTimeout(()=> actualizarFiltrosCruzados('caja'), 0);
    });
  }
  if (selEst) {
    selEst.addEventListener('change', ()=> {
      setTimeout(()=> actualizarFiltrosCruzados('estado'), 0);
    });
  }
  
  // Botón Limpiar: resetear todos los filtros
  if (btnReset) {
    btnReset.addEventListener('click', async ()=> {
      // Bloquear todos los elementos inmediatamente
      if (q) q.disabled = true;
      if (selCat) selCat.disabled = true;
      if (selCaja) selCaja.disabled = true;
      if (selEst) selEst.disabled = true;
      if (btnBuscar) btnBuscar.disabled = true;
      if (btnReset) btnReset.disabled = true;
      if (btnPrint) btnPrint.disabled = true;
      document.body.style.cursor = 'wait';
      
      try {
        if (q) q.value = '';
        if (selCat) selCat.value = '';
        if (selCaja) selCaja.value = '';
        if (selEst) selEst.value = '';
        
        // Limpiar inmediatamente estadísticas y filtros aplicados
        const statTotal = $('#statTotal');
        const statDisponibles = $('#statDisponibles');
        const statPrestados = $('#statPrestados');
        const filtrosDiv = $('#filtrosAplicados');
        const labelTotal = document.querySelector('.stat-label');
        
        if (statTotal) statTotal.textContent = '0';
        if (statDisponibles) statDisponibles.textContent = '0';
        if (statPrestados) statPrestados.textContent = '0';
        if (filtrosDiv) filtrosDiv.textContent = '';
        if (labelTotal) labelTotal.textContent = 'Total de libros:';
        
        // Recargar catálogos completos
        await cargarCatalogos();
        // Cargar todos los libros sin filtros (como al inicio)
        await cargarLibros();
      } finally {
        // Desbloquear todos los elementos
        if (q) q.disabled = false;
        if (selCat) selCat.disabled = false;
        if (selCaja) selCaja.disabled = false;
        if (selEst) selEst.disabled = false;
        if (btnBuscar) btnBuscar.disabled = false;
        if (btnReset) btnReset.disabled = false;
        if (btnPrint) btnPrint.disabled = false;
        document.body.style.cursor = 'default';
      }
    });
  }
  
  // Botón Registrar Préstamo
  const btnRegistrarPrestamo = $('#btnRegistrarPrestamo');
  if (btnRegistrarPrestamo) {
    btnRegistrarPrestamo.addEventListener('click', registrarPrestamo);
  }
  
  // Botón Registrar Devolución
  const btnRegistrarDevolucion = $('#btnRegistrarDevolucion');
  if (btnRegistrarDevolucion) {
    btnRegistrarDevolucion.addEventListener('click', registrarDevolucion);
  }
  
  // Limpiar valores iniciales
  if (q) q.value = '';
  if (selCat) selCat.value = '';
  if (selCaja) selCaja.value = '';
  if (selEst) selEst.value = '';
  
  // Cargar todos los libros al iniciar
  await cargarLibros();
});
