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
    retirada_por_propietario: "Retirada por el propietario", arrendada_por_propietario: "Marcada arrendada por el propietario", baja_solicitada: "Pidió darla de baja con un contrato en curso", arrendada_con_roumix: "Arrendada con Roumix (primer mes pagado)", solicitar_cambios: "Cambios solicitados",
    rechazar: "Rechazada", retirar: "Retirada", correcciones_enviadas: "Correcciones enviadas por el propietario",
    cuenta_suspendida: "Cuenta suspendida", cuenta_reactivada: "Cuenta reactivada",
    rol_admin_asignado: "Rol de administrador asignado", rol_admin_retirado: "Rol de administrador retirado",
    eliminado_demo: "Publicación de demostración eliminada",
    verificacion_enviada: "Perfil de propietario enviado", verificacion_aprobada: "Propietario aprobado",
    verificacion_info_solicitada: "Información adicional solicitada", verificacion_rechazada: "Propietario rechazado",
    condiciones_aceptadas: "Condiciones de comisión aceptadas",
    publicacion_moderada: "Publicación moderada", cuenta_estado_cambiado: "Estado de cuenta cambiado",
    verificacion_decidida: "Verificación decidida", solicitud_actualizada: "Solicitud actualizada",
    contrato_creado: "Contrato creado", contrato_editado: "Contrato editado", contrato_enviado: "Contrato enviado",
    contrato_cancelado: "Contrato cancelado", contrato_aceptado: "Contrato aceptado por una parte",
    contrato_formalizado: "Contrato formalizado", mensaje_a_parte: "Mensaje a una parte", mensaje_respondido: "Mensaje respondido",
    nota_interna_registrada: "Nota interna", conversacion_estado: "Estado de conversación",
    pago_habilitado: "Pago habilitado", pago_aprobado: "Pago aprobado", pago_rechazado: "Pago rechazado",
    pago_requiere_devolucion: "Cobro por devolver (Wompi)", pago_monto_no_coincide: "Monto distinto al firmado (Wompi)",
    disputa_abierta: "Disputa abierta", disputa_resuelta: "Disputa resuelta", desembolso_registrado: "Desembolso registrado",
    devolucion_registrada: "Devolución registrada", pago_cancelado: "Pago cancelado",
    acceso_denegado_panel: "Intento de acceso al panel sin permiso"
  }
};

function fecha(valor) {
  return valor ? new Date(valor).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function chip(texto, tipo) {
  return `<span class="admin-chip admin-chip-${tipo}">${escaparHTML(texto)}</span>`;
}

// Tarjeta de una lista del panel (reemplaza las filas de tabla). Todo lo que llega aquí ya viene
// escapado por quien llama. Arriba: referencia, título y estado; en medio: datos clave con su
// etiqueta; a la derecha (abajo en celular): la acción principal.
//   ref, titulo, sub, estado, datos: [[etiqueta, valor]], texto, acciones, imagen, destacada, compacta
function tarjeta(t) {
  const datos = (t.datos || []).filter(([, valor]) => valor !== null && valor !== undefined && valor !== "");
  return `
    <article class="admin-card${t.destacada ? " admin-card-destacada" : ""}${t.compacta ? " admin-card-compacta" : ""}">
      ${t.imagen ? `<img class="admin-card-foto" src="${t.imagen}" alt="" loading="lazy">` : ""}
      <div class="admin-card-cuerpo">
        <div class="admin-card-cabeza">
          <div class="admin-card-identidad">
            ${t.ref ? `<p class="admin-card-ref">${t.ref}</p>` : ""}
            <h3 class="admin-card-titulo">${t.titulo}</h3>
            ${t.sub ? `<p class="admin-card-sub">${t.sub}</p>` : ""}
          </div>
          ${t.estado ? `<div class="admin-card-estado">${t.estado}</div>` : ""}
        </div>
        ${datos.length ? `<dl class="admin-card-datos">${datos.map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor}</dd></div>`).join("")}</dl>` : ""}
        ${t.texto ? `<p class="admin-card-texto">${t.texto}</p>` : ""}
      </div>
      ${t.acciones ? `<div class="admin-card-acciones">${t.acciones}</div>` : ""}
    </article>`;
}

const ROLES_USUARIO = { estudiante: "Estudiante", propietario: "Propietario", admin: "Administración" };

function listaTarjetas(html) {
  return `<div class="admin-tarjetas">${html}</div>`;
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
  const dibujo = typeof ilustracionVacia === "function" ? ilustracionVacia("lista") : "";
  contenedor.innerHTML = `<div class="admin-vacio rx-vacio rx-vacio-compacto" role="status">${dibujo}<p>${escaparHTML(texto)}</p></div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  // La página solo se muestra si el servidor confirma el rol admin
  if (!(await protegerPagina(["admin"]))) return;

  const paneles = { resumen: cargarResumen, solicitudes: cargarSolicitudes, contratos: cargarContratos, pagos: cargarPagos, mensajes: cargarMensajes, reportes: cargarReportes, propietarios: cargarPropietarios, inmuebles: cargarInmuebles, usuarios: cargarUsuarios, historial: cargarHistorial };

  // Título y explicación de cada sección (se muestran arriba del contenido)
  const SECCIONES = {
    resumen: ["Resumen", "Lo que necesita atención hoy y las cifras de la plataforma."],
    solicitudes: ["Solicitudes", "Revisa cada solicitud de arriendo, compártela con el propietario y avanza su estado."],
    contratos: ["Contratos", "Contratos con firma electrónica: prepáralos desde la solicitud, envíalos y sigue las firmas."],
    pagos: ["Pagos", "Pagos del primer mes (con Wompi o simulados), comisión del 10 %, desembolsos, devoluciones y disputas."],
    mensajes: ["Mensajes", "Conversaciones de estudiantes y propietarios con el equipo de Roumix."],
    propietarios: ["Propietarios", "Verifica la identidad de los propietarios antes de que puedan publicar."],
    inmuebles: ["Publicaciones", "Modera las publicaciones: aprobar, pedir cambios, pausar o retirar."],
    reportes: ["Reportes", "Reportes de estudiantes y propietarios sobre publicaciones."],
    usuarios: ["Usuarios", "Cuentas de la plataforma: busca, suspende o reactiva."],
    historial: ["Auditoría", "Registro de solo adición de cada acción del equipo y de los pasos clave de los usuarios."]
  };

  // Menú lateral: en celular es un cajón que se abre con "Secciones"
  const lateral = document.getElementById("admin-lateral");
  const fondoLateral = document.getElementById("admin-lateral-fondo");
  const btnAbrirLateral = document.getElementById("admin-lateral-abrir");
  const esCelular = window.matchMedia("(max-width: 900px)");
  function abrirLateral() {
    lateral.classList.add("abierto");
    fondoLateral.hidden = false;
    btnAbrirLateral.setAttribute("aria-expanded", "true");
    document.body.classList.add("admin-lateral-bloqueo");
    (lateral.querySelector(".admin-tab.activa") || lateral.querySelector("button")).focus();
  }
  function cerrarLateral(devolverFoco) {
    if (!lateral.classList.contains("abierto")) return;
    lateral.classList.remove("abierto");
    fondoLateral.hidden = true;
    btnAbrirLateral.setAttribute("aria-expanded", "false");
    document.body.classList.remove("admin-lateral-bloqueo");
    if (devolverFoco) btnAbrirLateral.focus();
  }
  btnAbrirLateral.addEventListener("click", abrirLateral);
  document.getElementById("admin-lateral-cerrar").addEventListener("click", () => cerrarLateral(true));
  fondoLateral.addEventListener("click", () => cerrarLateral(true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarLateral(true); });
  esCelular.addEventListener("change", () => cerrarLateral(false));

  // El botón "Secciones" muestra cuántas cosas esperan atención en total
  function actualizarContadorTotal() {
    const total = [...lateral.querySelectorAll(".admin-contador")]
      .filter(c => !c.hidden).reduce((suma, c) => suma + (Number(c.textContent) || 0), 0);
    const contadorTotal = document.getElementById("contador-total");
    contadorTotal.textContent = total > 99 ? "99+" : String(total);
    contadorTotal.hidden = total === 0;
  }
  new MutationObserver(actualizarContadorTotal).observe(lateral, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });

  function abrirPanel(nombre) {
    if (!Object.hasOwn(paneles, nombre)) nombre = "resumen";
    document.querySelectorAll(".admin-tab").forEach(tab => {
      const activa = tab.dataset.panel === nombre;
      tab.classList.toggle("activa", activa);
      if (activa) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    document.querySelectorAll(".admin-panel").forEach(panel => { panel.hidden = panel.id !== `panel-${nombre}`; });
    const [titulo, descripcion] = SECCIONES[nombre];
    document.getElementById("admin-titulo").textContent = titulo;
    document.getElementById("admin-descripcion").textContent = descripcion;
    document.title = `${titulo} — Panel Roumix`;
    // La sección queda en la dirección: al recargar o volver atrás se abre la misma
    if (location.hash !== `#${nombre}`) history.replaceState(null, "", `#${nombre}`);
    cerrarLateral(false);
    paneles[nombre]();
  }
  document.querySelectorAll(".admin-tab").forEach(tab => tab.addEventListener("click", () => {
    abrirPanel(tab.dataset.panel);
    if (esCelular.matches) document.getElementById("admin-titulo").scrollIntoView({ block: "start" });
  }));

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
      const atencion = (n) => (n ? "alerta" : "neutro");
      const grupos = [
        ["Requiere atención", [
          ["Propietarios por revisar", data.verificaciones.porRevisar, atencion(data.verificaciones.porRevisar), "propietarios"],
          ["Solicitudes nuevas", data.solicitudes.nuevas, atencion(data.solicitudes.nuevas), "solicitudes"],
          ["Mensajes por responder", data.conversaciones.pendientes, atencion(data.conversaciones.pendientes), "mensajes"],
          ["Reportes pendientes", data.reportes.pendientes, atencion(data.reportes.pendientes), "reportes"],
          ["Publicaciones en revisión", data.inmuebles.enRevision, atencion(data.inmuebles.enRevision), "inmuebles"],
          ["Contratos en borrador", data.contratos.borradores, atencion(data.contratos.borradores), "contratos"],
          ["Desembolsos por hacer", data.pagos.por_desembolsar, atencion(data.pagos.por_desembolsar), "pagos"],
          ["Pagos en disputa", data.pagos.en_disputa, atencion(data.pagos.en_disputa), "pagos"],
          ["Bajas por fuera de Roumix (30 días)", data.bajasFueraRoumix || 0, atencion(data.bajasFueraRoumix), "inmuebles"]
        ]],
        ["La plataforma", [
          ["Estudiantes", data.usuarios.estudiantes, "neutro", "usuarios"],
          ["Propietarios", data.usuarios.propietarios, "neutro", "propietarios"],
          ["Propietarios aprobados", data.verificaciones.aprobados, "ok", "propietarios"],
          ["Publicaciones disponibles", data.inmuebles.visibles, "ok", "inmuebles"],
          ["Solicitudes en curso", data.solicitudes.abiertas, "neutro", "solicitudes"],
          ["Contratos por aceptar", data.contratos.por_aceptar, "neutro", "contratos"],
          ["Contratos formalizados", data.contratos.formalizados, "ok", "contratos"],
          ["Cuentas suspendidas", data.usuarios.suspendidos, atencion(data.usuarios.suspendidos), "usuarios"]
        ]],
        ["Finanzas", [
          ["Pagos registrados", data.pagos.registrados, "ok", "pagos"],
          ["Pagos por hacer", data.pagos.por_pagar, "neutro", "pagos"],
          ["Comisiones generadas", formatearPrecioCOP(data.pagos.comisiones), "ok", "pagos"]
        ]]
      ];
      const tarjeta = ([titulo, valor, tipo, panel]) => `
        <${panel ? `button type="button" data-ir="${panel}"` : "div"} class="admin-metrica admin-metrica-${tipo}">
          <span class="admin-metrica-valor">${escaparHTML(valor)}</span>
          <span class="admin-metrica-titulo">${titulo}</span>
        </${panel ? "button" : "div"}>`;
      const pendientes = grupos[0][1].filter(m => m[1] > 0);
      contenedor.innerHTML = grupos.map(([titulo, metricas], i) => `
        <section class="admin-grupo" aria-label="${titulo}">
          <h2 class="admin-grupo-titulo">${titulo}${i === 0 && pendientes.length === 0 ? ' <span class="admin-al-dia">✓ Todo al día</span>' : ""}</h2>
          <div class="admin-metricas">${(i === 0 && pendientes.length ? pendientes : metricas).map(tarjeta).join("")}</div>
        </section>`).join("") + graficaComisiones(data.comisionesPorMes || []);
      contenedor.querySelectorAll("[data-ir]").forEach(b => b.addEventListener("click", () => abrirPanel(b.dataset.ir)));
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }

  // Barras de comisiones por mes: lo cobrado (sólido) y lo que el débito automático cobrará (rayado)
  function graficaComisiones(meses) {
    if (!meses.length) return "";
    const nombreMes = (m) => {
      const [a, mm] = m.split("-").map(Number);
      return new Date(Date.UTC(a, mm - 1, 15)).toLocaleDateString("es-CO", { month: "short", timeZone: "UTC" }).replace(".", "");
    };
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).slice(0, 7);
    const maximo = Math.max(1, ...meses.map((m) => m.cobrada + m.programada));
    const compacto = (n) => n >= 1000000 ? `$${(n / 1000000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : `$${Math.round(n / 1000)} mil`;
    const cobradoTotal = meses.reduce((t, m) => t + m.cobrada, 0);
    const programadoTotal = meses.reduce((t, m) => t + m.programada, 0);
    const columnas = meses.map((m) => {
      const total = m.cobrada + m.programada;
      const tip = [m.cobrada ? `Cobrado: ${formatearPrecioCOP(m.cobrada)}` : "", m.programada ? `Programado: ${formatearPrecioCOP(m.programada)}` : ""].filter(Boolean).join(" · ") || "Sin comisiones";
      return `
        <div class="admin-grafica-col${m.mes === hoy ? " admin-grafica-hoy" : ""}" tabindex="0" aria-label="${nombreMes(m.mes)} ${m.mes.slice(0, 4)}: ${tip}">
          <span class="admin-grafica-valor">${total ? compacto(total) : ""}</span>
          <div class="admin-grafica-pila">
            ${m.programada ? `<span class="admin-grafica-barra admin-grafica-programada" style="--h:${(m.programada / maximo) * 100}%"></span>` : ""}
            ${m.cobrada ? `<span class="admin-grafica-barra admin-grafica-cobrada" style="--h:${(m.cobrada / maximo) * 100}%"></span>` : ""}
          </div>
          <span class="admin-grafica-mes">${nombreMes(m.mes)}${m.mes === hoy ? " · hoy" : ""}</span>
          <span class="admin-grafica-tip" role="tooltip">${escaparHTML(nombreMes(m.mes))} ${m.mes.slice(0, 4)}<br>${escaparHTML(tip)}</span>
        </div>`;
    }).join("");
    return `
      <section class="admin-grupo admin-grafica" aria-labelledby="titulo-grafica-comisiones">
        <h2 class="admin-grupo-titulo" id="titulo-grafica-comisiones">Comisiones por mes</h2>
        <p class="admin-grafica-nota">Cobrado en los últimos meses: <strong>${formatearPrecioCOP(cobradoTotal)}</strong> · Programado por débito automático: <strong>${formatearPrecioCOP(programadoTotal)}</strong></p>
        <div class="admin-grafica-leyenda" aria-hidden="true">
          <span><i class="admin-grafica-muestra admin-grafica-cobrada"></i>Cobrado</span>
          <span><i class="admin-grafica-muestra admin-grafica-programada"></i>Programado</span>
        </div>
        <div class="admin-grafica-area">${columnas}</div>
        <table class="sr-only">
          <caption>Comisiones de Roumix por mes</caption>
          <thead><tr><th scope="col">Mes</th><th scope="col">Cobrado</th><th scope="col">Programado</th></tr></thead>
          <tbody>${meses.map((m) => `<tr><th scope="row">${nombreMes(m.mes)} ${m.mes.slice(0, 4)}</th><td>${formatearPrecioCOP(m.cobrada)}</td><td>${formatearPrecioCOP(m.programada)}</td></tr>`).join("")}</tbody>
        </table>
      </section>`;
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
  // Lo que le toca hacer al equipo en cada estado (en la lista de solicitudes)
  const SIGUIENTE_CORTO = {
    recibida: "revisar y compartir con el propietario", en_revision: "esperar respuesta del propietario",
    aceptada: "coordinar visita o negociar", visita_coordinada: "negociar condiciones", en_negociacion: "acordar condiciones",
    contrato_pendiente: "preparar el contrato y recoger firmas", contrato_formalizado: "esperar el pago del primer mes",
    pago_pendiente: "esperar el pago del primer mes", pagado: "registrar el desembolso"
  };
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
        ${listaTarjetas(data.map(s => tarjeta({
          ref: `Solicitud #${s.id} · ${fecha(s.created_at)}`,
          titulo: escaparHTML(s.inmueble_titulo),
          sub: `Inmueble #${s.inmueble_id} · ${escaparHTML(s.barrio || "—")} · ${formatearPrecioCOP(s.canon_mensual)}/mes`,
          estado: chipSolicitud(s.estado) + (SIGUIENTE_CORTO[s.estado] ? `<small class="admin-card-siguiente">Sigue: ${SIGUIENTE_CORTO[s.estado]}</small>` : ""),
          destacada: s.estado === "recibida",
          datos: [
            ["Estudiante", `${escaparHTML(s.estudiante_nombre || "Cuenta eliminada")}<small>${escaparHTML(s.estudiante_email || "")}</small>`],
            ["Propietario", `${escaparHTML(s.propietario_nombre || "—")}<small>${escaparHTML(s.propietario_telefono || s.propietario_email || "")}</small>`],
            ["Ingreso", `${fechaDia(s.fecha_ingreso)}<small>${s.duracion_meses} mes(es) · ${s.personas} persona(s)</small>`]
          ],
          acciones: `<button type="button" class="btn-card-action${s.estado === "recibida" ? " btn-card-principal" : ""}" data-solicitud="${s.id}">${s.estado === "recibida" ? "Revisar" : "Gestionar"}</button>`
        })).join(""))}`;
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

  // Recorrido de una solicitud: cada estado cae en uno de estos pasos
  const PASOS_SOLICITUD = [
    { titulo: "Recibida", estados: ["recibida"] },
    { titulo: "Con el propietario", estados: ["en_revision"] },
    { titulo: "Aceptada", estados: ["aceptada", "visita_coordinada"] },
    { titulo: "Negociación", estados: ["en_negociacion"] },
    { titulo: "Contrato", estados: ["contrato_pendiente"] },
    { titulo: "Pago", estados: ["contrato_formalizado", "pago_pendiente"] },
    { titulo: "Lista", estados: ["pagado", "completada"] }
  ];
  const pasoDe = (estado) => PASOS_SOLICITUD.findIndex(p => p.estados.includes(estado));
  // Qué pasa con cada cambio de estado (se muestra al elegirlo)
  const EFECTO_ESTADO = {
    en_revision: "Se comparte con el propietario, sin los datos del estudiante, y le llega un correo.",
    aceptada: "El propietario aceptó la solicitud. Cuéntale al estudiante.",
    visita_coordinada: "Ya hay fecha para que el estudiante conozca el lugar.",
    en_negociacion: "Las partes ajustan canon, fechas y condiciones a través de Roumix.",
    contrato_pendiente: "Ya hay acuerdo: se habilita preparar el contrato.",
    rechazada: "La solicitud se cierra. Explícale el motivo al estudiante.",
    cancelada: "La solicitud se cierra (por ejemplo, el estudiante desistió). Explícale el motivo."
  };
  const CIERRES = ["rechazada", "cancelada"];

  /** La guía de "Lo que sigue": qué hacer ahora y los botones para hacerlo. */
  function siguientePaso(s, contratos) {
    const vigente = contratos.find(c => VIGENTES.includes(c.estado));
    const avanzar = (estado, texto, principal) => s.siguientes.includes(estado)
      ? `<button type="button" class="${principal ? "btn-search-action" : "btn-card-action"}" data-avanzar="${estado}">${texto}</button>` : "";
    const escribir = (para, texto) => `<button type="button" class="btn-card-action" data-escribir="${para}">${texto}</button>`;
    const guias = {
      recibida: ["Revisa la solicitud y compártela con el propietario",
        "Comprueba que las fechas, la duración y el número de personas tengan sentido para este inmueble. Si todo está bien, compártela: el propietario recibe un correo sin los datos del estudiante.",
        avanzar("en_revision", "Compartir con el propietario", true) + escribir("estudiante", "Preguntarle algo al estudiante")],
      en_revision: ["Espera la respuesta del propietario",
        "El propietario ya conoce la solicitud. Cuando acepte, márcala como aceptada; si no puede, recházala explicándole el motivo al estudiante.",
        avanzar("aceptada", "El propietario aceptó", true) + escribir("propietario", "Escribirle al propietario")],
      aceptada: ["Coordina una visita o pasen a negociar",
        "Si el estudiante quiere conocer el lugar, acuerden una visita. Si no hace falta, pasen directo a negociar las condiciones.",
        avanzar("visita_coordinada", "Hay visita coordinada", true) + avanzar("en_negociacion", "Pasar a negociación")],
      visita_coordinada: ["Después de la visita, negocien las condiciones",
        "Si el estudiante sigue interesado, pasen a acordar canon, fecha de inicio, duración y reglas de la casa.",
        avanzar("en_negociacion", "Pasar a negociación", true) + escribir("estudiante", "Escribirle al estudiante")],
      en_negociacion: ["Acuerden las condiciones del contrato",
        "Cuando las dos partes estén de acuerdo en canon, fechas y condiciones, pásala a «Contrato pendiente» para preparar el contrato.",
        avanzar("contrato_pendiente", "Ya hay acuerdo: preparar contrato", true)],
      contrato_pendiente: !vigente
        ? ["Prepara el contrato", "Los datos de la solicitud ya vienen llenos. Ajusta lo acordado y crea el borrador; las partes todavía no lo verán.",
          '<button type="button" class="btn-search-action" data-ir-contrato>Ir al contrato</button>']
        : vigente.estado === "borrador"
          ? ["Revisa el borrador y envíalo", "Cuando lo envíes, las partes reciben un correo para firmarlo y ya no se podrá editar. Ambas deben tener registrado su documento de identidad.",
            '<button type="button" class="btn-search-action" data-ir-contrato>Ir al contrato</button>']
          : ["Esperando las firmas", `Firmas: ${[vigente.aceptado_propietario_en, vigente.aceptado_estudiante_en].filter(Boolean).length} de 2. Si alguien no ha firmado, recuérdaselo por mensaje. Plazo para firmar: ${fecha(vigente.vence_en)}`,
            '<button type="button" class="btn-card-action" data-ir-contrato>Ver el contrato</button>' +
            (vigente.aceptado_estudiante_en ? "" : escribir("estudiante", "Recordarle al estudiante")) +
            (vigente.aceptado_propietario_en ? "" : escribir("propietario", "Recordarle al propietario"))],
      contrato_formalizado: ["El estudiante debe pagar el primer mes", "El contrato está firmado por ambas partes. El pago se habilita en Roumix y se sigue desde la sección Pagos.",
        '<button type="button" class="btn-card-action" data-ir-panel="pagos">Ir a Pagos</button>'],
      pago_pendiente: ["El estudiante debe pagar el primer mes", "El pago está habilitado. Si se demora, escríbele al estudiante.",
        '<button type="button" class="btn-card-action" data-ir-panel="pagos">Ir a Pagos</button>' + escribir("estudiante", "Escribirle al estudiante")],
      pagado: ["Registra el desembolso al propietario", "El pago se recibió. Transfiérele al propietario su parte y regístralo en Pagos.",
        '<button type="button" class="btn-search-action" data-ir-panel="pagos">Ir a Pagos</button>'],
      completada: ["Proceso terminado", "La solicitud se completó. No hay nada pendiente.", ""],
      rechazada: ["Solicitud cerrada", "Fue rechazada. Puedes dejar notas internas, pero ya no cambia de estado.", ""],
      cancelada: ["Solicitud cerrada", "Fue cancelada. Puedes dejar notas internas, pero ya no cambia de estado.", ""]
    };
    const [titulo, texto, botones] = guias[s.estado] || ["", "", ""];
    if (!titulo) return "";
    const cerrada = ["completada", "rechazada", "cancelada"].includes(s.estado);
    return `
      <section class="sol-siguiente${cerrada ? " sol-siguiente-cerrada" : ""}" aria-labelledby="sol-siguiente-titulo">
        <p class="sol-siguiente-etiqueta">${cerrada ? "Estado" : "Lo que sigue"}</p>
        <h3 id="sol-siguiente-titulo">${escaparHTML(titulo)}</h3>
        <p>${escaparHTML(texto)}</p>
        ${botones ? `<div class="sol-siguiente-botones">${botones}</div>` : ""}
      </section>`;
  }

  /** Barra de pasos con el lugar de la solicitud en el recorrido. */
  function barraPasos(s) {
    let actual = pasoDe(s.estado);
    let detenida = false;
    if (actual === -1) {
      // Cerrada: se marca el paso en el que estaba cuando se cerró
      const ultimo = [...s.historial].reverse().find(h => h.estado_nuevo === s.estado && h.estado_anterior);
      actual = Math.max(0, ultimo ? pasoDe(ultimo.estado_anterior) : 0);
      detenida = true;
    }
    const lista = s.estado === "completada" || s.estado === "pagado";
    return `
      <ol class="sol-pasos${detenida ? " sol-pasos-detenida" : ""}" aria-label="Recorrido de la solicitud">
        ${PASOS_SOLICITUD.map((p, i) => {
          const estado = i < actual || (lista && i === actual) ? "hecho" : i === actual ? (detenida ? "detenido" : "actual") : "pendiente";
          const nota = { hecho: "completado", actual: "paso actual", detenido: `aquí se ${s.estado === "rechazada" ? "rechazó" : "canceló"}`, pendiente: "pendiente" }[estado];
          return `<li class="sol-paso sol-paso-${estado}"${estado === "actual" || estado === "detenido" ? ' aria-current="step"' : ""}>
            <span class="sol-paso-punto" aria-hidden="true">${estado === "hecho" ? "✓" : estado === "detenido" ? "×" : i + 1}</span>
            <span class="sol-paso-texto">${p.titulo}<span class="sr-only"> (${nota})</span></span>
          </li>`;
        }).join("")}
      </ol>`;
  }

  async function abrirSolicitud(id, pestana) {
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
    const autor = (h) => h.autor_rol === "admin" ? `Roumix · ${escaparHTML(h.autor_nombre || "admin")}` : h.autor_rol === "estudiante" ? "Estudiante" : h.autor_rol === "propietario" ? "Propietario" : "Sistema";
    const conContrato = contratos.length > 0 || ["contrato_pendiente", "contrato_formalizado", "pago_pendiente", "pagado", "completada"].includes(s.estado);
    const avances = s.siguientes.filter(e => !CIERRES.includes(e));
    const cierres = s.siguientes.filter(e => CIERRES.includes(e));
    const opcionEstado = (e) => `
      <label class="sol-opcion${CIERRES.includes(e) ? " sol-opcion-cierre" : ""}">
        <input type="radio" name="sol-estado" value="${e}">
        <span><strong>${escaparHTML(e === "en_negociacion" && s.estado === "contrato_pendiente" ? "Volver a negociación" : ETIQUETAS.solicitud[e])}</strong>
          <small>${escaparHTML(e === "en_negociacion" && s.estado === "contrato_pendiente" ? "Cancela el contrato que esté en curso para renegociar." : EFECTO_ESTADO[e] || "")}</small></span>
      </label>`;
    const historialOrdenado = [...s.historial].reverse();

    contenidoSolicitud.innerHTML = `
      <header class="sol-cabeza">
        <p class="sol-ref">Solicitud #${s.id} · recibida el ${fecha(s.created_at)}</p>
        <h2 id="dialogo-solicitud-titulo">${escaparHTML(s.inmueble_titulo)}</h2>
        <p class="sol-chips">${chipSolicitud(s.estado)} ${compartida ? chip("Compartida con el propietario", "aprobada") : chip("El propietario aún no la conoce", "pendiente")}</p>
      </header>

      ${barraPasos(s)}
      ${siguientePaso(s, contratos)}

      <div class="sol-tarjetas">
        <section class="sol-tarjeta" aria-labelledby="sol-datos-titulo">
          <h3 id="sol-datos-titulo">Lo que pide el estudiante</h3>
          <dl class="sol-datos">
            <div><dt>Canon</dt><dd>${formatearPrecioCOP(s.canon_mensual)}/mes</dd></div>
            <div><dt>Ingreso</dt><dd>${fechaDia(s.fecha_ingreso)}</dd></div>
            <div><dt>Duración</dt><dd>${s.duracion_meses} ${s.duracion_meses === 1 ? "mes" : "meses"}</dd></div>
            <div><dt>Personas</dt><dd>${s.personas}${s.capacidad ? ` <small>de ${s.capacidad} posibles</small>` : ""}</dd></div>
          </dl>
          <p class="sol-inmueble"><a href="detalle.html?id=${s.inmueble_id}" target="_blank" rel="noopener">Ver publicación #${s.inmueble_id}</a> · ${escaparHTML(s.barrio || "—")} · ${escaparHTML(ETIQUETAS.estado[s.inmueble_estado] || s.inmueble_estado)}</p>
          ${s.mensaje ? `<blockquote class="sol-mensaje">${escaparHTML(s.mensaje)}</blockquote>` : '<p class="sol-vacio">El estudiante no dejó mensaje.</p>'}
        </section>
        <section class="sol-tarjeta" aria-labelledby="sol-partes-titulo">
          <h3 id="sol-partes-titulo">Partes <span class="sol-privado">Solo Roumix</span></h3>
          <div class="sol-parte">
            <span class="sol-parte-rol">Estudiante</span>
            <strong>${escaparHTML(s.estudiante_nombre || "Cuenta eliminada")}</strong>
            <small>${escaparHTML(s.estudiante_email || "")}${s.estudiante_telefono ? " · " + escaparHTML(s.estudiante_telefono) : ""}</small>
          </div>
          <div class="sol-parte">
            <span class="sol-parte-rol">Propietario</span>
            <strong>${escaparHTML(s.propietario_nombre || "—")}</strong>
            <small>${escaparHTML(s.propietario_email || "")}${s.propietario_telefono ? " · " + escaparHTML(s.propietario_telefono) : ""}</small>
          </div>
          <p class="sol-aviso">No compartas estos datos entre las partes: toda la comunicación pasa por Roumix.</p>
        </section>
      </div>

      ${conContrato ? `<div id="sol-contrato">${seccionContrato(s, contratos)}</div>` : ""}

      <div class="sol-acciones">
        <div class="sol-pestanas" role="tablist" aria-label="Acciones sobre la solicitud">
          <button type="button" role="tab" id="tab-sol-actualizar" aria-controls="sol-panel-actualizar" data-pestana="actualizar">${cerrada ? "Nota interna" : "Cambiar estado"}</button>
          <button type="button" role="tab" id="tab-sol-escribir" aria-controls="sol-panel-escribir" data-pestana="escribir">Escribir a una parte</button>
          <button type="button" role="tab" id="tab-sol-historial" aria-controls="sol-panel-historial" data-pestana="historial">Historial <span class="sol-contador">${s.historial.length}</span></button>
        </div>

        <form class="sol-panel" id="sol-panel-actualizar" role="tabpanel" aria-labelledby="tab-sol-actualizar" novalidate>
          ${cerrada ? '<p class="sol-ayuda">La solicitud está cerrada. Puedes dejar una nota para el equipo; las partes no la ven.</p>' : `
          <fieldset class="sol-opciones">
            <legend>¿A qué estado pasa? <span>Ahora: ${escaparHTML(ETIQUETAS.solicitud[s.estado])}</span></legend>
            ${avances.map(opcionEstado).join("")}
            ${cierres.length ? `<p class="sol-opciones-separador">Cerrar la solicitud</p>${cierres.map(opcionEstado).join("")}` : ""}
            <label class="sol-opcion sol-opcion-sin">
              <input type="radio" name="sol-estado" value="">
              <span><strong>No cambiar el estado</strong><small>Solo enviar un mensaje o dejar una nota.</small></span>
            </label>
          </fieldset>
          <div class="sol-campos" id="sol-campos" hidden>
            <div class="sol-campo">
              <label for="sol-admin-nota-est" id="sol-etiqueta-est">Mensaje para el estudiante <span>opcional · le llega por correo</span></label>
              <textarea id="sol-admin-nota-est" rows="2" maxlength="1000" placeholder="Ej: El propietario puede mostrarte la habitación el sábado a las 10 a. m."></textarea>
            </div>
            <div class="sol-campo" id="sol-campo-prop">
              <label for="sol-admin-nota-prop">Mensaje para el propietario <span>opcional · le llega por correo</span></label>
              <textarea id="sol-admin-nota-prop" rows="2" maxlength="1000" placeholder="Ej: Una estudiante quiere tu habitación desde el próximo mes, por 6 meses."></textarea>
            </div>`}
            <div class="sol-campo">
              <label for="sol-admin-nota-int">Nota interna <span>opcional · solo la ve el equipo</span></label>
              <textarea id="sol-admin-nota-int" rows="2" maxlength="1000" placeholder="Ej: Llamé al propietario, confirma disponibilidad."></textarea>
            </div>
            <p class="pub-mensaje" id="sol-admin-resultado" role="alert" hidden></p>
            <button type="submit" class="btn-search-action" id="sol-guardar">${cerrada ? "Guardar nota" : "Guardar"}</button>
          ${cerrada ? "" : "</div>"}
        </form>

        <form class="sol-panel" id="sol-panel-escribir" role="tabpanel" aria-labelledby="tab-sol-escribir" novalidate hidden>
          <p class="sol-ayuda">Abre una conversación en la bandeja «Mensajes» de la persona y le llega un correo. Cada parte solo habla con Roumix.</p>
          <fieldset class="sol-destinos">
            <legend class="sr-only">Destinatario</legend>
            <label class="sol-destino"><input type="radio" name="para-parte" value="estudiante" checked><span>Al estudiante</span></label>
            <label class="sol-destino${compartida ? "" : " sol-destino-bloqueado"}"><input type="radio" name="para-parte" value="propietario" ${compartida ? "" : "disabled"}><span>Al propietario${compartida ? "" : "<small>Primero compártele la solicitud</small>"}</span></label>
          </fieldset>
          <div class="sol-campo">
            <label for="sol-parte-mensaje">Mensaje</label>
            <textarea id="sol-parte-mensaje" rows="4" maxlength="2000" placeholder="Ej: Hola, ¿qué día te queda bien para la visita?"></textarea>
          </div>
          <p class="pub-mensaje" id="sol-parte-resultado" role="alert" hidden></p>
          <button type="submit" class="btn-search-action">Enviar mensaje</button>
        </form>

        <div class="sol-panel" id="sol-panel-historial" role="tabpanel" aria-labelledby="tab-sol-historial" hidden>
          <ol class="sol-linea">
            ${historialOrdenado.map(h => `
              <li class="sol-evento${h.estado_nuevo ? " sol-evento-estado" : ""}">
                <span class="sol-evento-meta">${fecha(h.created_at)} · ${autor(h)}</span>
                ${h.estado_nuevo ? `<p class="sol-evento-titulo">${h.estado_anterior ? `${escaparHTML(ETIQUETAS.solicitud[h.estado_anterior] || h.estado_anterior)} → ` : ""}<strong>${escaparHTML(ETIQUETAS.solicitud[h.estado_nuevo] || h.estado_nuevo)}</strong></p>` : ""}
                ${h.nota_estudiante ? `<p class="sol-nota"><span>Al estudiante</span>${escaparHTML(h.nota_estudiante)}</p>` : ""}
                ${h.nota_propietario ? `<p class="sol-nota"><span>Al propietario</span>${escaparHTML(h.nota_propietario)}</p>` : ""}
                ${h.nota_interna ? `<p class="sol-nota sol-nota-interna"><span>Nota interna</span>${escaparHTML(h.nota_interna)}</p>` : ""}
              </li>`).join("")}
          </ol>
        </div>
      </div>`;

    if (conContrato) activarSeccionContrato(s, contratos);

    // En pantallas angostas la barra de pasos se desplaza: se centra en el paso actual
    const barra = contenidoSolicitud.querySelector(".sol-pasos");
    const pasoActual = barra && barra.querySelector('[aria-current="step"]');
    if (pasoActual && barra.scrollWidth > barra.clientWidth) {
      barra.scrollLeft = pasoActual.offsetLeft - barra.offsetLeft - (barra.clientWidth - pasoActual.offsetWidth) / 2;
    }

    // Pestañas (con flechas del teclado)
    const pestanas = [...contenidoSolicitud.querySelectorAll("[data-pestana]")];
    function mostrarPestana(nombre, enfocar) {
      pestanas.forEach(b => {
        const activa = b.dataset.pestana === nombre;
        b.setAttribute("aria-selected", String(activa));
        b.tabIndex = activa ? 0 : -1;
        document.getElementById(b.getAttribute("aria-controls")).hidden = !activa;
        if (activa && enfocar) b.focus();
      });
    }
    pestanas.forEach((b, i) => {
      b.addEventListener("click", () => mostrarPestana(b.dataset.pestana));
      b.addEventListener("keydown", (e) => {
        const salto = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (salto) mostrarPestana(pestanas[(i + salto + pestanas.length) % pestanas.length].dataset.pestana, true);
      });
    });
    mostrarPestana(pestana || "actualizar");

    // Formulario de cambio de estado: los campos aparecen al elegir una opción y se adaptan a ella
    const form = document.getElementById("sol-panel-actualizar");
    const campos = document.getElementById("sol-campos");
    const guardar = document.getElementById("sol-guardar");
    function alElegirEstado() {
      const elegido = form.querySelector('input[name="sol-estado"]:checked');
      if (!elegido || !campos) return;
      const estado = elegido.value;
      campos.hidden = false;
      const cierra = CIERRES.includes(estado);
      document.getElementById("sol-etiqueta-est").innerHTML = cierra
        ? "Mensaje para el estudiante <span class=\"sol-obligatorio\">obligatorio · explícale el motivo</span>"
        : "Mensaje para el estudiante <span>opcional · le llega por correo</span>";
      // Al propietario solo se le escribe si ya conoce la solicitud (o se le comparte ahora)
      document.getElementById("sol-campo-prop").hidden = !(compartida || estado === "en_revision");
      guardar.textContent = estado ? `Pasar a «${estado === "en_negociacion" && s.estado === "contrato_pendiente" ? "Volver a negociación" : ETIQUETAS.solicitud[estado]}»` : "Guardar mensajes y nota";
      guardar.classList.toggle("sol-guardar-cierre", cierra);
    }
    form.addEventListener("change", (e) => { if (e.target.name === "sol-estado") alElegirEstado(); });

    // Botones de "Lo que sigue"
    contenidoSolicitud.querySelectorAll("[data-avanzar]").forEach(b => b.addEventListener("click", () => {
      mostrarPestana("actualizar");
      const opcion = form.querySelector(`input[name="sol-estado"][value="${b.dataset.avanzar}"]`);
      if (!opcion) return;
      opcion.checked = true;
      alElegirEstado();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      (document.getElementById(b.dataset.avanzar === "en_revision" ? "sol-admin-nota-prop" : "sol-admin-nota-est") || opcion).focus({ preventScroll: true });
    }));
    contenidoSolicitud.querySelectorAll("[data-escribir]").forEach(b => b.addEventListener("click", () => {
      mostrarPestana("escribir");
      const opcion = contenidoSolicitud.querySelector(`input[name="para-parte"][value="${b.dataset.escribir}"]`);
      if (opcion && !opcion.disabled) opcion.checked = true;
      const panel = document.getElementById("sol-panel-escribir");
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("sol-parte-mensaje").focus({ preventScroll: true });
    }));
    contenidoSolicitud.querySelectorAll("[data-ir-contrato]").forEach(b => b.addEventListener("click", () => {
      const seccion = document.getElementById("sol-contrato");
      if (!seccion) return;
      seccion.scrollIntoView({ behavior: "smooth", block: "start" });
      const primero = seccion.querySelector("input, a, button");
      if (primero) primero.focus({ preventScroll: true });
    }));
    contenidoSolicitud.querySelectorAll("[data-ir-panel]").forEach(b => b.addEventListener("click", () => {
      dialogoSolicitud.close();
      abrirPanel(b.dataset.irPanel);
    }));

    document.getElementById("sol-panel-escribir").addEventListener("submit", async (e) => {
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

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const resultado = document.getElementById("sol-admin-resultado");
      const mostrar = (texto) => { resultado.textContent = texto; resultado.className = "pub-mensaje pub-mensaje-error"; resultado.hidden = false; };
      const valor = (id) => { const el = document.getElementById(id); return el && !el.closest("[hidden]") ? el.value.trim() : ""; };
      const elegido = form.querySelector('input[name="sol-estado"]:checked');
      if (!cerrada && !elegido) return mostrar("Elige a qué estado pasa la solicitud, o «No cambiar el estado».");
      const estado = elegido ? elegido.value : "";
      const cuerpo = {
        estado: estado || undefined,
        notaEstudiante: valor("sol-admin-nota-est") || undefined,
        notaPropietario: valor("sol-admin-nota-prop") || undefined,
        notaInterna: valor("sol-admin-nota-int") || undefined
      };
      if (!estado && !cuerpo.notaEstudiante && !cuerpo.notaPropietario && !cuerpo.notaInterna) return mostrar(cerrada ? "Escribe la nota." : "Escribe al menos un mensaje o una nota.");
      if (CIERRES.includes(estado) && !cuerpo.notaEstudiante) {
        mostrar("Explícale al estudiante por qué se cierra la solicitud.");
        return document.getElementById("sol-admin-nota-est").focus();
      }
      if (CIERRES.includes(estado) && !confirm(`¿Confirmas marcar la solicitud #${s.id} como "${ETIQUETAS.solicitud[estado]}"? Se cerrará.`)) return;

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

  // ---------------- Contratos (firma electrónica F-1 a F-4) ----------------
  const ETIQUETA_CONTRATO = {
    borrador: "Borrador", enviado: "Enviado", pendiente_aceptacion: "Falta una firma",
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
        ${listaTarjetas(data.map(c => tarjeta({
          ref: `Contrato #${c.id} · Solicitud #${c.solicitud_id}`,
          titulo: escaparHTML(c.inmueble_titulo),
          sub: `${formatearPrecioCOP(c.canon_mensual)}/mes · desde ${fechaDia(c.fecha_inicio)} · ${c.duracion_meses} mes(es)`,
          estado: chipContrato(c.estado) + (c.vence_en && ["enviado", "pendiente_aceptacion"].includes(c.estado) ? `<small>Vence ${fecha(c.vence_en)}</small>` : ""),
          destacada: c.estado === "borrador",
          datos: [
            ["Arrendador", `${escaparHTML(c.propietario_nombre)}<small>${c.aceptado_propietario_en ? "✓ Firmó" : "Falta firmar"}</small>`],
            ["Arrendatario", `${escaparHTML(c.estudiante_nombre)}<small>${c.aceptado_estudiante_en ? "✓ Firmó" : "Falta firmar"}</small>`]
          ],
          acciones: `<button type="button" class="btn-card-action" data-solicitud-contrato="${c.solicitud_id}">Gestionar</button>`
        })).join(""))}`;
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
      canon_mensual: s.canon_mensual, dia_pago: 5, duracion_meses: s.duracion_meses,
      fecha_inicio: isoDia(s.fecha_ingreso) < hoyLocal() ? hoyLocal() : isoDia(s.fecha_ingreso),
      inmueble_direccion: "", servicios_incluidos: "", condiciones: ""
    };
    return `
      <form id="form-contrato" class="admin-contrato-form" novalidate>
        <fieldset class="ct-grupo">
          <legend>Dinero</legend>
          <div class="admin-contrato-grid">
            <label>Canon mensual (COP)<input type="number" id="ct-canon" min="1" step="1000" inputmode="numeric" value="${escaparHTML(v.canon_mensual)}"><small id="ct-canon-texto"></small></label>
            <label>Día de pago de cada mes<input type="number" id="ct-dia" min="1" max="28" inputmode="numeric" value="${escaparHTML(v.dia_pago)}"><small>Entre 1 y 28</small></label>
          </div>
          <p class="ct-nota">Sin depósito: la Ley 820 de 2003 (art. 16) no permite exigirlo.</p>
        </fieldset>
        <fieldset class="ct-grupo">
          <legend>Fechas</legend>
          <div class="admin-contrato-grid">
            <label>Fecha de inicio<input type="date" id="ct-inicio" value="${escaparHTML(isoDia(v.fecha_inicio))}"></label>
            <label>Duración (meses)<input type="number" id="ct-duracion" min="1" max="24" inputmode="numeric" value="${escaparHTML(v.duracion_meses)}"><small id="ct-fin"></small></label>
          </div>
        </fieldset>
        <fieldset class="ct-grupo">
          <legend>Inmueble</legend>
          <label>Dirección<input type="text" id="ct-direccion" maxlength="200" value="${escaparHTML(v.inmueble_direccion || "")}" placeholder="Ej: Calle 40 # 30-15, apto 201"></label>
          <label>Servicios incluidos en el canon<input type="text" id="ct-servicios" maxlength="500" value="${escaparHTML(v.servicios_incluidos || "")}" placeholder="Ej: Agua, luz, gas e internet"></label>
        </fieldset>
        <fieldset class="ct-grupo">
          <legend>Condiciones acordadas</legend>
          <label class="sr-only" for="ct-condiciones">Condiciones acordadas</label>
          <textarea id="ct-condiciones" rows="4" maxlength="5000" placeholder="Ej: No se permiten mascotas. Visitas hasta las 10 p. m.">${escaparHTML(v.condiciones || "")}</textarea>
          <small class="ct-nota">Reglas de la casa y lo que hayan pactado. Quedan en el PDF del contrato.</small>
        </fieldset>
        <p class="pub-mensaje" id="ct-resultado" role="alert" hidden></p>
        <div class="admin-botones">
          ${c ? `<button type="button" class="btn-search-action" id="ct-enviar">Enviar a las partes para firmar</button>` : ""}
          <button type="submit" class="${c ? "btn-card-action" : "btn-search-action"}">${c ? "Guardar borrador" : "Crear borrador"}</button>
          ${c ? `<a class="btn-card-action" href="contrato.html?id=${c.id}" target="_blank" rel="noopener">Vista previa</a>` : ""}
        </div>
      </form>`;
  }

  // Mini recorrido del contrato: borrador → enviado → firmas → formalizado
  function pasosContrato(c) {
    const firmas = c ? [c.aceptado_propietario_en, c.aceptado_estudiante_en].filter(Boolean).length : 0;
    const actual = !c || c.estado === "borrador" ? 0 : c.estado === "formalizado" ? 4 : 2;
    const pasos = ["Borrador", "Enviado", `Firmas (${firmas}/2)`, "Formalizado"];
    return `<ol class="ct-pasos" aria-label="Estado del contrato">${pasos.map((p, i) => {
      const estado = i < actual ? "hecho" : i === actual ? "actual" : "pendiente";
      return `<li class="ct-paso ct-paso-${estado}"${estado === "actual" ? ' aria-current="step"' : ""}>${p}</li>`;
    }).join("")}</ol>`;
  }

  function seccionContrato(s, contratos) {
    const vigente = contratos.find(c => VIGENTES.includes(c.estado));
    const formalizado = contratos.find(c => c.estado === "formalizado");
    const historial = contratos.filter(c => c !== vigente && c !== formalizado);
    const firma = (fechaFirma, nombre, rol) => `
      <div class="ct-firma${fechaFirma ? " ct-firma-ok" : ""}">
        <span class="sol-parte-rol">${rol}</span>
        ${fechaFirma ? `<strong>✓ Firmó</strong><small>${escaparHTML(nombre || "")} · ${fecha(fechaFirma)}</small>` : "<strong>Falta firmar</strong>"}
      </div>`;
    let cuerpo;
    if (formalizado) {
      cuerpo = `${pasosContrato(formalizado)}
        <p class="ct-texto">Contrato #${formalizado.id} firmado por ambas partes el ${fecha(formalizado.formalizado_en)}.</p>
        ${formalizado.codigo_verificacion ? `<p class="ct-texto">Código de verificación: <code>${escaparHTML(formalizado.codigo_verificacion)}</code></p>` : ""}
        <div class="admin-botones"><a class="btn-card-action" href="contrato.html?id=${formalizado.id}" target="_blank" rel="noopener">Ver contrato firmado</a></div>`;
    } else if (vigente && vigente.estado === "borrador") {
      cuerpo = `${pasosContrato(vigente)}
        <p class="ct-texto">Las partes todavía no lo ven. Revisa los datos y envíalo; una vez enviado ya no se puede editar.</p>
        ${formularioContrato(s, vigente)}`;
    } else if (vigente) {
      cuerpo = `${pasosContrato(vigente)}
        <p class="ct-texto">Enviado el ${fecha(vigente.enviado_en)} · las partes tienen hasta el ${fecha(vigente.vence_en)} para firmarlo.</p>
        <div class="ct-firmas">
          ${firma(vigente.aceptado_propietario_en, vigente.firma_propietario, "Propietario")}
          ${firma(vigente.aceptado_estudiante_en, vigente.firma_estudiante, "Estudiante")}
        </div>
        <div class="admin-botones"><a class="btn-card-action" href="contrato.html?id=${vigente.id}" target="_blank" rel="noopener">Ver contrato</a></div>`;
    } else if (s.estado === "contrato_pendiente") {
      cuerpo = `${pasosContrato(null)}
        <p class="ct-texto">Los datos de la solicitud ya vienen llenos: ajusta lo que acordaron las partes y crea el borrador.</p>
        ${formularioContrato(s, null)}`;
    } else {
      cuerpo = '<p class="ct-texto">No hay un contrato en curso.</p>';
    }
    const cancelar = vigente ? `
      <details class="admin-cancelar-contrato">
        <summary>Cancelar este contrato</summary>
        <label class="reporte-label" for="ct-motivo">Motivo (queda en el historial)</label>
        <textarea id="ct-motivo" rows="2" maxlength="500"></textarea>
        <button type="button" class="btn-card-action btn-card-danger" id="ct-cancelar">Cancelar contrato #${vigente.id}</button>
      </details>` : "";
    return `
      <section class="sol-tarjeta admin-seccion-contrato" aria-labelledby="ct-titulo">
        <h3 id="ct-titulo">Contrato${vigente || formalizado ? ` <small>#${(vigente || formalizado).id}</small>` : ""}</h3>
        ${cuerpo}
        ${cancelar}
        ${historial.length ? `<p class="ct-anteriores">Anteriores: ${historial.map(c => `<a href="contrato.html?id=${c.id}" target="_blank" rel="noopener">#${c.id}</a> ${escaparHTML(ETIQUETA_CONTRATO[c.estado])}`).join(" · ")}</p>` : ""}
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
      fechaInicio: document.getElementById("ct-inicio").value,
      duracionMeses: Number(document.getElementById("ct-duracion").value),
      diaPago: Number(document.getElementById("ct-dia").value),
      inmuebleDireccion: document.getElementById("ct-direccion").value,
      serviciosIncluidos: document.getElementById("ct-servicios").value,
      condiciones: document.getElementById("ct-condiciones").value
    });

    const form = document.getElementById("form-contrato");
    if (form) {
      // Ayudas debajo de los campos: el canon en pesos y la fecha en que termina
      const ayudas = () => {
        const canon = Number(document.getElementById("ct-canon").value);
        document.getElementById("ct-canon-texto").textContent = canon > 0 ? `${formatearPrecioCOP(canon)} al mes` : "";
        const [a, m, d] = document.getElementById("ct-inicio").value.split("-").map(Number);
        const meses = Number(document.getElementById("ct-duracion").value);
        let texto = "";
        if (a && m && d && Number.isInteger(meses) && meses > 0) {
          // Igual que el servidor: inicio + meses (sin pasarse del último día del mes) − 1 día
          const mesFin = new Date(a, m - 1 + meses, 1);
          const ultimo = new Date(mesFin.getFullYear(), mesFin.getMonth() + 1, 0).getDate();
          const fin = new Date(mesFin.getFullYear(), mesFin.getMonth(), Math.min(d, ultimo) - 1);
          texto = `Termina el ${fin.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}`;
        }
        document.getElementById("ct-fin").textContent = texto;
      };
      form.addEventListener("input", ayudas);
      ayudas();
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

  // Cobros mensuales del débito automático (meses 2 en adelante)
  const ESTADO_COBRO = { programado: ["Programado", "en_revision"], en_proceso: ["En proceso", "en_revision"], aprobado: ["Cobrado", "aprobada"],
    fallido: ["Reintentando", "pendiente"], vencido: ["Vencido", "rechazada"], cancelado: ["Cancelado", "neutro"] };
  async function cargarCobros() {
    const contenedor = document.getElementById("lista-cobros-admin");
    mostrarCarga(contenedor);
    try {
      const r = await RoumixAPI.admin(`/cobros?estado=${encodeURIComponent(document.getElementById("filtro-cobros").value)}`);
      document.getElementById("btn-procesar-cobros").disabled = !r.habilitado;
      if (!r.habilitado) {
        document.getElementById("cobros-ayuda").textContent = r.motivo === "falta_llave_privada"
          ? "Para cobrar por débito automático falta la llave privada de Wompi (WOMPI_PRIVATE_KEY) en Vercel."
          : "El débito automático necesita Wompi activo.";
      }
      const faltan = r.sinDebito || [];
      const avisoFaltan = faltan.length ? `
        <div class="admin-aviso-debito" role="note">
          <strong>${faltan.length} arriendo(s) con el primer mes pagado y sin débito automático</strong> (el contrato lo exige):
          <ul>${faltan.map((f) => `<li><a href="pago.html?id=${f.pago_id}" target="_blank" rel="noopener">Pago #${f.pago_id}</a> · ${escaparHTML(f.inmueble_titulo)} · ${escaparHTML(f.estudiante_nombre || "—")}</li>`).join("")}</ul>
        </div>` : "";
      if (!r.data.length) {
        vacio(contenedor, "No hay cobros mensuales con este filtro.");
        if (avisoFaltan) contenedor.insertAdjacentHTML("afterbegin", avisoFaltan);
        return;
      }
      contenedor.innerHTML = avisoFaltan + listaTarjetas(r.data.map((c) => {
        const [texto, tipo] = ESTADO_COBRO[c.estado] || [c.estado, "neutro"];
        return tarjeta({
          ref: `Cobro #${c.id} · mes ${c.numero_mes}${c.referencia ? ` · ${escaparHTML(c.referencia)}` : ""}`,
          titulo: escaparHTML(c.inmueble_titulo),
          sub: `${escaparHTML(c.estudiante_nombre || "—")} → ${escaparHTML(c.propietario_nombre || "—")} · ${escaparHTML(c.fuente_descripcion)}${c.modo === "sandbox" ? " · pruebas" : ""}`,
          estado: chip(texto, tipo) + (c.desembolso_estado ? `<small>Desembolso ${c.desembolso_estado === "realizado" ? "realizado" : "pendiente"}</small>` : ""),
          destacada: c.estado === "vencido" || (c.estado === "aprobado" && c.desembolso_estado === "pendiente"),
          datos: [
            ["Fecha de cobro", c.estado === "fallido" && c.proximo_intento ? `Reintento ${escaparHTML(c.proximo_intento)}` : escaparHTML(c.fecha_cobro)],
            ["Canon", `<strong>${formatearPrecioCOP(c.monto)}</strong>`],
            [`Comisión (${Number(c.porcentaje_comision)} %)`, formatearPrecioCOP(c.comision)],
            ["Al propietario", formatearPrecioCOP(c.neto_propietario)],
            ["Intentos", String(c.intentos)],
            ...(c.ultimo_error && c.estado !== "aprobado" ? [["Último error", escaparHTML(c.ultimo_error)]] : [])
          ],
          acciones: (c.estado === "aprobado" && c.desembolso_estado === "pendiente"
            ? `<button type="button" class="btn-card-action" data-cobro-desembolso="${c.id}">Registrar desembolso</button>` : "") +
            `<a class="btn-card-action" href="pago.html?id=${c.pago_id}" target="_blank" rel="noopener">Ver pago</a>`
        });
      }).join(""));
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  document.getElementById("filtro-cobros").addEventListener("change", cargarCobros);
  document.getElementById("btn-procesar-cobros").addEventListener("click", async (e) => {
    if (!confirm("¿Ejecutar ahora los cobros que vencen hoy? Se cobrará con el medio guardado de cada estudiante.")) return;
    e.target.disabled = true;
    try {
      const r = await RoumixAPI.admin("/cobros/procesar", { method: "POST" });
      RoumixAvisos.mostrar(r.message, "exito", 6000);
      cargarCobros();
    } catch (err) {
      RoumixAvisos.mostrar(err.message, "error", 6000);
    }
    e.target.disabled = false;
  });
  document.getElementById("lista-cobros-admin").addEventListener("click", async (e) => {
    const boton = e.target.closest("button[data-cobro-desembolso]");
    if (!boton) return;
    if (!confirm("¿Registrar que ya se transfirió al propietario su parte de este cobro?")) return;
    boton.disabled = true;
    try {
      const r = await RoumixAPI.admin(`/cobros/${boton.dataset.cobroDesembolso}/desembolso`, { method: "POST" });
      RoumixAvisos.mostrar(r.message, "exito", 5000);
      cargarCobros();
    } catch (err) {
      RoumixAvisos.mostrar(err.message, "error", 5000);
      boton.disabled = false;
    }
  });

  async function cargarPagos() {
    cargarCobros();
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
        ${listaTarjetas(r.data.map(p => tarjeta({
          ref: `Pago #${p.id} · ${escaparHTML(p.referencia || "Sin referencia")}`,
          titulo: escaparHTML(p.inmueble_titulo),
          sub: `Solicitud #${p.solicitud_id}`,
          estado: chipPago(p.estado) + (p.desembolso_estado ? `<small>${escaparHTML(ETIQUETA_DESEMBOLSO[p.desembolso_estado])}</small>` : ""),
          destacada: p.estado === "en_disputa" || p.desembolso_estado === "pendiente",
          datos: [
            ["Monto", `<strong>${formatearPrecioCOP(p.monto)}</strong>`],
            ["Comisión Roumix", formatearPrecioCOP(p.comision)],
            ["Al propietario", formatearPrecioCOP(p.neto_propietario)],
            ["Estudiante", escaparHTML(p.estudiante_nombre || "—")],
            ["Propietario", escaparHTML(p.propietario_nombre || "—")]
          ],
          acciones: `<button type="button" class="btn-card-action" data-pago="${p.id}">Gestionar</button>`
        })).join(""))}`;
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
    if (p.estado === "aprobado" && p.desembolso_estado === "pendiente") acciones.push(["desembolso", p.simulado ? "Registrar desembolso (simulado)" : "Registrar transferencia al propietario", "btn-search-action", false]);
    if (["aprobado", "en_disputa"].includes(p.estado) && p.desembolso_estado !== "realizado") acciones.push(["devolucion", p.simulado ? "Devolver al estudiante (simulado)" : "Registrar devolución (hazla antes en Wompi)", "btn-card-action btn-card-danger", true]);
    if (p.estado === "en_disputa") acciones.push(["resolver-disputa", "Cerrar la disputa sin devolución", "btn-card-action", true]);
    if (["pendiente", "fallido"].includes(p.estado)) acciones.push(["cancelar", "Cancelar el pago y cerrar la solicitud", "btn-card-action btn-card-danger", true]);

    contenidoPago.innerHTML = `
      <h2 id="dialogo-pago-titulo">Pago #${p.id} · ${escaparHTML(p.inmueble_titulo)}</h2>
      <p>${chipPago(p.estado)} ${p.desembolso_estado ? chip(ETIQUETA_DESEMBOLSO[p.desembolso_estado], "neutro") : ""} ${p.simulado ? chip("Simulado", "pendiente") : chip(p.modo_wompi === "sandbox" ? "Wompi · modo de pruebas" : "Wompi", "aprobada")}</p>
      ${p.eventos.some(e => e.tipo === "requiere_devolucion") ? `<div class="verif-aviso"><div><strong>Hay un cobro por devolver.</strong>
        <p>Wompi aprobó una transacción que no correspondía (pago duplicado, cancelado o con otro monto). Devuélvela desde el panel de Wompi; el detalle está en los movimientos.</p></div></div>` : ""}
      <dl class="admin-datos">
        <dt>Monto (primer canon)</dt><dd>${formatearPrecioCOP(p.monto)}</dd>
        <dt>Comisión Roumix</dt><dd>${formatearPrecioCOP(p.comision)} (${Number(p.porcentaje_comision)} %, a cargo del propietario${p.version_condiciones ? `, condiciones v. ${escaparHTML(p.version_condiciones)}` : ""})</dd>
        <dt>Neto al propietario</dt><dd>${formatearPrecioCOP(p.neto_propietario)}${p.desembolso_referencia ? ` · ${escaparHTML(p.desembolso_referencia)}` : ""}</dd>
        <dt>Referencia</dt><dd>${escaparHTML(p.referencia || "—")}${p.metodo ? ` · ${escaparHTML(p.metodo_nombre || p.metodo)}` : ""}${p.wompi_transaccion_id ? ` · Transacción Wompi ${escaparHTML(p.wompi_transaccion_id)}` : ""}</dd>
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
        ${listaTarjetas(data.map(c => tarjeta({
          ref: `${fecha(c.ultimo_mensaje_en)}${c.solicitud_id ? ` · Solicitud #${c.solicitud_id}` : ""}`,
          titulo: escaparHTML(c.asunto),
          sub: `${escaparHTML(c.usuario_nombre || "Cuenta eliminada")} · ${escaparHTML(ROL[c.usuario_rol] || "")} · ${escaparHTML(c.inmueble_titulo || "Consulta general")}`,
          estado: (c.sin_leer ? chip("Sin leer", "pendiente") : "") + chip(c.estado === "pendiente" ? "Pendiente" : "Atendida", c.estado === "pendiente" ? "en_revision" : "aprobada"),
          destacada: Boolean(c.sin_leer),
          texto: c.ultimo_mensaje ? `“${escaparHTML(c.ultimo_mensaje.slice(0, 160))}${c.ultimo_mensaje.length > 160 ? "…" : ""}”` : "",
          acciones: `<button type="button" class="btn-card-action${c.estado === "pendiente" ? " btn-card-principal" : ""}" data-conversacion="${c.id}">${c.estado === "pendiente" ? "Responder" : "Ver"}</button>`
        })).join(""))}`;
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
  // Condiciones de la comisión: cuántos propietarios faltan por aceptar la versión vigente y aviso único
  async function cargarCondiciones() {
    const caja = document.getElementById("condiciones-propietarios");
    try {
      const { data: c } = await RoumixAPI.admin("/condiciones");
      if (!c.por_aceptar) {
        caja.innerHTML = `<p class="fotos-ayuda">✓ Todos los propietarios aprobados aceptaron las condiciones vigentes (versión ${escaparHTML(c.version)}).</p>`;
        return;
      }
      caja.innerHTML = `
        <div class="verif-aviso">
          <div>
            <strong>Condiciones de la comisión, versión ${escaparHTML(c.version)}</strong>
            <p>${c.aceptaron} propietario(s) ya las aceptaron · ${c.por_aceptar} aprobado(s) aún no.
              ${c.por_avisar ? `A ${c.por_avisar} todavía no se les ha avisado.` : "A todos ya se les avisó."}</p>
            <details><summary>Qué cambia</summary><ul>${c.cambios.map((x) => `<li>${escaparHTML(x)}</li>`).join("")}</ul></details>
          </div>
          ${c.por_avisar ? `<button type="button" class="btn-card-action" id="btn-avisar-condiciones">Avisar a ${c.por_avisar} propietario(s)</button>` : ""}
        </div>`;
      const boton = document.getElementById("btn-avisar-condiciones");
      if (boton) {
        boton.addEventListener("click", async () => {
          if (!confirm(`¿Enviar el aviso y el correo de las condiciones nuevas a ${c.por_avisar} propietario(s)? Cada uno lo recibe una sola vez.`)) return;
          boton.disabled = true;
          try {
            const r = await RoumixAPI.admin("/condiciones/avisar", { method: "POST" });
            RoumixAvisos.mostrar(r.message, "exito", 5000);
            cargarCondiciones();
          } catch (err) {
            RoumixAvisos.mostrar(err.message, "error", 5000);
            boton.disabled = false;
          }
        });
      }
    } catch (error) {
      caja.innerHTML = "";
    }
  }

  async function cargarPropietarios() {
    cargarCondiciones();
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
        ${listaTarjetas(data.map(p => tarjeta({
          ref: p.perfil_enviado_en ? `Perfil enviado ${fecha(p.perfil_enviado_en)}` : "Aún no envía su perfil",
          titulo: escaparHTML(p.nombre_completo || p.nombre),
          sub: escaparHTML(p.email),
          estado: chip(ETIQUETAS.verificacion[p.etapa], tipoChip[p.etapa]) + (p.revisado_en ? `<small>${fecha(p.revisado_en)}${p.revisado_por_nombre ? " · " + escaparHTML(p.revisado_por_nombre) : ""}</small>` : ""),
          destacada: p.etapa === "pendiente",
          datos: [
            ["Relación y ciudad", p.perfil_enviado_en ? `${escaparHTML(ETIQUETAS.relacion[p.relacion_inmueble] || "—")} · ${escaparHTML(p.ciudad || "—")}` : ""],
            ["Teléfono (solo Roumix)", `${escaparHTML(p.telefono || "—")}<small>${p.telefono_verificado_por_roumix ? "✓ verificado por Roumix" : "declarado"}</small>`],
            ["Inmuebles", `${p.inmuebles} publicado(s)${p.perfil_enviado_en ? `<small>${p.cantidad_inmuebles || "?"} declarado(s)</small>` : ""}`],
            ["Correo", p.correo_confirmado ? chip("Confirmado", "aprobada") : chip("Sin confirmar", "pendiente")]
          ],
          acciones: `<button type="button" class="btn-card-action${p.etapa === "pendiente" ? " btn-card-principal" : ""}" data-propietario="${p.id}">${p.etapa === "pendiente" ? "Revisar" : "Ver"}</button>`
        })).join(""))}`;
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
        ${listaTarjetas(data.map(r => tarjeta({
          ref: `Reporte · ${fecha(r.created_at)}`,
          titulo: escaparHTML(ETIQUETAS.motivo[r.motivo]),
          sub: `Publicación #${r.inmueble_id} · ${escaparHTML(r.inmueble_titulo)}`,
          estado: chip(ETIQUETAS.reporte[r.estado], r.estado) + (r.resuelto_por_nombre ? `<small>por ${escaparHTML(r.resuelto_por_nombre)}</small>` : ""),
          destacada: r.estado === "pendiente",
          datos: [
            ["Publicación", chip(ETIQUETAS.moderacion[r.inmueble_moderacion], r.inmueble_moderacion)],
            ["Reportó", escaparHTML(r.reportante_email || "Cuenta eliminada")]
          ],
          texto: r.descripcion ? `“${escaparHTML(r.descripcion)}”` : "",
          acciones: `<button type="button" class="btn-card-action" data-inmueble="${r.inmueble_id}">Revisar</button>`
        })).join(""))}`;
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
        ${listaTarjetas(data.map(i => tarjeta({
          imagen: i.imagen_principal ? escaparHTML(i.imagen_principal) : "",
          ref: `Publicación #${i.id}`,
          titulo: escaparHTML(i.titulo),
          sub: `${escaparHTML(i.barrio)} · ${formatearPrecioCOP(i.precio)}/mes`,
          estado: chip(ETIQUETAS.moderacion[i.moderacion], i.moderacion) + (i.revisado_en ? "<small>✓ revisada</small>" : ""),
          destacada: i.moderacion === "en_revision" || i.reportes_pendientes > 0 || ["otro_medio", "conocido"].includes(i.baja_motivo),
          datos: [
            ["Propietario", `${escaparHTML(i.propietario_nombre || "Demostración (sin propietario)")}<small>${escaparHTML(i.propietario_email || "")}</small>`],
            ["Estado comercial", escaparHTML(ETIQUETAS.estado[i.estado])],
            ["Reportes", i.reportes_pendientes ? chip(`${i.reportes_pendientes} pendiente(s)`, "pendiente") : "Ninguno pendiente"],
            ...(i.baja_justificacion ? [["Motivo del propietario", `${["otro_medio", "conocido"].includes(i.baja_motivo) ? chip("Por fuera de Roumix", "pendiente") : ""}<small>${escaparHTML(i.baja_justificacion)}</small>`]] : [])
          ],
          acciones: `<button type="button" class="btn-card-action" data-inmueble="${i.id}">Revisar</button>`
        })).join(""))}`;
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
        ${listaTarjetas(data.map(u => tarjeta({
          ref: `${escaparHTML(ROLES_USUARIO[u.rol] || u.rol)} · desde ${fecha(u.created_at)}`,
          titulo: escaparHTML(u.nombre),
          sub: escaparHTML(u.email),
          estado: chip(u.estado === "activo" ? "Activa" : "Suspendida", u.estado === "activo" ? "aprobada" : "rechazada"),
          datos: [
            ["Correo", u.correo_confirmado ? chip("Confirmado", "aprobada") : chip("Sin confirmar", "pendiente")],
            ["Inmuebles", u.rol === "propietario" ? String(u.inmuebles) : ""],
            ["Reportes procedentes", u.reportes_procedentes ? chip(String(u.reportes_procedentes), "procedente") : "0"],
            ["Política", u.acepto_politica_en ? "Aceptada" : "<small>Sin aceptación registrada</small>"]
          ],
          acciones: u.rol !== "admin" && (!yo || yo.id !== u.id)
            ? `<button type="button" class="btn-card-action ${u.estado === "activo" ? "btn-card-danger" : ""}" data-usuario="${u.id}" data-estado="${u.estado === "activo" ? "suspendido" : "activo"}" data-nombre="${escaparHTML(u.nombre)}">${u.estado === "activo" ? "Suspender" : "Reactivar"}</button>`
            : ""
        })).join(""))}`;
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
  // ---------------- Auditoría (solo adición) ----------------
  const ENTIDAD = { usuario: "Cuenta", inmueble: "Publicación", solicitud: "Solicitud", contrato: "Contrato", pago: "Pago", conversacion: "Conversación", panel: "Panel" };
  const RESPONSABLE = { admin: ["Roumix", "aprobada"], estudiante: ["Estudiante", "neutro"], propietario: ["Propietario", "neutro"], sistema: ["Sistema", "pendiente"] };
  let audCursor = null;

  function detallesAuditoria(datos) {
    const partes = Object.entries(datos || {})
      .filter(([clave]) => !["historial_id", "inmueble_titulo"].includes(clave))
      .map(([clave, valor]) => `${escaparHTML(clave.replace(/_/g, " "))}: ${escaparHTML(Array.isArray(valor) ? valor.join(", ") : valor)}`);
    return partes.length ? `<br><small class="admin-aud-datos">${partes.join(" · ")}</small>` : "";
  }

  function enlaceEntidad(a) {
    if (!a.entidad_id) return escaparHTML(ENTIDAD[a.entidad] || a.entidad);
    const nombre = `${escaparHTML(ENTIDAD[a.entidad] || a.entidad)} ${/^\d+$/.test(a.entidad_id) ? "#" + escaparHTML(a.entidad_id) : ""}`;
    const titulo = a.datos && a.datos.inmueble_titulo ? `<br><small>${escaparHTML(a.datos.inmueble_titulo)}</small>` : "";
    if (a.entidad === "inmueble") return `<button type="button" class="admin-enlace" data-inmueble="${escaparHTML(a.entidad_id)}">${nombre}</button>${titulo}`;
    if (["solicitud", "pago", "conversacion"].includes(a.entidad)) return `<button type="button" class="admin-enlace" data-aud-${a.entidad}="${escaparHTML(a.entidad_id)}">${nombre}</button>`;
    if (a.entidad === "contrato") return `<a class="admin-enlace" href="contrato.html?id=${encodeURIComponent(a.entidad_id)}" target="_blank" rel="noopener">${nombre}</a>`;
    return nombre + titulo;
  }

  async function cargarHistorial(masAntiguos = false) {
    const contenedor = document.getElementById("lista-historial");
    const botonMas = document.getElementById("aud-mas");
    if (!masAntiguos) { audCursor = null; mostrarCarga(contenedor); }
    const params = new URLSearchParams();
    const valor = (id) => document.getElementById(id).value.trim();
    if (valor("aud-entidad")) params.set("entidad", valor("aud-entidad"));
    if (valor("aud-actor")) params.set("actor", valor("aud-actor"));
    if (valor("aud-desde")) params.set("desde", valor("aud-desde"));
    if (valor("aud-hasta")) params.set("hasta", valor("aud-hasta"));
    if (valor("aud-buscar")) params.set("q", valor("aud-buscar"));
    if (masAntiguos && audCursor) params.set("antes", audCursor);
    try {
      const { data, hayMas } = await RoumixAPI.admin(`/auditoria?${params}`);
      if (!masAntiguos && data.length === 0) { botonMas.hidden = true; return vacio(contenedor, "No hay registros con estos filtros."); }
      const filas = data.map(a => {
        const [quien, tono] = RESPONSABLE[a.actor_rol] || [a.actor_rol, "neutro"];
        return tarjeta({
          compacta: true,
          ref: fecha(a.created_at),
          titulo: escaparHTML(ETIQUETAS.accion[a.accion] || a.accion.replace(/_/g, " ")),
          sub: `${escaparHTML(a.actor_nombre || quien)} · ${enlaceEntidad(a)}`,
          estado: chip(quien, tono),
          texto: `${escaparHTML(a.resumen || "—")}${detallesAuditoria(a.datos)}`
        });
      }).join("");
      if (masAntiguos && contenedor.querySelector(".admin-tarjetas")) {
        contenedor.querySelector(".admin-tarjetas").insertAdjacentHTML("beforeend", filas);
      } else {
        contenedor.innerHTML = listaTarjetas(filas);
      }
      audCursor = data.length ? data[data.length - 1].id : audCursor;
      botonMas.hidden = !hayMas;
    } catch (error) {
      mostrarError(contenedor, error);
    }
  }
  ["aud-entidad", "aud-actor", "aud-desde", "aud-hasta"].forEach(id => document.getElementById(id).addEventListener("change", () => cargarHistorial()));
  document.getElementById("aud-buscar").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cargarHistorial(), 350);
  });
  document.getElementById("aud-mas").addEventListener("click", () => cargarHistorial(true));
  document.getElementById("lista-historial").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.audSolicitud) abrirSolicitud(Number(b.dataset.audSolicitud));
    if (b.dataset.audPago) abrirPago(Number(b.dataset.audPago));
    if (b.dataset.audConversacion) abrirConversacion(Number(b.dataset.audConversacion));
  });

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

  // Se abre la sección guardada en la dirección (#pagos, #solicitudes…); si no es el resumen,
  // los contadores del menú se cargan aparte
  abrirPanel(location.hash.slice(1) || "resumen");
  if (!document.querySelector('.admin-tab.activa[data-panel="resumen"]')) cargarContador();
});
