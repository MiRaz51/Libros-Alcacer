// Configurar la URL del WebApp de Apps Script aquí
const API_URL = 'https://script.google.com/macros/s/AKfycbzNVc-5NU3DkeClA9Y8M_pVRYJd3s2gpfVFgQ1OjWSH3BHL6ikvNL7Y4UBQnr8TQowx8Q/exec';

async function api(action, payload = {}, timeout = 30000) {
  const params = new URLSearchParams({ action, ...payload });
  const url = `${API_URL}?${params.toString()}`;
  
  // Crear promesa con timeout
  const fetchPromise = fetch(url, { method: 'GET', cache: 'no-store' });
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout: La operación tardó más de ${timeout/1000}s`)), timeout)
  );
  
  try {
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error en la API: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (err) {
    console.error(`[API] Error en ${action}:`, err);
    throw err;
  }
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

async function actualizarSoloEstados(){
  const selEstado = document.getElementById('selEstado');
  if (!selEstado) return;
  
  // Guardar el valor actual del filtro de estado
  const estadoActual = selEstado.value.trim();
  
  // Verificar si hay otros filtros activos (categoría o caja)
  const selCategoria = document.getElementById('selCategoria');
  const selCaja = document.getElementById('selCaja');
  const cat = selCategoria?.value.trim() || '';
  const caja = selCaja?.value.trim() || '';
  const hayOtrosFiltros = cat || caja;
  
  try {
    let estados = [];
    
    if (hayOtrosFiltros) {
      // Si hay filtros de categoría o caja, obtener estados filtrados
      const data = await api('catalogos_filtrados', { cat, caja, estado: '' });
      estados = data.estados || [];
    } else {
      // Si no hay filtros, obtener todos los estados
      const data = await api('catalogos');
      estados = data.estados || [];
    }
    
    // Actualizar solo el select de estados
    selEstado.innerHTML = `<option value="">Todos los estados</option>` + 
      estados.map(v=>`<option value="${v}">${v}</option>`).join('');
    
    // Restaurar el valor si sigue disponible
    if (estadoActual && estados.includes(estadoActual)) {
      selEstado.value = estadoActual;
    }
  } catch(err){
    console.error('Error actualizando estados:', err);
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
    tabla.innerHTML = `<div class="loading-message">
      <div class="loading-message-title">⏳ Cargando libros...</div>
      <div class="loading-message-subtitle">Esto puede tardar unos segundos</div>
    </div>`;
    
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
  if (!el) return;
  
  const rows = items.map(x=> {
    const estado = x.estado || x.estadoprestado || x['estado prestado'] || '';
    const estadoNorm = String(estado).toLowerCase().trim();
    
    let estadoClass = '';
    if (estadoNorm === 'disponible') {
      estadoClass = 'estado-disponible';
    } else if (estado && estadoNorm !== 'disponible') {
      estadoClass = 'estado-prestado';
    }
    
    return `<tr>
      <td>${esc(x.titulo)}</td>
      <td>${esc(x.categoria)}</td>
      <td>${esc(x.caja)}</td>
      <td><span class="estado-badge ${estadoClass}">${esc(estado)}</span></td>
      <td class="actions no-print">
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
      <th class="no-print"></th>
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
  
  // Añadir event listeners a los botones
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
    // Listas con viñetas - PRIMERO detectar bloques de texto + lista (con o sin strong)
    .replace(/^(.+:)\n- /gm, '<p class="list-intro">$1</p>\n- ')
    .replace(/^(<strong>.+<\/strong>)\n\d+\. /gm, '<p class="list-intro">$1</p>\n1. ')
    // Listas con viñetas
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Listas numeradas
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Líneas horizontales
    .replace(/^---$/gm, '<hr>')
    // Párrafos (líneas no vacías que no son otros elementos)
    .split('\n\n')
    .map(block => {
      if (block.startsWith('<h') || block.startsWith('<li') || block.startsWith('<hr') || block.startsWith('<p')) {
        return block;
      }
      if (block.trim() === '') return '';
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    })
    .join('\n');
  
  // Envolver listas consecutivas en ul/ol (permitiendo espacios en blanco entre <li>)
  html = html.replace(/(?:<li>.*?<\/li>\s*)+/gs, match => {
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
    // Guardar ID del libro actual
    __currentLibroId = id;
    
    // Buscar datos del libro en __currentItems (cache local)
    const cachedData = __currentItems.find(item => item.id === id);
    
    // Si tenemos datos en cache, mostrarlos inmediatamente
    if (cachedData) {
      // Usando datos en cache para carga rápida
      f.reset();
      $('#dlgTitle').textContent = '⏳ Cargando información...';
      
      // Mostrar datos en cache inmediatamente
      actualizarCamposFormulario(cachedData);
      actualizarBadgeEstado(cachedData);
      
      // Mostrar mensaje de carga en portada (mismo formato que préstamo/devolución)
      mostrarMensajeCarga('Cargando información del libro', 'Esto puede tardar unos segundos');
      
      // Limpiar resumen
      const resumenContainer = $('#resumenLibro');
      if (resumenContainer) {
        resumenContainer.innerHTML = '';
        resumenContainer.textContent = '';
      }
      
      // IMPORTANTE: Mantener formulario deshabilitado hasta que se carguen datos del backend
      deshabilitarFormulario(true);
      
      // Mostrar diálogo inmediatamente
      dlg.showModal();
    } else {
      // Sin cache, mostrar indicador de carga
      // Sin cache, cargando desde backend
      deshabilitarFormulario(true);
      f.reset();
      $('#dlgTitle').textContent = '⏳ Cargando información...';
      const tituloField = f.querySelector('textarea[name="titulo"]');
      if (tituloField) tituloField.value = 'Cargando...';
      
      // Mostrar mensaje de carga visual
      mostrarMensajeCarga('Cargando información del libro', 'Esto puede tardar unos segundos');
      
      dlg.showModal();
    }
    
    document.body.style.cursor = 'wait';
    
    // Obtener datos completos del backend (siempre, para tener datos actualizados)
    const data = await api('get_libro', { id });
    
    // Actualizar título
    $('#dlgTitle').textContent = 'Información del Libro';
    
    // Llenar campos con la información del libro
    actualizarCamposFormulario(data);
    
    // Mostrar estado con badge de color
    actualizarBadgeEstado(data);
    
    // Mostrar portada del libro
    mostrarPortada(data.urldelaimagen || data.urldela || data.imagen || '');
    
    // Mostrar resumen del libro
    mostrarResumen(data.resumen || data.descripcion || data.sinopsis || '');
    
    // Habilitar todos los elementos del formulario
    deshabilitarFormulario(false);
    
    // IMPORTANTE: Aplicar lógica de préstamo/devolución DESPUÉS de habilitar el formulario
    // para que los campos específicos se deshabiliten según el estado del libro
    actualizarCamposSegunEstado(data);
    
  } catch(err){ 
    dlg.close();
    alert(err.message); 
  } finally {
    document.body.style.cursor = 'default';
  }
}

// Función para mostrar mensaje de carga en el diálogo
function mostrarMensajeCarga(mensaje, submensaje = '') {
  const portadaContainer = $('#portadaLibro');
  const resumenContainer = $('#resumenLibro');
  const mensajeMovilContainer = $('#mensajeCargaMovil');
  const dlg = $('#dlg');
  
  const mensajeHTML = `
    <div class="loading-indicator">
      <div class="loading-indicator-icon">⏳</div>
      <div class="loading-indicator-text">${mensaje}</div>
      ${submensaje ? `<div class="loading-indicator-subtext">${submensaje}</div>` : ''}
    </div>
  `;
  
  // Mostrar mensaje en la portada (visible en desktop)
  if (portadaContainer) {
    portadaContainer.innerHTML = mensajeHTML;
    portadaContainer.className = '';
  }
  
  // Mostrar mensaje en contenedor móvil (visible en móvil)
  if (mensajeMovilContainer) {
    mensajeMovilContainer.innerHTML = mensajeHTML;
    
    // Hacer scroll al inicio del diálogo para que el mensaje sea visible en móvil
    // Usar setTimeout para asegurar que el DOM se actualice antes del scroll
    setTimeout(() => {
      if (dlg && mensajeMovilContainer) {
        // Scroll suave al inicio del diálogo
        const form = dlg.querySelector('form');
        if (form) {
          form.scrollTop = 0;
        }
        // También intentar scroll en el diálogo mismo
        dlg.scrollTop = 0;
      }
    }, 10);
  }
  
  // Limpiar resumen para evitar mensaje duplicado
  if (resumenContainer) {
    resumenContainer.innerHTML = '';
    resumenContainer.textContent = '';
    // Mantener siempre la clase base para conservar el estilo del contenedor
    resumenContainer.classList.add('resumen-texto');
    resumenContainer.classList.remove('sin-contenido');
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
  
  // Limpiar cualquier contenido HTML previo (incluyendo mensajes de carga)
  resumenContainer.innerHTML = '';
  // Asegurar que el contenedor conserva su clase base
  resumenContainer.classList.add('resumen-texto');
  resumenContainer.classList.remove('sin-contenido');
  
  if (!texto || texto.trim() === '') {
    // Agregar clase sin-contenido para centrar el mensaje
    resumenContainer.classList.add('sin-contenido');
    resumenContainer.textContent = 'Sin resumen';
  } else {
    resumenContainer.textContent = texto.trim();
  }
}

function mostrarPortada(url){
  const portadaContainer = $('#portadaLibro');
  const mensajeMovilContainer = $('#mensajeCargaMovil');
  if (!portadaContainer) return;
  
  // Limpiar contenido anterior
  portadaContainer.innerHTML = '';
  portadaContainer.className = 'portada-placeholder';
  
  // Limpiar mensaje móvil
  if (mensajeMovilContainer) {
    mensajeMovilContainer.innerHTML = '';
  }
  
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

// Función auxiliar para obtener información del estado del libro
function obtenerInfoEstado(data) {
  const estado = data.estado || data.estadoprestado || data['estado prestado'] || '';
  const estadoNorm = String(estado).toLowerCase().trim();
  const estaDisponible = estadoNorm === 'disponible';
  const estaPrestado = !estaDisponible && estado && estadoNorm !== '';
  
  return { estado, estadoNorm, estaDisponible, estaPrestado };
}

// Función auxiliar para obtener la clase CSS del badge según el estado
function obtenerClaseBadge(estadoNorm, estado) {
  if (estadoNorm === 'disponible') {
    return 'estado-disponible';
  } else if (estado && estadoNorm !== 'disponible') {
    return 'estado-prestado';
  }
  return '';
}

// Función auxiliar para actualizar el badge de estado en el diálogo
function actualizarBadgeEstado(data) {
  const estadoDisplay = $('#estadoDisplay');
  if (!estadoDisplay) return;
  
  const { estado, estadoNorm } = obtenerInfoEstado(data);
  const estadoClass = obtenerClaseBadge(estadoNorm, estado);
  
  estadoDisplay.innerHTML = estado ? `<span class="estado-badge ${estadoClass}">${esc(estado)}</span>` : '';
}

// Función auxiliar para actualizar campos del formulario según el estado del libro
function actualizarCamposSegunEstado(data) {
  const prestadoA = $('#prestadoA');
  const btnRegistrarPrestamo = $('#btnRegistrarPrestamo');
  const btnRegistrarDevolucion = $('#btnRegistrarDevolucion');
  const confirmarInput = $('#confirmarDevolucion');
  
  // Determinar si está prestado basándose en el estado
  const { estaPrestado } = obtenerInfoEstado(data);
  
  if (estaPrestado) {
    // Libro prestado: deshabilitar préstamo, habilitar devolución
    if (prestadoA) {
      prestadoA.value = '';
      prestadoA.disabled = true;
      prestadoA.placeholder = 'Libro ya prestado';
    }
    if (btnRegistrarPrestamo) {
      btnRegistrarPrestamo.disabled = true;
    }
    if (confirmarInput) {
      confirmarInput.disabled = false;
      confirmarInput.value = '';
      confirmarInput.placeholder = 'Escribe "DEVOLVER" para confirmar';
    }
    if (btnRegistrarDevolucion) {
      btnRegistrarDevolucion.disabled = false;
    }
  } else {
    // Libro disponible: habilitar préstamo, deshabilitar devolución
    if (prestadoA) {
      prestadoA.value = '';
      prestadoA.disabled = false;
      prestadoA.placeholder = 'Nombre de la persona';
    }
    if (btnRegistrarPrestamo) {
      btnRegistrarPrestamo.disabled = false;
    }
    if (confirmarInput) {
      confirmarInput.disabled = true;
      confirmarInput.value = '';
      confirmarInput.placeholder = 'Libro no prestado';
    }
    if (btnRegistrarDevolucion) {
      btnRegistrarDevolucion.disabled = true;
    }
  }
}

// Función auxiliar para actualizar todos los campos del formulario con los datos del libro
function actualizarCamposFormulario(data) {
  const f = $('#frmLibro');
  if (!f) return;
  
  for (const [k, v] of Object.entries(data)) {
    if (k === 'estado') continue; // Saltear estado, lo manejamos aparte
    const el = f.querySelector(`[name="${k}"]`);
    if (el) el.value = v == null ? '' : v;
  }
}

// Función auxiliar para realizar todas las actualizaciones después de préstamo/devolución
async function actualizarDespuesDeOperacion(data, opts = {}) {
  const { deferVisualClear = false } = opts;
  // Actualizar UI de forma síncrona (no requiere await)
  actualizarCamposFormulario(data);
  actualizarBadgeEstado(data);
  actualizarCamposSegunEstado(data);
  actualizarFilaEnTabla(__currentLibroId, data);
  actualizarEstadisticas(__currentItems);
  
  // Actualizar portada y resumen (limpia mensajes de carga)
  if (!deferVisualClear) {
    mostrarPortada(data.urldelaimagen || data.urldela || data.imagen || '');
    mostrarResumen(data.resumen || data.descripcion || data.sinopsis || '');
  }
  
  // Actualizar filtro de estado (esperar para que se actualice correctamente)
  await actualizarSoloEstados();
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
        // Actualizar Estado (columna 4, índice 3) con badge y color
        const { estado, estadoNorm } = obtenerInfoEstado(data);
        const estadoClass = obtenerClaseBadge(estadoNorm, estado);
        
        celdas[3].innerHTML = estado ? `<span class="estado-badge ${estadoClass}">${esc(estado)}</span>` : '';
      }
    }
  });
  
  // Actualizar también el objeto en __currentItems para que las estadísticas se calculen correctamente
  const index = __currentItems.findIndex(item => item.id === libroId);
  if (index !== -1) {
    // Actualizar el estado del libro en el array
    __currentItems[index] = { ...__currentItems[index], ...data };
  }
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
  
  // Verificar que el libro esté disponible antes de permitir el préstamo
  const estadoDisplay = $('#estadoDisplay');
  if (estadoDisplay) {
    const estadoBadge = estadoDisplay.querySelector('.estado-badge');
    if (estadoBadge) {
      const estadoTexto = estadoBadge.textContent.toLowerCase().trim();
      if (estadoTexto !== 'disponible') {
        alert('Este libro ya está prestado. Primero debe registrarse la devolución.');
        return;
      }
    }
  }
  
  const btnRegistrar = $('#btnRegistrarPrestamo');
  const btnCerrar = document.querySelector('.btn-cerrar-footer');
  
  try {
    // Deshabilitar botón, botón cerrar y cambiar cursor
    if (btnRegistrar) btnRegistrar.disabled = true;
    if (btnCerrar) btnCerrar.disabled = true;
    document.body.style.cursor = 'wait';
    
    // Mostrar mensaje de carga
    mostrarMensajeCarga('Registrando préstamo...', 'Por favor espera');
    
    // Registrar préstamo en el backend
    const result = await api('registrar_prestamo', { 
      id: __currentLibroId, 
      prestadoa: nombrePersona 
    });
    
    alert('Préstamo registrado correctamente');
    
    // Mostrar mensaje de actualización (mantener visible hasta el final)
    mostrarMensajeCarga('Actualizando información...', 'Casi listo');
    
    // Si el backend devuelve los datos actualizados, usarlos
    // Si no, hacer una llamada adicional
    let data;
    if (result && result.libro) {
      data = result.libro;
    } else {
      data = await api('get_libro', { id: __currentLibroId });
    }
    
    // Actualizar todo el diálogo, tabla, estadísticas y filtros (sin limpiar aún indicadores visuales)
    await actualizarDespuesDeOperacion(data, { deferVisualClear: true });
    
    // Ahora sí limpiar los mensajes visuales y mostrar portada/resumen finales
    mostrarPortada(data.urldelaimagen || data.urldela || data.imagen || '');
    mostrarResumen(data.resumen || data.descripcion || data.sinopsis || '');
    
    // Rehabilitar botón cerrar exactamente al finalizar todas las actualizaciones
    if (btnCerrar) btnCerrar.disabled = false;
    
  } catch(err) {
    alert('Error al registrar préstamo: ' + err.message);
    // En caso de error, habilitar el botón para permitir reintentar
    if (btnRegistrar) btnRegistrar.disabled = false;
    if (btnCerrar) btnCerrar.disabled = false;
  } finally {
    // Habilitar botón cerrar y restaurar cursor
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
  const btnCerrar = document.querySelector('.btn-cerrar-footer');
  
  try {
    // Deshabilitar botón, botón cerrar y cambiar cursor
    if (btnDevolucion) btnDevolucion.disabled = true;
    if (btnCerrar) btnCerrar.disabled = true;
    document.body.style.cursor = 'wait';
    
    // Mostrar mensaje de carga
    mostrarMensajeCarga('Registrando devolución...', 'Por favor espera');
    
    // Registrar devolución en el backend
    const result = await api('registrar_devolucion', { 
      id: __currentLibroId
    });
    
    alert('Devolución registrada correctamente');
    
    // Mostrar mensaje de actualización (mantener hasta el final)
    mostrarMensajeCarga('Actualizando información...', 'Casi listo');
    
    // Si el backend devuelve los datos actualizados, usarlos
    // Si no, hacer una llamada adicional
    let data;
    if (result && result.libro) {
      data = result.libro;
    } else {
      data = await api('get_libro', { id: __currentLibroId });
    }
    
    // Actualizar todo el diálogo, tabla, estadísticas y filtros (sin limpiar aún indicadores visuales)
    await actualizarDespuesDeOperacion(data, { deferVisualClear: true });
    
    // Limpiar indicadores y mostrar portada/resumen finales
    mostrarPortada(data.urldelaimagen || data.urldela || data.imagen || '');
    mostrarResumen(data.resumen || data.descripcion || data.sinopsis || '');
    
    // Rehabilitar botón cerrar al final
    if (btnCerrar) btnCerrar.disabled = false;
    
  } catch(err) {
    alert('Error al registrar devolución: ' + err.message);
    // En caso de error, habilitar el botón para permitir reintentar
    if (btnDevolucion) btnDevolucion.disabled = false;
  } finally {
    // Restaurar cursor
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
  
  // Botones cerrar diálogos
  const btnCerrarDialog = $('#btnCerrarDialog');
  if (btnCerrarDialog) {
    btnCerrarDialog.addEventListener('click', () => {
      const dlg = $('#dlg');
      if (dlg) dlg.close();
    });
  }
  
  const btnCerrarHelp = $('#btnCerrarHelp');
  if (btnCerrarHelp) {
    btnCerrarHelp.addEventListener('click', () => {
      const dlgHelp = $('#dlgHelp');
      if (dlgHelp) dlgHelp.close();
    });
  }
  
  const btnCerrarLicense = $('#btnCerrarLicense');
  if (btnCerrarLicense) {
    btnCerrarLicense.addEventListener('click', () => {
      const dlgLicense = $('#dlgLicense');
      if (dlgLicense) dlgLicense.close();
    });
  }
  
  const btnCerrarPrivacy = $('#btnCerrarPrivacy');
  if (btnCerrarPrivacy) {
    btnCerrarPrivacy.addEventListener('click', () => {
      const dlgPrivacy = $('#dlgPrivacy');
      if (dlgPrivacy) dlgPrivacy.close();
    });
  }
  
  // Limpiar valores iniciales
  if (q) q.value = '';
  if (selCat) selCat.value = '';
  if (selCaja) selCaja.value = '';
  if (selEst) selEst.value = '';
  
  // Cargar todos los libros al iniciar
  await cargarLibros();
  
  // Detectar scroll horizontal en tabla para mostrar indicador
  const card = $('.card');
  if (card) {
    const checkScroll = () => {
      const hasScroll = card.scrollWidth > card.clientWidth;
      if (hasScroll) {
        card.classList.add('has-scroll');
        card.addEventListener('scroll', () => {
          const isAtEnd = card.scrollLeft >= card.scrollWidth - card.clientWidth - 5;
          if (isAtEnd) {
            card.classList.remove('has-scroll');
          } else {
            card.classList.add('has-scroll');
          }
        });
      } else {
        card.classList.remove('has-scroll');
      }
    };
    
    // Verificar al cargar y al redimensionar
    checkScroll();
    window.addEventListener('resize', checkScroll);
    
    // Verificar después de renderizar tabla
    const observer = new MutationObserver(checkScroll);
    observer.observe(card, { childList: true, subtree: true });
  }
});
