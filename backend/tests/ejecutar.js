/**
 * Ejecutor de las pruebas de Roumix:  npm test   (desde backend/ o desde la raíz)
 *
 * Las pruebas son de INTEGRACIÓN: llaman a los controladores reales contra la base de
 * datos configurada en DATABASE_URL. Cada una crea sus propios usuarios, inmuebles,
 * solicitudes, etc. (con correos @roumix.test) y los BORRA al terminar. Nunca tocan
 * datos reales ni envían correos de verdad (usan un transporte de correo simulado).
 *
 * Como escriben en la base de datos, se exige confirmarlo con una variable de entorno:
 *   ROUMIX_PRUEBAS_BD=si npm test            (Git Bash / macOS / Linux)
 *   $env:ROUMIX_PRUEBAS_BD="si"; npm test    (PowerShell)
 *
 * Opcional: ejecutar solo algunas →  npm test -- 03 05
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const carpeta = __dirname;
require('dotenv').config({ path: path.join(carpeta, '..', '.env') });

if (process.env.ROUMIX_PRUEBAS_BD !== 'si') {
  console.log(`
Las pruebas de Roumix escriben datos temporales en la base de datos configurada en
DATABASE_URL y los borran al terminar. Para confirmar que quieres ejecutarlas:

  Git Bash:    ROUMIX_PRUEBAS_BD=si npm test
  PowerShell:  $env:ROUMIX_PRUEBAS_BD="si"; npm test
`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en backend/.env');
  process.exit(1);
}

const filtros = process.argv.slice(2);
const archivos = fs.readdirSync(carpeta)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => filtros.length === 0 || filtros.some((x) => f.startsWith(x) || f.includes(x)))
  .sort();

const resultados = [];
for (const archivo of archivos) {
  console.log(`\n━━━ ${archivo} ━━━`);
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [path.join(carpeta, archivo)], { encoding: 'utf8', env: process.env, timeout: 300000 });
  const salida = `${r.stdout || ''}${r.stderr || ''}`;
  // Se muestran las comprobaciones; los registros del servidor (errores esperados) se omiten
  const lineas = salida.split(/\r?\n/).filter((l) => /^(✅|❌ (?!(POST|GET|PUT|PATCH|DELETE) )|🧹|⚠️ Quedaron|ERROR|Error en la prueba)/.test(l));
  console.log(lineas.join('\n'));
  const ok = (salida.match(/^✅/gm) || []).length;
  const mal = (salida.match(/^❌ (?!(POST|GET|PUT|PATCH|DELETE) )/gm) || []).length;
  resultados.push({ archivo, ok, mal, codigo: r.status, segundos: ((Date.now() - inicio) / 1000).toFixed(1) });
}

console.log('\n━━━ Resumen ━━━');
let total = 0;
let fallidos = 0;
for (const r of resultados) {
  const bien = r.codigo === 0 && r.mal === 0;
  if (!bien) fallidos++;
  total += r.ok;
  console.log(`${bien ? '✅' : '❌'} ${r.archivo.padEnd(34)} ${String(r.ok).padStart(3)} comprobaciones${r.mal ? `, ${r.mal} fallida(s)` : ''}  (${r.segundos} s)`);
}
console.log(`\n${total} comprobaciones en ${resultados.length} archivo(s). ${fallidos ? `${fallidos} archivo(s) con fallos.` : 'Todo OK.'}`);
process.exit(fallidos ? 1 : 0);
