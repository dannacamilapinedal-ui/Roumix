/**
 * Detecta datos de contacto en los textos que ve la otra parte (títulos y descripciones
 * de las publicaciones). En Roumix el estudiante y el propietario solo se comunican a
 * través del equipo: un teléfono, un correo, una red social o un enlace en la publicación
 * permitiría cerrar el trato por fuera de la plataforma.
 *
 * detectarContacto(texto) → { tipo, fragmento } | null
 */

// Celulares colombianos (3xx xxx xxxx) y fijos con indicativo (60x xxx xxxx), con o sin +57
const CELULAR = /(?:\+\s*57[\s.-]*)?\b(?:3\d{2}|60\d)[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/;
// Fijos locales de 7 dígitos que empiezan por 6 (ej. 662 3456 o 6623456)
const FIJO = /\b6\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/;
const CORREO = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\barroba\b)\s*[A-Za-z0-9-]+\s*(?:\.|\bpunto\b)\s*(?:com|co|net|org|edu|es|me)\b/i;
const ENLACE = /\b(?:https?:\/\/|www\.)\S+|\b(?:wa\.me|bit\.ly|linktr\.ee|t\.me)\/\S*|\b[a-z0-9-]+\.(?:com|co|net|org|me)(?:\/\S*)?\b/i;
const REDES = /\b(?:whats?\s*app|wasap|whatsap|wpp|wsp|telegram|instagram|insta|facebook|tik\s*tok|messenger|signal)\b/i;
const USUARIO_RED = /(?:^|[\s(])@[A-Za-z0-9_.]{3,}/;
const FRASES = /\b(?:ll[aá]m(?:e|a)me|escr[ií]b(?:e|a)me|cont[aá]ct(?:e|a)me|comun[ií]c(?:ate|ese|a)\s+(?:al|conmigo|por)|mi\s+(?:n[uú]mero|cel(?:ular)?|whats?app|correo)|m[aá]ndame\s+(?:un\s+)?(?:mensaje|msj))\b/i;

// Un número precedido de "$" o seguido de pesos/mil/COP/metros/minutos es un valor, no un teléfono
function esValor(texto, indice, fragmento) {
  const antes = texto.slice(Math.max(0, indice - 3), indice);
  const despues = texto.slice(indice + fragmento.length, indice + fragmento.length + 12).toLowerCase();
  return /\$\s*$/.test(antes) || /^\s*(?:pesos|mil|cop|m\b|m2|m²|metros|min|minutos|meses)/.test(despues);
}

function buscarNumero(texto, regex) {
  const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let m;
  while ((m = global.exec(texto)) !== null) {
    if (!esValor(texto, m.index, m[0])) return m[0].trim();
  }
  return null;
}

function detectarContacto(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  const telefono = buscarNumero(texto, CELULAR) || buscarNumero(texto, FIJO);
  if (telefono) return { tipo: 'teléfono', fragmento: telefono };
  const reglas = [['correo', CORREO], ['enlace', ENLACE], ['red social', REDES], ['usuario de red social', USUARIO_RED], ['frase de contacto', FRASES]];
  for (const [tipo, regex] of reglas) {
    const m = texto.match(regex);
    if (m) return { tipo, fragmento: m[0].trim() };
  }
  return null;
}

/**
 * Revisa varios campos ({ nombreVisible: texto }) y lanza un 400 con el primero que tenga contacto.
 */
function exigirSinContacto(campos) {
  for (const [campo, valor] of Object.entries(campos)) {
    const valores = Array.isArray(valor) ? valor : [valor];
    for (const v of valores) {
      const hallado = detectarContacto(v);
      if (hallado) {
        const err = new Error(
          `Por seguridad, las publicaciones no pueden incluir teléfonos, correos, redes sociales ni enlaces: los estudiantes te contactan solo a través de Roumix. ` +
          `Quita este ${hallado.tipo} de ${campo}: «${hallado.fragmento.slice(0, 60)}».`
        );
        err.status = 400;
        err.codigo = 'datos_de_contacto';
        throw err;
      }
    }
  }
}

module.exports = { detectarContacto, exigirSinContacto };
