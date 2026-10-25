/**
 * ==========================================================================
 * ROUMIX - JAVASCRIPT GLOBAL & MODULAR
 * Control de roles (Estudiante / Propietario), LocalStorage y Navegación
 * ==========================================================================
 */

// 1. Los inmuebles se consultan siempre a la API (ver js/api.js); aquí no hay datos de ejemplo.

// 2. Sesión de Supabase Auth guardada en el navegador.
// Solo se guardan los tokens y el perfil que devuelve el servidor; nunca la contraseña.
const RoumixStorage = {
  _leer: function(clave) {
    try {
      return localStorage.getItem(clave);
    } catch (e) {
      return null;
    }
  },

  // Perfil del usuario con sesión (o null si es visitante)
  getUsuario: function() {
    try {
      const u = this._leer("roumix_usuario");
      return u && this.getToken() ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  setUsuario: function(usuario) {
    localStorage.setItem("roumix_usuario", JSON.stringify(usuario));
  },

  // Guarda la respuesta de /api/auth/login, /registro o /refresh
  setSesion: function(sesion, usuario) {
    localStorage.setItem("roumix_token", sesion.access_token);
    localStorage.setItem("roumix_refresh_token", sesion.refresh_token);
    localStorage.setItem("roumix_expira", String(sesion.expires_at || 0));
    this.setUsuario(usuario);
  },

  // Token de sesión de Supabase Auth que se envía al backend
  getToken: function() {
    return this._leer("roumix_token");
  },

  getRefreshToken: function() {
    return this._leer("roumix_refresh_token");
  },

  // Segundos (epoch) en que vence el token de acceso
  getExpiracion: function() {
    return Number(this._leer("roumix_expira")) || 0;
  },

  limpiarSesion: function() {
    ["roumix_usuario", "roumix_token", "roumix_refresh_token", "roumix_expira", "roumix_inmuebles"]
      .forEach((clave) => localStorage.removeItem(clave));
  },

  cerrarSesion: async function() {
    // Se invalida la sesión en Supabase; aunque falle, se borra localmente
    if (this.getToken() && typeof RoumixAPI !== "undefined") {
      try {
        await RoumixAPI.logout();
      } catch (e) {
        console.warn("No se pudo cerrar la sesión en el servidor:", e.message);
      }
    }
    this.limpiarSesion();
    const enCarpetaPages = window.location.pathname.includes("/pages/");
    window.location.href = enCarpetaPages ? "../index.html" : "index.html";
  }
};

// 2.1 Escapa texto antes de insertarlo con innerHTML.
// Los datos de los inmuebles los escriben los usuarios: nunca deben interpretarse como HTML.
function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 3. Formateador de moneda colombiana
function formatearPrecioCOP(valor) {
  return "$" + Number(valor).toLocaleString("es-CO");
}

// 4. Modal de Contacto por WhatsApp (Compartido)
function abrirModalContacto(id) {
  // Solo se usan inmuebles ya cargados desde la API
  const inmueble = typeof RoumixAPI !== "undefined" ? RoumixAPI._cache[id] : null;

  if (!inmueble) return;

  const modal = document.getElementById("modal-contacto");
  if (!modal) return;

  const propNombre = document.getElementById("modal-prop-nombre");
  const propDueno = document.getElementById("modal-prop-dueno");
  const textMensaje = document.getElementById("modal-mensaje-wa");
  const btnWhatsApp = document.getElementById("modal-btn-whatsapp");

  if (propNombre) propNombre.textContent = `${inmueble.titulo} — ${inmueble.precioFormato || ('$' + inmueble.precio)}/mes`;
  const nombrePropietario = inmueble.propietario.nombre;
  const telefonoPropietario = inmueble.propietario.telefono;
  if (propDueno) propDueno.textContent = `${nombrePropietario} (publicado por un usuario de Roumix)`;

  const mensajePredeterminado = `Hola ${nombrePropietario}, vi en Roumix tu publicación de "${inmueble.titulo}" en ${inmueble.barrio} por ${inmueble.precioFormato || ('$' + inmueble.precio)}. Soy estudiante universitario y me gustaría consultar disponibilidad y coordinar una visita. ¡Muchas gracias!`;

  if (textMensaje) textMensaje.value = mensajePredeterminado;

  if (btnWhatsApp) {
    // Sin teléfono registrado no se inventa uno: se desactiva el botón
    if (telefonoPropietario) {
      btnWhatsApp.href = `https://wa.me/${telefonoPropietario}?text=${encodeURIComponent(mensajePredeterminado)}`;
      btnWhatsApp.removeAttribute("aria-disabled");
      btnWhatsApp.style.pointerEvents = "";
      btnWhatsApp.style.opacity = "";
    } else {
      btnWhatsApp.removeAttribute("href");
      btnWhatsApp.setAttribute("aria-disabled", "true");
      btnWhatsApp.style.pointerEvents = "none";
      btnWhatsApp.style.opacity = "0.5";
      if (textMensaje) textMensaje.value = "Este inmueble aún no tiene un teléfono de contacto registrado.";
    }
  }

  modal.classList.add("open");
}

function cerrarModalContacto() {
  const modal = document.getElementById("modal-contacto");
  if (modal) modal.classList.remove("open");
}

// 5. Renderizado inteligente y homogéneo de la barra de navegación según el rol
function sincronizarBarraNavegacion() {
  const header = document.querySelector(".main-header");
  if (!header) return;

  // Si estamos en la página de login (index.html o iniciarsesion.html), no renderizamos menú de usuario
  const esPaginaLogin = window.location.pathname.endsWith("index.html") || 
                        window.location.pathname.endsWith("iniciarsesion.html") || 
                        window.location.pathname.endsWith("/");
  if (document.body.classList.contains("page-login") || (esPaginaLogin && document.getElementById("form-auth"))) {
    return;
  }

  const enCarpetaPages = window.location.pathname.includes("/pages/") || window.location.pathname.includes("\\pages\\");
  const prefixPages = enCarpetaPages ? "" : "pages/";
  const prefixRoot = enCarpetaPages ? "../" : "";

  // El rol guardado solo decide qué enlaces se muestran; el servidor vuelve a validarlo
  const usuario = RoumixStorage.getUsuario();
  const esPropietario = usuario && usuario.rol === "propietario";
  const paginaActual = window.location.pathname.split("/").pop() || "buscar.html";

  // Obtenemos los contenedores de nav
  const navContainer = header.querySelector(".nav-links");
  const rightContainer = header.querySelector(".header-right");

  if (navContainer) {
    if (esPropietario) {
      navContainer.innerHTML = `
        <li><a href="${prefixPages}buscar.html" class="nav-link ${paginaActual === 'buscar.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="${prefixPages}buscar.html" class="nav-link">Buscar</a></li>
        <li><a href="${prefixPages}publicar.html" class="nav-link ${paginaActual === 'publicar.html' ? 'active' : ''}">Publicar</a></li>
        <li><a href="${prefixPages}mis-publicaciones.html" class="nav-link ${paginaActual === 'mis-publicaciones.html' ? 'active' : ''}">Mis publicaciones</a></li>
        <li><a href="${prefixPages}como-funciona.html" class="nav-link ${paginaActual === 'como-funciona.html' ? 'active' : ''}">Cómo funciona</a></li>
        <li><a href="${prefixPages}comparar.html" class="nav-link ${paginaActual === 'comparar.html' ? 'active' : ''}">Comparar</a></li>
      `;
    } else {
      navContainer.innerHTML = `
        <li><a href="${prefixPages}buscar.html" class="nav-link ${paginaActual === 'buscar.html' ? 'active' : ''}">Inicio</a></li>
        <li><a href="${prefixPages}buscar.html" class="nav-link">Buscar</a></li>
        <li><a href="${prefixPages}como-funciona.html" class="nav-link ${paginaActual === 'como-funciona.html' ? 'active' : ''}">Cómo funciona</a></li>
        <li><a href="${prefixPages}comparar.html" class="nav-link ${paginaActual === 'comparar.html' ? 'active' : ''}">Comparar</a></li>
      `;
    }
  }

  if (rightContainer) {
    if (usuario) {
      const rolTexto = esPropietario ? "Propietario" : "Estudiante";
      rightContainer.innerHTML = `
        <span class="user-role-badge">${rolTexto}</span>
        <a href="${prefixRoot}index.html" class="btn-logout-pill" onclick="RoumixStorage.cerrarSesion(); return false;">Cerrar sesión</a>
      `;
      rightContainer.querySelector(".user-role-badge").title = usuario.nombre;
    } else {
      rightContainer.innerHTML = `
        <a href="${prefixRoot}index.html" class="btn-logout-pill">Iniciar sesión</a>
      `;
    }
  }

  // Los enlaces "Cerrar sesión" fijos del HTML (pie de página) también cierran la sesión real
  document.querySelectorAll('a.footer-link, a#btn-logout').forEach((enlace) => {
    if (enlace.textContent.trim() !== "Cerrar sesión") return;
    if (!usuario) {
      enlace.textContent = "Iniciar sesión";
      return;
    }
    enlace.addEventListener("click", (e) => {
      e.preventDefault();
      RoumixStorage.cerrarSesion();
    });
  });
}

// 6. Protección de páginas privadas
// Uso: await protegerPagina(["propietario"]). Redirige si no hay sesión o el rol no corresponde.
// Además confirma la sesión y el rol con el servidor (la fuente de verdad).
async function protegerPagina(rolesPermitidos) {
  const enCarpetaPages = window.location.pathname.includes("/pages/");
  const prefixRoot = enCarpetaPages ? "../" : "";
  const paginaActual = window.location.pathname.split("/").pop();

  // La página no se muestra hasta confirmar el acceso
  document.body.style.visibility = "hidden";

  if (!RoumixStorage.getToken()) {
    window.location.replace(`${prefixRoot}index.html?redirigir=${encodeURIComponent(paginaActual)}`);
    return null;
  }

  let usuario;
  try {
    usuario = await RoumixAPI.getPerfil();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      RoumixStorage.limpiarSesion();
      window.location.replace(`${prefixRoot}index.html?redirigir=${encodeURIComponent(paginaActual)}`);
      return null;
    }
    document.body.style.visibility = "";
    alert(`No se pudo verificar tu sesión: ${error.message}`);
    return null;
  }

  if (!rolesPermitidos.includes(usuario.rol)) {
    alert("Esta sección es solo para propietarios.");
    window.location.replace(`${enCarpetaPages ? "" : "pages/"}buscar.html`);
    return null;
  }

  sincronizarBarraNavegacion();
  document.body.style.visibility = "";
  return usuario;
}

document.addEventListener("DOMContentLoaded", () => {
  sincronizarBarraNavegacion();

  const btnCerrar = document.getElementById("btn-cerrar-modal");
  if (btnCerrar) {
    btnCerrar.addEventListener("click", cerrarModalContacto);
  }

  const modal = document.getElementById("modal-contacto");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) cerrarModalContacto();
    });
  }
});
