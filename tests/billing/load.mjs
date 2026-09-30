// Compile the real server modules in memory; replace network/DB boundaries only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const importCommonJS = createRequire(import.meta.url);

export default function load(file, mocks = {}, env = {}) {
  const absolute = path.resolve(file);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const evaluatedModule = { exports: {} };
  vm.runInNewContext(output, {
    module: evaluatedModule, exports: evaluatedModule.exports, Buffer, Request, Response, URL, Date, setTimeout,
    process: { env }, console: { error() {} },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (name.startsWith('.')) return load(resolveSource(path.join(path.dirname(absolute), name)), mocks, env);
      if (name.startsWith('@/')) return load(resolveSource(path.resolve(name.slice(2))), mocks, env);
      return importCommonJS(name);
    },
  }, { filename: absolute });
  return evaluatedModule.exports;
};

function resolveSource(candidate) {
  for (const file of [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`, `${candidate}.mjs`]) {
    if (fs.existsSync(file)) return file;
  }
  return `${candidate}.ts`;
}
