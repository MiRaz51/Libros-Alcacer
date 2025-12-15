// ========== CONFIGURACIÓN POCKETBASE ==========
const POCKETBASE_URL = 'https://pocketbase-production-bc89.up.railway.app';
const pb = new PocketBase(POCKETBASE_URL);

// Deshabilitar auto-cancelación de requests
pb.autoCancellation(false);

// ========== FUNCIONES API ADAPTADAS PARA POCKETBASE ==========

async function api(action, payload = {}, timeout = 30000) {
    try {
        switch (action) {
            case 'catalogos':
                return await getCatalogos();

            case 'catalogos_filtrados':
                return await getCatalogosFiltrados(payload);

            case 'search_libros':
                return await searchLibros(payload);

            case 'list_libros':
                return await listLibros();

            case 'get_libro':
                return await getLibro(payload.id);

            case 'registrar_prestamo':
                return await registrarPrestamo(payload);

            case 'registrar_devolucion':
                return await registrarDevolucion(payload);

            default:
                throw new Error('Acción desconocida: ' + action);
        }
    } catch (err) {
        console.error(`[API] Error en ${action}:`, err);
        throw new Error(err.message || 'Error en la operación');
    }
}

// ========== FUNCIONES DE BÚSQUEDA Y LISTADO ==========

async function listLibros() {
    try {
        const records = await pb.collection('librostitulo').getFullList({
            sort: 'titulo',
        });

        const items = records.map(record => ({
            id: record.id,
            titulo: record.titulo || '',
            autor: record.autor || '',
            categoria: record.categoria || '',
            caja: record.caja || '',
            estado: record.estado || 'Disponible'
        }));

        return { items };
    } catch (error) {
        console.error('Error listando libros:', error);
        throw error;
    }
}

async function searchLibros(params) {
    try {
        const { q = '', cat = '', caja = '', estado = '' } = params;

        // Construir filtros para PocketBase
        const filters = [];

        if (q) {
            filters.push(`titulo ~ "${q}"`);
        }
        if (cat) {
            filters.push(`categoria = "${cat}"`);
        }
        if (caja) {
            filters.push(`caja = "${caja}"`);
        }
        if (estado) {
            filters.push(`estado = "${estado}"`);
        }

        const filterString = filters.length > 0 ? filters.join(' && ') : '';

        const records = await pb.collection('librostitulo').getFullList({
            filter: filterString,
            sort: 'titulo',
        });

        const items = records.map(record => ({
            id: record.id,
            titulo: record.titulo || '',
            autor: record.autor || '',
            categoria: record.categoria || '',
            caja: record.caja || '',
            estado: record.estado || 'Disponible'
        }));

        return { items };
    } catch (error) {
        console.error('Error buscando libros:', error);
        throw error;
    }
}

async function getLibro(id) {
    try {
        const record = await pb.collection('librostitulo').getOne(id);
        return {
            id: record.id,
            titulo: record.titulo || '',
            autor: record.autor || '',
            editorial: record.editorial || '',
            anio: record.anio || '',
            isbn: record.isbn || '',
            categoria: record.categoria || '',
            caja: record.caja || '',
            estado: record.estado || 'Disponible',
            prestadoa: record.prestadoa || '',
            notas: record.notas || '',
            urldelaimagen: record.urldelaimagen || '',
            resumen: record.resumen || '',
            created: record.created,
            updated: record.updated
        };
    } catch (error) {
        console.error('Error obteniendo libro:', error);
        throw error;
    }
}

// ========== FUNCIONES DE CATÁLOGOS ==========

async function getCatalogos() {
    try {
        // Obtener todos los libros
        const records = await pb.collection('librostitulo').getFullList();

        // Extraer valores únicos
        const categoriasSet = new Set();
        const cajasSet = new Set();
        const estadosSet = new Set();

        records.forEach(record => {
            if (record.categoria) categoriasSet.add(record.categoria);
            if (record.caja) cajasSet.add(record.caja);
            if (record.estado) estadosSet.add(record.estado);
        });

        // Convertir a arrays y ordenar
        const categorias = Array.from(categoriasSet).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );

        const cajas = Array.from(cajasSet).sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return String(a).localeCompare(String(b));
        });

        const estados = Array.from(estadosSet).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );

        return { categorias, cajas, estados };
    } catch (error) {
        console.error('Error obteniendo catálogos:', error);
        throw error;
    }
}

async function getCatalogosFiltrados(params) {
    try {
        const { cat = '', caja = '', estado = '' } = params;

        // Construir filtros
        const filters = [];
        if (cat) filters.push(`categoria = "${cat}"`);
        if (caja) filters.push(`caja = "${caja}"`);
        if (estado) filters.push(`estado = "${estado}"`);

        const filterString = filters.length > 0 ? filters.join(' && ') : '';

        const records = await pb.collection('librostitulo').getFullList({
            filter: filterString,
        });

        // Extraer valores únicos de los registros filtrados
        const categoriasSet = new Set();
        const cajasSet = new Set();
        const estadosSet = new Set();

        records.forEach(record => {
            if (record.categoria) categoriasSet.add(record.categoria);
            if (record.caja) cajasSet.add(record.caja);
            if (record.estado) estadosSet.add(record.estado);
        });

        // Convertir a arrays y ordenar
        const categorias = Array.from(categoriasSet).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );

        const cajas = Array.from(cajasSet).sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            return String(a).localeCompare(String(b));
        });

        const estados = Array.from(estadosSet).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );

        return { categorias, cajas, estados };
    } catch (error) {
        console.error('Error obteniendo catálogos filtrados:', error);
        throw error;
    }
}

// ========== FUNCIONES DE PRÉSTAMOS ==========

async function registrarPrestamo(params) {
    try {
        const { id, prestadoa } = params;

        if (!id || !prestadoa) {
            throw new Error('ID y nombre de la persona son requeridos');
        }

        // Actualizar el libro
        const record = await pb.collection('librostitulo').update(id, {
            prestadoa: prestadoa,
            estado: `Prestado a ${prestadoa}`
        });

        return {
            ok: true,
            message: 'Préstamo registrado',
            libro: {
                id: record.id,
                titulo: record.titulo || '',
                autor: record.autor || '',
                editorial: record.editorial || '',
                anio: record.anio || '',
                isbn: record.isbn || '',
                categoria: record.categoria || '',
                caja: record.caja || '',
                estado: record.estado || '',
                prestadoa: record.prestadoa || '',
                notas: record.notas || '',
                urldelaimagen: record.urldelaimagen || '',
                resumen: record.resumen || ''
            }
        };
    } catch (error) {
        console.error('Error registrando préstamo:', error);
        throw error;
    }
}

async function registrarDevolucion(params) {
    try {
        const { id } = params;

        if (!id) {
            throw new Error('ID es requerido');
        }

        // Actualizar el libro
        const record = await pb.collection('librostitulo').update(id, {
            prestadoa: '',
            estado: 'Disponible'
        });

        return {
            ok: true,
            message: 'Devolución registrada',
            libro: {
                id: record.id,
                titulo: record.titulo || '',
                autor: record.autor || '',
                editorial: record.editorial || '',
                anio: record.anio || '',
                isbn: record.isbn || '',
                categoria: record.categoria || '',
                caja: record.caja || '',
                estado: record.estado || '',
                prestadoa: record.prestadoa || '',
                notas: record.notas || '',
                urldelaimagen: record.urldelaimagen || '',
                resumen: record.resumen || ''
            }
        };
    } catch (error) {
        console.error('Error registrando devolución:', error);
        throw error;
    }
}

// ========== EL RESTO DEL CÓDIGO DE app.js SE MANTIENE IGUAL ==========
// Copiar todo el código desde la línea 34 en adelante del app.js original
