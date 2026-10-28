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
  _request: async function(ruta, opciones = {}, reintento = true) {
    // Renueva el token si vence en menos de un minuto
    if (RoumixStorage.getRefreshToken() && RoumixStorage.getExpiracion() - 60 < Date.now() / 1000) {
      await this._renovarSesion();
    }

    const headers = { ...(opciones.headers || {}) };
    // Con FormData (fotos) el navegador pone el Content-Type multipart por sí solo
    if (opciones.body && !(opciones.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    // Si la petición ya trae su propio token (p. ej. el del enlace de recuperación) se respeta
    const token = headers['Authorization'] ? null : RoumixStorage.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${this.baseURL}${ruta}`, { ...opciones, headers });
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor de Roumix. Verifica que el backend esté encendido.');
    }

    // Token rechazado: se intenta renovar una vez y repetir la petición
    if (res.status === 401 && token && reintento && await this._renovarSesion()) {
      return this._request(ruta, opciones, false);
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
   * Usa el refresh token para obtener un token de acceso nuevo.
   * Devuelve true si lo logró; si no, borra la sesión local.
   */
  _renovarSesion: async function() {
    const refreshToken = RoumixStorage.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) RoumixStorage.limpiarSesion();
        return false;
      }
      const json = await res.json();
      RoumixStorage.setSesion(json.sesion, json.usuario);
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Crea una cuenta. Si Supabase no exige confirmar el correo, deja la sesión iniciada.
   */
  registrar: async function(datos) {
    const json = await this._request('/auth/registro', { method: 'POST', body: JSON.stringify(datos) });
    if (json.sesion) RoumixStorage.setSesion(json.sesion, json.usuario);
    return json;
  },

  /**
   * Inicia sesión con correo y contraseña. El rol llega desde el perfil guardado.
   */
  /**
   * Pide el correo para crear una contraseña nueva (la respuesta no revela si la cuenta existe)
   */
  recuperarContrasena: async function(email, captchaToken) {
    const json = await this._request('/auth/recuperar', { method: 'POST', body: JSON.stringify({ email, captchaToken }) });
    return json.message;
  },

  /**
   * Guarda la contraseña nueva usando el token que trae el enlace del correo
   */
  restablecerContrasena: async function(tokenRecuperacion, password) {
    const json = await this._request('/auth/restablecer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenRecuperacion}` },
      body: JSON.stringify({ password })
    }, false);
    return json.message;
  },

  login: async function(email, password, captchaToken) {
    const json = await this._request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, captchaToken }) });
    RoumixStorage.setSesion(json.sesion, json.usuario);
    return json.usuario;
  },

  /**
   * Perfil del usuario con sesión, confirmado por el servidor
   */
  getPerfil: async function() {
    const json = await this._request('/auth/perfil');
    RoumixStorage.setUsuario(json.usuario);
    return json.usuario;
  },

  logout: async function() {
    await this._request('/auth/logout', { method: 'POST' }, false);
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
    if (filtros.orden) params.append('orden', filtros.orden);
    if (filtros.ids && filtros.ids.length) params.append('ids', filtros.ids.join(','));

    const json = await this._request(`/inmuebles${params.toString() ? '?' + params.toString() : ''}`);
    return json.data.map((item) => this._guardarEnCache(this._normalizarInmueble(item)));
  },

  /**
   * Datos actuales de los inmuebles seleccionados para comparar (solo los disponibles)
   */
  getInmueblesPorIds: async function(ids) {
    if (!ids.length) return [];
    return this.getInmuebles({ ids });
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
   * Un inmueble propio en cualquier estado (para editarlo)
   */
  getMiInmueble: async function(id) {
    const json = await this._request(`/inmuebles/mios/${encodeURIComponent(id)}`);
    return this._normalizarInmueble(json.data);
  },

  /**
   * Arma el multipart con los datos (JSON) y las fotos nuevas
   */
  _formularioInmueble: function(datos, fotos) {
    const form = new FormData();
    form.append('datos', JSON.stringify(datos));
    (fotos || []).forEach((foto) => form.append('fotos', foto));
    return form;
  },

  /**
   * Publica un inmueble con sus fotos. El propietario lo determina el servidor
   * a partir de la sesión; las fotos se suben a Supabase Storage.
   */
  crearInmueble: async function(datos, fotos) {
    const json = await this._request('/inmuebles', { method: 'POST', body: this._formularioInmueble(datos, fotos) });
    return this._normalizarInmueble(json.data);
  },

  /**
   * Edita un inmueble propio. datos.fotosConservar = URLs actuales que se mantienen.
   */
  actualizarInmueble: async function(id, datos, fotosNuevas) {
    const json = await this._request(`/inmuebles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: this._formularioInmueble(datos, fotosNuevas)
    });
    return this._normalizarInmueble(json.data);
  },

  /**
   * estado: 'disponible' | 'pausado' | 'arrendado'
   */
  cambiarEstado: async function(id, estado) {
    const json = await this._request(`/inmuebles/${encodeURIComponent(id)}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado })
    });
    return json.data;
  },

  /**
   * Busca una dirección o sector de Villavicencio (solo propietarios; lo resuelve el backend)
   */
  buscarLugar: async function(q) {
    const json = await this._request(`/inmuebles/geocodificar?q=${encodeURIComponent(q)}`);
    return json.data;
  },

  /**
   * Reporta una publicación. motivo: fraude | informacion_falsa | fotos_no_corresponden |
   * precio_enganoso | contenido_inapropiado | otro
   */
  reportarInmueble: async function(id, motivo, descripcion) {
    const json = await this._request(`/inmuebles/${encodeURIComponent(id)}/reportes`, {
      method: 'POST',
      body: JSON.stringify({ motivo, descripcion })
    });
    return json.message;
  },

  /**
   * Petición a la API de administración (el servidor exige rol admin)
   */
  admin: async function(ruta, opciones = {}) {
    if (opciones.body && typeof opciones.body !== 'string') opciones.body = JSON.stringify(opciones.body);
    return this._request(`/admin${ruta}`, opciones);
  },

  eliminarInmueble: async function(id) {
    await this._request(`/inmuebles/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
