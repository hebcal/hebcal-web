/* eslint-disable require-jsdoc */
import {vilna} from '@hebcal/core';

const allRefs = {};

(async () => {
  for (const [masechet, dapim] of vilna.shas) {
    console.error(masechet);
    allRefs[masechet] = Array(dapim);
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
      console.error(`ignoring ${masechet} nodeType ${node.nodeType}`);
      continue;
    }
    if (!Array.isArray(node.refs)) {
      console.error(`ignoring ${masechet} ArrayMapNode without refs`);
      continue;
    }
    const startPage = parseInt(node.startingAddress, 10);
    const startSide = node.startingAddress[node.startingAddress.length - 1]; // a or b
    let currentSide = startSide === 'a';
    let currentPage = startPage;
    const prefix = `Jerusalem Talmud ${masechet} `;
    for (let ref of node.refs) {
      if (ref.startsWith(prefix)) {
        ref = ref.substring(prefix.length);
      }
      if (currentSide) {
        allRefs[masechet][currentPage] = ref;
      }
      if (!currentSide) {
        currentPage++;
      }
      currentSide = !currentSide;
    }
  }
  allRefs[masechet] = allRefs[masechet].slice(1);
}
