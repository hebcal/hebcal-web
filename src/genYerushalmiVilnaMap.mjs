/* eslint-disable require-jsdoc */
import {vilna} from '@hebcal/core';
import pino from 'pino';

const logger = pino();
const allRefs = {};

(async () => {
  // ignore number of dapim
  for (const [masechet] of vilna.shas) {
    logger.info(masechet);
    allRefs[masechet] = [];
    await handleTractate(masechet);
  }
  console.log(JSON.stringify(allRefs));
})();

async function handleTractate(masechet) {
  const url = `https://www.sefaria.org/api/v2/index/Jerusalem_Talmud_${masechet}`;
  const response = await fetch(url);
  const responseData = await response.json();
  const nodes = responseData.alts.Vilna.nodes;
  for (const node of nodes) {
    if (node.nodeType !== 'ArrayMapNode') {
      continue;
    }
    const prefix = `Jerusalem Talmud ${masechet} `;
    for (let ref of node.refs) {
      if (ref.startsWith(prefix)) {
        ref = ref.substring(prefix.length);
      }
      allRefs[masechet].push(ref);
    }
  }
}
