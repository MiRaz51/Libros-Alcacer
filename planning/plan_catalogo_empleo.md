# Plan de adaptación: Catálogo laboral con calificaciones y control de confiabilidad

## 1. Contexto actual
- **Stack**: SPA ligera con `index.html`, `styles.css`, `app.js`, backend en Google Apps Script + Service Worker (`sw.js`) para PWA/offline.
- **Funcionalidad existente**: Catálogo de libros con filtros cruzados (categoría, caja, estado), tabla ordenable, modales de detalle, estadísticas y llamadas al backend vía `api(action, payload)` @app.js.
- **Arquitectura reutilizable**: Inputs/selects de búsqueda, renderizado de tabla, diálogos, manejo de estados/estadísticas y capa de red ya preparada para cualquier dataset estructurado.

## 2. Objetivo
Transformar la app en un catálogo de talento donde:
1. Se publiquen perfiles con habilidades, oficios/profesiones y datos de contacto (WhatsApp).
2. Usuarios busquen perfiles por filtros equivalentes a los actuales (categorías, ubicación, disponibilidad, etc.).
3. Se registre un "match" automático al iniciar contacto por WhatsApp para medir contratos potenciales.
4. Sólo los usuarios que generaron un match puedan calificar al profesional, construyendo un record de confiabilidad.
5. Se minimice el fraude en el registro (anti-bots/validación básica).

## 3. Adaptaciones principales
### 3.1 Catálogo de perfiles
- **Backend**: Nuevos endpoints `catalogos`, `catalogos_filtrados`, `search_perfiles` que devuelvan categorías (oficio), ubicaciones, disponibilidad, habilidades destacadas.
- **Frontend**:
  - Renombrar inputs/selects (p.ej. `Buscar por nombre u oficio`, `Área`, `Modalidad`, `Disponibilidad`).
  - Tabla `renderTabla` mostrará columnas: Nombre, Oficio/Profesión, Habilidades clave, Disponibilidad, Acciones.
  - Modales de detalle con resumen del perfil, enlaces a portafolio, botón WhatsApp.

### 3.2 Registro de contacto (match) + WhatsApp
1. Botón "Contactar por WhatsApp" reemplaza/acompaña al botón actual "Ver".
2. Al hacer clic:
   - Se llama a `api('crear_match', { profesionalId, contratanteId })`.
   - Backend devuelve `matchId` válido (registra timestamp, IP, user agents).
   - Sólo si hay respuesta exitosa se abre `https://wa.me/<numero>?text=...`.
3. Datos almacenados: profesional, contratante, fecha de creación, IP, dispositivo, estado (`contacto_creado`).
4. Métricas visibles: "Contactos registrados" por perfil, "Calificaciones verificadas".
5. Protección básica: limitar matches repetidos entre los mismos actores en un intervalo corto; marcar como baja confiabilidad cuando el patrón sea sospechoso.

### 3.3 Calificaciones y record de confiabilidad
1. **Requisito**: sólo usuarios con un `matchId` válido (<= X días) pueden calificar.
2. **Flujo**:
   - Tras usar WhatsApp, el contratante vuelve al sistema y abre el formulario "Calificar servicio".
   - El frontend envía `api('registrar_calificacion', { matchId, rating, comentario })`.
   - Backend verifica: `matchId` existe, pertenece al usuario autenticado, no se usó antes, no expiró.
   - Si pasa, almacena calificación ligada al profesional + marca `matchId` como `calificado`.
3. **Visualización**: Promedio de estrellas, total de calificaciones verificadas, badges como "Confiabilidad Alta" (basado en media y cantidad mínima).
4. **Auditoría**: Registrar IP, timestamps y userId para detectar abusos (múltiples ratings desde mismo dispositivo, etc.).

### 3.4 Mensajería por WhatsApp
- Botón genera URL `https://wa.me/<numero>?text=Mensaje%20prefabricado`.
- Número validado en backend (regex + opcional API externa) antes de almacenarlo.
- Se puede parametrizar el mensaje (nombre del profesional, enlace al perfil) para trackeo.

### 3.5 Validación de postulantes (anti-bots)
1. **Autenticación**: usar un proveedor (Google/Firebase/Auth0). El token se envía al Apps Script, que valida identidad antes de crear perfil.
2. **CAPTCHA**: integrar reCAPTCHA v3 o hCaptcha en el formulario de registro.
3. **Flujo de aprobación**: nuevo campo `estado` en el perfil (`pendiente`, `aprobado`). Sólo `aprobado` aparece en la búsqueda.
4. **Rate limiting**: limitar número de registros por IP/dispositivo por día.
5. **Metadatos**: almacenar IP, timestamp, user agent para auditorías.

## 4. Cambios en UI/UX
1. **Index/Toolbar**
   - Actualizar labels y placeholders.
   - Añadir selectores adicionales si se necesitan (ej. modalidad presencial/remota).
2. **Tabla**
   - Columnas nuevas (Nombre, Oficio, Habilidades, Disponibilidad, Rating, Acciones).
   - Botones: "Ver perfil", "Contactar por WhatsApp", "Calificar" (sólo si hay match).
3. **Modales**
   - Mostrar datos completos: bio, experiencia, calificaciones, botones de acción.
   - Formulario de calificación (estrellas + comentario) con validación.
4. **Indicadores**
   - Estadísticas superiores muestran resultados totales, disponibles, calificaciones promedio.
   - Badges para "Contrato verificado" (match registrado) y niveles de confianza.

## 5. Backend (Apps Script)
- Endpoints sugeridos:
  - `catalogos`, `catalogos_filtrados`, `search_perfiles` (lecturas).
  - `crear_match` (POST): crea registro de contacto.
  - `registrar_calificacion` (POST): inserta rating tras validar match.
  - `registrar_postulante` (POST): alta de perfil con validaciones anti-bot.
  - `get_historial_calificaciones` (GET): recupera ratings para mostrar en UI.
- Controles: expiración de match (ej. 30 días), un rating por match, auditoría de IPs, límites por usuario.

### 5.1 Límites gratuitos de plataformas alternativas

| Plataforma | Lecturas/día | Escrituras/día | Invocaciones/mes | Base de datos | Transferencia | Storage archivos |
| --- | --- | --- | --- | --- | --- | --- |
| Firebase (Firestore + Cloud Functions) | ≈50 000 | ≈20 000 | ≈125 000 (Cloud Functions) | 1 GB Firestore incluido | Incluido en cuota general de hosting | Depende de Firebase Storage (5 GB gratis típicamente) |
| Supabase (Postgres + RPC) | N/A (depende de consultas) | N/A | ≈50 000 llamadas RPC | 500 MB Postgres | 1 GB/mes | 2 GB en Supabase Storage |

## 6. Servicio de calificaciones con un solo paso automatizado
Dado que los usuarios no completarán flujos largos, el único punto fiable será el clic "Contactar".
- **Regla clave**: sin match registrado, no existe opción de calificar ni aumentar la confiabilidad.
- **Expiración**: los matches expiran para evitar calificaciones tardías/fraude.
- **Monitoreo**: reportes internos para detectar perfiles con muchos matches pero pocas calificaciones (posible spam) o lo contrario (intentos de auto-rating).

## 7. Próximos pasos sugeridos
1. Definir esquema de datos y actualizar Sheets/DB para perfiles, matches y calificaciones.
2. Implementar endpoints en Apps Script con validaciones descritas.
3. Actualizar `index.html`/`app.js`/`styles.css`:
   - Renombrar filtros y columnas.
   - Añadir botones y formularios de calificación.
   - Integrar flujo de matches y restricciones.
4. (Opcional) Integrar autenticación y CAPTCHA en el formulario de registro de postulantes.

Este documento recoge todos los acuerdos y decisiones discutidos para guiar la implementación del catálogo laboral con sistema de confiabilidad basado en matches y calificaciones verificadas.
