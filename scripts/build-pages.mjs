import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(root, 'dist', 'client');
const server = path.join(root, 'dist', 'server');
const output = path.join(root, 'dist', 'pages');
const workerSource = path.join(root, 'dist', 'pages-worker-source');

await rm(output, { recursive: true, force: true });
await cp(client, output, { recursive: true });

for (const file of ['index.html', 'styles.css', 'script.js', 'favicon.png', 'robots.txt', 'sitemap.xml', '_headers']) {
  await cp(path.join(root, file), path.join(output, file));
}
for (const directory of ['assets', 'tracker']) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}

await rm(workerSource, { recursive: true, force: true });
await mkdir(workerSource, { recursive: true });
await cp(server, workerSource, { recursive: true });
await rename(path.join(workerSource, 'index.js'), path.join(workerSource, 'vinext.js'));
await cp(path.join(root, 'cloudflare-pages', 'worker-entry.js'), path.join(workerSource, 'index.js'));

await build({
  entryPoints: [path.join(workerSource, 'index.js')],
  outfile: path.join(output, '_worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
  logLevel: 'info',
});
await rm(workerSource, { recursive: true, force: true });

await writeFile(path.join(output, '_routes.json'), `${JSON.stringify({
  version: 1,
  include: ['/_next/image', '/missioncontrol', '/missioncontrol/*', '/api/*', '/feedback/*', '/impact', '/impact/*'],
  exclude: ['/_next/static/*'],
}, null, 2)}\n`);

console.log('Cloudflare Pages output assembled at dist/pages');
