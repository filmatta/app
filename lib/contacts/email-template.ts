export function profileContactEmailHtml({ sender, context, href }: { sender: string; context: string; href: string }) {
  const safeSender = escapeHtml(sender), safeContext = escapeHtml(context), safeHref = escapeHtml(href);
  return `<div style="background:#080808;color:#f1efe9;padding:32px;font-family:Arial,sans-serif"><p style="color:#b9dceb;font-size:12px;letter-spacing:.14em">FILMATTA / CONTACTO</p><h1 style="font-size:24px">Recibiste una nueva consulta.</h1><p style="color:#c9c9c5;line-height:1.6">${safeSender} quiere ponerse en contacto desde ${safeContext}. El mensaje completo permanece privado dentro de FILMATTA.</p><p><a href="${safeHref}" style="display:inline-block;border:1px solid #b9dceb;color:#b9dceb;padding:12px 18px;text-decoration:none">Ver consulta</a></p><p style="color:#8f9290;font-size:12px">No compartimos automáticamente email, teléfono ni WhatsApp.</p></div>`;
}

function escapeHtml(value: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => map[character]);
}
