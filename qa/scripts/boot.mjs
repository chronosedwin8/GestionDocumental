// Carga qa/.env.qa en process.env y luego importa el módulo indicado.
// Las variables aquí definidas ganan a server/.env porque dotenv no sobreescribe.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const envPath = new URL('../.env.qa', import.meta.url);
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const i = trimmed.indexOf('=');
  if (i < 0) continue;
  process.env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
}

const target = process.argv[2];
if (!target) {
  console.error('Uso: tsx qa/scripts/boot.mjs <ruta-al-modulo>');
  process.exit(2);
}
await import(pathToFileURL(path.resolve(target)).href);
