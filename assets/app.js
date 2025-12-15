// ========== CONFIGURACIÓN POCKETBASE ==========
const POCKETBASE_URL = 'https://pocketbase-production-aec1.up.railway.app/';
const COLLECTION_NAME = 'Libros';
const pb = new PocketBase(POCKETBASE_URL);

// Deshabilitar auto-cancelación para evitar errores en peticiones rápidas
pb.autoCancellation(false);

// ========== ESTADO GLOBAL ==========
let __allBooks = []; // Caché de TODOS los libros (versión ligera)
let __fuse = null;   // Instancia de Fuse.js
let __currentItems = [];
let __currentLibroId = null;
let __sortColumn = 'titulo';
let __sortDirection = 'asc';
let __crossBusy = false;
let __crossTimer = null;
let __favoritos = new Set(); // IDs de libros favoritos
let __filtrandoFavoritos = false; // Estado del filtro de favoritos

// ========== CAPA DE DATOS (MODELO) ==========

/**
 * Descarga TODOS los libros de una vez (solo campos necesarios).
 * Esto permite búsqueda instantánea y difusa en el cliente.
 */
async function cargarTodosLosLibros() {
    try {
        // OPTIMIZACIÓN: 'fields' reduce el tamaño de descarga drásticamente
        const records = await pb.collection(COLLECTION_NAME).getFullList({
            sort: 'titulo',
            fields: 'id,titulo,categoria,caja,prestado'
        });

        // Mapeo ligero
        __allBooks = records.map(r => ({
            id: r.id,
            titulo: r.titulo || '',
            categoria: r.categoria || '',
            caja: r.caja || '',
            prestado: r.prestado || '',
            estado: r.prestado ? r.prestado : 'Disponible'
        }));

        // Inicializar Fuse.js para búsqueda difusa
        const options = {
            keys: ['titulo'],
            threshold: 0.4, // Tolerancia a errores (0.0 = exacto, 1.0 = coincide todo)
            ignoreLocation: true // Buscar en cualquier parte del string
        };
        __fuse = new Fuse(__allBooks, options);

        return __allBooks;
    } catch (error) {
        console.error('Error cargando libros:', error);
        throw error;
    }
}

/**
 * Filtra los libros en memoria usando Fuse.js (si hay texto) y filtros exactos.
 */
function filtrarLibrosLocalmente({ q = '', cat = '', caja = '', estado = '' } = {}) {
    let resultados = [];

    // 1. Filtrado por texto (Fuzzy o Exacto)
    if (q) {
        if (__fuse) {
            // Fuse devuelve { item, refIndex }
            resultados = __fuse.search(q).map(result => result.item);
        } else {
            // Fallback si Fuse no cargó (no debería pasar)
            const qLower = q.toLowerCase();
            resultados = __allBooks.filter(b => b.titulo.toLowerCase().includes(qLower));
        }
    } else {
        resultados = [...__allBooks]; // Copia de todos
    }

    // 2. Filtros de selectores (Exactos)
    if (cat) resultados = resultados.filter(b => b.categoria === cat);
    if (caja) resultados = resultados.filter(b => b.caja === caja);
    if (estado) resultados = resultados.filter(b => b.estado === estado);

    // 3. Filtro de favoritos (si está activo)
    if (__filtrandoFavoritos) {
        resultados = resultados.filter(b => __favoritos.has(b.id));
    }

    return resultados;
}

/**
 * Obtiene un libro específico por ID con todos sus detalles.
 */
async function obtenerLibroPorId(id) {
    try {
        const r = await pb.collection(COLLECTION_NAME).getOne(id);
        return {
            id: r.id,
            titulo: r.titulo || '',
            autor: r.autor || '',
            editorial: r.editorial || '',
            anio: r.anio || '',
            isbn: r.isbn || '',
            categoria: r.categoria || '',
            caja: r.caja || '',
            prestado: r.prestado || '',
            estado: r.prestado ? r.prestado : 'Disponible',
            notas: r.notas || '',
            urldelaimagen: r.urldelaimagen || '',
            resumen: r.resumen || '',
            created: r.created,
            updated: r.updated
        };
    } catch (error) {
        console.error('Error obteniendo libro:', error);
        throw error;
    }
}

/**
 * Obtiene listas únicas de categorías, cajas y estados desde la caché local.
 */
function obtenerCatalogosLocales({ cat = '', caja = '', estado = '' } = {}) {
    // Filtrar primero sobre todos los libros
    let filtrados = [...__allBooks];

    // Aplicar filtros parciales para "filtros cruzados"
    // (Si selecciono Categoría X, solo mostrar Cajas que tengan libros de Cat X)
    if (cat) filtrados = filtrados.filter(b => b.categoria === cat);
    if (caja) filtrados = filtrados.filter(b => b.caja === caja);
    if (estado) filtrados = filtrados.filter(b => b.estado === estado);

    const categoriasSet = new Set();
    const cajasSet = new Set();
    const estadosSet = new Set();

    filtrados.forEach(r => {
        if (r.categoria) categoriasSet.add(r.categoria);
        if (r.caja) cajasSet.add(r.caja);
        if (r.estado) estadosSet.add(r.estado);
    });

    return {
        categorias: Array.from(categoriasSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        cajas: ordenarCajasNumericamente(Array.from(cajasSet)),
        estados: Array.from(estadosSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    };
}

/**
 * Registra un préstamo actualizando el registro.
 */
async function registrarPrestamoDb(id, prestadoA) {
    if (!id || !prestadoA) throw new Error('Datos incompletos para préstamo');

    console.log(`Intentando registrar préstamo: ID=${id}, Colección=${COLLECTION_NAME}, Prestado=${prestadoA}`);

    try {
        const record = await pb.collection(COLLECTION_NAME).update(id, {
            prestado: prestadoA
        });
        return await obtenerLibroPorId(record.id);
    } catch (e) {
        console.error('Error en registrarPrestamoDb:', e);
        console.error('URL intentada:', pb.baseUrl);
        throw e;
    }
}

/**
 * Registra una devolución actualizando el registro.
 */
/**
 * Registra una devolución actualizando el registro.
 */
async function registrarDevolucionDb(id) {
    if (!id) throw new Error('ID requerido para devolución');

    const record = await pb.collection(COLLECTION_NAME).update(id, {
        prestado: ''
    });

    actualizarCacheLocal(record);
    return await obtenerLibroPorId(record.id);
}

// ========== GESTIÓN DE FAVORITOS ==========

/**
 * Carga los favoritos desde localStorage
 */
function cargarFavoritos() {
    try {
        const stored = localStorage.getItem('libros_favoritos');
        if (stored) {
            __favoritos = new Set(JSON.parse(stored));
        }
    } catch (e) {
        console.error('Error cargando favoritos:', e);
        __favoritos = new Set();
    }
}

/**
 * Guarda los favoritos en localStorage
 */
function guardarFavoritos() {
    try {
        localStorage.setItem('libros_favoritos', JSON.stringify([...__favoritos]));
    } catch (e) {
        console.error('Error guardando favoritos:', e);
    }
}

/**
 * Alterna el estado de favorito de un libro
 */
function toggleFavorito(libroId) {
    if (!libroId) return;

    if (__favoritos.has(libroId)) {
        __favoritos.delete(libroId);
    } else {
        __favoritos.add(libroId);
    }

    guardarFavoritos();
    actualizarBotonFavorito(libroId);
}

/**
 * Verifica si un libro es favorito
 */
function esFavorito(libroId) {
    return __favoritos.has(libroId);
}

/**
 * Actualiza el estado visual del botón de favoritos
 */
function actualizarBotonFavorito(libroId) {
    const btn = $('#btnFavorito');
    const icon = $('.favorito-icon');

    if (!btn || !icon) return;

    if (esFavorito(libroId)) {
        btn.classList.add('active');
        icon.textContent = '★';
        btn.title = 'Quitar de favoritos';
    } else {
        btn.classList.remove('active');
        icon.textContent = '☆';
        btn.title = 'Agregar a favoritos';
    }
}

function actualizarCacheLocal(record) {
    // Actualizar el libro en la lista global __allBooks para que los filtros sigan funcionando
    const idx = __allBooks.findIndex(b => b.id === record.id);
    if (idx !== -1) {
        __allBooks[idx].prestado = record.prestado || '';
        __allBooks[idx].estado = record.prestado ? record.prestado : 'Disponible';
        // Si hubiera cambio de caja/categoria también se actualizaría aquí
        if (__fuse) __fuse.setCollection(__allBooks); // Actualizar índice de búsqueda
    }
}


// ========== UTILIDADES ==========

function $(sel, root = document) { return root.querySelector(sel); }

function ordenarCajasNumericamente(cajas) {
    return [...cajas].sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a).localeCompare(String(b));
    });
}

function esc(v) {
    return (v == null ? '' : String(v))
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ========== LÓGICA DE INTERFAZ (CONTROLLER) ==========

// --- Inicialización ---

window.addEventListener('load', async () => {
    bloquearUI(true);
    try {
        setupEventListeners();
        setupScrollDetection();

        // 1. Cargar favoritos desde localStorage
        cargarFavoritos();

        // 2. Cargar TODOS los datos al inicio
        await cargarTodosLosLibros();

        // 3. Inicializar UI con los datos cargados
        cargarCatalogosUI();
        cargarLibrosUI(); // Ahora es síncrono/local

    } catch (e) {
        console.error("Error fatal iniciando app:", e);
        alert("Error iniciando la aplicación. Revisa la consola.");
    } finally {
        bloquearUI(false);
    }
});

function setupEventListeners() {
    // Búsqueda instantánea al escribir (debounce opcional, pero con Fuse local es muy rápido)
    $('#q')?.addEventListener('input', () => {
        // Pequeño debounce para no saturar en móviles muy lentos
        if (__crossTimer) clearTimeout(__crossTimer);
        __crossTimer = setTimeout(cargarLibrosUI, 300);
    });

    // Filtros (ahora son instantáneos)
    ['selCategoria', 'selCaja', 'selEstado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const origin = id === 'selCategoria' ? 'cat' : (id === 'selCaja' ? 'caja' : 'estado');
            el.addEventListener('change', () => {
                cargarLibrosUI();
                actualizarFiltrosCruzadosUI(origin);
            });
        }
    });


    // Botones de acción
    $('#btnFavoritos')?.addEventListener('click', toggleFiltroFavoritos);
    $('#btnReset')?.addEventListener('click', resetearFiltros);
    $('#btnPrint')?.addEventListener('click', imprimirPagina);
    $('#btnRegistrarPrestamo')?.addEventListener('click', uiRegistrarPrestamo);
    $('#btnRegistrarDevolucion')?.addEventListener('click', uiRegistrarDevolucion);

    // Navegación en diálogo
    $('#btnAnterior')?.addEventListener('click', navegarAnterior);
    $('#btnSiguiente')?.addEventListener('click', navegarSiguiente);

    // Botón de favoritos
    $('#btnFavorito')?.addEventListener('click', () => {
        if (__currentLibroId) {
            toggleFavorito(__currentLibroId);
        }
    });

    // Diálogos
    setupDialogListeners();
}

// --- Funciones Principales de UI ---

function cargarLibrosUI() {
    const params = obtenerParametrosFiltros();
    const tabla = $('#tabla');

    // Ya no bloqueamos UI porque es local e instantáneo
    // document.body.style.cursor = 'wait';

    try {
        const items = filtrarLibrosLocalmente(params);
        __currentItems = items;

        // Si hay búsqueda por texto, Fuse ya devuelve ordenado por relevancia.
        // Si NO hay búsqueda, ordenamos por título.
        if (!params.q) {
            ordenarItemsLocalmente('titulo', 'asc');
        } else {
            renderTabla(items); // Renderizar tal cual viene de Fuse (relevancia)
        }

    } catch (err) {
        tabla.innerHTML = `<div class="error-message">Error: ${err.message}</div>`;
    }
}

function cargarCatalogosUI() {
    try {
        const params = obtenerParametrosFiltros(); // Obtener selección actual
        const data = obtenerCatalogosLocales(); // Sin filtros = todos los valores posibles
        actualizarSelects(data, params); // Actualizar preservando selección
    } catch (err) {
        console.error('Error cargando catálogos iniciales:', err);
    }
}

function actualizarFiltrosCruzadosUI() {
    const params = obtenerParametrosFiltros();

    const data = {
        categorias: obtenerCatalogosLocales({ ...params, cat: '' }).categorias,
        cajas: obtenerCatalogosLocales({ ...params, caja: '' }).cajas,
        estados: obtenerCatalogosLocales({ ...params, estado: '' }).estados
    };

    actualizarSelects(data, params);
}

async function verLibroUI(id) {
    const dlg = $('#dlg');
    if (!dlg) return;

    __currentLibroId = id;
    const itemCache = __currentItems.find(i => i.id === id);

    // Estrategia: Mostrar cache primero (rápido), luego actualizar (seguro)
    if (itemCache) {
        renderDetalleLibro(itemCache);
        dlg.showModal();
        lockAppScroll();
        mostrarMensajeCarga('Verificando información...', 'Sincronizando con servidor');
    } else {
        mostrarMensajeCarga('Cargando libro...', 'Por favor espera');
        dlg.showModal();
        lockAppScroll();
    }

    try {
        deshabilitarFormulario(true);
        const dataFull = await obtenerLibroPorId(id);
        renderDetalleLibro(dataFull); // Re-render con datos frescos
        actualizarLogicaEstado(dataFull);
        actualizarBotonesNavegacion(); // Habilitar/deshabilitar según posición
        actualizarBotonFavorito(id); // Actualizar estado del botón de favoritos
    } catch (e) {
        alert("Error cargando detalles: " + e.message);
        dlg.close();
    } finally {
        deshabilitarFormulario(false);
        limpiarMensajeCarga();
    }
}

async function uiRegistrarPrestamo() {
    const persona = $('#prestadoA')?.value.trim();
    if (!persona) return alert('Ingresa el nombre de la persona.');
    if (!__currentLibroId) return;

    try {
        mostrarMensajeCarga('Registrando préstamo...', 'Guardando en base de datos');
        deshabilitarFormulario(true);

        const libroActualizado = await registrarPrestamoDb(__currentLibroId, persona);

        alert('Préstamo registrado con éxito.');
        actualizarEstadoLocal(libroActualizado);
        renderDetalleLibro(libroActualizado);
        actualizarLogicaEstado(libroActualizado);
        cargarCatalogosUI(); // Actualizar filtros con el nuevo nombre

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        deshabilitarFormulario(false);
        limpiarMensajeCarga();
    }
}

async function uiRegistrarDevolucion() {
    const confirmacion = $('#confirmarDevolucion')?.value.trim().toUpperCase();
    if (confirmacion !== 'DEVOLVER') return alert('Escribe "DEVOLVER" para confirmar.');
    if (!__currentLibroId) return;

    try {
        mostrarMensajeCarga('Registrando devolución...', 'Guardando cambios');
        deshabilitarFormulario(true);

        const libroActualizado = await registrarDevolucionDb(__currentLibroId);

        alert('Devolución registrada con éxito.');
        actualizarEstadoLocal(libroActualizado);
        renderDetalleLibro(libroActualizado);
        actualizarLogicaEstado(libroActualizado);
        cargarCatalogosUI(); // Actualizar filtros para quitar el nombre

    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        deshabilitarFormulario(false);
        limpiarMensajeCarga();
    }
}

function resetearFiltros() {
    $('#q').value = '';
    $('#selCategoria').value = '';
    $('#selCaja').value = '';
    $('#selEstado').value = '';
    __filtrandoFavoritos = false; // Desactivar filtro de favoritos
    actualizarEstadoBotonFavoritos(); // Actualizar UI del botón

    cargarCatalogosUI(); // Resetear catálogos
    cargarLibrosUI(); // Resetear lista
}

/**
 * Activa/desactiva el filtro de favoritos
 */
function toggleFiltroFavoritos() {
    __filtrandoFavoritos = !__filtrandoFavoritos;
    actualizarEstadoBotonFavoritos();
    cargarLibrosUI();
}

/**
 * Actualiza el estado visual del botón de favoritos en la toolbar
 */
function actualizarEstadoBotonFavoritos() {
    const btn = $('#btnFavoritos');
    if (!btn) return;

    if (__filtrandoFavoritos) {
        btn.classList.add('active');
        btn.textContent = '⭐ Mostrando Favoritos';
        btn.title = 'Mostrar todos los libros';
    } else {
        btn.classList.remove('active');
        btn.textContent = '⭐ Favoritos';
        btn.title = 'Ver solo favoritos';
    }
}

// --- Helpers de Renderizado y DOM ---

function obtenerParametrosFiltros() {
    return {
        q: $('#q')?.value.trim() || '',
        cat: $('#selCategoria')?.value || '',
        caja: $('#selCaja')?.value || '',
        estado: $('#selEstado')?.value || ''
    };
}

function renderTabla(items) {
    actualizarEstadisticas(items);
    const el = $('#tabla');
    if (!el) return;

    const rows = items.map(item => {
        const { clase } = analizarEstado(item.estado);
        return `
        <tr>
            <td>${esc(item.titulo)}</td>
            <td>${esc(item.categoria)}</td>
            <td>${esc(item.caja)}</td>
            <td><span class="estado-badge ${clase}">${esc(item.estado)}</span></td>
            <td class="actions no-print">
                <button class="secondary view" data-id="${item.id}">Ver</button>
            </td>
        </tr>`;
    }).join('');

    const sortIcon = (col) => __sortColumn !== col ? ' ↕' : (__sortDirection === 'asc' ? ' ↑' : ' ↓');

    el.innerHTML = `
    <table>
        <thead><tr>
            <th class="sortable" data-col="titulo">Título${sortIcon('titulo')}</th>
            <th class="sortable" data-col="categoria">Categoría${sortIcon('categoria')}</th>
            <th class="sortable" data-col="caja">Caja${sortIcon('caja')}</th>
            <th class="sortable" data-col="estado">Estado${sortIcon('estado')}</th>
            <th class="no-print"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;

    // Listeners tabla
    el.querySelectorAll('.sortable').forEach(th =>
        th.addEventListener('click', () => ordenarItemsLocalmente(th.dataset.col))
    );
    el.querySelectorAll('.view').forEach(btn =>
        btn.addEventListener('click', () => verLibroUI(btn.dataset.id))
    );
}

function renderDetalleLibro(data) {
    const f = $('#frmLibro');
    if (!f) return;

    // Llenar campos simples
    for (const [k, v] of Object.entries(data)) {
        const input = f.querySelector(`[name="${k}"]`);
        if (input) {
            input.value = v || '';
            if (input.tagName === 'TEXTAREA' && k === 'titulo') {
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            }
        }
    }

    // Badge estado
    const { clase } = analizarEstado(data.estado);
    const badgeContainer = $('#estadoDisplay');
    if (badgeContainer) {
        badgeContainer.innerHTML = data.estado ?
            `<span class="estado-badge ${clase}">${esc(data.estado)}</span>` : '';
    }

    // Portada y Resumen
    mostrarPortada(data.urldelaimagen);
    mostrarResumen(data.resumen);
}

function actualizarLogicaEstado(data) {
    const { esPrestado } = analizarEstado(data.estado);
    const prestadoA = $('#prestadoA');
    const btnPrestamo = $('#btnRegistrarPrestamo');
    const btnDevolucion = $('#btnRegistrarDevolucion');
    const confirmInput = $('#confirmarDevolucion');

    if (esPrestado) {
        if (prestadoA) {
            prestadoA.value = data.prestado || '';
            prestadoA.disabled = true;
            prestadoA.placeholder = data.prestado;
        }
        if (btnPrestamo) btnPrestamo.disabled = true;
        if (confirmInput) { confirmInput.disabled = false; confirmInput.placeholder = 'Escribe "DEVOLVER"'; }
        if (btnDevolucion) btnDevolucion.disabled = false;
    } else {
        if (prestadoA) {
            prestadoA.value = ''; // Limpiar valor anterior
            prestadoA.disabled = false;
            prestadoA.placeholder = 'Nombre de la persona';
        }
        if (btnPrestamo) btnPrestamo.disabled = false;
        if (confirmInput) { confirmInput.disabled = true; confirmInput.placeholder = 'Libro no prestado'; }
        if (btnDevolucion) btnDevolucion.disabled = true;
    }
}

function actualizarEstadoLocal(libroActualizado) {
    const idx = __currentItems.findIndex(i => i.id === libroActualizado.id);
    if (idx !== -1) {
        __currentItems[idx] = { ...__currentItems[idx], ...libroActualizado };
        // NO re-renderizar la tabla mientras el diálogo está abierto
        // (evita que cambie el orden y se pierda la navegación)
        // renderTabla(__currentItems);
    }
}

function analizarEstado(estadoRaw) {
    // El estado ya viene calculado como "Prestado a..." o "Disponible" desde el modelo
    const estado = (estadoRaw || '').toLowerCase().trim();
    const esDisponible = estado === 'disponible';
    const esPrestado = !esDisponible && estado !== '';
    let clase = '';
    if (esDisponible) clase = 'estado-disponible';
    else if (esPrestado) clase = 'estado-prestado';
    return { estado: estadoRaw, esDisponible, esPrestado, clase };
}

function ordenarItemsLocalmente(col, forceDir) {
    if (forceDir) {
        __sortDirection = forceDir;
    } else if (__sortColumn === col) {
        __sortDirection = __sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        __sortDirection = 'asc';
    }
    __sortColumn = col;

    const sorted = [...__currentItems].sort((a, b) => {
        let valA = a[col] || '';
        let valB = b[col] || '';

        if (col === 'caja') {
            const nA = parseInt(valA), nB = parseInt(valB);
            if (!isNaN(nA) && !isNaN(nB)) return __sortDirection === 'asc' ? nA - nB : nB - nA;
        }

        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        return __sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    // IMPORTANTE: Actualizar __currentItems con el orden nuevo
    __currentItems = sorted;
    renderTabla(sorted);
}

function actualizarEstadisticas(items) {
    const total = items.length;
    const disponibles = items.filter(i => analizarEstado(i.estado).esDisponible).length;
    const prestados = items.filter(i => analizarEstado(i.estado).esPrestado).length;

    $('#statTotal').textContent = total;
    $('#statDisponibles').textContent = disponibles;
    $('#statPrestados').textContent = prestados;

    // Filtros label
    const params = obtenerParametrosFiltros();
    const hayFiltros = Object.values(params).some(v => v);
    const label = document.querySelector('.stat-label');
    if (label) label.textContent = hayFiltros ? 'Resultados:' : 'Total de libros:';

    const divFiltros = $('#filtrosAplicados');
    if (divFiltros) {
        if (!hayFiltros) divFiltros.textContent = '';
        else {
            const txt = [];
            if (params.q) txt.push(`Búsqueda: "${params.q}"`);
            if (params.cat) txt.push(`Categoría: ${params.cat}`);
            if (params.caja) txt.push(`Caja: ${params.caja}`);
            if (params.estado) txt.push(`Estado: ${params.estado}`);
            divFiltros.textContent = 'Filtros: ' + txt.join(' | ');
        }
    }
}

// --- Manejo de Selects y UI Auxiliar ---

function actualizarSelects(data, selectedValues = {}) {
    const update = (id, items = [], currentVal) => {
        const el = document.getElementById(id);
        if (!el) return;

        const defaultText = el.dataset.defaultText || el.firstElementChild?.textContent?.replace('Cargando...', '') || 'Todos';
        el.dataset.defaultText = defaultText;

        el.innerHTML = `<option value="">${defaultText}</option>` +
            items.map(v => `<option value="${v}">${v}</option>`).join('');

        if (currentVal && items.map(String).includes(String(currentVal))) {
            el.value = currentVal;
        }
    };

    update('selCategoria', data.categorias, selectedValues.cat);
    update('selCaja', data.cajas, selectedValues.caja);
    update('selEstado', data.estados, selectedValues.estado);
}

function mostrarCargandoEnSelects(origin) {
    const setLoad = (id) => {
        if (origin && id.toLowerCase().includes(origin)) return;
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<option>Cargando...</option>`;
    };
    setLoad('selCategoria'); setLoad('selCaja'); setLoad('selEstado');
}

function toggleSelects(disabled) {
    ['selCategoria', 'selCaja', 'selEstado', 'btnBuscar', 'btnReset'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function bloquearUI(bloquear) {
    toggleSelects(bloquear);
    const q = $('#q');
    if (q) q.disabled = bloquear;
}

// --- Portada, Resumen y Scroll ---

function mostrarPortada(url) {
    const c = $('#portadaLibro');
    if (!c) return;
    c.innerHTML = '';
    c.className = 'portada-placeholder';

    if (!url) { c.textContent = 'Sin portada'; return; }

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Portada';
    img.onload = () => { c.innerHTML = ''; c.className = ''; c.appendChild(img); };
    img.onerror = () => { c.textContent = 'Sin portada'; };
    img.style.cursor = 'pointer';
    img.onclick = () => mostrarImagenPantallaCompleta(url);
}

function mostrarResumen(texto) {
    const c = $('#resumenLibro');
    if (!c) return;
    c.innerHTML = '';
    c.classList.remove('sin-contenido');
    if (!texto) {
        c.classList.add('sin-contenido');
        c.textContent = 'Sin resumen';
    } else {
        c.textContent = texto;
    }
}

function mostrarImagenPantallaCompleta(url) {
    const dlg = document.createElement('dialog');
    dlg.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.9);border:none;width:100%;height:100%;display:flex;justify-content:center;align-items:center;z-index:9999;`;
    dlg.innerHTML = `<img src="${url}" style="max-width:95vw;max-height:95vh;object-fit:contain;">`;
    dlg.onclick = () => { dlg.close(); document.body.removeChild(dlg); };
    document.body.appendChild(dlg);
    dlg.showModal();
}

// --- Scroll Locking (Móvil) ---
function lockAppScroll() {
    document.body.style.overflow = 'hidden';
}
function unlockAppScroll() {
    document.body.style.overflow = '';
}

function setupScrollDetection() {
    const card = $('.card');
    if (card) {
        const check = () => {
            if (card.scrollWidth > card.clientWidth) card.classList.add('has-scroll');
            else card.classList.remove('has-scroll');
        };
        window.addEventListener('resize', check);
        new MutationObserver(check).observe(card, { childList: true, subtree: true });
    }
}

// --- Diálogos ---
function setupDialogListeners() {
    const closeDlg = (id) => { const d = $(id); if (d) d.close(); };
    $('#btnCerrarDialog')?.addEventListener('click', () => closeDlg('#dlg'));

    // GENÉRICO: Desbloquear scroll al cerrar CUALQUIER diálogo (cubre botón, ESC, etc.)
    document.querySelectorAll('dialog').forEach(d => {
        d.addEventListener('close', unlockAppScroll);
    });

    // Actualizar tabla al cerrar el diálogo principal (para reflejar cambios de préstamo/devolución)
    const dlgPrincipal = $('#dlg');
    if (dlgPrincipal) {
        dlgPrincipal.addEventListener('close', () => {
            // Re-renderizar la tabla con el estado actual
            renderTabla(__currentItems);
        });
    }


    // Helpers para docs
    const showDoc = async (file, dlgId, contentId) => {
        try {
            const txt = await (await fetch(file)).text();
            const content = document.getElementById(contentId);
            if (content) {
                // Usar marked si está disponible, sino fallback simple
                if (typeof marked !== 'undefined') {
                    content.innerHTML = marked.parse(txt);
                } else {
                    content.innerHTML = txt.replace(/\n/g, '<br>');
                }
            }
            const dlg = document.getElementById(dlgId);
            if (dlg) {
                dlg.showModal();
                lockAppScroll(); // Bloquear scroll al abrir doc
            }
        } catch (e) { console.error(e); }
    };

    $('#btnHelp')?.addEventListener('click', () => showDoc('docs/README.md', 'dlgHelp', 'helpContent'));
    $('#linkLicense')?.addEventListener('click', (e) => { e.preventDefault(); showDoc('docs/LICENSE.md', 'dlgLicense', 'licenseContent'); });
    $('#linkPrivacy')?.addEventListener('click', (e) => { e.preventDefault(); showDoc('docs/PRIVACY.md', 'dlgPrivacy', 'privacyContent'); });

    // Cerrar docs (botones internos)
    ['dlgHelp', 'dlgLicense', 'dlgPrivacy'].forEach(id => {
        const btn = document.querySelector(`#${id} button`);
        if (btn) btn.addEventListener('click', () => document.getElementById(id).close());
    });
}

function mostrarMensajeCarga(msg, sub) {
    const c = $('#portadaLibro');
    if (c) c.innerHTML = `<div style="text-align:center;padding:20px"><div>⏳</div><div>${msg}</div><small>${sub}</small></div>`;
}
function limpiarMensajeCarga() {
    // Se limpia automáticamente al mostrar portada
}

function imprimirPagina() {
    const original = document.title;
    document.title += ` - ${new Date().toLocaleString()}`;
    window.print();
    document.title = original;
}

// --- Navegación entre libros en el diálogo ---

function navegarAnterior() {
    if (!__currentLibroId || __currentItems.length === 0) return;

    const currentIndex = __currentItems.findIndex(i => i.id === __currentLibroId);
    if (currentIndex > 0) {
        const anteriorId = __currentItems[currentIndex - 1].id;
        verLibroUI(anteriorId);
    }
}

function navegarSiguiente() {
    if (!__currentLibroId || __currentItems.length === 0) return;

    const currentIndex = __currentItems.findIndex(i => i.id === __currentLibroId);
    if (currentIndex < __currentItems.length - 1) {
        const siguienteId = __currentItems[currentIndex + 1].id;
        verLibroUI(siguienteId);
    }
}

function actualizarBotonesNavegacion() {
    const btnAnterior = $('#btnAnterior');
    const btnSiguiente = $('#btnSiguiente');

    if (!btnAnterior || !btnSiguiente || !__currentLibroId) return;

    const currentIndex = __currentItems.findIndex(i => i.id === __currentLibroId);

    // Deshabilitar "Atrás" si estamos en el primero
    btnAnterior.disabled = (currentIndex <= 0);

    // Deshabilitar "Siguiente" si estamos en el último
    btnSiguiente.disabled = (currentIndex >= __currentItems.length - 1);
}

function deshabilitarFormulario(deshabilitar) {
    const f = document.getElementById('frmLibro');
    if (!f) return;
    const elements = f.querySelectorAll('input, textarea, button');
    elements.forEach(el => el.disabled = deshabilitar);

    // Mantener siempre habilitado el botón de cerrar si existe dentro del form (aunque suele estar fuera)
    const btnCerrar = document.getElementById('btnCerrarDialog');
    if (btnCerrar) btnCerrar.disabled = false;

    // Mantener habilitados los botones de navegación (no forman parte del formulario de edición)
    const btnAnterior = document.getElementById('btnAnterior');
    const btnSiguiente = document.getElementById('btnSiguiente');
    if (btnAnterior) btnAnterior.disabled = false;
    if (btnSiguiente) btnSiguiente.disabled = false;

    // Actualizar estado real de navegación
    actualizarBotonesNavegacion();
}
