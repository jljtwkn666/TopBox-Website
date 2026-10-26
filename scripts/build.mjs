import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Production depends on this Worker for account, plan and data APIs. Never
// generate a static-file-only Worker here: that silently breaks sign-in.
const root = process.cwd();
const output = resolve(root, 'dist/server');
const worker = await readFile(resolve(root, 'worker.js'), 'utf8');
const requiredRoutes = ['/api/auth/login', '/api/bootstrap', 'env.ASSETS.fetch'];
const missingRoutes = requiredRoutes.filter(route => !worker.includes(route));

if (missingRoutes.length) {
  throw new Error(`Refusing to build an incomplete Worker: missing ${missingRoutes.join(', ')}`);
}

await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.js'), worker);
console.log('Built verified full Worker to dist/server/index.js');
