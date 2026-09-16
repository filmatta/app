// Test-only TS loader. Keeps navigation/catalog tests independent of Billing.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const requireModule = createRequire(import.meta.url);
export default function load(file, mocks = {}, env = {}) {
  const absolute = path.resolve(file);
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(
    output,
    {
      module: mod,
      exports: mod.exports,
      Buffer,
      Request,
      Response,
      URL,
      URLSearchParams,
      FormData,
      Date,
      setTimeout,
      process: { env },
      console: { error() {} },
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "server-only") return {};
        if (name.startsWith("."))
          return load(
            path.join(path.dirname(absolute), `${name}.ts`),
            mocks,
            env,
          );
        return requireModule(name);
      },
    },
    { filename: absolute },
  );
  return mod.exports;
}
