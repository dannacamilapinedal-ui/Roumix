/**
 * ============================================================================
 * ROUMIX - CLIENTE API MODULAR (FRONTEND)
 * Maneja todas las comunicaciones HTTP con el servidor Node.js + Express.
 * Si la API falla se lanza un error: nunca se reemplaza por datos locales.
 * ============================================================================
 */

// Imagen que solo se MUESTRA cuando un inmueble aún no tiene fotos (no se guarda en la BD)
const IMAGEN_SIN_FOTO = 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1000&q=80';

const RoumixAPI = {
  // Si la página la entrega el propio backend (http://localhost:3000 o el servidor desplegado)
  // se usa la misma URL; si se abre como archivo o con Live Server, se apunta al backend local.
  baseURL: window.location.protocol === 'file:' || ['5500', '5501'].includes(window.location.port)
    ? 'http://localhost:3000/api'
    : '/api',

  // Inmuebles ya cargados, por ID (lo usa el modal de contacto)
  _cache: {},

  /**
   * Petición genérica: devuelve el JSON o lanza un Error con el mensaje del servidor.
   */
  _request: async function(ruta, opciones = {}) {
    const headers = { ...(opciones.headers || {}) };
    if (opciones.body) headers['Content-Type'] = 'application/json';

    const token = RoumixStorage.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${this.baseURL}${ruta}`, { ...opciones, headers });
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor de Roumix. Verifica que el backend esté encendido.');
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `Error en el servidor (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  },

  /**
   * Obtiene la lista de inmuebles disponibles aplicando filtros opcionales
   */
  getInmuebles: async function(filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.tipo && filtros.tipo !== 'todos') params.append('tipo', filtros.tipo);
    if (filtros.precioMax) params.append('precioMax', filtros.precioMax);
    if (filtros.universidad && filtros.universidad !== 'todas') params.append('universidad', filtros.universidad);
    if (filtros.q) params.append('q', filtros.q);

    const json = await this._request(`/inmuebles${params.toString() ? '?' + params.toString() : ''}`);
    return json.data.map((item) => this._guardarEnCache(this._normalizarInmueble(item)));
  },

  /**
   * Obtiene un inmueble por su ID desde la base de datos
   */
  getInmueblePorId: async function(id) {
    const json = await this._request(`/inmuebles/${encodeURIComponent(id)}`);
    return this._guardarEnCache(this._normalizarInmueble(json.data));
  },

  /**
   * Inmuebles del propietario con sesión iniciada (identificado por su ID en el servidor)
   */
  getMisInmuebles: async function() {
    const json = await this._request('/inmuebles/mios');
    return json.data.map((item) => this._guardarEnCache(this._normalizarInmueble(item)));
  },

  /**
   * Envía un nuevo inmueble para registrarlo en PostgreSQL.
   * El propietario lo determina el servidor a partir de la sesión.
   */
  crearInmueble: async function(nuevo) {
    const json = await this._request('/inmuebles', {
      method: 'POST',
      body: JSON.stringify({
        titulo: nuevo.titulo,
        tipo: nuevo.tipo,
        precio: nuevo.precio,
        barrio: nuevo.barrio,
        universidad: nuevo.universidad,
        distanciaTexto: nuevo.distanciaTexto,
        distanciaMetros: nuevo.distanciaMetros,
        tiempoPie: nuevo.tiempoPie,
        estrato: nuevo.estrato,
        area: nuevo.area,
        transporte: nuevo.transporte,
        amenidades: nuevo.amenidades,
        descripcion: nuevo.descripcion,
        deposito: nuevo.deposito,
        contratoMinimo: nuevo.contratoMinimo,
        latitud: nuevo.lat,
        longitud: nuevo.lng,
        imagenPrincipal: nuevo.imagen,
        galeria: nuevo.galeria
      })
    });
    return this._normalizarInmueble(json.data);
  },

  _guardarEnCache: function(item) {
    this._cache[item.id] = item;
    return item;
  },

  /**
   * Normaliza los nombres de columnas de PostgreSQL con las variables de la vista
   */
  _normalizarInmueble: function(item) {
    const galeria = Array.isArray(item.galeria) ? item.galeria : [];
    const imagen = item.imagen_principal || galeria[0] || IMAGEN_SIN_FOTO;
    const nombrePropietario = item.propietario_nombre || null;

    return {
      ...item,
      precio: Number(item.precio),
      precioFormato: '$' + Number(item.precio).toLocaleString('es-CO'),
      tipoLabel: item.tipo_label || item.tipo,
      distanciaTexto: item.distancia_texto || `${item.barrio} · Villavicencio`,
      distanciaMetros: item.distancia_metros ?? null,
      tiempoPie: item.tiempo_pie || null,
      contratoMinimo: item.contrato_minimo || null,
      disponibleDesde: item.disponible_desde || null,
      amenidades: Array.isArray(item.amenidades) ? item.amenidades : [],
      lat: item.latitud !== null && item.latitud !== undefined ? Number(item.latitud) : null,
      lng: item.longitud !== null && item.longitud !== undefined ? Number(item.longitud) : null,
      imagen,
      galeria: galeria.length ? galeria : [imagen],
      propietario: {
        nombre: nombrePropietario || 'Usuario de Roumix',
        iniciales: nombrePropietario ? nombrePropietario.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : 'R',
        telefono: item.propietario_telefono || null
      }
    };
  }
};
