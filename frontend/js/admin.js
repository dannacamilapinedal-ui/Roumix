/**
 * ============================================================================
 * ROUMIX - PANEL DE ADMINISTRACIÓN (admin.html)
 * La interfaz solo organiza la información: cada permiso lo valida el servidor.
 * ============================================================================
 */

const ETIQUETAS = {
  motivo: {
    fraude: "Posible fraude", informacion_falsa: "Información falsa", fotos_no_corresponden: "Fotos no corresponden",
    precio_enganoso: "Precio engañoso", contenido_inapropiado: "Contenido inapropiado", otro: "Otro"
  },
  verificacion: {
    incompleto: "Perfil incompleto", pendiente: "Por revisar", requiere_informacion: "Requiere información",
    aprobado: "Aprobado", rechazado: "Rechazado"
  },
  relacion: { propietario: "Propietario", administrador: "Administrador", familiar: "Familiar", otro: "Otra" },
  moderacion: {
    aprobada: "Aprobada", en_revision: "En revisión", requiere_cambios: "Requiere cambios",
    rechazada: "Rechazada", retirada: "Retirada"
  },
  reporte: { pendiente: "Pendiente", procedente: "Procedente", no_procede: "No procede" },
  solicitud: {
    recibida: "Recibida", en_revision: "En revisión", aceptada: "Aceptada", rechazada: "Rechazada",
    visita_coordinada: "Visita coordinada", en_negociacion: "En negociación", contrato_pendiente: "Contrato pendiente",
    contrato_formalizado: "Contrato formalizado", pago_pendiente: "Pago pendiente", pagado: "Pagado",
    completada: "Completada", cancelada: "Cancelada"
  },
  estado: { disponible: "Disponible", pausado: "Pausado por el propietario", arrendado: "Arrendado", retirado: "Retirado por el propietario" },
  accion: {
    pausa_preventiva: "Pausa preventiva por reporte", aprobar: "Aprobada", pausar: "Pausada por Roumix para revisión",
    retirada_por_propietario: "Retirada por el propietario", solicitar_cambios: "Cambios solicitados",
    rechazar: "Rechazada", retirar: "Retirada", correcciones_enviadas: "Correcciones enviadas por el propietario",
    cuenta_suspendida: "Cuenta suspendida", cuenta_reactivada: "Cuenta reactivada",
    rol_admin_asignado: "Rol de administrador asignado", rol_admin_retirado: "Rol de administrador retirado",
    eliminado_demo: "Publicación de demostración eliminada",
    verificacion_enviada: "Perfil de propietario enviado", verificacion_aprobada: "Propietario aprobado",
    verificacion_info_solicitada: "Información adicional solicitada", verificacion_rechazada: "Propietario rechazado"
  }
};

function fecha(valor) {
  return valor ? new Date(valor).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function chip(texto, tipo) {
  return `<span class="admin-chip admin-chip-${tipo}">${escaparHTML(texto)}</span>`;
}

function mostrarCarga(contenedor) {
  contenedor.innerHTML = '<p class="admin-cargando" role="status">Cargando…</p>';
}

function mostrarError(contenedor, error) {
  contenedor.innerHTML = "";
  const p = document.createElement("p");
  p.className = "pub-mensaje pub-mensaje-error";
  p.setAttribute("role", "alert");
  p.textContent = `No se pudo cargar: ${error.message}`;
  contenedor.appendChild(p);
}

function vacio(contenedor, texto) {
  contenedor.innerHTML = `<p class="admin-vacio">${escaparHTML(texto)}</p>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  // La página solo se muestra si el servidor confirma el rol admin
  if (!(await protegerPagina(["admin"]))) return;

  const paneles = { resumen: cargarResumen, solicitudes: cargarSolicitudes, contratos: cargarContratos, pagos: cargarPagos, mensajes: cargarMensajes, reportes: cargarReportes, propietarios: cargarPropietarios, inmuebles: cargarInmuebles, usuarios: cargarUsuarios, historial: cargarHistorial };

  function abrirPanel(nombre) {
    document.querySelectorAll(".admin-tab").forEach(tab => {
      const activa = tab.dataset.panel === nombre;
      tab.classList.toggle("activa", activa);
      tab.setAttribute("aria-selected", String(activa));
    });
    document.querySelectorAll(".admin-panel").forEach(panel => { panel.hidden = panel.id !== `panel-${nombre}`; });
    paneles[nombre]();
  }
  document.querySelectorAll(".admin-tab").forEach(tab => tab.addEventListener("click", () => abrirPanel(tab.dataset.panel)));

  // ---------------- Resumen ----------------
  async function cargarResumen() {
    const contenedor = document.getElementById("admin-metricas");
    mostrarCarga(contenedor);
    try {
      const { data } = await RoumixAPI.admin("/resumen");
      const contador = document.getElementById("contador-reportes");
      contador.textContent = data.reportes.pendientes;
      contador.hidden = data.reportes.pendientes === 0;
      actualizarContadorPropietarios(data);
      actualizarContadorSolicitudes(data);
      actualizarContadorMensajes(data);
      actualizarContadorContratos(data);
      actualizarContadorPagos(data);
      const metricas = [
        ["Desembolsos por hacer", data.pagos.por_desembolsar, data.pagos.por_desembolsar ? "alerta" : "neutro", "pagos"],
        ["Pagos en disputa", data.pagos.en_disputa, data.pagos.en_disputa ? "alerta" : "neutro", "pagos"],
        ["Comisiones (simuladas)", formatearPrecioCOP(data.pagos.comisiones), "ok", "pagos"],
        ["Contratos por aceptar", data.contratos.por_aceptar, "neutro", "contratos"],
        ["Contratos formalizados", data.contratos.formalizados, "ok", "contratos"],
        ["Mensajes por responder", data.conversaciones.pendientes, data.conversaciones.pendientes ? "alerta" : "neutro", "mensajes"],
        ["Solicitudes nuevas", data.solicitudes.nuevas, data.solicitudes.nuevas ? "alerta" : "neutro", "solicitudes"],
        ["Solicitudes en curso", data.solicitudes.abiertas, "neutro", "solicitudes"],
        ["Propietarios por revisar", data.verificaciones.porRevisar, data.verificaciones.porRevisar ? "alerta" : "neutro", "propietarios"],
        ["Reportes pendientes", data.reportes.pendientes, "alerta", "reportes"],
        ["Publicaciones en revisión", data.inmuebles.enRevision, "alerta", "inmuebles"],
        ["Esperando correcciones", data.inmuebles.requiereCambios, "neutro", "inmuebles"],
        ["Publicaciones visibles", data.inmuebles.visibles, "ok", null],
        ["Publicaciones totales", data.inmuebles.total, "neutro", null],
        ["Usuarios", `${data.usuarios.total}`, "neutro", "usuarios"],
        ["Estudiantes / Propietarios", `${data.usuarios.estudiantes} / ${data.usuarios.propietarios}`, "neutro", "usuarios"],
        ["Cuentas suspendidas", data.usuarios.suspendidos, data.usuarios.suspendidos ? "alerta" : "neutro", "usuarios"],
        ["Propietarios aprobados", data.verificaciones.aprobados, "ok", "propietarios"],
        ["Perfiles incompletos", data.verificaciones.incompletos, "neutro", "propietarios"]
      ];
      contenedor.innerHTML = metricas.map(([titulo, valor, tipo, panel]) => `
        <${panel ? `button type="button" data-ir="${panel}"` : "div"} class="admin-metrica admin-metrica-${tipo}">
          <span class="admin-metrica-valor">${escaparHTML(valor)}</span>
          <span class="admin-metrica-titulo">${titulo}</span>
        </${panel ? "button" : "div"}>`).join("");
      contenedor.querySelectorAll("[data-ir]").forEach(b => b.addEventListener("click", () => abrirPanel(b.dataset.ir)));
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }

  function actualizarContadorPropietarios(data) {
    const contador = document.getElementById("contador-propietarios");
    contador.textContent = data.verificaciones.porRevisar;
    contador.hidden = data.verificaciones.porRevisar === 0;
  }

  function actualizarContadorSolicitudes(data) {
    const contador = document.getElementById("contador-solicitudes");
    contador.textContent = data.solicitudes.nuevas;
    contador.hidden = data.solicitudes.nuevas === 0;
  }

  // ---------------- Solicitudes de arriendo ----------------
  // Roumix es el intermediario: aquí se ven los datos de ambas partes, que nunca
  // se muestran entre ellas.
  const CHIP_SOLICITUD = {
    recibida: "pendiente", en_revision: "en_revision", aceptada: "aprobada", rechazada: "rechazada",
    visita_coordinada: "en_revision", en_negociacion: "en_revision", contrato_pendiente: "en_revision",
    contrato_formalizado: "aprobada", pago_pendiente: "requiere_cambios", pagado: "aprobada",
    completada: "aprobada", cancelada: "neutro"
  };
  const chipSolicitud = (estado) => chip(ETIQUETAS.solicitud[estado] || estado, CHIP_SOLICITUD[estado] || "neutro");
  const fechaDia = (valor) => valor ? new Date(String(valor).slice(0, 10) + "T12:00:00").toLocaleDateString("es-CO", { dateStyle: "medium" }) : "—";

  async function cargarSolicitudes() {
    const contenedor = document.getElementById("lista-solicitudes-admin");
    mostrarCarga(contenedor);
    const params = new URLSearchParams({ estado: document.getElementById("filtro-solicitudes").value });
    const q = document.getElementById("buscar-solicitudes").value.trim();
    if (q) params.set("q", q);
    try {
      const { data } = await RoumixAPI.admin(`/solicitudes?${params}`);
      if (data.length === 0) return vacio(contenedor, "No hay solicitudes con estos filtros.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Solicitud</th><th scope="col">Inmueble</th><th scope="col">Estudiante</th><th scope="col">Propietario</th><th scope="col">Ingreso</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(s => `
            <tr>
              <td><strong>#${s.id}</strong><br><small>${fecha(s.created_at)}</small></td>
              <td>${escaparHTML(s.inmueble_titulo)}<br><small>#${s.inmueble_id} · ${escaparHTML(s.barrio || "—")} · ${formatearPrecioCOP(s.canon_mensual)}</small></td>
              <td>${escaparHTML(s.estudiante_nombre || "Cuenta eliminada")}<br><small>${escaparHTML(s.estudiante_email || "")}</small></td>
              <td>${escaparHTML(s.propietario_nombre || "—")}<br><small>${escaparHTML(s.propietario_telefono || s.propietario_email || "")}</small></td>
              <td>${fechaDia(s.fecha_ingreso)}<br><small>${s.duracion_meses} mes(es) · ${s.personas} pers.</small></td>
              <td>${chipSolicitud(s.estado)}${s.compartida_propietario_en ? "" : "<br><small>Sin compartir al propietario</small>"}</td>
              <td><button type="button" class="btn-card-action" data-solicitud="${s.id}">${s.estado === "recibida" ? "Revisar" : "Gestionar"}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-solicitudes").addEventListener("change", cargarSolicitudes);
  document.getElementById("buscar-solicitudes").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(cargarSolicitudes, 350);
  });

  const dialogoSolicitud = document.getElementById("dialogo-solicitud");
  const contenidoSolicitud = document.getElementById("dialogo-solicitud-contenido");
  dialogoSolicitud.querySelector("[data-cerrar]").addEventListener("click", () => dialogoSolicitud.close());
  document.getElementById("lista-solicitudes-admin").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-solicitud]");
    if (boton) abrirSolicitud(Number(boton.dataset.solicitud));
  });

  async function abrirSolicitud(id) {
    contenidoSolicitud.innerHTML = '<p class="admin-cargando" role="status">Cargando…</p>';
    if (!dialogoSolicitud.open) dialogoSolicitud.showModal();
    let s;
    try {
      ({ data: s } = await RoumixAPI.admin(`/solicitudes/${id}`));
    } catch (error) {
      return mostrarError(contenidoSolicitud, error);
    }
    let contratos = [];
    try {
      ({ data: contratos } = await RoumixAPI.admin(`/solicitudes/${id}/contratos`));
    } catch (e) { /* la sección de contrato muestra el error al usarla */ }
    const compartida = Boolean(s.compartida_propietario_en);
    const cerrada = ["rechazada", "completada", "cancelada"].includes(s.estado);
    const autor = (h) => h.autor_rol === "admin" ? `Roumix · ${escaparHTML(h.autor_nombre || "admin")}` : h.autor_rol === "estudiante" ? "Estudiante" : "Sistema";

    contenidoSolicitud.innerHTML = `
      <h2 id="dialogo-solicitud-titulo">Solicitud #${s.id} · ${escaparHTML(s.inmueble_titulo)}</h2>
      <p>${chipSolicitud(s.estado)} ${compartida ? chip(`Compartida con el propietario el ${fecha(s.compartida_propietario_en)}`, "aprobada") : chip("El propietario aún no la conoce", "pendiente")}</p>
      <div class="admin-detalle-grid">
        <div>
          <h3>Solicitud</h3>
          <dl class="admin-datos">
            <dt>Inmueble</dt><dd><a href="detalle.html?id=${s.inmueble_id}" target="_blank" rel="noopener">#${s.inmueble_id}</a> · ${escaparHTML(s.barrio || "—")} · ${escaparHTML(ETIQUETAS.estado[s.inmueble_estado] || s.inmueble_estado)}</dd>
            <dt>Canon</dt><dd>${formatearPrecioCOP(s.canon_mensual)}/mes</dd>
            <dt>Ingreso</dt><dd>${fechaDia(s.fecha_ingreso)}</dd>
            <dt>Duración</dt><dd>${s.duracion_meses} mes(es)</dd>
            <dt>Personas</dt><dd>${s.personas}${s.capacidad ? ` (capacidad: ${s.capacidad})` : ""}</dd>
            <dt>Mensaje del estudiante</dt><dd class="admin-texto-largo">${escaparHTML(s.mensaje || "—")}</dd>
          </dl>
        </div>
        <div>
          <h3>Partes (solo Roumix)</h3>
          <dl class="admin-datos">
            <dt>Estudiante</dt><dd>${escaparHTML(s.estudiante_nombre || "Cuenta eliminada")}<br><small>${escaparHTML(s.estudiante_email || "")}${s.estudiante_telefono ? " · " + escaparHTML(s.estudiante_telefono) : ""}</small></dd>
            <dt>Propietario</dt><dd>${escaparHTML(s.propietario_nombre || "—")}<br><small>${escaparHTML(s.propietario_email || "")}${s.propietario_telefono ? " · " + escaparHTML(s.propietario_telefono) : ""}</small></dd>
          </dl>
          <p class="fotos-ayuda">No compartas estos datos entre las partes: Roumix coordina toda la comunicación.</p>
        </div>
      </div>

      <h3>Historial</h3>
      <ol class="admin-historial-solicitud">
        ${s.historial.map(h => `
          <li>
            <span class="admin-historial-meta">${fecha(h.created_at)} · ${autor(h)}</span>
            ${h.estado_nuevo ? `<span>${h.estado_anterior ? `${escaparHTML(ETIQUETAS.solicitud[h.estado_anterior])} → ` : ""}<strong>${escaparHTML(ETIQUETAS.solicitud[h.estado_nuevo])}</strong></span>` : ""}
            ${h.nota_estudiante ? `<p><em>Para el estudiante:</em> ${escaparHTML(h.nota_estudiante)}</p>` : ""}
            ${h.nota_propietario ? `<p><em>Para el propietario:</em> ${escaparHTML(h.nota_propietario)}</p>` : ""}
            ${h.nota_interna ? `<p class="admin-nota-interna"><em>Nota interna:</em> ${escaparHTML(h.nota_interna)}</p>` : ""}
          </li>`).join("")}
      </ol>

      <div id="sol-contrato">${seccionContrato(s, contratos)}</div>

      <form class="admin-decision" id="form-escribir-parte" novalidate>
        <h3>Escribir a una de las partes</h3>
        <p class="fotos-ayuda">El mensaje llega a la bandeja "Mensajes" del usuario y a su correo. Cada parte solo habla con Roumix.</p>
        <fieldset class="admin-decisiones">
          <legend class="sr-only">Destinatario</legend>
          <label><input type="radio" name="para-parte" value="estudiante" checked> Al estudiante</label>
          <label><input type="radio" name="para-parte" value="propietario" ${compartida ? "" : "disabled"}> Al propietario${compartida ? "" : " (primero pásala a \"En revisión\")"}</label>
        </fieldset>
        <label for="sol-parte-mensaje" class="reporte-label">Mensaje</label>
        <textarea id="sol-parte-mensaje" rows="3" maxlength="2000" placeholder="Ej: Hola, ¿qué día te queda bien para la visita?"></textarea>
        <p class="pub-mensaje" id="sol-parte-resultado" role="alert" hidden></p>
        <button type="submit" class="btn-search-action">Enviar mensaje</button>
      </form>

      <form class="admin-decision" id="form-solicitud-admin" novalidate>
        <h3>${cerrada ? "Agregar nota interna" : "Actualizar la solicitud"}</h3>
        ${cerrada ? "" : `
        <label for="sol-admin-estado" class="reporte-label">Nuevo estado</label>
        <select id="sol-admin-estado">
          <option value="">— Mantener "${escaparHTML(ETIQUETAS.solicitud[s.estado])}" —</option>
          ${s.siguientes.map(e => `<option value="${e}">${escaparHTML(ETIQUETAS.solicitud[e])}</option>`).join("")}
        </select>
        <p class="fotos-ayuda">${compartida ? "" : "Al pasarla a \"En revisión\" se comparte con el propietario (sin datos del estudiante) y le llega un correo. "}Contrato formalizado, pago y pagado los pondrá el sistema en los próximos módulos: no se ponen a mano.</p>
        <label for="sol-admin-nota-est" class="reporte-label">Mensaje para el estudiante (le llega por correo; obligatorio si rechazas o cancelas)</label>
        <textarea id="sol-admin-nota-est" rows="2" maxlength="1000" placeholder="Ej: El propietario puede mostrarte la habitación el sábado a las 10 a. m."></textarea>
        <label for="sol-admin-nota-prop" class="reporte-label">Mensaje para el propietario (le llega por correo)</label>
        <textarea id="sol-admin-nota-prop" rows="2" maxlength="1000" placeholder="Ej: Una estudiante quiere tu habitación desde el próximo mes, por 6 meses."></textarea>`}
        <label for="sol-admin-nota-int" class="reporte-label">Nota interna (solo la ve el equipo de Roumix)</label>
        <textarea id="sol-admin-nota-int" rows="2" maxlength="1000" placeholder="Ej: Llamé al propietario, confirma disponibilidad."></textarea>
        <p class="pub-mensaje" id="sol-admin-resultado" role="alert" hidden></p>
        <button type="submit" class="btn-search-action">Guardar</button>
      </form>`;

    activarSeccionContrato(s, contratos);

    document.getElementById("form-escribir-parte").addEventListener("submit", async (e) => {
      e.preventDefault();
      const resultado = document.getElementById("sol-parte-resultado");
      const mensaje = document.getElementById("sol-parte-mensaje").value.trim();
      const para = (e.target.querySelector('input[name="para-parte"]:checked') || {}).value;
      if (mensaje.length < 2) {
        resultado.textContent = "Escribe el mensaje.";
        resultado.className = "pub-mensaje pub-mensaje-error";
        resultado.hidden = false;
        return;
      }
      const boton = e.target.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        const respuesta = await RoumixAPI.admin("/conversaciones", { method: "POST", body: { solicitudId: s.id, para, mensaje } });
        RoumixAvisos.mostrar(respuesta.message, "exito");
        dialogoSolicitud.close();
        abrirConversacion(respuesta.data.id);
      } catch (error) {
        resultado.textContent = error.message;
        resultado.className = "pub-mensaje pub-mensaje-error";
        resultado.hidden = false;
        boton.disabled = false;
      }
    });

    const form = document.getElementById("form-solicitud-admin");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const resultado = document.getElementById("sol-admin-resultado");
      const mostrar = (texto) => { resultado.textContent = texto; resultado.className = "pub-mensaje pub-mensaje-error"; resultado.hidden = false; };
      const valor = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
      const estado = valor("sol-admin-estado");
      const cuerpo = {
        estado: estado || undefined,
        notaEstudiante: valor("sol-admin-nota-est") || undefined,
        notaPropietario: valor("sol-admin-nota-prop") || undefined,
        notaInterna: valor("sol-admin-nota-int") || undefined
      };
      if (!estado && !cuerpo.notaEstudiante && !cuerpo.notaPropietario && !cuerpo.notaInterna) return mostrar("Elige un nuevo estado o escribe al menos una nota.");
      if ((estado === "rechazada" || estado === "cancelada") && !cuerpo.notaEstudiante) return mostrar("Explícale al estudiante por qué se cierra la solicitud.");
      if ((estado === "rechazada" || estado === "cancelada") && !confirm(`¿Confirmas marcar la solicitud #${s.id} como "${ETIQUETAS.solicitud[estado]}"? Se cerrará.`)) return;

      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        const respuesta = await RoumixAPI.admin(`/solicitudes/${s.id}`, { method: "POST", body: cuerpo });
        RoumixAvisos.mostrar(respuesta.message, "exito");
        cargarSolicitudes();
        cargarContador();
        abrirSolicitud(s.id);
      } catch (error) {
        mostrar(error.message);
        boton.disabled = false;
      }
    });
  }

  function actualizarContadorMensajes(data) {
    const contador = document.getElementById("contador-mensajes");
    contador.textContent = data.conversaciones.pendientes;
    contador.hidden = data.conversaciones.pendientes === 0;
  }

  // ---------------- Contratos (flujo demostrativo) ----------------
  const ETIQUETA_CONTRATO = {
    borrador: "Borrador", enviado: "Enviado", pendiente_aceptacion: "Falta una aceptación",
    formalizado: "Formalizado", cancelado: "Cancelado", expirado: "Expirado"
  };
  const CHIP_CONTRATO = {
    borrador: "pendiente", enviado: "en_revision", pendiente_aceptacion: "en_revision",
    formalizado: "aprobada", cancelado: "neutro", expirado: "rechazada"
  };
  const chipContrato = (estado) => chip(ETIQUETA_CONTRATO[estado] || estado, CHIP_CONTRATO[estado] || "neutro");
  const VIGENTES = ["borrador", "enviado", "pendiente_aceptacion"];
  const isoDia = (valor) => valor ? String(valor).slice(0, 10) : "";
  const hoyLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function actualizarContadorContratos(data) {
    const contador = document.getElementById("contador-contratos");
    contador.textContent = data.contratos.borradores;
    contador.hidden = data.contratos.borradores === 0;
  }

  async function cargarContratos() {
    const contenedor = document.getElementById("lista-contratos-admin");
    mostrarCarga(contenedor);
    try {
      const { data } = await RoumixAPI.admin(`/contratos?estado=${document.getElementById("filtro-contratos").value}`);
      if (data.length === 0) return vacio(contenedor, "No hay contratos con este estado.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Contrato</th><th scope="col">Inmueble</th><th scope="col">Partes</th><th scope="col">Condiciones</th><th scope="col">Aceptaciones</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(c => `
            <tr>
              <td><strong>#${c.id}</strong><br><small>Solicitud #${c.solicitud_id}</small></td>
              <td>${escaparHTML(c.inmueble_titulo)}</td>
              <td><small>Arrendador:</small> ${escaparHTML(c.propietario_nombre)}<br><small>Arrendatario:</small> ${escaparHTML(c.estudiante_nombre)}</td>
              <td>${formatearPrecioCOP(c.canon_mensual)}/mes<br><small>Desde ${fechaDia(c.fecha_inicio)} · ${c.duracion_meses} mes(es)</small></td>
              <td><small>Propietario: ${c.aceptado_propietario_en ? "✓" : "—"}<br>Estudiante: ${c.aceptado_estudiante_en ? "✓" : "—"}</small></td>
              <td>${chipContrato(c.estado)}${c.vence_en && ["enviado", "pendiente_aceptacion"].includes(c.estado) ? `<br><small>Vence ${fecha(c.vence_en)}</small>` : ""}</td>
              <td><button type="button" class="btn-card-action" data-solicitud-contrato="${c.solicitud_id}">Gestionar</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-contratos").addEventListener("change", cargarContratos);
  document.getElementById("lista-contratos-admin").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-solicitud-contrato]");
    if (boton) abrirSolicitud(Number(boton.dataset.solicitudContrato));
  });

  function formularioContrato(s, c) {
    const v = c || {
      canon_mensual: s.canon_mensual, deposito: "", dia_pago: 5, duracion_meses: s.duracion_meses,
      fecha_inicio: isoDia(s.fecha_ingreso) < hoyLocal() ? hoyLocal() : isoDia(s.fecha_ingreso),
      inmueble_direccion: "", servicios_incluidos: "", condiciones: ""
    };
    return `
      <form id="form-contrato" class="admin-contrato-form" novalidate>
        <div class="admin-contrato-grid">
          <label>Canon mensual (COP)<input type="number" id="ct-canon" min="1" step="1000" value="${escaparHTML(v.canon_mensual)}"></label>
          <label>Depósito (COP, opcional)<input type="number" id="ct-deposito" min="0" step="1000" value="${escaparHTML(v.deposito ?? "")}"></label>
          <label>Fecha de inicio<input type="date" id="ct-inicio" value="${escaparHTML(isoDia(v.fecha_inicio))}"></label>
          <label>Duración (meses)<input type="number" id="ct-duracion" min="1" max="24" value="${escaparHTML(v.duracion_meses)}"></label>
          <label>Día de pago (1–28)<input type="number" id="ct-dia" min="1" max="28" value="${escaparHTML(v.dia_pago)}"></label>
          <label>Dirección del inmueble<input type="text" id="ct-direccion" maxlength="200" value="${escaparHTML(v.inmueble_direccion || "")}" placeholder="Ej: Calle 40 # 30-15, apto 201"></label>
        </div>
        <label class="reporte-label" for="ct-servicios">Servicios incluidos</label>
        <input type="text" id="ct-servicios" maxlength="500" value="${escaparHTML(v.servicios_incluidos || "")}" placeholder="Ej: Agua, luz, gas e internet">
        <label class="reporte-label" for="ct-condiciones">Condiciones acordadas</label>
        <textarea id="ct-condiciones" rows="4" maxlength="5000" placeholder="Ej: No se permiten mascotas. Visitas hasta las 10 p. m. El depósito se devuelve al entregar el inmueble en buen estado.">${escaparHTML(v.condiciones || "")}</textarea>
        <p class="pub-mensaje" id="ct-resultado" role="alert" hidden></p>
        <div class="admin-botones">
          <button type="submit" class="btn-search-action">${c ? "Guardar borrador" : "Crear borrador"}</button>
          ${c ? `<button type="button" class="btn-card-action" id="ct-enviar">Enviar a las partes</button>` : ""}
          ${c ? `<a class="btn-card-action" href="contrato.html?id=${c.id}" target="_blank" rel="noopener">Vista previa</a>` : ""}
        </div>
      </form>`;
  }

  function seccionContrato(s, contratos) {
    const vigente = contratos.find(c => VIGENTES.includes(c.estado));
    const formalizado = contratos.find(c => c.estado === "formalizado");
    const historial = contratos.filter(c => c !== vigente && c !== formalizado);
    let cuerpo;
    if (formalizado) {
      cuerpo = `<p>${chipContrato("formalizado")} Contrato <a href="contrato.html?id=${formalizado.id}" target="_blank" rel="noopener">#${formalizado.id}</a> aceptado por ambas partes el ${fecha(formalizado.formalizado_en)}.</p>`;
    } else if (vigente && vigente.estado === "borrador") {
      cuerpo = `<p>${chipContrato("borrador")} Contrato #${vigente.id}: las partes todavía no lo ven. Al enviarlo ya no se podrá editar.</p>${formularioContrato(s, vigente)}`;
    } else if (vigente) {
      cuerpo = `
        <p>${chipContrato(vigente.estado)} Contrato <a href="contrato.html?id=${vigente.id}" target="_blank" rel="noopener">#${vigente.id}</a> enviado el ${fecha(vigente.enviado_en)} · vence ${fecha(vigente.vence_en)}</p>
        <p><small>Propietario: ${vigente.aceptado_propietario_en ? `✓ aceptó (${escaparHTML(vigente.firma_propietario)})` : "pendiente"} · Estudiante: ${vigente.aceptado_estudiante_en ? `✓ aceptó (${escaparHTML(vigente.firma_estudiante)})` : "pendiente"}</small></p>`;
    } else if (s.estado === "contrato_pendiente") {
      cuerpo = `<p class="fotos-ayuda">Prepara el contrato con las condiciones que acordaron las partes. Los datos de la solicitud ya vienen llenos.</p>${formularioContrato(s, null)}`;
    } else {
      cuerpo = `<p class="fotos-ayuda">El contrato se prepara cuando la solicitud está en "Contrato pendiente".</p>`;
    }
    const cancelar = vigente ? `
      <details class="admin-cancelar-contrato">
        <summary>Cancelar este contrato</summary>
        <label class="reporte-label" for="ct-motivo">Motivo (queda en el historial)</label>
        <textarea id="ct-motivo" rows="2" maxlength="500"></textarea>
        <button type="button" class="btn-card-action btn-card-danger" id="ct-cancelar">Cancelar contrato #${vigente.id}</button>
      </details>` : "";
    return `
      <section class="admin-decision admin-seccion-contrato">
        <h3>Contrato <small>(demostrativo)</small></h3>
        ${cuerpo}
        ${cancelar}
        ${historial.length ? `<p class="fotos-ayuda">Anteriores: ${historial.map(c => `<a href="contrato.html?id=${c.id}" target="_blank" rel="noopener">#${c.id}</a> ${escaparHTML(ETIQUETA_CONTRATO[c.estado])}`).join(" · ")}</p>` : ""}
      </section>`;
  }

  function activarSeccionContrato(s, contratos) {
    const vigente = contratos.find(c => VIGENTES.includes(c.estado));
    const recargar = async (mensaje) => {
      RoumixAvisos.mostrar(mensaje, "exito");
      cargarSolicitudes();
      cargarContador();
      if (!document.getElementById("panel-contratos").hidden) cargarContratos();
      abrirSolicitud(s.id);
    };
    const mostrarError = (texto) => {
      const r = document.getElementById("ct-resultado");
      if (r) { r.textContent = texto; r.className = "pub-mensaje pub-mensaje-error"; r.hidden = false; }
      else RoumixAvisos.mostrar(texto, "error", 5000);
    };
    const datos = () => ({
      canonMensual: Number(document.getElementById("ct-canon").value),
      deposito: document.getElementById("ct-deposito").value === "" ? null : Number(document.getElementById("ct-deposito").value),
      fechaInicio: document.getElementById("ct-inicio").value,
      duracionMeses: Number(document.getElementById("ct-duracion").value),
      diaPago: Number(document.getElementById("ct-dia").value),
      inmuebleDireccion: document.getElementById("ct-direccion").value,
      serviciosIncluidos: document.getElementById("ct-servicios").value,
      condiciones: document.getElementById("ct-condiciones").value
    });

    const form = document.getElementById("form-contrato");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const boton = form.querySelector('button[type="submit"]');
        boton.disabled = true;
        try {
          const r = vigente
            ? await RoumixAPI.admin(`/contratos/${vigente.id}`, { method: "PUT", body: datos() })
            : await RoumixAPI.admin(`/solicitudes/${s.id}/contrato`, { method: "POST", body: datos() });
          recargar(r.message);
        } catch (err) {
          mostrarError(err.message);
          boton.disabled = false;
        }
      });
    }
    const enviar = document.getElementById("ct-enviar");
    if (enviar) {
      enviar.addEventListener("click", async () => {
        if (!confirm(`¿Enviar el contrato #${vigente.id} al estudiante y al propietario?\n\nSe guarda lo que está en el formulario y, una vez enviado, ya no se podrá editar.`)) return;
        enviar.disabled = true;
        try {
          await RoumixAPI.admin(`/contratos/${vigente.id}`, { method: "PUT", body: datos() });
          const r = await RoumixAPI.admin(`/contratos/${vigente.id}/enviar`, { method: "POST" });
          recargar(r.message);
        } catch (err) {
          mostrarError(err.message);
          enviar.disabled = false;
        }
      });
    }
    const cancelar = document.getElementById("ct-cancelar");
    if (cancelar) {
      cancelar.addEventListener("click", async () => {
        const motivo = document.getElementById("ct-motivo").value.trim();
        if (motivo.length < 5) return RoumixAvisos.mostrar("Escribe el motivo de la cancelación.", "error");
        if (!confirm(`¿Cancelar el contrato #${vigente.id}? Las partes ya no podrán aceptarlo.`)) return;
        try {
          const r = await RoumixAPI.admin(`/contratos/${vigente.id}/cancelar`, { method: "POST", body: { motivo } });
          recargar(r.message);
        } catch (err) {
          RoumixAvisos.mostrar(err.message, "error", 5000);
        }
      });
    }
  }

  // ---------------- Pagos (SIMULADOS) ----------------
  const ETIQUETA_PAGO = {
    pendiente: "Por pagar", fallido: "Rechazado", aprobado: "Aprobado", en_disputa: "En disputa",
    reembolsado: "Devuelto", cancelado: "Cancelado"
  };
  const CHIP_PAGO = { pendiente: "pendiente", fallido: "rechazada", aprobado: "aprobada", en_disputa: "requiere_cambios", reembolsado: "neutro", cancelado: "neutro" };
  const ETIQUETA_DESEMBOLSO = { pendiente: "Por desembolsar", retenido: "Retenido", realizado: "Desembolsado", anulado: "Anulado" };
  const chipPago = (estado) => chip(ETIQUETA_PAGO[estado] || estado, CHIP_PAGO[estado] || "neutro");

  function actualizarContadorPagos(data) {
    const contador = document.getElementById("contador-pagos");
    const n = data.pagos.por_desembolsar + data.pagos.en_disputa;
    contador.textContent = n;
    contador.hidden = n === 0;
  }

  async function cargarPagos() {
    const contenedor = document.getElementById("lista-pagos-admin");
    mostrarCarga(contenedor);
    try {
      const r = await RoumixAPI.admin(`/pagos?estado=${document.getElementById("filtro-pagos").value}`);
      const t = r.totales;
      document.getElementById("pagos-totales").innerHTML = [
        ["Recaudado", t.recaudado], ["Comisiones Roumix", t.comisiones], ["Por desembolsar", t.por_desembolsar],
        ["Desembolsado", t.desembolsado], ["Devuelto", t.devuelto]
      ].map(([titulo, valor]) => `
        <div class="admin-metrica admin-metrica-neutro">
          <span class="admin-metrica-valor">${formatearPrecioCOP(valor)}</span>
          <span class="admin-metrica-titulo">${titulo}</span>
        </div>`).join("");
      document.getElementById("pagos-esperando").innerHTML = r.esperandoCondiciones.length ? `
        <div class="verif-aviso">
          <div><strong>Pagos esperando que el propietario acepte la comisión</strong>
            <p>${r.esperandoCondiciones.map(s => `Solicitud #${s.id} · ${escaparHTML(s.inmueble_titulo)} (${escaparHTML(s.propietario_nombre || "—")})`).join("<br>")}</p></div>
          ${r.esperandoCondiciones.map(s => `<button type="button" class="btn-card-action" data-habilitar="${s.id}">Reintentar #${s.id}</button>`).join("")}
        </div>` : "";
      if (r.data.length === 0) return vacio(contenedor, "No hay pagos con este filtro.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Pago</th><th scope="col">Inmueble</th><th scope="col">Partes</th><th scope="col">Monto</th><th scope="col">Comisión / neto</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${r.data.map(p => `
            <tr>
              <td><strong>#${p.id}</strong><br><small>${escaparHTML(p.referencia || "Sin referencia")}</small></td>
              <td>${escaparHTML(p.inmueble_titulo)}<br><small>Solicitud #${p.solicitud_id}</small></td>
              <td><small>Estudiante:</small> ${escaparHTML(p.estudiante_nombre || "—")}<br><small>Propietario:</small> ${escaparHTML(p.propietario_nombre || "—")}</td>
              <td>${formatearPrecioCOP(p.monto)}</td>
              <td>${formatearPrecioCOP(p.comision)}<br><small>${formatearPrecioCOP(p.neto_propietario)} al propietario</small></td>
              <td>${chipPago(p.estado)}${p.desembolso_estado ? `<br><small>${escaparHTML(ETIQUETA_DESEMBOLSO[p.desembolso_estado])}</small>` : ""}</td>
              <td><button type="button" class="btn-card-action" data-pago="${p.id}">Gestionar</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-pagos").addEventListener("change", cargarPagos);
  document.getElementById("pagos-esperando").addEventListener("click", async (e) => {
    const boton = e.target.closest("button[data-habilitar]");
    if (!boton) return;
    boton.disabled = true;
    try {
      const r = await RoumixAPI.admin(`/solicitudes/${boton.dataset.habilitar}/pago`, { method: "POST" });
      RoumixAvisos.mostrar(r.message, "exito");
      cargarPagos();
    } catch (err) {
      RoumixAvisos.mostrar(err.message, "error", 6000);
      boton.disabled = false;
    }
  });

  const dialogoPago = document.getElementById("dialogo-pago");
  const contenidoPago = document.getElementById("dialogo-pago-contenido");
  dialogoPago.querySelector("[data-cerrar]").addEventListener("click", () => dialogoPago.close());
  document.getElementById("lista-pagos-admin").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-pago]");
    if (boton) abrirPago(Number(boton.dataset.pago));
  });

  async function abrirPago(id) {
    contenidoPago.innerHTML = '<p class="admin-cargando" role="status">Cargando…</p>';
    if (!dialogoPago.open) dialogoPago.showModal();
    let p;
    try {
      ({ data: p } = await RoumixAPI.admin(`/pagos/${id}`));
    } catch (error) {
      return mostrarError(contenidoPago, error);
    }
    const acciones = [];
    if (p.estado === "aprobado" && p.desembolso_estado === "pendiente") acciones.push(["desembolso", "Registrar desembolso (simulado)", "btn-search-action", false]);
    if (["aprobado", "en_disputa"].includes(p.estado) && p.desembolso_estado !== "realizado") acciones.push(["devolucion", "Devolver al estudiante (simulado)", "btn-card-action btn-card-danger", true]);
    if (p.estado === "en_disputa") acciones.push(["resolver-disputa", "Cerrar la disputa sin devolución", "btn-card-action", true]);
    if (["pendiente", "fallido"].includes(p.estado)) acciones.push(["cancelar", "Cancelar el pago y cerrar la solicitud", "btn-card-action btn-card-danger", true]);

    contenidoPago.innerHTML = `
      <h2 id="dialogo-pago-titulo">Pago #${p.id} · ${escaparHTML(p.inmueble_titulo)}</h2>
      <p>${chipPago(p.estado)} ${p.desembolso_estado ? chip(ETIQUETA_DESEMBOLSO[p.desembolso_estado], "neutro") : ""} ${chip("Simulado", "pendiente")}</p>
      <dl class="admin-datos">
        <dt>Monto (primer canon)</dt><dd>${formatearPrecioCOP(p.monto)}</dd>
        <dt>Comisión Roumix</dt><dd>${formatearPrecioCOP(p.comision)} (${Number(p.porcentaje_comision)} %, a cargo del propietario${p.version_condiciones ? `, condiciones v. ${escaparHTML(p.version_condiciones)}` : ""})</dd>
        <dt>Neto al propietario</dt><dd>${formatearPrecioCOP(p.neto_propietario)}${p.desembolso_referencia ? ` · ${escaparHTML(p.desembolso_referencia)}` : ""}</dd>
        <dt>Referencia</dt><dd>${escaparHTML(p.referencia || "—")}${p.metodo ? ` · ${escaparHTML((p.metodos || {})[p.metodo] || p.metodo)}` : ""}</dd>
        <dt>Intentos</dt><dd>${p.intentos}</dd>
        <dt>Enlaces</dt><dd><a href="pago.html?id=${p.id}" target="_blank" rel="noopener">Ver pago</a> · <a href="contrato.html?id=${p.contrato_id}" target="_blank" rel="noopener">Contrato #${p.contrato_id}</a></dd>
      </dl>
      <h3>Movimientos</h3>
      <ol class="admin-historial-solicitud">
        ${p.eventos.map(e => `<li><span class="admin-historial-meta">${fecha(e.created_at)} · ${escaparHTML(e.autor_rol)}</span>
          <strong>${escaparHTML(e.tipo.replace(/_/g, " "))}</strong>${e.monto ? ` · ${formatearPrecioCOP(e.monto)}` : ""}${e.referencia ? ` · ${escaparHTML(e.referencia)}` : ""}
          ${e.detalle ? `<p>${escaparHTML(e.detalle)}</p>` : ""}</li>`).join("")}
      </ol>
      ${acciones.length ? `
      <form class="admin-decision" id="form-pago-admin" novalidate>
        <h3>Acciones</h3>
        <label for="pago-motivo" class="reporte-label">Motivo o explicación (obligatorio para devolver, cerrar la disputa o cancelar)</label>
        <textarea id="pago-motivo" rows="2" maxlength="500"></textarea>
        <p class="pub-mensaje" id="pago-resultado" role="alert" hidden></p>
        <div class="admin-botones">
          ${acciones.map(([accion, texto, clase]) => `<button type="button" class="${clase}" data-accion-pago="${accion}">${texto}</button>`).join("")}
        </div>
      </form>` : `<p class="fotos-ayuda">No hay acciones pendientes para este pago.</p>`}`;

    const form = document.getElementById("form-pago-admin");
    if (!form) return;
    form.addEventListener("click", async (e) => {
      const boton = e.target.closest("button[data-accion-pago]");
      if (!boton) return;
      const accion = boton.dataset.accionPago;
      const texto = document.getElementById("pago-motivo").value.trim();
      const resultado = document.getElementById("pago-resultado");
      const necesitaMotivo = acciones.find(a => a[0] === accion)[3];
      if (necesitaMotivo && texto.length < 5) {
        resultado.textContent = "Escribe el motivo (al menos 5 caracteres).";
        resultado.className = "pub-mensaje pub-mensaje-error";
        resultado.hidden = false;
        return;
      }
      if (!confirm(`¿Confirmas "${boton.textContent}" para el pago #${p.id}?`)) return;
      boton.disabled = true;
      const cuerpo = accion === "resolver-disputa" ? { nota: texto } : { motivo: texto };
      try {
        const r = await RoumixAPI.admin(`/pagos/${p.id}/${accion}`, { method: "POST", body: cuerpo });
        RoumixAvisos.mostrar(r.message, "exito", 5000);
        cargarPagos();
        cargarContador();
        abrirPago(p.id);
      } catch (err) {
        resultado.textContent = err.message;
        resultado.className = "pub-mensaje pub-mensaje-error";
        resultado.hidden = false;
        boton.disabled = false;
      }
    });
  }

  // ---------------- Mensajes (comunicación gestionada) ----------------
  const ROL = { estudiante: "Estudiante", propietario: "Propietario" };

  async function cargarMensajes() {
    const contenedor = document.getElementById("lista-mensajes-admin");
    mostrarCarga(contenedor);
    const params = new URLSearchParams({ estado: document.getElementById("filtro-mensajes").value });
    const rol = document.getElementById("filtro-mensajes-rol").value;
    if (rol) params.set("rol", rol);
    const q = document.getElementById("buscar-mensajes").value.trim();
    if (q) params.set("q", q);
    try {
      const { data } = await RoumixAPI.admin(`/conversaciones?${params}`);
      if (data.length === 0) return vacio(contenedor, "No hay conversaciones con estos filtros.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Último mensaje</th><th scope="col">Usuario</th><th scope="col">Asunto</th><th scope="col">Sobre</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(c => `
            <tr${c.sin_leer ? ' class="admin-fila-nueva"' : ""}>
              <td>${fecha(c.ultimo_mensaje_en)}${c.sin_leer ? "<br>" + chip("Sin leer", "pendiente") : ""}</td>
              <td>${escaparHTML(c.usuario_nombre || "Cuenta eliminada")}<br><small>${escaparHTML(ROL[c.usuario_rol] || "")} · ${escaparHTML(c.usuario_email || "")}</small></td>
              <td><strong>${escaparHTML(c.asunto)}</strong><br><small class="admin-texto-largo">${escaparHTML((c.ultimo_mensaje || "").slice(0, 120))}</small></td>
              <td>${c.solicitud_id ? `Solicitud #${c.solicitud_id}<br>` : ""}<small>${escaparHTML(c.inmueble_titulo || "Consulta general")}</small></td>
              <td>${chip(c.estado === "pendiente" ? "Pendiente" : "Atendida", c.estado === "pendiente" ? "en_revision" : "aprobada")}</td>
              <td><button type="button" class="btn-card-action" data-conversacion="${c.id}">${c.estado === "pendiente" ? "Responder" : "Ver"}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-mensajes").addEventListener("change", cargarMensajes);
  document.getElementById("filtro-mensajes-rol").addEventListener("change", cargarMensajes);
  document.getElementById("buscar-mensajes").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(cargarMensajes, 350);
  });

  const dialogoConversacion = document.getElementById("dialogo-conversacion");
  const contenidoConversacion = document.getElementById("dialogo-conversacion-contenido");
  dialogoConversacion.querySelector("[data-cerrar]").addEventListener("click", () => dialogoConversacion.close());
  document.getElementById("lista-mensajes-admin").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-conversacion]");
    if (boton) abrirConversacion(Number(boton.dataset.conversacion));
  });

  async function abrirConversacion(id) {
    contenidoConversacion.innerHTML = '<p class="admin-cargando" role="status">Cargando…</p>';
    if (!dialogoConversacion.open) dialogoConversacion.showModal();
    let c;
    try {
      ({ data: c } = await RoumixAPI.admin(`/conversaciones/${id}`));
    } catch (error) {
      return mostrarError(contenidoConversacion, error);
    }
    contenidoConversacion.innerHTML = `
      <h2 id="dialogo-conversacion-titulo">${escaparHTML(c.asunto)}</h2>
      <p>${chip(c.estado === "pendiente" ? "Pendiente de respuesta" : "Atendida", c.estado === "pendiente" ? "en_revision" : "aprobada")}
         ${chip(ROL[c.usuario_rol] || c.usuario_rol, "neutro")}
         ${c.solicitud_id ? chip(`Solicitud #${c.solicitud_id} · ${ETIQUETAS.solicitud[c.solicitud_estado] || ""}`, "neutro") : ""}</p>
      <dl class="admin-datos admin-datos-linea">
        <dt>Usuario</dt><dd>${escaparHTML(c.usuario_nombre || "Cuenta eliminada")} · ${escaparHTML(c.usuario_email || "")}${c.usuario_telefono ? " · " + escaparHTML(c.usuario_telefono) : ""}</dd>
        <dt>Sobre</dt><dd>${c.inmueble_id ? `<a href="detalle.html?id=${c.inmueble_id}" target="_blank" rel="noopener">${escaparHTML(c.inmueble_titulo || "Vivienda #" + c.inmueble_id)}</a>` : "Consulta general"}</dd>
      </dl>
      <ol class="admin-chat">
        ${c.mensajes.map(m => `
          <li class="admin-chat-msg ${m.tipo === "nota_interna" ? "interna" : m.autor_rol === "admin" ? "roumix" : "usuario"}">
            <span class="admin-historial-meta">${m.tipo === "nota_interna" ? "🔒 Nota interna · " : ""}${m.autor_rol === "admin" ? `Roumix · ${escaparHTML(m.autor_nombre || "admin")}` : escaparHTML(c.usuario_nombre || ROL[m.autor_rol])} · ${fecha(m.created_at)}</span>
            <p>${escaparHTML(m.cuerpo).replace(/\n/g, "<br>")}</p>
          </li>`).join("")}
      </ol>
      <form class="admin-decision" id="form-conversacion-admin" novalidate>
        <label for="conv-respuesta" class="reporte-label">Respuesta</label>
        <textarea id="conv-respuesta" rows="3" maxlength="2000" placeholder="Escribe tu respuesta. No compartas teléfonos ni correos de la otra parte."></textarea>
        <label class="admin-check"><input type="checkbox" id="conv-interna"> Guardar como nota interna (el usuario no la ve)</label>
        <p class="pub-mensaje" id="conv-resultado" role="alert" hidden></p>
        <div class="admin-botones">
          <button type="submit" class="btn-search-action">Enviar</button>
          <button type="button" class="btn-card-action" id="conv-estado">${c.estado === "pendiente" ? "Marcar como atendida" : "Marcar como pendiente"}</button>
        </div>
      </form>`;
    const chat = contenidoConversacion.querySelector(".admin-chat");
    chat.scrollTop = chat.scrollHeight;

    const resultado = document.getElementById("conv-resultado");
    const error = (texto) => { resultado.textContent = texto; resultado.className = "pub-mensaje pub-mensaje-error"; resultado.hidden = false; };
    document.getElementById("conv-estado").addEventListener("click", async () => {
      try {
        const r = await RoumixAPI.admin(`/conversaciones/${c.id}/estado`, { method: "POST", body: { estado: c.estado === "pendiente" ? "atendida" : "pendiente" } });
        RoumixAvisos.mostrar(r.message, "exito");
        cargarMensajes();
        cargarContador();
        abrirConversacion(c.id);
      } catch (err) { error(err.message); }
    });
    document.getElementById("form-conversacion-admin").addEventListener("submit", async (e) => {
      e.preventDefault();
      const mensaje = document.getElementById("conv-respuesta").value.trim();
      const interna = document.getElementById("conv-interna").checked;
      if (!mensaje) return error("Escribe el mensaje.");
      const boton = e.target.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        const r = await RoumixAPI.admin(`/conversaciones/${c.id}/mensajes`, { method: "POST", body: { mensaje, interna } });
        RoumixAvisos.mostrar(r.message, "exito");
        cargarMensajes();
        cargarContador();
        abrirConversacion(c.id);
      } catch (err) {
        error(err.message);
        boton.disabled = false;
      }
    });
  }

  // ---------------- Propietarios (verificación) ----------------
  let propietariosCargados = [];
  async function cargarPropietarios() {
    const contenedor = document.getElementById("lista-propietarios");
    mostrarCarga(contenedor);
    const params = new URLSearchParams({ estado: document.getElementById("filtro-verificacion").value });
    const q = document.getElementById("buscar-propietarios").value.trim();
    if (q) params.set("q", q);
    try {
      const { data } = await RoumixAPI.admin(`/propietarios?${params}`);
      propietariosCargados = data;
      if (data.length === 0) return vacio(contenedor, "No hay propietarios con este estado.");
      const tipoChip = { incompleto: "pendiente", pendiente: "en_revision", requiere_informacion: "requiere_cambios", aprobado: "aprobada", rechazado: "rechazada" };
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Propietario</th><th scope="col">Perfil</th><th scope="col">Contacto (solo Roumix)</th><th scope="col">Inmuebles</th><th scope="col">Verificación</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(p => `
            <tr>
              <td><strong>${escaparHTML(p.nombre_completo || p.nombre)}</strong><br><small>${escaparHTML(p.email)}</small>
                ${p.correo_confirmado ? "<br>" + chip("Correo confirmado", "aprobada") : ""}</td>
              <td>${p.perfil_enviado_en ? `${escaparHTML(ETIQUETAS.relacion[p.relacion_inmueble] || "—")} · ${escaparHTML(p.ciudad || "—")}<br><small>${p.cantidad_inmuebles || "?"} inmueble(s) · enviado ${fecha(p.perfil_enviado_en)}</small>` : "<small>Aún no envía su perfil</small>"}</td>
              <td>${escaparHTML(p.telefono || "—")}<br><small>${p.telefono_verificado_por_roumix ? "✓ verificado por Roumix" : "declarado"}</small></td>
              <td>${p.inmuebles}</td>
              <td>${chip(ETIQUETAS.verificacion[p.etapa], tipoChip[p.etapa])}${p.revisado_en ? `<br><small>${fecha(p.revisado_en)}${p.revisado_por_nombre ? " · " + escaparHTML(p.revisado_por_nombre) : ""}</small>` : ""}</td>
              <td><button type="button" class="btn-card-action" data-propietario="${p.id}">${p.etapa === "pendiente" ? "Revisar" : "Ver"}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-verificacion").addEventListener("change", cargarPropietarios);
  document.getElementById("buscar-propietarios").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(cargarPropietarios, 350);
  });

  const dialogoPropietario = document.getElementById("dialogo-propietario");
  const contenidoPropietario = document.getElementById("dialogo-propietario-contenido");
  dialogoPropietario.querySelector("[data-cerrar]").addEventListener("click", () => dialogoPropietario.close());

  document.getElementById("lista-propietarios").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-propietario]");
    if (!boton) return;
    const p = propietariosCargados.find(x => x.id === boton.dataset.propietario);
    if (p) abrirPropietario(p);
  });

  function abrirPropietario(p) {
    const puedeDecidir = Boolean(p.perfil_enviado_en);
    contenidoPropietario.innerHTML = `
      <h2 id="dialogo-propietario-titulo">${escaparHTML(p.nombre_completo || p.nombre)}</h2>
      <p>${chip(ETIQUETAS.verificacion[p.etapa], p.etapa === "aprobado" ? "aprobada" : p.etapa === "rechazado" ? "rechazada" : "pendiente")}
         ${p.correo_confirmado ? chip("Correo confirmado", "aprobada") : chip("Correo sin confirmar", "pendiente")}
         ${chip(p.telefono_verificado_por_roumix ? "Teléfono verificado por Roumix" : "Teléfono declarado", p.telefono_verificado_por_roumix ? "aprobada" : "neutro")}</p>
      <div class="admin-detalle-grid">
        <div>
          <h3>Perfil enviado</h3>
          <dl class="admin-datos">
            <dt>Nombre completo</dt><dd>${escaparHTML(p.nombre_completo || "—")}</dd>
            <dt>Correo</dt><dd>${escaparHTML(p.email)}</dd>
            <dt>Celular</dt><dd>${escaparHTML(p.telefono || "—")}</dd>
            <dt>Ciudad</dt><dd>${escaparHTML(p.ciudad || "—")}</dd>
            <dt>Relación</dt><dd>${escaparHTML(ETIQUETAS.relacion[p.relacion_inmueble] || "—")}</dd>
            <dt>Inmuebles a publicar</dt><dd>${escaparHTML(p.cantidad_inmuebles || "—")}</dd>
            <dt>Zonas</dt><dd>${escaparHTML(p.zonas || "—")}</dd>
            <dt>Descripción</dt><dd class="admin-texto-largo">${escaparHTML(p.descripcion || "—")}</dd>
          </dl>
        </div>
        <div>
          <h3>Cuenta</h3>
          <dl class="admin-datos">
            <dt>Registro</dt><dd>${fecha(p.created_at)}</dd>
            <dt>Perfil enviado</dt><dd>${fecha(p.perfil_enviado_en)}</dd>
            <dt>Condiciones de comisión</dt><dd>${p.acepta_comision ? `Aceptadas el ${fecha(p.acepta_comision_en)} (versión ${escaparHTML(p.version_condiciones || "—")})` : "No aceptadas"}</dd>
            <dt>Publicaciones</dt><dd>${p.inmuebles}</dd>
            <dt>Última revisión</dt><dd>${p.revisado_en ? `${fecha(p.revisado_en)} · ${escaparHTML(p.revisado_por_nombre || "—")}` : "—"}</dd>
            <dt>Mensaje enviado</dt><dd class="admin-texto-largo">${escaparHTML(p.mensaje_admin || "—")}</dd>
          </dl>
        </div>
      </div>

      ${puedeDecidir ? `
      <form class="admin-decision" id="form-verificacion-admin" novalidate>
        <h3>Registrar decisión</h3>
        <p class="fotos-ayuda">Esta revisión no es una verificación legal de identidad. Marca el teléfono como verificado solo si llamaste al propietario y confirmaste el número.</p>
        <fieldset class="admin-decisiones">
          <legend class="sr-only">Decisión</legend>
          <label><input type="radio" name="decision-verif" value="aprobar"> Aprobar (ya puede publicar)</label>
          <label><input type="radio" name="decision-verif" value="solicitar_informacion"> Solicitar información adicional</label>
          <label><input type="radio" name="decision-verif" value="rechazar"> Rechazar</label>
        </fieldset>
        <label class="admin-check"><input type="checkbox" id="verif-telefono" ${p.telefono_verificado_por_roumix ? "checked" : ""}> Llamé al propietario y confirmé el teléfono</label>
        <label for="verif-mensaje-admin" class="reporte-label">Mensaje para el propietario (obligatorio si pides información o rechazas)</label>
        <textarea id="verif-mensaje-admin" rows="3" maxlength="1000" placeholder="Ej: Necesitamos que nos indiques el barrio exacto de tus inmuebles."></textarea>
        <p class="pub-mensaje" id="verif-resultado" role="alert" hidden></p>
        <button type="submit" class="btn-search-action">Guardar decisión</button>
      </form>` : `<p class="admin-vacio">El propietario todavía no ha enviado su perfil. Podrás revisarlo cuando lo haga.</p>`}`;

    if (!dialogoPropietario.open) dialogoPropietario.showModal();
    const form = document.getElementById("form-verificacion-admin");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const resultado = document.getElementById("verif-resultado");
      const decision = (form.querySelector('input[name="decision-verif"]:checked') || {}).value;
      const mensaje = document.getElementById("verif-mensaje-admin").value.trim();
      const mostrar = (texto, ok) => {
        resultado.textContent = texto;
        resultado.className = `pub-mensaje ${ok ? "pub-mensaje-exito" : "pub-mensaje-error"}`;
        resultado.hidden = false;
      };
      if (!decision) return mostrar("Elige una decisión.", false);
      if (decision !== "aprobar" && mensaje.length < 10) return mostrar("Escribe un mensaje de al menos 10 caracteres para el propietario.", false);
      if (decision === "rechazar" && !confirm("¿Confirmas rechazar a este propietario? No podrá publicar y sus publicaciones dejarán de mostrarse.")) return;

      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        const respuesta = await RoumixAPI.admin(`/propietarios/${p.id}/verificacion`, {
          method: "POST",
          body: { decision, mensaje: mensaje || undefined, telefonoVerificado: document.getElementById("verif-telefono").checked }
        });
        dialogoPropietario.close();
        RoumixAvisos.mostrar(respuesta.message, "exito");
        cargarPropietarios();
        cargarContador();
      } catch (error) {
        mostrar(error.message, false);
        boton.disabled = false;
      }
    });
  }

  // ---------------- Reportes ----------------
  async function cargarReportes() {
    const contenedor = document.getElementById("lista-reportes");
    mostrarCarga(contenedor);
    try {
      const { data } = await RoumixAPI.admin(`/reportes?estado=${document.getElementById("filtro-reportes").value}`);
      if (data.length === 0) return vacio(contenedor, "No hay reportes con este estado.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Publicación</th><th scope="col">Motivo</th><th scope="col">Explicación</th><th scope="col">Reportó</th><th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(r => `
            <tr>
              <td>${fecha(r.created_at)}</td>
              <td><strong>#${r.inmueble_id}</strong> ${escaparHTML(r.inmueble_titulo)}<br>${chip(ETIQUETAS.moderacion[r.inmueble_moderacion], r.inmueble_moderacion)}</td>
              <td>${escaparHTML(ETIQUETAS.motivo[r.motivo])}</td>
              <td class="admin-texto-largo">${escaparHTML(r.descripcion || "—")}</td>
              <td>${escaparHTML(r.reportante_email || "Cuenta eliminada")}</td>
              <td>${chip(ETIQUETAS.reporte[r.estado], r.estado)}${r.resuelto_por_nombre ? `<br><small>por ${escaparHTML(r.resuelto_por_nombre)}</small>` : ""}</td>
              <td><button type="button" class="btn-card-action" data-inmueble="${r.inmueble_id}">Revisar</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-reportes").addEventListener("change", cargarReportes);

  // ---------------- Publicaciones ----------------
  let temporizador = null;
  async function cargarInmuebles() {
    const contenedor = document.getElementById("lista-inmuebles-admin");
    mostrarCarga(contenedor);
    const params = new URLSearchParams({ moderacion: document.getElementById("filtro-moderacion").value });
    const q = document.getElementById("buscar-inmuebles").value.trim();
    if (q) params.set("q", q);
    try {
      const { data } = await RoumixAPI.admin(`/inmuebles?${params}`);
      if (data.length === 0) return vacio(contenedor, "No hay publicaciones con estos filtros.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Publicación</th><th scope="col">Propietario</th><th scope="col">Moderación</th><th scope="col">Estado comercial</th><th scope="col">Reportes</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${data.map(i => `
            <tr>
              <td><div class="admin-celda-inmueble">${i.imagen_principal ? `<img src="${escaparHTML(i.imagen_principal)}" alt="">` : ""}<span><strong>#${i.id}</strong> ${escaparHTML(i.titulo)}<br><small>${escaparHTML(i.barrio)} · ${formatearPrecioCOP(i.precio)}</small></span></div></td>
              <td>${escaparHTML(i.propietario_nombre || "Demostración (sin propietario)")}<br><small>${escaparHTML(i.propietario_email || "")}</small></td>
              <td>${chip(ETIQUETAS.moderacion[i.moderacion], i.moderacion)}${i.revisado_en ? "<br><small>✓ revisada</small>" : ""}</td>
              <td>${escaparHTML(ETIQUETAS.estado[i.estado])}</td>
              <td>${i.reportes_pendientes ? chip(`${i.reportes_pendientes} pendiente(s)`, "pendiente") : "—"}</td>
              <td><button type="button" class="btn-card-action" data-inmueble="${i.id}">Revisar</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-moderacion").addEventListener("change", cargarInmuebles);
  document.getElementById("buscar-inmuebles").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(cargarInmuebles, 350);
  });

  // ---------------- Detalle y decisión ----------------
  const dialogoInmueble = document.getElementById("dialogo-inmueble");
  const contenidoInmueble = document.getElementById("dialogo-inmueble-contenido");
  dialogoInmueble.querySelector("[data-cerrar]").addEventListener("click", () => dialogoInmueble.close());

  document.querySelector(".admin-container").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-inmueble]");
    if (boton) abrirInmueble(Number(boton.dataset.inmueble));
  });

  async function abrirInmueble(id) {
    mostrarCarga(contenidoInmueble);
    if (!dialogoInmueble.open) dialogoInmueble.showModal();
    let datos;
    try {
      ({ data: datos } = await RoumixAPI.admin(`/inmuebles/${id}`));
    } catch (error) {
      return mostrarError(contenidoInmueble, error);
    }
    const { inmueble: i, reportes, historial } = datos;

    contenidoInmueble.innerHTML = `
      <h2 id="dialogo-inmueble-titulo">#${i.id} · ${escaparHTML(i.titulo)}</h2>
      <p>${chip(ETIQUETAS.moderacion[i.moderacion], i.moderacion)} ${chip(ETIQUETAS.estado[i.estado], "neutro")}
         ${i.revisado_en ? chip(`Revisada el ${fecha(i.revisado_en)} por ${i.revisado_por_nombre || "—"}`, "aprobada") : ""}</p>
      <div class="admin-galeria">${(i.galeria || []).map(url => `<a href="${escaparHTML(url)}" target="_blank" rel="noopener"><img src="${escaparHTML(url)}" alt="Foto de la publicación"></a>`).join("") || "<p>Sin fotos.</p>"}</div>
      <div class="admin-detalle-grid">
        <div>
          <h3>Publicación</h3>
          <dl class="admin-datos">
            <dt>Precio</dt><dd>${formatearPrecioCOP(i.precio)}</dd>
            <dt>Tipo</dt><dd>${escaparHTML(i.tipo_label || i.tipo)}</dd>
            <dt>Barrio</dt><dd>${escaparHTML(i.barrio)}</dd>
            <dt>Ubicación exacta</dt><dd>${i.latitud ? `<a href="https://www.openstreetmap.org/?mlat=${Number(i.latitud)}&mlon=${Number(i.longitud)}#map=17/${Number(i.latitud)}/${Number(i.longitud)}" target="_blank" rel="noopener">${Number(i.latitud).toFixed(5)}, ${Number(i.longitud).toFixed(5)}</a>` : "Sin ubicación"}</dd>
            <dt>Descripción</dt><dd class="admin-texto-largo">${escaparHTML(i.descripcion || "—")}</dd>
            <dt>Publicada</dt><dd>${fecha(i.created_at)}</dd>
          </dl>
        </div>
        <div>
          <h3>Propietario</h3>
          <dl class="admin-datos">
            <dt>Nombre</dt><dd>${escaparHTML(i.propietario_nombre || "Sin propietario (demostración)")}</dd>
            <dt>Correo</dt><dd>${escaparHTML(i.propietario_email || "—")} ${i.propietario_correo_confirmado ? chip("confirmado", "aprobada") : ""}</dd>
            <dt>Celular</dt><dd>${escaparHTML(i.propietario_telefono || "—")} <small>(no verificado)</small></dd>
            <dt>Cuenta</dt><dd>${escaparHTML(i.propietario_estado || "—")}</dd>
          </dl>
        </div>
      </div>

      <h3>Reportes (${reportes.length})</h3>
      ${reportes.length ? `<ul class="admin-items">${reportes.map(r => `
        <li>${chip(ETIQUETAS.reporte[r.estado], r.estado)} <strong>${escaparHTML(ETIQUETAS.motivo[r.motivo])}</strong> · ${fecha(r.created_at)} · ${escaparHTML(r.reportante_email || "cuenta eliminada")}
          ${r.descripcion ? `<p class="admin-texto-largo">${escaparHTML(r.descripcion)}</p>` : ""}</li>`).join("")}</ul>` : "<p>Sin reportes.</p>"}

      <h3>Historial</h3>
      ${historial.length ? `<ul class="admin-items">${historial.map(h => `
        <li><strong>${escaparHTML(ETIQUETAS.accion[h.accion] || h.accion)}</strong> · ${fecha(h.created_at)} · ${escaparHTML(h.admin_nombre || (h.accion === "correcciones_enviadas" ? "propietario" : "sistema"))}
          ${h.justificacion ? `<p class="admin-texto-largo">${escaparHTML(h.justificacion)}</p>` : ""}</li>`).join("")}</ul>` : "<p>Sin decisiones registradas.</p>"}

      <form class="admin-decision" id="form-decision" novalidate>
        <h3>Registrar decisión</h3>
        <p class="fotos-ayuda">La decisión no cambia el estado comercial que eligió el propietario (disponible, pausado, arrendado o retirado). Salvo la pausa temporal, los reportes pendientes se resuelven con esta decisión.</p>
        <fieldset class="admin-decisiones">
          <legend class="sr-only">Decisión</legend>
          <label><input type="radio" name="decision" value="aprobar"> Aprobar (vuelve a mostrarse y recibe la insignia "Revisada por Roumix")</label>
          <label><input type="radio" name="decision" value="pausar"> Pausar temporalmente mientras se revisa (los reportes siguen abiertos)</label>
          <label><input type="radio" name="decision" value="solicitar_cambios"> Solicitar correcciones al propietario</label>
          <label><input type="radio" name="decision" value="rechazar"> Rechazar (no cumple las reglas)</label>
          <label><input type="radio" name="decision" value="retirar"> Retirar de forma definitiva</label>
        </fieldset>
        <div id="campo-alcance" hidden>
          <label for="decision-alcance" class="reporte-label">Qué comprobaste (se muestra públicamente)</label>
          <input type="text" id="decision-alcance" maxlength="300" value="Coherencia entre fotos, descripción, precio y ubicación.">
        </div>
        <label for="decision-justificacion" class="reporte-label">Justificación interna (obligatoria, queda en el historial)</label>
        <textarea id="decision-justificacion" rows="3" maxlength="1000" placeholder="Ej: Las fotos coinciden con la ubicación y el precio es acorde al sector."></textarea>
        <label for="decision-mensaje" class="reporte-label">Mensaje para el propietario (opcional; no incluyas datos de quien reportó)</label>
        <textarea id="decision-mensaje" rows="2" maxlength="1000"></textarea>
        <p class="pub-mensaje" id="decision-resultado" role="alert" hidden></p>
        <button type="submit" class="btn-search-action">Guardar decisión</button>
      </form>`;

    const form = document.getElementById("form-decision");
    form.querySelectorAll('input[name="decision"]').forEach(radio => radio.addEventListener("change", () => {
      document.getElementById("campo-alcance").hidden = radio.value !== "aprobar" || !radio.checked;
    }));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const resultado = document.getElementById("decision-resultado");
      const decision = (form.querySelector('input[name="decision"]:checked') || {}).value;
      const justificacion = document.getElementById("decision-justificacion").value.trim();
      const mostrar = (texto, ok) => {
        resultado.textContent = texto;
        resultado.className = `pub-mensaje ${ok ? "pub-mensaje-exito" : "pub-mensaje-error"}`;
        resultado.hidden = false;
      };
      if (!decision) return mostrar("Elige una decisión.", false);
      if (justificacion.length < 10) return mostrar("Escribe una justificación de al menos 10 caracteres.", false);
      if ((decision === "retirar" || decision === "rechazar") &&
          !confirm(`¿Confirmas ${decision === "retirar" ? "retirar definitivamente" : "rechazar"} esta publicación? El propietario ya no podrá reactivarla.`)) return;

      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        const respuesta = await RoumixAPI.admin(`/inmuebles/${i.id}/moderacion`, {
          method: "POST",
          body: {
            decision,
            justificacion,
            mensajePropietario: document.getElementById("decision-mensaje").value.trim() || undefined,
            alcance: decision === "aprobar" ? document.getElementById("decision-alcance").value.trim() : undefined
          }
        });
        mostrar(respuesta.message, true);
        await abrirInmueble(i.id);
        refrescarPanelActivo();
      } catch (error) {
        mostrar(error.message, false);
        boton.disabled = false;
      }
    });
  }

  // ---------------- Usuarios ----------------
  async function cargarUsuarios() {
    const contenedor = document.getElementById("lista-usuarios");
    mostrarCarga(contenedor);
    const params = new URLSearchParams({
      rol: document.getElementById("filtro-rol").value,
      estado: document.getElementById("filtro-estado-usuario").value
    });
    const q = document.getElementById("buscar-usuarios").value.trim();
    if (q) params.set("q", q);
    try {
      const { data } = await RoumixAPI.admin(`/usuarios?${params}`);
      if (data.length === 0) return vacio(contenedor, "No hay usuarios con estos filtros.");
      const yo = RoumixStorage.getUsuario();
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Correo</th><th scope="col">Inmuebles</th><th scope="col">Reportes procedentes</th><th scope="col">Registro</th><th scope="col">Estado</th></tr></thead>
          <tbody>${data.map(u => `
            <tr>
              <td><strong>${escaparHTML(u.nombre)}</strong><br><small>${escaparHTML(u.email)}</small></td>
              <td>${escaparHTML(u.rol)}</td>
              <td>${u.correo_confirmado ? chip("Confirmado", "aprobada") : chip("Sin confirmar", "pendiente")}</td>
              <td>${u.inmuebles}</td>
              <td>${u.reportes_procedentes ? chip(String(u.reportes_procedentes), "procedente") : "0"}</td>
              <td>${fecha(u.created_at)}${u.acepto_politica_en ? "" : "<br><small>sin aceptación de política registrada</small>"}</td>
              <td>${chip(u.estado, u.estado === "activo" ? "aprobada" : "rechazada")}
                ${u.rol !== "admin" && (!yo || yo.id !== u.id)
                  ? `<br><button type="button" class="btn-card-action ${u.estado === "activo" ? "btn-card-danger" : ""}" data-usuario="${u.id}" data-estado="${u.estado === "activo" ? "suspendido" : "activo"}" data-nombre="${escaparHTML(u.nombre)}">${u.estado === "activo" ? "Suspender" : "Reactivar"}</button>`
                  : ""}</td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  ["filtro-rol", "filtro-estado-usuario"].forEach(id => document.getElementById(id).addEventListener("change", cargarUsuarios));
  document.getElementById("buscar-usuarios").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(cargarUsuarios, 350);
  });

  const dialogoUsuario = document.getElementById("dialogo-usuario");
  const formUsuario = document.getElementById("form-usuario");
  let usuarioSeleccionado = null;
  dialogoUsuario.querySelector("[data-cerrar]").addEventListener("click", () => dialogoUsuario.close());

  document.getElementById("lista-usuarios").addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-usuario]");
    if (!boton) return;
    usuarioSeleccionado = { id: boton.dataset.usuario, estado: boton.dataset.estado };
    document.getElementById("dialogo-usuario-texto").textContent = boton.dataset.estado === "suspendido"
      ? `Vas a suspender la cuenta de ${boton.dataset.nombre}. No podrá iniciar sesión ni operar en Roumix, y sus publicaciones dejarán de mostrarse.`
      : `Vas a reactivar la cuenta de ${boton.dataset.nombre}.`;
    formUsuario.reset();
    document.getElementById("usuario-error").hidden = true;
    dialogoUsuario.showModal();
  });

  formUsuario.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = document.getElementById("usuario-error");
    const justificacion = document.getElementById("usuario-justificacion").value.trim();
    if (justificacion.length < 10) {
      error.textContent = "Escribe una justificación de al menos 10 caracteres.";
      error.hidden = false;
      return;
    }
    try {
      await RoumixAPI.admin(`/usuarios/${usuarioSeleccionado.id}/estado`, {
        method: "POST",
        body: { estado: usuarioSeleccionado.estado, justificacion }
      });
      dialogoUsuario.close();
      cargarUsuarios();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  // ---------------- Historial ----------------
  async function cargarHistorial() {
    const contenedor = document.getElementById("lista-historial");
    mostrarCarga(contenedor);
    try {
      const { data } = await RoumixAPI.admin("/historial?limite=200");
      if (data.length === 0) return vacio(contenedor, "Aún no hay acciones registradas.");
      contenedor.innerHTML = `
        <table class="admin-tabla">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Acción</th><th scope="col">Sobre</th><th scope="col">Responsable</th><th scope="col">Justificación</th></tr></thead>
          <tbody>${data.map(h => `
            <tr>
              <td>${fecha(h.created_at)}</td>
              <td>${escaparHTML(ETIQUETAS.accion[h.accion] || h.accion)}${h.moderacion_nueva ? `<br><small>${escaparHTML(ETIQUETAS.moderacion[h.moderacion_anterior] || "—")} → ${escaparHTML(ETIQUETAS.moderacion[h.moderacion_nueva])}</small>` : ""}</td>
              <td>${h.inmueble_id ? `<button type="button" class="admin-enlace" data-inmueble="${h.inmueble_id}">#${h.inmueble_id} ${escaparHTML(h.inmueble_titulo || "")}</button>` : escaparHTML(h.inmueble_titulo || h.afectado_email || "—")}</td>
              <td>${escaparHTML(h.admin_nombre || (h.accion === "correcciones_enviadas" ? "Propietario" : "Sistema"))}</td>
              <td class="admin-texto-largo">${escaparHTML(h.justificacion || "—")}</td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }

  function refrescarPanelActivo() {
    const activa = document.querySelector(".admin-tab.activa");
    if (activa) paneles[activa.dataset.panel]();
    if (activa && activa.dataset.panel !== "resumen") cargarContador();
  }

  async function cargarContador() {
    try {
      const { data } = await RoumixAPI.admin("/resumen");
      const contador = document.getElementById("contador-reportes");
      contador.textContent = data.reportes.pendientes;
      contador.hidden = data.reportes.pendientes === 0;
      actualizarContadorPropietarios(data);
      actualizarContadorSolicitudes(data);
      actualizarContadorMensajes(data);
      actualizarContadorContratos(data);
      actualizarContadorPagos(data);
    } catch (e) { /* el contador es informativo */ }
  }

  abrirPanel("resumen");
});
