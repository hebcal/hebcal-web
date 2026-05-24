const xmlEscMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&apos;',
};

export function xmlEsc(s) {
  return String(s).replace(/[&<>"']/g, (c) => xmlEscMap[c]);
}
