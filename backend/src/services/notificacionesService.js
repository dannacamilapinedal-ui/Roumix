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
const correoActivo = Boolean(SMTP.host && SMTP.user && SMTP.pass);

if (!correoActivo) {
  console.warn('⚠️  Correos desactivados: defina SMTP_HOST, SMTP_USER y SMTP_PASS para enviar notificaciones.');
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
  solicitar_cambios: {
    titulo: 'Necesitamos que corrijas tu publicación',
    explicacion: 'Tu publicación no se mostrará hasta que hagas los cambios solicitados. Cuando la edites y guardes, volverá automáticamente a revisión.',
    boton: 'Corregir mi publicación',
    ruta: null // se arma con el id del inmueble
  },
  rechazar: {
    titulo: 'Tu publicación fue rechazada',
    explicacion: 'La publicación no cumple las reglas de Roumix y no se mostrará. Puedes eliminarla desde "Mis publicaciones".',
    boton: 'Ver mis publicaciones',
    ruta: 'mis-publicaciones.html'
  },
  retirar: {
    titulo: 'Tu publicación fue retirada',
    explicacion: 'Roumix retiró la publicación de forma definitiva y no volverá a mostrarse. Puedes eliminarla desde "Mis publicaciones".',
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
  urlBase,
  usarTransporte,
  escapar
};
