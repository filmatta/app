import assert from "node:assert/strict";
import test from "node:test";
import { profileContactEmailHtml } from "../../lib/contacts/email-template.ts";

test("email notification keeps the message private and escapes visible context", () => {
  const html = profileContactEmailHtml({
    sender: "Ana <script>", context: "tu perfil profesional",
    href: "https://preview.example/cuenta/contactos/abc?x=1&y=2",
  });
  assert.match(html, /Ana &lt;script&gt;/);
  assert.match(html, /Ver consulta/);
  assert.match(html, /x=1&amp;y=2/);
  assert.doesNotMatch(html, /contenido completo|email del remitente/i);
});
