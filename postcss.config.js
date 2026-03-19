import purgecss from '@fullhuman/postcss-purgecss';
import purgecssConfig from './purgecss.config.cjs';

/**
 * Custom PostCSS plugin to remove vendor-prefixed properties where
 * the unprefixed version exists in the same rule, and to remove
 * specific deprecated properties like -webkit-overflow-scrolling.
 */
function removeVendorPrefixes() {
  return {
    postcssPlugin: 'remove-vendor-prefixes',
    Rule(rule) {
      const unprefixed = new Set();
      // First pass: collect all unprefixed property names
      rule.walkDecls((decl) => {
        if (!decl.prop.startsWith('-')) {
          unprefixed.add(decl.prop);
        }
      });
      // Second pass: remove prefixed declarations where unprefixed exists
      rule.walkDecls(/^-(?:webkit|moz)-/, (decl) => {
        const base = decl.prop.replace(/^-(?:webkit|moz)-/, '');
        if (unprefixed.has(base)) {
          decl.remove();
        }
      });
    },
    Declaration(decl) {
      // Remove deprecated properties that are no-ops in modern browsers
      if (decl.prop === '-webkit-overflow-scrolling') {
        decl.remove();
        return;
      }
      // Replace -webkit-appearance with unprefixed appearance
      // (supported in all modern browsers: Chrome 84+, Firefox 80+, Safari 15.4+)
      if (decl.prop === '-webkit-appearance') {
        decl.prop = 'appearance';
      }
    },
  };
}
removeVendorPrefixes.postcss = true;

export default {
  plugins: [removeVendorPrefixes, purgecss(purgecssConfig)],
};
