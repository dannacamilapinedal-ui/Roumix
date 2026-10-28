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
  moderacion: {
    aprobada: "Aprobada", en_revision: "En revisión", requiere_cambios: "Requiere cambios",
    rechazada: "Rechazada", retirada: "Retirada"
  },
  reporte: { pendiente: "Pendiente", procedente: "Procedente", no_procede: "No procede" },
  estado: { disponible: "Disponible", pausado: "Pausado por el propietario", arrendado: "Arrendado" },
  accion: {
    pausa_preventiva: "Pausa preventiva por reporte", aprobar: "Aprobada", solicitar_cambios: "Cambios solicitados",
    rechazar: "Rechazada", retirar: "Retirada", correcciones_enviadas: "Correcciones enviadas por el propietario",
    cuenta_suspendida: "Cuenta suspendida", cuenta_reactivada: "Cuenta reactivada",
    rol_admin_asignado: "Rol de administrador asignado", rol_admin_retirado: "Rol de administrador retirado",
    eliminado_demo: "Publicación de demostración eliminada"
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

  const paneles = { resumen: cargarResumen, reportes: cargarReportes, inmuebles: cargarInmuebles, usuarios: cargarUsuarios, historial: cargarHistorial };

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
      const metricas = [
        ["Reportes pendientes", data.reportes.pendientes, "alerta", "reportes"],
        ["Publicaciones en revisión", data.inmuebles.enRevision, "alerta", "inmuebles"],
        ["Esperando correcciones", data.inmuebles.requiereCambios, "neutro", "inmuebles"],
        ["Publicaciones visibles", data.inmuebles.visibles, "ok", null],
        ["Publicaciones totales", data.inmuebles.total, "neutro", null],
        ["Usuarios", `${data.usuarios.total}`, "neutro", "usuarios"],
        ["Estudiantes / Propietarios", `${data.usuarios.estudiantes} / ${data.usuarios.propietarios}`, "neutro", "usuarios"],
        ["Cuentas suspendidas", data.usuarios.suspendidos, data.usuarios.suspendidos ? "alerta" : "neutro", "usuarios"]
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
        <p class="fotos-ayuda">La decisión no cambia el estado comercial que eligió el propietario (disponible, pausado o arrendado). Los reportes pendientes se resolverán con esta decisión.</p>
        <fieldset class="admin-decisiones">
          <legend class="sr-only">Decisión</legend>
          <label><input type="radio" name="decision" value="aprobar"> Aprobar (vuelve a mostrarse y recibe la insignia "Revisada por Roumix")</label>
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
    } catch (e) { /* el contador es informativo */ }
  }

  abrirPanel("resumen");
});
