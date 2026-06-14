const knownRobots = new Set([
  'Apache-HttpClient',
  'axios',
  'Blackbox Exporter',
  'check_http',
  'checkhttp2',
  'curl',
  'Excel',
  'Go-http-client',
  'GuzzleHttp',
  'Java-http-client',
  'Java',
  'kube-probe',
  'libwww-perl',
  'Mediapartners-Google',
  'meta-externalads',
  'meta-externalagent',
  'meta-webindexer',
  'Mozilla/5.0 (compatible; Google-Apps-Script)',
  'Mozilla/5.0 (compatible; GoogleDocs; apps-spreadsheets; +http://docs.google.com)',
  'node-fetch',
  'node',
  'Prometheus',
  'python-httpx',
  'python-requests',
  'Python-urllib',
  'Python',
  'Rainmeter WebParser plugin',
  'SFDC-Callout',
  'Varnish Health Probe',
  'WordPress',
]);

const botRegex = /bot|crawl|spider|slurp/i;

/**
 * @private
 * @param {string} userAgent
 * @return {boolean}
 */
export function isRobot(userAgent) {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return false;
  }
  if (knownRobots.has(userAgent)) {
    return true;
  }
  const idx = userAgent.indexOf('/');
  if (idx !== -1) {
    const uaPrefix = userAgent.substring(0, idx);
    if (knownRobots.has(uaPrefix)) {
      return true;
    }
  }
  if (botRegex.test(userAgent)) {
    return true;
  }
  return false;
}
