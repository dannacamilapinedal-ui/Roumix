/**
 * ==========================================================================
 * ROUMIX - JAVASCRIPT GLOBAL & MODULAR
 * Control de roles (Estudiante / Propietario), LocalStorage y Navegación
 * ==========================================================================
 */

// 1. Los inmuebles se consultan siempre a la API (ver js/api.js); aquí no hay datos de ejemplo.

// 2. Sesión del usuario en el navegador (temporal hasta integrar Supabase Auth)
const RoumixStorage = {
  getUsuario: function() {
    try {
      const u = localStorage.getItem("roumix_usuario");
      return u ? JSON.parse(u) : { rol: "estudiante", nombre: "Estudiante" };
    } catch (e) {
      return { rol: "estudiante", nombre: "Estudiante" };
    }
  },

  setUsuario: function(usuario) {
    localStorage.setItem("roumix_usuario", JSON.stringify(usuario));
  },

  // Token de sesión de Supabase Auth que se envía al backend
  getToken: function() {
    try {
      return localStorage.getItem("roumix_token");
    } catch (e) {
      return null;
    }
  },

  cerrarSesion: function() {
    localStorage.removeItem("roumix_usuario");
    localStorage.removeItem("roumix_token");
    localStorage.removeItem("roumix_inmuebles"); // copia local antigua, ya no se usa
    const enCarpetaPages = window.location.pathname.includes("/pages/");
    window.location.href = enCarpetaPages ? "../index.html" : "index.html";
  }
};

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
    const rolTexto = esPropietario ? "Propietario" : "Estudiante";
    rightContainer.innerHTML = `
      <span class="user-role-badge">${rolTexto}</span>
      <a href="${prefixRoot}index.html" class="btn-logout-pill" onclick="RoumixStorage.cerrarSesion(); return false;">Cerrar sesión</a>
    `;
  }
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
