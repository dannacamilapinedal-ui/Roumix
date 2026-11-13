/**
 * Auditoría: historial de solo adición de las operaciones sensibles.
 *
 * - auditar(): registra una operación (se usa dentro o fuera de una transacción).
 * - accionAdmin(): traduce una ruta del panel (método + ruta) a una acción legible.
 * - datosSeguros(): guarda solo lo que sirve para auditar; los textos libres que
 *   pueden tener datos personales (mensajes, condiciones) se registran solo como
 *   "incluyó texto", nunca su contenido.
 */
const db = require('../config/db');
const { huella } = require('./limitesService');

// Las pruebas automáticas marcan sus registros para poder limpiarlos después
const esPrueba = () => process.env.ROUMIX_PRUEBAS === '1';

async function auditar({ actor = null, actorRol = null, accion, entidad, entidadId = null, resumen = null, datos = {}, ip = null }, cliente = db) {
  try {
    await cliente.query(
      `INSERT INTO auditoria (actor_id, actor_rol, actor_nombre, accion, entidad, entidad_id, resumen, datos, ip_huella, es_prueba)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        actor ? actor.id : null,
        actorRol || (actor ? actor.rol : 'sistema'),
        actor ? String(actor.nombre || '').slice(0, 120) : null,
        accion,
        entidad,
        entidadId === null || entidadId === undefined ? null : String(entidadId),
        resumen ? String(resumen).slice(0, 500) : null,
        JSON.stringify(datos || {}),
        ip ? huella(ip) : null,
        esPrueba()
      ]
    );
    return true;
  } catch (error) {
    // Dentro de una transacción el error sí debe propagarse (la operación no se hace sin rastro)
    if (cliente !== db) throw error;
    console.error('⚠️ No se pudo registrar en la auditoría:', error.message);
    return false;
  }
}

// Rutas del panel (método + ruta sin /api/admin) → acción y entidad
const RUTAS_ADMIN = [
  ['POST', /^\/inmuebles\/(\d+)\/moderacion$/, 'publicacion_moderada', 'inmueble'],
  ['POST', /^\/usuarios\/([\w-]+)\/estado$/, 'cuenta_estado_cambiado', 'usuario'],
  ['POST', /^\/propietarios\/([\w-]+)\/verificacion$/, 'verificacion_decidida', 'usuario'],
  ['POST', /^\/solicitudes\/(\d+)\/contrato$/, 'contrato_creado', 'solicitud'],
  ['POST', /^\/solicitudes\/(\d+)\/pago$/, 'pago_habilitado', 'solicitud'],
  ['POST', /^\/solicitudes\/(\d+)$/, 'solicitud_actualizada', 'solicitud'],
  ['PUT', /^\/contratos\/(\d+)$/, 'contrato_editado', 'contrato'],
  ['POST', /^\/contratos\/(\d+)\/enviar$/, 'contrato_enviado', 'contrato'],
  ['POST', /^\/contratos\/(\d+)\/cancelar$/, 'contrato_cancelado', 'contrato'],
  ['POST', /^\/conversaciones$/, 'mensaje_a_parte', 'conversacion'],
  ['POST', /^\/conversaciones\/(\d+)\/mensajes$/, 'mensaje_respondido', 'conversacion'],
  ['POST', /^\/conversaciones\/(\d+)\/estado$/, 'conversacion_estado', 'conversacion'],
  ['POST', /^\/pagos\/(\d+)\/desembolso$/, 'desembolso_registrado', 'pago'],
  ['POST', /^\/pagos\/(\d+)\/devolucion$/, 'devolucion_registrada', 'pago'],
  ['POST', /^\/pagos\/(\d+)\/resolver-disputa$/, 'disputa_resuelta', 'pago'],
  ['POST', /^\/pagos\/(\d+)\/cancelar$/, 'pago_cancelado', 'pago']
];

function accionAdmin(metodo, ruta) {
  const limpia = String(ruta || '').split('?')[0].replace(/\/+$/, '') || '/';
  for (const [m, patron, accion, entidad] of RUTAS_ADMIN) {
    const coincide = metodo === m && limpia.match(patron);
    if (coincide) return { accion, entidad, entidadId: coincide[1] || null };
  }
  const entidad = (limpia.split('/')[1] || 'panel').slice(0, 30);
  return { accion: `admin_${metodo.toLowerCase()}`, entidad, entidadId: null };
}

// Campos del cuerpo que se guardan tal cual (decisiones, estados, razones, cifras)
const CAMPOS_VISIBLES = [
  'decision', 'estado', 'para', 'interna', 'telefonoVerificado', 'justificacion', 'motivo', 'nota',
  'canonMensual', 'deposito', 'fechaInicio', 'duracionMeses', 'diaPago', 'solicitudId', 'alcance'
];
// Textos libres que pueden tener datos personales: solo se anota que venían
const CAMPOS_TEXTO = ['mensaje', 'mensajePropietario', 'notaEstudiante', 'notaPropietario', 'notaInterna', 'condiciones', 'inmuebleDireccion', 'serviciosIncluidos'];

function datosSeguros(body) {
  const datos = {};
  if (!body || typeof body !== 'object') return datos;
  for (const campo of CAMPOS_VISIBLES) {
    if (body[campo] !== undefined && body[campo] !== null && body[campo] !== '') {
      datos[campo] = typeof body[campo] === 'string' ? body[campo].slice(0, 300) : body[campo];
    }
  }
  const textos = CAMPOS_TEXTO.filter((c) => typeof body[c] === 'string' && body[c].trim());
  if (textos.length) datos.incluyo_texto = textos;
  return datos;
}

module.exports = { auditar, accionAdmin, datosSeguros };
