/**
 * ROUMIX - Envío de correos desde la cuenta de Gmail de Roumix (Google Apps Script)
 *
 * Por qué existe: el plan gratuito de Render bloquea los puertos SMTP, así que el servidor
 * no puede enviar correos directamente. Este script vive en la cuenta roumix04@gmail.com,
 * recibe la orden por HTTPS y envía el correo con Gmail.
 *
 * INSTALACIÓN (una sola vez), con la sesión iniciada en roumix04@gmail.com:
 *  1. Entra a https://script.google.com -> "Nuevo proyecto" y ponle de nombre "Roumix correos".
 *  2. Borra el contenido de Código.gs y pega TODO este archivo.
 *  3. Cambia el valor de SECRETO por un texto largo inventado (el mismo irá en CORREO_RELAY_SECRETO).
 *  4. Guarda (icono de disquete). Arriba elige la función "probar" y pulsa "Ejecutar":
 *     Google pedirá permisos -> "Revisar permisos" -> elige la cuenta -> "Configuración avanzada"
 *     -> "Ir a Roumix correos (no seguro)" -> "Permitir". Debe llegarte un correo de prueba.
 *  5. "Implementar" -> "Nueva implementación" -> tipo "Aplicación web":
 *       Descripción: Roumix correos · Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 *     Pulsa "Implementar" y copia la "URL de la aplicación web" (termina en /exec).
 *  6. En Render (Environment) y en backend/.env agrega:
 *       CORREO_RELAY_URL=<la URL /exec>
 *       CORREO_RELAY_SECRETO=<el mismo SECRETO de este archivo>
 *
 * Si cambias este código, usa "Implementar" -> "Gestionar implementaciones" -> editar ->
 * "Versión: nueva versión", para que la URL siga siendo la misma.
 *
 * Límite de Google para cuentas gratuitas: unos 100 destinatarios por día.
 */

const SECRETO = 'CAMBIA_ESTE_TEXTO_POR_UN_SECRETO_LARGO';
const MAX_DESTINATARIOS = 10;

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    if (!datos || datos.secreto !== SECRETO) {
      return responder({ ok: false, error: 'no autorizado' });
    }

    const para = String(datos.para || '')
      .split(',')
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c); });
    if (para.length === 0 || para.length > MAX_DESTINATARIOS) {
      return responder({ ok: false, error: 'destinatarios no válidos' });
    }

    MailApp.sendEmail({
      to: para.join(','),
      subject: String(datos.asunto || 'Roumix').slice(0, 150),
      htmlBody: String(datos.html || ''),
      body: String(datos.texto || ''),
      name: 'Roumix'
    });
    return responder({ ok: true, restantesHoy: MailApp.getRemainingDailyQuota() });
  } catch (error) {
    return responder({ ok: false, error: String(error) });
  }
}

// Permite comprobar en el navegador que la URL funciona (no envía nada)
function doGet() {
  return responder({ ok: true, servicio: 'Roumix correos', restantesHoy: MailApp.getRemainingDailyQuota() });
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

// Ejecútala una vez desde el editor para conceder permisos y recibir un correo de prueba
function probar() {
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: 'Roumix: prueba de correos',
    htmlBody: '<p>Si recibes este mensaje, el envío de correos de Roumix está listo.</p>',
    name: 'Roumix'
  });
  Logger.log('Correo de prueba enviado. Cuota restante hoy: ' + MailApp.getRemainingDailyQuota());
}
