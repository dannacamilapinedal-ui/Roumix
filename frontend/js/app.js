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

  const cuerpo = modal.querySelector(".modal-body");
  if (!cuerpo) return;

  const propietario = inmueble.propietario || {};
  const telefono = String(propietario.telefono || "").replace(/\D/g, "");
  const primerNombre = String(propietario.nombre || "").trim().split(/\s+/)[0];
  const saludo = primerNombre && primerNombre !== "Usuario" ? `Hola ${primerNombre}` : "Hola";
  const precio = inmueble.precioFormato || formatearPrecioCOP(inmueble.precio);
  // Los asteriscos marcan negrita en WhatsApp: se quitan del título para no romper el formato
  const titulo = String(inmueble.titulo || "").replace(/\*/g, "");
  const usuario = RoumixStorage.getUsuario();
  const firma = usuario && usuario.nombre ? `\n\nSoy ${String(usuario.nombre).trim().split(/\s+/)[0]}, estudiante. ¡Gracias!` : "\n\n¡Gracias!";
  const referencia = `Vi tu publicación en Roumix:\n*${titulo}*\n${inmueble.barrio} · ${precio}/mes`;

  const plantillas = {
    disponibilidad: { etiqueta: "¿Está disponible?", texto: `${saludo} 👋\n\n${referencia}\n\n¿Todavía está disponible?${firma}` },
    visita: { etiqueta: "Agendar visita", texto: `${saludo} 👋\n\n${referencia}\n\nMe gustaría conocerlo. ¿Qué día y hora te queda bien para una visita?${firma}` },
    detalles: { etiqueta: "Qué incluye", texto: `${saludo} 👋\n\n${referencia}\n\n¿Me cuentas qué incluye el arriendo (servicios, internet) y cuál es el depósito?${firma}` }
  };

  const imagen = inmueble.imagen || (inmueble.galeria && inmueble.galeria[0]) || "";
  const iniciales = propietario.iniciales || "R";

  cuerpo.innerHTML = `
    <div class="contacto-cabecera">
      <span class="contacto-sello">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.7 15.6 2.2 13.8 2.2 12 2.2 6.6 6.6 2.2 12 2.2S21.8 6.6 21.8 12 17.4 21.8 12 21.8zM12 .2C5.5.2.2 5.5.2 12c0 2.1.5 4.1 1.6 5.9L.1 24l6.3-1.6c1.7.9 3.7 1.4 5.6 1.4 6.5 0 11.8-5.3 11.8-11.8S18.5.2 12 .2z"/></svg>
        Contacto directo por WhatsApp
      </span>
      <h3 id="modal-contact-title" class="modal-title">Escríbele al arrendador</h3>
    </div>

    <div class="contacto-inmueble">
      ${imagen ? `<img src="${escaparHTML(imagen)}" alt="" class="contacto-inmueble-foto" loading="lazy">` : ""}
      <div class="contacto-inmueble-datos">
        <strong>${escaparHTML(inmueble.titulo)}</strong>
        <span>${escaparHTML(inmueble.barrio || "Villavicencio")} · ${escaparHTML(inmueble.tipoLabel || "Inmueble")}</span>
        <span class="contacto-precio">${escaparHTML(precio)}<small>/mes</small></span>
      </div>
    </div>

    <div class="contacto-dueno">
      <span class="contacto-avatar" aria-hidden="true">${escaparHTML(iniciales)}</span>
      <div>
        <strong>${escaparHTML(propietario.nombre || "Usuario de Roumix")}</strong>
        <span>Propietario · Villavicencio, Meta</span>
      </div>
    </div>

    ${telefono ? `
      <p class="contacto-paso">¿Qué quieres preguntar?</p>
      <div class="contacto-chips" role="radiogroup" aria-label="Tipo de mensaje">
        ${Object.entries(plantillas).map(([clave, p], i) => `
          <button type="button" class="contacto-chip${i === 0 ? " activo" : ""}" role="radio" aria-checked="${i === 0}" data-plantilla="${clave}">${p.etiqueta}</button>`).join("")}
      </div>

      <div class="contacto-burbuja-wrap">
        <label for="modal-mensaje-wa" class="contacto-paso">Tu mensaje <span>· puedes editarlo</span></label>
        <div class="contacto-burbuja">
          <textarea id="modal-mensaje-wa" rows="7" maxlength="600"></textarea>
          <span class="contacto-contador" id="contacto-contador"></span>
        </div>
      </div>

      <a id="modal-btn-whatsapp" href="#" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-action">
        <svg class="svg-icon-wa" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2.1-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.7 15.6 2.2 13.8 2.2 12 2.2 6.6 6.6 2.2 12 2.2S21.8 6.6 21.8 12 17.4 21.8 12 21.8zM12 .2C5.5.2.2 5.5.2 12c0 2.1.5 4.1 1.6 5.9L.1 24l6.3-1.6c1.7.9 3.7 1.4 5.6 1.4 6.5 0 11.8-5.3 11.8-11.8S18.5.2 12 .2z"/></svg>
        Enviar por WhatsApp
      </a>
      <p class="contacto-nota">Se abrirá WhatsApp con este mensaje listo. Nunca pagues ni envíes dinero antes de visitar el inmueble.</p>
    ` : `
      <div class="contacto-sin-telefono">
        <strong>Este arrendador aún no registró un número de WhatsApp.</strong>
        <span>Vuelve más tarde o explora otras opciones parecidas.</span>
      </div>
    `}
  `;

  if (telefono) {
    const areaMensaje = cuerpo.querySelector("#modal-mensaje-wa");
    const botonWa = cuerpo.querySelector("#modal-btn-whatsapp");
    const contador = cuerpo.querySelector("#contacto-contador");

    // El enlace siempre lleva lo que el estudiante ve (y editó) en el cuadro
    const actualizarEnlace = () => {
      botonWa.href = `https://wa.me/${telefono}?text=${encodeURIComponent(areaMensaje.value.trim())}`;
      contador.textContent = `${areaMensaje.value.length}/600`;
      // La burbuja crece con el texto, como en un chat
      areaMensaje.style.height = "auto";
      areaMensaje.style.height = `${areaMensaje.scrollHeight}px`;
    };

    cuerpo.querySelectorAll(".contacto-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        cuerpo.querySelectorAll(".contacto-chip").forEach((c) => {
          c.classList.toggle("activo", c === chip);
          c.setAttribute("aria-checked", String(c === chip));
        });
        areaMensaje.value = plantillas[chip.dataset.plantilla].texto;
        actualizarEnlace();
      });
    });

    areaMensaje.value = plantillas.disponibilidad.texto;
    areaMensaje.addEventListener("input", actualizarEnlace);
    actualizarEnlace();
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  // La altura del mensaje solo se puede medir cuando la ventana ya es visible
  const areaVisible = cuerpo.querySelector("#modal-mensaje-wa");
  if (areaVisible) {
    areaVisible.style.height = "auto";
    areaVisible.style.height = `${areaVisible.scrollHeight}px`;
  }
  const cerrar = document.getElementById("btn-cerrar-modal");
  if (cerrar) cerrar.focus({ preventScroll: true });
}

function cerrarModalContacto() {
  const modal = document.getElementById("modal-contacto");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

// Escape cierra la ventana de contacto
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarModalContacto();
});

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

  // En celular el menú se pliega detrás de un botón (☰) para no desbordar la pantalla
  const headerInner = header.querySelector(".header-inner");
  if (navContainer && headerInner && !header.querySelector(".nav-toggle")) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.setAttribute("aria-label", "Abrir menú");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<span></span><span></span><span></span>';
    headerInner.insertBefore(toggle, headerInner.querySelector(".main-nav"));

    const cerrarMenu = () => {
      header.classList.remove("menu-abierto");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir menú");
    };
    toggle.addEventListener("click", () => {
      const abierto = header.classList.toggle("menu-abierto");
      toggle.setAttribute("aria-expanded", String(abierto));
      toggle.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenu(); });
    document.addEventListener("click", (e) => { if (!header.contains(e.target)) cerrarMenu(); });
    window.matchMedia("(min-width: 769px)").addEventListener("change", cerrarMenu);
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
    RoumixAvisos.mostrar(`No se pudo verificar tu sesión: ${error.message}`, "error", 5000);
    return null;
  }

  if (!rolesPermitidos.includes(usuario.rol)) {
    document.body.style.visibility = "";
    RoumixAvisos.mostrar(rolesPermitidos.includes("admin") ? "Esta sección es solo para el equipo de Roumix." : "Esta sección es solo para propietarios.", "error");
    setTimeout(() => window.location.replace(`${enCarpetaPages ? "" : "pages/"}buscar.html`), 1600);
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

// 8. Avisos flotantes (toasts): reemplazan los alert() del navegador.
// Uso: RoumixAvisos.mostrar("Texto", "exito" | "error" | "info")
const RoumixAvisos = {
  _zona: null,

  _obtenerZona() {
    if (this._zona && document.body.contains(this._zona)) return this._zona;
    this._zona = document.createElement("div");
    this._zona.className = "rx-avisos";
    this._zona.setAttribute("role", "status");
    this._zona.setAttribute("aria-live", "polite");
    document.body.appendChild(this._zona);
    return this._zona;
  },

  mostrar(texto, tipo = "info", duracion = 3200) {
    const iconos = { exito: "✓", error: "!", info: "i" };
    const aviso = document.createElement("div");
    aviso.className = `rx-aviso rx-aviso-${tipo}`;
    aviso.innerHTML = `<span class="rx-aviso-icono" aria-hidden="true">${iconos[tipo] || "i"}</span><span class="rx-aviso-texto"></span>`;
    aviso.querySelector(".rx-aviso-texto").textContent = texto;
    this._obtenerZona().appendChild(aviso);

    const cerrar = () => {
      aviso.classList.add("rx-aviso-saliendo");
      setTimeout(() => aviso.remove(), 260);
    };
    const temporizador = setTimeout(cerrar, duracion);
    aviso.addEventListener("click", () => { clearTimeout(temporizador); cerrar(); });
  }
};

// 9. Inmuebles guardados con ❤ (solo en este navegador; no se envían al servidor)
const RoumixGuardados = {
  CLAVE: "roumix_guardados",

  lista() {
    try {
      const ids = JSON.parse(localStorage.getItem(this.CLAVE) || "[]");
      return Array.isArray(ids) ? ids.map(Number) : [];
    } catch (e) {
      return [];
    }
  },

  contiene(id) {
    return this.lista().includes(Number(id));
  },

  // Devuelve true si quedó guardado, false si se quitó
  alternar(id) {
    const ids = this.lista();
    const posicion = ids.indexOf(Number(id));
    if (posicion >= 0) ids.splice(posicion, 1);
    else ids.push(Number(id));
    try { localStorage.setItem(this.CLAVE, JSON.stringify(ids)); } catch (e) { /* almacenamiento bloqueado */ }
    return posicion < 0;
  }
};

// Botón ❤ que va sobre la foto de cada tarjeta
function botonGuardar(item) {
  const guardado = RoumixGuardados.contiene(item.id);
  return `
    <button type="button" class="btn-guardar-corazon${guardado ? " guardado" : ""}" data-guardar="${item.id}"
            aria-pressed="${guardado}" aria-label="${guardado ? "Quitar de guardados" : "Guardar inmueble"}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.4C1 8.3 3.1 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3 3.8 0 5.9 3.8 4.5 7.1C19.5 16.4 12 21 12 21z"/></svg>
    </button>`;
}

// Alterna el ❤ con animación y aviso. Devuelve el nuevo estado.
function alternarGuardado(boton) {
  const guardado = RoumixGuardados.alternar(boton.dataset.guardar);
  boton.classList.toggle("guardado", guardado);
  boton.setAttribute("aria-pressed", String(guardado));
  boton.setAttribute("aria-label", guardado ? "Quitar de guardados" : "Guardar inmueble");
  boton.classList.remove("rx-latido");
  void boton.offsetWidth; // reinicia la animación
  if (guardado) boton.classList.add("rx-latido");
  RoumixAvisos.mostrar(guardado ? "Guardado en tus favoritos" : "Quitado de tus favoritos", guardado ? "exito" : "info", 2200);
  return guardado;
}

// 10. Píldora que se desliza hasta la opción activa de un grupo de botones
function activarPildoraDeslizante(contenedor, selectorActivo = ".active") {
  if (!contenedor) return () => {};
  contenedor.classList.add("rx-pildoras");
  let indicador = contenedor.querySelector(".rx-pildora-indicador");
  if (!indicador) {
    indicador = document.createElement("span");
    indicador.className = "rx-pildora-indicador";
    indicador.setAttribute("aria-hidden", "true");
    contenedor.prepend(indicador);
  }

  const mover = (animar = true) => {
    const activo = contenedor.querySelector(selectorActivo);
    if (!activo) { indicador.style.opacity = "0"; return; }
    if (!animar) indicador.style.transition = "none";
    indicador.style.opacity = "1";
    indicador.style.width = `${activo.offsetWidth}px`;
    indicador.style.height = `${activo.offsetHeight}px`;
    indicador.style.transform = `translate(${activo.offsetLeft}px, ${activo.offsetTop}px)`;
    if (!animar) requestAnimationFrame(() => { indicador.style.transition = ""; });
  };

  mover(false);
  if ("ResizeObserver" in window) new ResizeObserver(() => mover(false)).observe(contenedor);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => mover(false));
  return mover;
}

// 11. Confeti breve para celebrar (no se muestra si el usuario prefiere menos movimiento)
function lanzarConfeti(origen) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const caja = origen ? origen.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x = caja.left + caja.width / 2;
  const y = caja.top + caja.height / 2;
  const colores = ["#c47c2b", "#25d366", "#d6ebd3", "#315c44", "#f5f0e6", "#e8a95b"];
  const capa = document.createElement("div");
  capa.className = "rx-confeti";
  capa.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 42; i++) {
    const pieza = document.createElement("i");
    const angulo = Math.random() * Math.PI * 2;
    const distancia = 70 + Math.random() * 140;
    pieza.style.left = `${x}px`;
    pieza.style.top = `${y}px`;
    pieza.style.background = colores[i % colores.length];
    pieza.style.setProperty("--dx", `${Math.cos(angulo) * distancia}px`);
    pieza.style.setProperty("--dy", `${Math.sin(angulo) * distancia - 60}px`);
    pieza.style.setProperty("--giro", `${Math.random() * 720 - 360}deg`);
    pieza.style.animationDelay = `${Math.random() * 80}ms`;
    capa.appendChild(pieza);
  }
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 1400);
}

// 12. Números que cuentan desde 0 hasta su valor (cifras de la portada)
function animarNumero(elemento, valorFinal, duracion = 900) {
  if (!elemento) return;
  const final = Number(valorFinal);
  if (!Number.isFinite(final) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elemento.textContent = String(valorFinal);
    return;
  }
  const inicio = performance.now();
  const paso = (ahora) => {
    const avance = Math.min(1, (ahora - inicio) / duracion);
    const suavizado = 1 - Math.pow(1 - avance, 3); // frena al final
    elemento.textContent = String(Math.round(final * suavizado));
    if (avance < 1) requestAnimationFrame(paso);
    else elemento.textContent = String(final);
  };
  requestAnimationFrame(paso);
  // Respaldo: si la pestaña no dibuja (segundo plano), el valor final queda igual
  setTimeout(() => { elemento.textContent = String(final); }, duracion + 300);
}

// 13. Ilustraciones para estados vacíos (SVG con los colores de Roumix)
function ilustracionVacia(tipo) {
  const casa = `
    <path d="M38 66 L60 48 L82 66 V92 H38 Z" fill="var(--rx-ilu-casa)" stroke="var(--rx-ilu-trazo)" stroke-width="3" stroke-linejoin="round"/>
    <rect x="53" y="74" width="14" height="18" rx="2" fill="var(--rx-ilu-trazo)"/>
    <path d="M34 68 L60 46 L86 68" fill="none" stroke="var(--rx-ilu-trazo)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const extras = {
    buscar: `
      <circle cx="86" cy="82" r="15" fill="var(--rx-ilu-fondo)" stroke="var(--acento-naranja)" stroke-width="5"/>
      <path d="M97 93 L108 104" stroke="var(--acento-naranja)" stroke-width="6" stroke-linecap="round"/>`,
    guardados: `
      <path d="M88 104s-15-9-19-18c-3-7 1-14 8-14 4 0 7 2 11 6 4-4 7-6 11-6 7 0 11 7 8 14-4 9-19 18-19 18z" fill="#e0475b" stroke="var(--rx-ilu-fondo)" stroke-width="3"/>`,
    publicar: `
      <circle cx="88" cy="88" r="15" fill="var(--acento-naranja)" stroke="var(--rx-ilu-fondo)" stroke-width="3"/>
      <path d="M88 81 V95 M81 88 H95" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    comparar: `
      <rect x="74" y="72" width="30" height="34" rx="6" fill="var(--rx-ilu-fondo)" stroke="var(--acento-naranja)" stroke-width="4"/>
      <path d="M81 84 H97 M81 93 H92" stroke="var(--acento-naranja)" stroke-width="4" stroke-linecap="round"/>`,
    error: `
      <circle cx="88" cy="88" r="15" fill="#c0392b" stroke="var(--rx-ilu-fondo)" stroke-width="3"/>
      <path d="M88 80 V90" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <circle cx="88" cy="96" r="2.4" fill="#fff"/>`
  };
  return `
    <svg class="rx-vacio-ilustracion" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--rx-ilu-circulo)"/>
      <circle cx="26" cy="34" r="4" fill="var(--acento-naranja)" opacity="0.5"/>
      <circle cx="96" cy="28" r="3" fill="var(--rx-ilu-trazo)" opacity="0.35"/>
      ${casa}
      ${extras[tipo] || ""}
    </svg>`;
}

// 14. Tema claro / oscuro con un botón (☾ / ☀). Por defecto, claro.
// La elección se recuerda en este navegador. Un script pequeño en <head> la aplica
// antes de dibujar la página para que no parpadee.
const RoumixTema = {
  CLAVE: "roumix_tema",

  actual() {
    return document.documentElement.dataset.tema === "oscuro" ? "oscuro" : "claro";
  },

  aplicar(tema, animar) {
    const raiz = document.documentElement;
    if (animar && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raiz.classList.add("rx-cambiando-tema");
      setTimeout(() => raiz.classList.remove("rx-cambiando-tema"), 400);
    }
    if (tema === "oscuro") raiz.dataset.tema = "oscuro";
    else delete raiz.dataset.tema;
    try { localStorage.setItem(this.CLAVE, tema); } catch (e) { /* almacenamiento bloqueado */ }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", tema === "oscuro" ? "#0b0b0b" : "#142219");

    document.querySelectorAll(".rx-tema-toggle").forEach((boton) => {
      const oscuro = tema === "oscuro";
      boton.setAttribute("aria-pressed", String(oscuro));
      boton.setAttribute("aria-label", oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
      boton.title = oscuro ? "Modo claro" : "Modo oscuro";
    });
  },

  instalar() {
    const contenedor = document.querySelector(".main-header .header-inner");
    if (!contenedor || contenedor.querySelector(".rx-tema-toggle")) return;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "rx-tema-toggle";
    boton.innerHTML = `
      <svg class="icono-luna" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <svg class="icono-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>`;
    boton.addEventListener("click", () => {
      this.aplicar(this.actual() === "oscuro" ? "claro" : "oscuro", true);
    });
    // Computador: junto a "Cerrar sesión". Celular: al lado del ☰ (fuera del menú plegable)
    const derecha = contenedor.querySelector(".header-right");
    const esCelular = window.matchMedia("(max-width: 768px)");
    const ubicar = () => {
      if (derecha && !esCelular.matches) {
        derecha.appendChild(boton);
      } else {
        contenedor.insertBefore(boton, contenedor.querySelector(".nav-toggle") || null);
      }
    };
    ubicar();
    esCelular.addEventListener("change", ubicar);
    this.aplicar(this.actual(), false);
  }
};

document.addEventListener("DOMContentLoaded", () => RoumixTema.instalar());
