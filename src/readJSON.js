import {readFileSync} from 'fs';

/**
 * @param {string} f
 * @return {any}
 */
export function readJSON(f) {
  const fileUrl = new URL(f, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, 'utf8'));
}
