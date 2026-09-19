import assert from "node:assert/strict";
import { test } from "node:test";
import load from "../load.mjs";

const { getSafeNextPath, getSafePostAuthPath } = load(
  "lib/auth/safe-next-path.ts",
);

test("keeps canonical internal destinations, including a safe nested next", () => {
  assert.equal(getSafeNextPath("/"), "/");
  assert.equal(getSafeNextPath("/planes"), "/planes");
  assert.equal(getSafeNextPath("/cuenta"), "/cuenta");
  assert.equal(
    getSafeNextPath("/restablecer-contrasena?next=/cuenta"),
    "/restablecer-contrasena?next=/cuenta",
  );
  assert.equal(
    getSafeNextPath("/cursos/intro?tab=contenido#leccion-1"),
    "/cursos/intro?tab=contenido#leccion-1",
  );
});

test("rejects external URLs, schemes, separators and raw controls", () => {
  const malicious = [
    "/\t/example.invalid",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "http://evil.example",
    " //evil.example",
    "javascript:alert(1)",
    "data:text/html,<h1>evil</h1>",
    "/\r//evil.example",
    "/\n//evil.example",
    "/\u0000/evil.example",
    "/\u001f/evil.example",
    "/\u007f/evil.example",
  ];

  for (const value of malicious) {
    assert.equal(getSafeNextPath(value), "/cuenta", JSON.stringify(value));
  }
});

test("rejects encoded and repeatedly encoded controls and separators", () => {
  const malicious = [
    "/%09/example.invalid",
    "/%00/example.invalid",
    "/%1f/example.invalid",
    "/%7F/example.invalid",
    "/%0d%0a//evil.example",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/%2509/example.invalid",
    "/%255cevil.example",
  ];

  for (const value of malicious) {
    assert.equal(getSafeNextPath(value), "/cuenta", value);
  }
});

test("rejects malformed encodings and sanitizes an unsafe fallback", () => {
  assert.equal(getSafeNextPath("/%zz"), "/cuenta");
  assert.equal(
    getSafeNextPath("https://evil.example", "//fallback.example"),
    "/cuenta",
  );
});

test("prevents post-auth loops while preserving valid recovery destinations", () => {
  assert.equal(getSafePostAuthPath("/login?next=/cuenta"), "/cuenta");
  assert.equal(getSafePostAuthPath("/registro"), "/cuenta");
  assert.equal(
    getSafePostAuthPath("/restablecer-contrasena?next=/cuenta"),
    "/restablecer-contrasena?next=/cuenta",
  );
});

test("a nested next value is validated again before its final redirect", () => {
  const outer = getSafeNextPath(
    "/restablecer-contrasena?next=https%3A%2F%2Fevil.example",
  );
  const nested = new URL(outer, "https://app.filmatta.com").searchParams.get(
    "next",
  );

  assert.equal(getSafeNextPath(nested), "/cuenta");
});
