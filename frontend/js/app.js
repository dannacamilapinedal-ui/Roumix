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

// 2.0 Selección del comparador.
// Solo se guardan los IDs (no copias de los datos): comparar.html consulta la información
// actual a la API. localStorage aquí solo recuerda la selección entre páginas.
const RoumixComparador = {
  MAX: 3,
  CLAVE: "roumix_comparar",

  getIds: function() {
    try {
      const ids = JSON.parse(localStorage.getItem(this.CLAVE) || "[]");
      return Array.isArray(ids) ? ids.filter(id => Number.isInteger(id) && id > 0).slice(0, this.MAX) : [];
    } catch (e) {
      return [];
    }
  },

  _guardar: function(ids) {
    try {
      localStorage.setItem(this.CLAVE, JSON.stringify(ids));
    } catch (e) {
      console.warn("No se pudo guardar la selección para comparar", e);
    }
    actualizarBotonComparar();
  },

  contiene: function(id) {
    return this.getIds().includes(Number(id));
  },

  // Devuelve { ok, mensaje }
  agregar: function(id) {
    const ids = this.getIds();
    id = Number(id);
    if (ids.includes(id)) return { ok: true };
    if (ids.length >= this.MAX) {
      return { ok: false, mensaje: `Puedes comparar máximo ${this.MAX} inmuebles. Quita uno para agregar otro.` };
    }
    this._guardar([...ids, id]);
    return { ok: true };
  },

  quitar: function(id) {
    this._guardar(this.getIds().filter(i => i !== Number(id)));
  },

  // Conserva solo los IDs indicados (p. ej. los que siguen disponibles)
  conservar: function(idsValidos) {
    this._guardar(this.getIds().filter(i => idsValidos.includes(i)));
  },

  limpiar: function() {
    this._guardar([]);
  }
};

// Muestra en el botón "Comparar" cuántos inmuebles hay seleccionados
function actualizarBotonComparar() {
  const boton = document.getElementById("btn-abrir-comparador");
  if (!boton) return;
  const n = RoumixComparador.getIds().length;
  const texto = n ? `Comparar (${n}/${RoumixComparador.MAX}) →` : "Comparar opciones →";
  // Pequeña animación cuando cambia la cantidad seleccionada
  if (boton.dataset.rxCantidad !== undefined && boton.dataset.rxCantidad !== String(n)) {
    boton.classList.remove("rx-bump");
    void boton.offsetWidth;
    boton.classList.add("rx-bump");
  }
  boton.dataset.rxCantidad = String(n);
  boton.textContent = texto;
}

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
    // Un solo enlace "Buscar" (antes "Inicio" y "Buscar" llevaban al mismo lugar)
    const enlace = (pagina, texto) =>
      `<li><a href="${prefixPages}${pagina}" class="nav-link ${paginaActual === pagina ? 'active' : ''}"${paginaActual === pagina ? ' aria-current="page"' : ''}>${texto}</a></li>`;
    const enlaces = [enlace("buscar.html", "Buscar"), enlace("comparar.html", "Comparar")];
    if (esPropietario) {
      enlaces.push(enlace("publicar.html", "Publicar"), enlace("mis-publicaciones.html", "Mis publicaciones"));
    }
    if (usuario && usuario.rol === "admin") enlaces.push(enlace("admin.html", "Administración"));
    enlaces.push(enlace("como-funciona.html", "Cómo funciona"));
    navContainer.innerHTML = enlaces.join("");
  }

  if (rightContainer) {
    if (usuario) {
      const rolTexto = { propietario: "Propietario", admin: "Administración" }[usuario.rol] || "Estudiante";
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

// 5.1 Insignias de confianza. Cada una corresponde a una comprobación real:
//  - "Correo confirmado": Supabase Auth verificó que el propietario accede a su correo.
//  - "Revisada por Roumix": un administrador revisó la publicación y registró qué comprobó.
// No existe insignia de teléfono verificado porque Roumix aún no comprueba teléfonos.
function insigniasConfianza(item, prefijoPaginas) {
  const prefijo = prefijoPaginas ?? "";
  const insignias = [];
  if (item.propietario_correo_confirmado) {
    insignias.push(`<a class="insignia insignia-correo" href="${prefijo}como-funciona.html#insignias" title="El propietario confirmó su correo. No demuestra que sea el dueño del inmueble.">✉ Correo confirmado</a>`);
  }
  if (item.revisado_en) {
    const fecha = new Date(item.revisado_en).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
    insignias.push(`<a class="insignia insignia-revisada" href="${prefijo}como-funciona.html#insignias" title="Revisada por Roumix el ${fecha}: ${escaparHTML(item.revision_alcance || "")}">✓ Revisada por Roumix</a>`);
  }
  return insignias.join("");
}

// 5.2 Reportar una publicación: modal accesible creado bajo demanda
const MOTIVOS_REPORTE = [
  ["fraude", "Posible fraude o estafa"],
  ["informacion_falsa", "Información falsa o engañosa"],
  ["fotos_no_corresponden", "Las fotos no corresponden al inmueble"],
  ["precio_enganoso", "Precio engañoso"],
  ["contenido_inapropiado", "Contenido inapropiado"],
  ["otro", "Otro motivo"]
];

function puedeReportar(item) {
  const usuario = RoumixStorage.getUsuario();
  // Visitantes ven el botón (se les pide iniciar sesión); el dueño y los administradores no
  return !usuario || (usuario.rol !== "admin" && usuario.id !== item.propietario_id);
}

function abrirModalReporte(id, titulo) {
  const enCarpetaPages = window.location.pathname.includes("/pages/");
  if (!RoumixStorage.getToken()) {
    const pagina = window.location.pathname.split("/").pop() + window.location.search;
    if (confirm("Para reportar una publicación debes iniciar sesión. ¿Ir a iniciar sesión?")) {
      window.location.href = `${enCarpetaPages ? "../" : ""}index.html?redirigir=${encodeURIComponent(pagina.split("?")[0])}`;
    }
    return;
  }

  let dialogo = document.getElementById("modal-reporte");
  if (!dialogo) {
    dialogo = document.createElement("dialog");
    dialogo.id = "modal-reporte";
    dialogo.className = "modal-reporte";
    dialogo.setAttribute("aria-labelledby", "reporte-titulo");
    dialogo.innerHTML = `
      <form method="dialog" class="reporte-form" novalidate>
        <h2 id="reporte-titulo">Reportar publicación</h2>
        <p class="reporte-inmueble"></p>
        <p class="reporte-ayuda">Cuéntanos qué está mal. El equipo de Roumix revisará el caso: reportar
          <strong>no elimina</strong> la publicación ni la marca como falsa. Tu identidad no se mostrará al propietario.</p>
        <fieldset>
          <legend>Motivo</legend>
          ${MOTIVOS_REPORTE.map(([valor, texto]) => `
            <label class="reporte-opcion"><input type="radio" name="motivo" value="${valor}"> ${texto}</label>`).join("")}
        </fieldset>
        <label for="reporte-descripcion" class="reporte-label">Explicación <span>(opcional, obligatoria si eliges "Otro")</span></label>
        <textarea id="reporte-descripcion" maxlength="1000" rows="4" placeholder="Ej: las fotos aparecen en otro anuncio con otra dirección."></textarea>
        <p class="reporte-mensaje" role="alert" hidden></p>
        <div class="reporte-acciones">
          <button type="button" class="btn-card-action" data-cerrar>Cancelar</button>
          <button type="submit" class="btn-search-action" data-enviar>Enviar reporte</button>
        </div>
      </form>`;
    document.body.appendChild(dialogo);
    dialogo.querySelector("[data-cerrar]").addEventListener("click", () => dialogo.close());
    dialogo.addEventListener("click", (e) => { if (e.target === dialogo) dialogo.close(); });
  }

  const form = dialogo.querySelector("form");
  const mensaje = dialogo.querySelector(".reporte-mensaje");
  const botonEnviar = dialogo.querySelector("[data-enviar]");
  form.reset();
  mensaje.hidden = true;
  botonEnviar.disabled = false;
  botonEnviar.hidden = false;
  form.querySelector("fieldset").disabled = false;
  dialogo.querySelector(".reporte-inmueble").textContent = titulo || "";

  form.onsubmit = async (e) => {
    e.preventDefault();
    const motivo = (form.querySelector('input[name="motivo"]:checked') || {}).value;
    const descripcion = dialogo.querySelector("#reporte-descripcion").value.trim();
    const mostrar = (texto, tipo) => {
      mensaje.textContent = texto;
      mensaje.className = `reporte-mensaje pub-mensaje ${tipo === "exito" ? "pub-mensaje-exito" : "pub-mensaje-error"}`;
      mensaje.hidden = false;
    };
    if (!motivo) return mostrar("Elige un motivo.", "error");
    if (motivo === "otro" && descripcion.length < 10) return mostrar('Explica brevemente el problema (mínimo 10 caracteres).', "error");

    botonEnviar.disabled = true;
    try {
      const respuesta = await RoumixAPI.reportarInmueble(id, motivo, descripcion);
      mostrar(respuesta, "exito");
      botonEnviar.hidden = true;
      form.querySelector("fieldset").disabled = true;
      dialogo.querySelector("[data-cerrar]").textContent = "Cerrar";
    } catch (error) {
      mostrar(error.message, "error");
      botonEnviar.disabled = false;
    }
  };

  dialogo.querySelector("[data-cerrar]").textContent = "Cancelar";
  dialogo.showModal();
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
    alert(rolesPermitidos.includes("admin") ? "Esta sección es solo para el equipo de Roumix." : "Esta sección es solo para propietarios.");
    window.location.replace(`${enCarpetaPages ? "" : "pages/"}buscar.html`);
    return null;
  }

  sincronizarBarraNavegacion();
  document.body.style.visibility = "";
  return usuario;
}

document.addEventListener("DOMContentLoaded", () => {
  sincronizarBarraNavegacion();
  actualizarBotonComparar();

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

// 7. Experiencia visual: pantalla de carga, imágenes, aparición al hacer scroll y skeletons.
// Solo presentación: no cambia datos, rutas ni permisos.
const RoumixUI = {
  reducirMovimiento: window.matchMedia("(prefers-reduced-motion: reduce)").matches,

  // Oculta la pantalla de carga (si llegó a mostrarse) con un desvanecimiento.
  // Las páginas privadas ocultan el contenido mientras verifican la sesión: se espera a que terminen.
  ocultarCarga: function() {
    const html = document.documentElement;
    if (!html.classList.contains("rx-cargando")) return;
    if (document.body && document.body.style.visibility === "hidden") {
      setTimeout(() => this.ocultarCarga(), 150);
      return;
    }
    // Si la página cargó antes de 0,3 s, la pantalla nunca se mostró: se retira sin esperar
    if (!html.classList.contains("rx-mostrar")) {
      html.classList.remove("rx-cargando");
      return;
    }
    html.classList.remove("rx-mostrar");
    setTimeout(() => html.classList.remove("rx-cargando"), 400);
  },

  SELECTOR_IMAGENES: ".card-img, .my-prop-img, .gallery-main-img, .gallery-thumb-img, .compare-thumb-img, " +
    ".foto-item img, .map-popup-card img, .admin-galeria img, .admin-celda-inmueble img",

  // La imagen se muestra con un fundido cuando termina de cargar (las que ya están listas no se tocan)
  prepararImagen: function(img) {
    if (img.dataset.rxImg) return;
    img.dataset.rxImg = "1";
    if (img.complete && img.naturalWidth > 0) return;
    img.classList.add("rx-img-espera");
    const mostrar = () => img.classList.remove("rx-img-espera");
    img.addEventListener("load", mostrar, { once: true });
    img.addEventListener("error", mostrar, { once: true });
    // Respaldo: una imagen lenta (o diferida por "loading=lazy") nunca queda oculta indefinidamente
    setTimeout(mostrar, 5000);
  },

  SELECTOR_REVELAR: ".info-card, .feature-box, .mapa-detalle, .app-footer .footer-col, " +
    ".insignias-explicacion > div, .admin-metrica, .compare-actions-row",

  // Los bloques que están más abajo aparecen suavemente al llegar a ellos
  registrarRevelar: function(raiz) {
    if (!this._observadorScroll) return;
    raiz.querySelectorAll(this.SELECTOR_REVELAR).forEach((el) => {
      if (el.dataset.rxRevelar) return;
      el.dataset.rxRevelar = "1";
      // Lo que ya está en pantalla nunca se oculta
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add("rx-revelar");
      this._observadorScroll.observe(el);
    });
  },

  iniciar: function() {
    if (!this.reducirMovimiento && "IntersectionObserver" in window) {
      this._observadorScroll = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add("rx-visible");
          this._observadorScroll.unobserve(entrada.target);
        });
      }, { rootMargin: "0px 0px -40px 0px", threshold: 0.08 });
    }

    document.querySelectorAll(this.SELECTOR_IMAGENES).forEach((img) => this.prepararImagen(img));
    this.registrarRevelar(document);

    // Contenido que las páginas agregan después (tarjetas, galería, tablas)
    let pendiente = null;
    new MutationObserver((cambios) => {
      cambios.forEach((cambio) => cambio.addedNodes.forEach((nodo) => {
        if (nodo.nodeType !== 1) return;
        if (nodo.matches(this.SELECTOR_IMAGENES)) this.prepararImagen(nodo);
        nodo.querySelectorAll(this.SELECTOR_IMAGENES).forEach((img) => this.prepararImagen(img));
      }));
      clearTimeout(pendiente);
      pendiente = setTimeout(() => this.registrarRevelar(document), 50);
    }).observe(document.body, { childList: true, subtree: true });

    // Pantalla de carga: se retira cuando la página y sus fuentes están listas (máximo 1,2 s)
    const fuentes = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fuentes, new Promise((r) => setTimeout(r, 1200))]).then(() => this.ocultarCarga());
  },

  // Tarjetas de relleno mientras llegan los resultados
  skeletonTarjetas: function(cantidad) {
    const tarjeta = `
      <div class="rx-skeleton-card" aria-hidden="true">
        <div class="rx-skeleton rx-skeleton-img"></div>
        <div class="rx-skeleton-lineas">
          <div class="rx-skeleton rx-skeleton-linea ancha"></div>
          <div class="rx-skeleton rx-skeleton-linea media"></div>
          <div class="rx-skeleton rx-skeleton-linea corta"></div>
          <div class="rx-skeleton rx-skeleton-linea media"></div>
        </div>
      </div>`;
    return `<div class="sr-only" role="status">Cargando…</div>${tarjeta.repeat(cantidad)}`;
  }
};

document.addEventListener("DOMContentLoaded", () => RoumixUI.iniciar());

// Al volver con "Atrás", la página puede venir de la caché del navegador: sin pantalla de carga
window.addEventListener("pageshow", (e) => {
  if (e.persisted) document.documentElement.classList.remove("rx-mostrar", "rx-cargando");
});
