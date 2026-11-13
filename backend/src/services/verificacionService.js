/**
 * Verificación de propietarios.
 *
 * Un propietario completa su perfil y Roumix lo revisa antes de dejarlo publicar.
 * Estados: pendiente · aprobado · rechazado · requiere_informacion.
 * Mientras no envíe el perfil (perfil_enviado_en vacío) se muestra como "Perfil incompleto".
 *
 * Se dice exactamente lo que se comprobó: el correo lo confirma Supabase Auth y el
 * teléfono es declarado, salvo que Roumix lo marque "verificado por Roumix" tras llamar.
 * Nada de esto es una verificación legal de identidad o de la propiedad del inmueble.
 */
const db = require('../config/db');

const ESTADOS = ['pendiente', 'aprobado', 'rechazado', 'requiere_informacion'];
const RELACIONES = ['propietario', 'administrador', 'familiar', 'otro'];
const VERSION_CONDICIONES = '2026-11';

const CONDICIONES_COMISION = 'Roumix cobra al propietario una comisión del 10 % del primer canon mensual, una sola vez, cuando el arriendo se concreta a través de la plataforma (contrato formalizado y primer pago confirmado). Mientras el proyecto esté en fase de demostración, los pagos son simulados y no se mueve dinero real.';

/** Devuelve la verificación del propietario y la crea en "pendiente" si aún no existe. */
async function obtener(propietarioId, cliente = db) {
  const existente = await cliente.query('SELECT * FROM verificaciones_propietario WHERE propietario_id = $1', [propietarioId]);
  if (existente.rows.length) return existente.rows[0];
  const creada = await cliente.query(
    `INSERT INTO verificaciones_propietario (propietario_id) VALUES ($1)
     ON CONFLICT (propietario_id) DO UPDATE SET propietario_id = EXCLUDED.propietario_id
     RETURNING *`,
    [propietarioId]
  );
  return creada.rows[0];
}

/** Etapa que se muestra al propietario (incluye "incompleto", que no es un estado guardado). */
function etapa(v) {
  if (!v) return 'incompleto';
  if (v.estado === 'pendiente' && !v.perfil_enviado_en) return 'incompleto';
  return v.estado;
}

/** Datos que puede ver el propio propietario (sin ids internos de quién revisó). */
function vistaPropietario(v) {
  return {
    estado: v.estado,
    etapa: etapa(v),
    puedePublicar: v.estado === 'aprobado',
    nombreCompleto: v.nombre_completo,
    telefono: v.telefono,
    ciudad: v.ciudad,
    relacionInmueble: v.relacion_inmueble,
    cantidadInmuebles: v.cantidad_inmuebles,
    zonas: v.zonas,
    descripcion: v.descripcion,
    perfilEnviadoEn: v.perfil_enviado_en,
    aceptaComision: v.acepta_comision,
    aceptaComisionEn: v.acepta_comision_en,
    telefonoVerificadoPorRoumix: v.telefono_verificado_por_roumix,
    mensajeAdmin: v.mensaje_admin,
    revisadoEn: v.revisado_en,
    condicionesComision: CONDICIONES_COMISION,
    versionCondiciones: VERSION_CONDICIONES
  };
}

/** ¿Este propietario puede publicar? (solo si su cuenta está aprobada) */
async function estaAprobado(propietarioId) {
  const { rows } = await db.query(
    "SELECT 1 FROM verificaciones_propietario WHERE propietario_id = $1 AND estado = 'aprobado'",
    [propietarioId]
  );
  return rows.length > 0;
}

module.exports = {
  ESTADOS,
  RELACIONES,
  VERSION_CONDICIONES,
  CONDICIONES_COMISION,
  obtener,
  etapa,
  vistaPropietario,
  estaAprobado
};
