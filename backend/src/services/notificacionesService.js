/**
 * Notificaciones por correo (reportes y decisiones de moderación).
 *
 * Se envían por SMTP (por ejemplo Gmail con una "contraseña de aplicación").
 * Si no hay configuración SMTP, las notificaciones se omiten y se avisa en el registro:
 * un correo que no sale nunca debe impedir que se guarde un reporte o una decisión.
 * Nunca se incluye la identidad de quien reportó.
 */
const nodemailer = require('nodemailer');
const db = require('../config/db');

const limpiar = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
const SMTP = {
  host: limpiar(process.env.SMTP_HOST),
  port: Number(limpiar(process.env.SMTP_PORT)) || 465,
  user: limpiar(process.env.SMTP_USER),
  pass: limpiar(process.env.SMTP_PASS)
};
const REMITENTE = limpiar(process.env.CORREO_REMITENTE) || (SMTP.user ? `Roumix <${SMTP.user}>` : '');
const CORREO_ADMIN = limpiar(process.env.CORREO_ADMIN);

// Opción recomendada en Render gratis (que bloquea los puertos SMTP): un Google Apps Script
// en la cuenta de Gmail de Roumix que envía los correos y se llama por HTTPS.
// Ver docs/correo-apps-script.gs
const RELAY = {
  url: limpiar(process.env.CORREO_RELAY_URL),
  secreto: limpiar(process.env.CORREO_RELAY_SECRETO)
};
const relayActivo = Boolean(RELAY.url && RELAY.secreto);
const smtpActivo = Boolean(SMTP.host && SMTP.user && SMTP.pass);
const correoActivo = relayActivo || smtpActivo;

if (relayActivo) {
  console.log('✉️  Correos: Google Apps Script (HTTPS).');
} else if (smtpActivo) {
  console.log(`✉️  Correos: SMTP ${SMTP.host}:${SMTP.port}.`);
} else {
  console.warn('⚠️  Correos desactivados: defina CORREO_RELAY_URL y CORREO_RELAY_SECRETO (o SMTP_HOST, SMTP_USER y SMTP_PASS).');
}

/**
 * Envío por el Apps Script: POST con JSON. Google responde con una redirección que fetch sigue
 * automáticamente hasta la respuesta del script ({ ok: true } o { ok: false, error }).
 */
async function enviarPorRelay({ para, asunto: tituloCorreo, html, texto }) {
  const respuesta = await fetch(RELAY.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secreto: RELAY.secreto, para, asunto: tituloCorreo, html, texto }),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  const cuerpo = await respuesta.text();
  let json = null;
  try {
    json = JSON.parse(cuerpo);
  } catch (e) {
    throw new Error(`el Apps Script no devolvió JSON (HTTP ${respuesta.status}); revisa que esté implementado como aplicación web con acceso "Cualquier usuario"`);
  }
  if (!json.ok) throw new Error(`el Apps Script rechazó el envío: ${json.error || 'sin detalle'}`);
}

let transporte = null;
let transporteDePrueba = false;
function obtenerTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.port === 465,
      auth: { user: SMTP.user, pass: SMTP.pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    });
  }
  return transporte;
}

// Permite reemplazar el transporte en las pruebas (sin enviar correos reales)
function usarTransporte(otro) {
  transporte = otro;
  transporteDePrueba = true;
}

const ETIQUETAS_MOTIVO = {
  fraude: 'Posible fraude o estafa',
  informacion_falsa: 'Información falsa o engañosa',
  fotos_no_corresponden: 'Las fotos no corresponden al inmueble',
  precio_enganoso: 'Precio engañoso',
  contenido_inapropiado: 'Contenido inapropiado',
  otro: 'Otro motivo'
};

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Asunto en una sola línea y sin caracteres de control
const asunto = (texto) => String(texto).replace(/[\r\n\t]+/g, ' ').slice(0, 150);

/**
 * Plantilla HTML con la identidad de Roumix (estilos en línea: los correos no admiten CSS externo).
 */
function plantilla({ titulo, parrafos, boton, nota }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 14px;color:#2b3a2f;font-size:15px;line-height:1.55;">${p}</p>`).join('');
  const accion = boton
    ? `<p style="margin:22px 0;"><a href="${escapar(boton.url)}" style="background:#142219;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;font-size:14px;display:inline-block;">${escapar(boton.texto)}</a></p>`
    : '';
  const pie = nota ? `<p style="margin:18px 0 0;color:#7b8878;font-size:12px;line-height:1.5;">${nota}</p>` : '';
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f0e6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ded7c5;border-radius:16px;overflow:hidden;">
    <div style="background:#142219;padding:18px 24px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">roumix<span style="color:#c47c2b;">.</span></div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 16px;color:#142219;font-size:20px;">${escapar(titulo)}</h1>
      ${cuerpo}${accion}${pie}
    </div>
  </div>
  <p style="text-align:center;color:#7b8878;font-size:11px;margin:14px 0 0;">Roumix · Vivienda universitaria en Villavicencio</p>
</body></html>`;
}

// Versión en texto plano (para clientes de correo sin HTML)
function textoPlano({ titulo, parrafos, boton }) {
  const sinEtiquetas = (h) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [titulo, '', ...parrafos.map(sinEtiquetas), boton ? `\n${boton.texto}: ${boton.url}` : ''].join('\n');
}

/**
 * Envía un correo. Nunca lanza error: devuelve true si se envió.
 */
async function enviar({ para, asunto: tituloCorreo, contenido }) {
  const destinatarios = [...new Set([].concat(para).filter(Boolean))];
  if ((!correoActivo && !transporteDePrueba) || destinatarios.length === 0) return false;
  try {
    if (relayActivo && !transporteDePrueba) {
      await enviarPorRelay({
        para: destinatarios.join(','),
        asunto: asunto(tituloCorreo),
        html: plantilla(contenido),
        texto: textoPlano(contenido)
      });
      return true;
    }
    await obtenerTransporte().sendMail({
      from: REMITENTE,
      to: destinatarios.join(', '),
      subject: asunto(tituloCorreo),
      html: plantilla(contenido),
      text: textoPlano(contenido)
    });
    return true;
  } catch (error) {
    console.error('⚠️ No se pudo enviar el correo:', error.message);
    return false;
  }
}

async function correosAdministradores() {
  const { rows } = await db.query("SELECT email FROM usuarios WHERE rol = 'admin' AND estado = 'activo'");
  return [...rows.map((r) => r.email), CORREO_ADMIN].filter(Boolean);
}

async function correoPropietario(propietarioId) {
  if (!propietarioId) return null;
  const { rows } = await db.query("SELECT email, nombre FROM usuarios WHERE id = $1 AND estado = 'activo'", [propietarioId]);
  return rows[0] || null;
}

/**
 * A la administración: llegó un reporte.
 */
async function notificarReporteAdministracion({ inmueble, motivo, descripcion, pausada, urlBase }) {
  try {
    const para = await correosAdministradores();
    return await enviar({
      para,
      asunto: `Nuevo reporte: ${inmueble.titulo} (#${inmueble.id})`,
      contenido: {
        titulo: 'Llegó un nuevo reporte',
        parrafos: [
          `Publicación: <strong>${escapar(inmueble.titulo)}</strong> (#${inmueble.id})`,
          `Motivo: <strong>${escapar(ETIQUETAS_MOTIVO[motivo] || motivo)}</strong>`,
          descripcion ? `Explicación: “${escapar(descripcion)}”` : 'La persona no agregó una explicación.',
          pausada
            ? 'La publicación quedó <strong>oculta de forma preventiva</strong> mientras la revisas.'
            : 'La publicación <strong>sigue visible</strong> porque fue revisada y aprobada hace menos de 30 días; se ocultará si llega otro reporte de una persona distinta.'
        ],
        boton: { texto: 'Revisar en el panel', url: `${urlBase}/pages/admin.html` },
        nota: 'Por privacidad, este correo no incluye los datos de quien reportó. Puedes verlos en el panel de administración.'
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de reporte:', error.message);
    return false;
  }
}

/**
 * Al propietario: su publicación quedó en revisión por un reporte.
 */
async function notificarPausaPropietario({ inmueble, urlBase }) {
  try {
    const propietario = await correoPropietario(inmueble.propietario_id);
    if (!propietario) return false;
    return await enviar({
      para: propietario.email,
      asunto: `Tu publicación "${inmueble.titulo}" está en revisión`,
      contenido: {
        titulo: 'Tu publicación está en revisión',
        parrafos: [
          `Hola ${escapar(propietario.nombre)},`,
          `Recibimos un reporte sobre tu publicación <strong>${escapar(inmueble.titulo)}</strong>. Mientras el equipo de Roumix la revisa, no aparecerá en las búsquedas.`,
          'Un reporte <strong>no significa</strong> que la publicación sea falsa: solo inicia una revisión. No tienes que hacer nada por ahora; te escribiremos cuando haya una decisión.'
        ],
        boton: { texto: 'Ver mis publicaciones', url: `${urlBase}/pages/mis-publicaciones.html` }
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de pausa:', error.message);
    return false;
  }
}

const TEXTOS_DECISION = {
  aprobar: {
    titulo: 'Tu publicación fue aprobada',
    explicacion: 'El equipo de Roumix revisó tu publicación y está aprobada. Si estaba disponible, ya aparece de nuevo en las búsquedas.',
    boton: 'Ver mis publicaciones',
    ruta: 'mis-publicaciones.html'
  },
  pausar: {
    titulo: 'Tu publicación está en revisión',
    explicacion: 'Mientras el equipo de Roumix la revisa, la publicación no aparece en las búsquedas. No tienes que hacer nada por ahora: te avisaremos cuando termine la revisión.',
    boton: 'Ver mis publicaciones',
    ruta: 'mis-publicaciones.html'
  },
  solicitar_cambios: {
    titulo: 'Necesitamos que corrijas tu publicación',
    explicacion: 'Tu publicación no se mostrará hasta que hagas los cambios solicitados. Cuando la edites y guardes, volverá automáticamente a revisión.',
    boton: 'Corregir mi publicación',
    ruta: null // se arma con el id del inmueble
  },
  rechazar: {
    titulo: 'Tu publicación fue rechazada',
    explicacion: 'La publicación no cumple las reglas de Roumix y no se mostrará. Queda guardada en "Mis publicaciones" como registro.',
    boton: 'Ver mis publicaciones',
    ruta: 'mis-publicaciones.html'
  },
  retirar: {
    titulo: 'Tu publicación fue retirada',
    explicacion: 'Roumix retiró la publicación de forma definitiva y no volverá a mostrarse. Queda guardada en "Mis publicaciones" como registro.',
    boton: 'Ver mis publicaciones',
    ruta: 'mis-publicaciones.html'
  }
};

/**
 * Al propietario: la administración tomó una decisión sobre su publicación.
 */
async function notificarDecisionPropietario({ inmueble, decision, mensaje, urlBase }) {
  try {
    const textos = TEXTOS_DECISION[decision];
    const propietario = await correoPropietario(inmueble.propietario_id);
    if (!textos || !propietario) return false;
    const ruta = textos.ruta || `publicar.html?editar=${inmueble.id}`;
    return await enviar({
      para: propietario.email,
      asunto: `${textos.titulo}: ${inmueble.titulo}`,
      contenido: {
        titulo: textos.titulo,
        parrafos: [
          `Hola ${escapar(propietario.nombre)},`,
          `Publicación: <strong>${escapar(inmueble.titulo)}</strong>`,
          `<strong>Mensaje de Roumix:</strong><br>${escapar(mensaje)}`,
          textos.explicacion
        ],
        boton: { texto: textos.boton, url: `${urlBase}/pages/${ruta}` },
        nota: 'Si tienes dudas sobre esta decisión, responde a este correo.'
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de decisión:', error.message);
    return false;
  }
}

/**
 * A la administración: un propietario envió su perfil para revisión.
 */
async function notificarVerificacionPendiente({ propietario, urlBase }) {
  try {
    const para = await correosAdministradores();
    return await enviar({
      para,
      asunto: `Propietario por revisar: ${propietario.nombre}`,
      contenido: {
        titulo: 'Un propietario espera tu revisión',
        parrafos: [
          `<strong>${escapar(propietario.nombre)}</strong> (${escapar(propietario.email)}) completó su perfil de propietario.`,
          'Revisa la información, confirma el teléfono si lo consideras necesario y aprueba, rechaza o pide información adicional.'
        ],
        boton: { texto: 'Revisar en el panel', url: `${urlBase}/pages/admin.html` }
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de verificación pendiente:', error.message);
    return false;
  }
}

const TEXTOS_VERIFICACION = {
  aprobar: {
    titulo: '¡Tu cuenta de propietario fue aprobada!',
    explicacion: 'Ya puedes publicar tus inmuebles en Roumix. Los estudiantes los verán en cuanto los publiques.',
    boton: 'Publicar mi primer inmueble',
    ruta: 'publicar.html'
  },
  solicitar_informacion: {
    titulo: 'Roumix necesita información adicional',
    explicacion: 'Completa o corrige lo que te pedimos y vuelve a enviar tu perfil para continuar con la revisión.',
    boton: 'Actualizar mi perfil',
    ruta: 'verificacion.html'
  },
  rechazar: {
    titulo: 'Tu solicitud de verificación fue rechazada',
    explicacion: 'Por ahora no podrás publicar inmuebles en Roumix. Si crees que es un error, responde a este correo.',
    boton: 'Ver mi verificación',
    ruta: 'verificacion.html'
  }
};

/**
 * Al propietario: Roumix tomó una decisión sobre su verificación.
 */
async function notificarDecisionVerificacion({ propietario, decision, mensaje, urlBase }) {
  try {
    const textos = TEXTOS_VERIFICACION[decision];
    if (!textos || !propietario || !propietario.email) return false;
    return await enviar({
      para: propietario.email,
      asunto: textos.titulo,
      contenido: {
        titulo: textos.titulo,
        parrafos: [
          `Hola ${escapar(propietario.nombre)},`,
          `<strong>Mensaje de Roumix:</strong><br>${escapar(mensaje)}`,
          textos.explicacion
        ],
        boton: { texto: textos.boton, url: `${urlBase}/pages/${textos.ruta}` },
        nota: 'La verificación de Roumix revisa tu perfil y tus datos de contacto; no es una verificación legal de identidad ni de la propiedad de los inmuebles.'
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de decisión de verificación:', error.message);
    return false;
  }
}

/**
 * Correo de confirmación de cuenta (lo envía Roumix, no Supabase).
 * Devuelve true si salió; quien lo llama decide qué hacer si falla.
 */
async function enviarConfirmacionCuenta({ email, nombre, enlace }) {
  const primerNombre = String(nombre || '').trim().split(/\s+/)[0];
  return enviar({
    para: email,
    asunto: 'Confirma tu cuenta de Roumix',
    contenido: {
      titulo: primerNombre ? `¡Hola, ${primerNombre}! Confirma tu cuenta` : 'Confirma tu cuenta',
      parrafos: [
        'Gracias por registrarte en <strong>Roumix</strong>, la plataforma de vivienda universitaria de Villavicencio.',
        'Para activar tu cuenta, confirma que este correo es tuyo con el botón de abajo.',
        'El enlace vence en <strong>24 horas</strong>. Si no lo abres a tiempo, el registro se cancela y tendrás que registrarte de nuevo.'
      ],
      boton: { texto: 'Confirmar mi correo', url: enlace },
      nota: 'Si no creaste una cuenta en Roumix, ignora este mensaje: sin la confirmación, la cuenta no se activa.'
    }
  });
}

/**
 * Correo para crear una contraseña nueva (lo envía Roumix, no Supabase).
 */
async function enviarRecuperacion({ email, enlace }) {
  return enviar({
    para: email,
    asunto: 'Crea una contraseña nueva para Roumix',
    contenido: {
      titulo: 'Crea una contraseña nueva',
      parrafos: [
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta de Roumix.',
        'Usa el botón de abajo para crear una contraseña nueva. El enlace funciona una sola vez y vence en poco tiempo.'
      ],
      boton: { texto: 'Crear contraseña nueva', url: enlace },
      nota: 'Si no pediste este cambio, ignora este mensaje: tu contraseña actual sigue funcionando.'
    }
  });
}

// ---------------------------------------------------------------------------
// Solicitudes de arriendo. Los correos nunca incluyen datos de contacto de la
// otra parte: todo lo coordina el equipo de Roumix.
// ---------------------------------------------------------------------------
const formatoFecha = (valor) => new Date(`${valor}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

async function notificarSolicitudNueva({ solicitud, estudiante, urlBase }) {
  try {
    return await enviar({
      para: await correosAdministradores(),
      asunto: `Nueva solicitud de arriendo #${solicitud.id}: ${solicitud.inmuebleTitulo}`,
      contenido: {
        titulo: 'Llegó una solicitud de arriendo',
        parrafos: [
          `<strong>${escapar(estudiante.nombre)}</strong> (${escapar(estudiante.email)}) quiere arrendar <strong>${escapar(solicitud.inmuebleTitulo)}</strong>.`,
          `Ingreso: ${escapar(formatoFecha(solicitud.fechaIngreso))} · ${solicitud.duracion} mes(es) · ${solicitud.personas} persona(s).`,
          'Revísala en el panel, habla con el propietario y actualiza el estado para que el estudiante sepa en qué va.'
        ],
        boton: { texto: 'Ver la solicitud', url: `${urlBase}/pages/admin.html` }
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de solicitud nueva:', error.message);
    return false;
  }
}

async function notificarSolicitudCanceladaAdmin({ solicitud, motivo, urlBase }) {
  try {
    return await enviar({
      para: await correosAdministradores(),
      asunto: `Solicitud #${solicitud.id} cancelada por el estudiante`,
      contenido: {
        titulo: 'Un estudiante canceló su solicitud',
        parrafos: [
          `La solicitud #${solicitud.id} de <strong>${escapar(solicitud.inmuebleTitulo)}</strong> fue cancelada por el estudiante.`,
          motivo ? `Motivo: ${escapar(motivo)}` : 'No indicó un motivo.'
        ],
        boton: { texto: 'Abrir el panel', url: `${urlBase}/pages/admin.html` }
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de solicitud cancelada:', error.message);
    return false;
  }
}

async function correoUsuarioActivo(id) {
  if (!id) return null;
  const { rows } = await db.query("SELECT email, nombre FROM usuarios WHERE id = $1 AND estado = 'activo'", [id]);
  return rows[0] || null;
}

async function notificarSolicitudEstudiante({ estudianteId, solicitud, estado, etiqueta, nota, urlBase }) {
  try {
    const estudiante = await correoUsuarioActivo(estudianteId);
    if (!estudiante) return false;
    return await enviar({
      para: estudiante.email,
      asunto: estado ? `Tu solicitud #${solicitud.id} ahora está: ${etiqueta}` : `Novedad en tu solicitud #${solicitud.id}`,
      contenido: {
        titulo: estado ? `Tu solicitud está: ${etiqueta}` : 'Hay una novedad en tu solicitud',
        parrafos: [
          `Hola ${escapar(String(estudiante.nombre || '').split(' ')[0])}, esto es lo último de tu solicitud para <strong>${escapar(solicitud.inmuebleTitulo)}</strong>.`,
          nota ? `<strong>Mensaje del equipo de Roumix:</strong><br>${escapar(nota)}` : 'Entra a Roumix para ver el detalle.'
        ],
        boton: { texto: 'Ver mis solicitudes', url: `${urlBase}/pages/solicitudes.html` },
        nota: 'Roumix coordina todo con el propietario por ti. Nunca pagues por fuera de la plataforma.'
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de solicitud al estudiante:', error.message);
    return false;
  }
}

async function notificarSolicitudPropietario({ propietarioId, solicitud, estado, etiqueta, nota, nueva, urlBase }) {
  try {
    const propietario = await correoUsuarioActivo(propietarioId);
    if (!propietario) return false;
    return await enviar({
      para: propietario.email,
      asunto: nueva ? `Tienes una solicitud de arriendo para ${solicitud.inmuebleTitulo}` : `Solicitud #${solicitud.id}: ${etiqueta || 'novedad'}`,
      contenido: {
        titulo: nueva ? 'Un estudiante quiere arrendar tu inmueble' : (estado ? `La solicitud está: ${etiqueta}` : 'Novedad en una solicitud'),
        parrafos: [
          nueva
            ? `El equipo de Roumix está gestionando una solicitud para <strong>${escapar(solicitud.inmuebleTitulo)}</strong> y te contactará para coordinar.`
            : `Hay una actualización de la solicitud #${solicitud.id} para <strong>${escapar(solicitud.inmuebleTitulo)}</strong>.`,
          nota ? `<strong>Mensaje del equipo de Roumix:</strong><br>${escapar(nota)}` : ''
        ].filter(Boolean),
        boton: { texto: 'Ver solicitudes', url: `${urlBase}/pages/solicitudes.html` }
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de solicitud al propietario:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Comunicación gestionada
// ---------------------------------------------------------------------------
const recorte = (valor, max = 600) => {
  const limpio = String(valor || '').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
};

async function notificarMensajeAdministracion({ conversacion, usuario, mensaje, nueva, urlBase }) {
  try {
    return await enviar({
      para: await correosAdministradores(),
      asunto: `${nueva ? 'Nueva consulta' : 'Nuevo mensaje'} de ${usuario.nombre}: ${conversacion.asunto}`,
      contenido: {
        titulo: nueva ? 'Llegó una consulta nueva' : 'Un usuario respondió una conversación',
        parrafos: [
          `<strong>${escapar(usuario.nombre)}</strong> (${escapar(usuario.rol)}) escribió en <strong>${escapar(conversacion.asunto)}</strong>:`,
          `<em>${escapar(recorte(mensaje)).replace(/\n/g, '<br>')}</em>`
        ],
        boton: { texto: 'Responder en el panel', url: `${urlBase}/pages/admin.html` }
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de mensaje a la administración:', error.message);
    return false;
  }
}

async function notificarRespuestaRoumix({ usuarioId, conversacion, mensaje, urlBase }) {
  try {
    const { rows } = await db.query("SELECT email, nombre FROM usuarios WHERE id = $1 AND estado = 'activo'", [usuarioId]);
    if (!rows.length) return false;
    return await enviar({
      para: rows[0].email,
      asunto: `Roumix te respondió: ${conversacion.asunto}`,
      contenido: {
        titulo: 'Tienes un mensaje del equipo de Roumix',
        parrafos: [
          `Hola ${escapar(String(rows[0].nombre || '').split(' ')[0])}, te escribimos sobre <strong>${escapar(conversacion.asunto)}</strong>:`,
          escapar(recorte(mensaje)).replace(/\n/g, '<br>')
        ],
        boton: { texto: 'Ver y responder', url: `${urlBase}/pages/mensajes.html?c=${conversacion.id}` },
        nota: 'Responde desde Roumix: así queda todo registrado. Nunca pagues nada por fuera de la plataforma.'
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de respuesta de Roumix:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Contratos (flujo demostrativo: la aceptación no es una firma electrónica legal)
// ---------------------------------------------------------------------------
async function notificarContrato({ contrato, evento, parte, urlBase }) {
  try {
    const { rows } = await db.query(
      "SELECT id, email, nombre FROM usuarios WHERE id = ANY($1) AND estado = 'activo'",
      [[contrato.estudiante_id, contrato.propietario_id].filter(Boolean)]
    );
    const boton = { texto: 'Ver el contrato', url: `${urlBase}/pages/contrato.html?id=${contrato.id}` };
    const nota = 'Contrato demostrativo: la aceptación en Roumix no es una firma electrónica con validez legal.';
    const enviados = [];
    if (evento === 'enviado' || evento === 'formalizado') {
      for (const u of rows) {
        enviados.push(await enviar({
          para: u.email,
          asunto: evento === 'enviado' ? `Tu contrato #${contrato.id} está listo para revisar` : `Contrato #${contrato.id} formalizado`,
          contenido: {
            titulo: evento === 'enviado' ? 'Revisa y acepta tu contrato' : '¡El contrato quedó formalizado!',
            parrafos: [
              `Hola ${escapar(String(u.nombre || '').split(' ')[0])}, ${evento === 'enviado'
                ? `Roumix preparó el contrato de <strong>${escapar(contrato.inmueble_titulo)}</strong> con las condiciones acordadas. Revísalo y acéptalo dentro de los próximos 7 días.`
                : `ambas partes aceptaron el contrato de <strong>${escapar(contrato.inmueble_titulo)}</strong>.`}`,
              evento === 'formalizado' && u.id === contrato.estudiante_id
                ? 'El siguiente paso es el pago del primer mes, que se hará a través de Roumix. Te avisaremos cuando esté habilitado.'
                : 'Si algo no coincide con lo acordado, escríbele al equipo de Roumix antes de aceptarlo.'
            ],
            boton,
            nota
          }
        }));
      }
      if (evento === 'formalizado') {
        await enviar({
          para: await correosAdministradores(),
          asunto: `Contrato #${contrato.id} formalizado`,
          contenido: { titulo: 'Un contrato quedó formalizado', parrafos: [`Ambas partes aceptaron el contrato #${contrato.id} (${escapar(contrato.inmueble_titulo)}). La solicitud pasó a "Contrato formalizado".`], boton: { texto: 'Abrir el panel', url: `${urlBase}/pages/admin.html` } }
        });
      }
      return enviados.some(Boolean);
    }
    // Aceptación parcial: se avisa a la otra parte
    const otraId = parte === 'estudiante' ? contrato.propietario_id : contrato.estudiante_id;
    const otra = rows.find((u) => u.id === otraId);
    if (!otra) return false;
    return await enviar({
      para: otra.email,
      asunto: `Falta tu aceptación del contrato #${contrato.id}`,
      contenido: {
        titulo: 'Solo falta tu aceptación',
        parrafos: [`${parte === 'estudiante' ? 'El estudiante' : 'El propietario'} ya aceptó el contrato de <strong>${escapar(contrato.inmueble_titulo)}</strong>. Revísalo y acéptalo para formalizarlo.`],
        boton,
        nota
      }
    });
  } catch (error) {
    console.error('⚠️ Notificación de contrato:', error.message);
    return false;
  }
}

/**
 * Dirección pública de la aplicación para los enlaces de los correos.
 */
function urlBase(req) {
  const configurada = limpiar(process.env.APP_URL).replace(/\/+$/, '');
  return configurada || `${req.protocol}://${req.get('host')}`;
}

module.exports = {
  correoActivo,
  notificarReporteAdministracion,
  notificarPausaPropietario,
  notificarDecisionPropietario,
  enviarConfirmacionCuenta,
  notificarVerificacionPendiente,
  notificarDecisionVerificacion,
  notificarSolicitudNueva,
  notificarSolicitudCanceladaAdmin,
  notificarSolicitudEstudiante,
  notificarSolicitudPropietario,
  notificarMensajeAdministracion,
  notificarRespuestaRoumix,
  notificarContrato,
  enviarRecuperacion,
  urlBase,
  usarTransporte,
  escapar
};
