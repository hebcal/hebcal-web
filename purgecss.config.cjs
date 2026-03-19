// purgecss.config.cjs
//
// PurgeCSS scans your EJS templates and JS to find which CSS classes
// are actually used, then strips everything else from the compiled CSS.

module.exports = {
  // Files to scan for CSS class usage
  content: [
    'views/**/*.ejs',
    'views/**/*.html',
    'src/**/*.js',
    'static/**/*.js',
  ],

  // Custom extractor that handles EJS template syntax
  // The default extractor would choke on <%= %> tags
  defaultExtractor: content => {
    // Match class-like tokens, including Bootstrap's responsive prefixes
    // like col-sm-4, d-print-none, mb-lg-0, etc.
    return content.match(/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/g) || [];
  },

  // Safelist: classes that PurgeCSS can't detect statically because
  // they're added dynamically by JavaScript or Bootstrap's JS
  safelist: {
    // Exact class names to always keep
    standard: [
      'show',
      'showing',
      'hiding',
      'fade',
      'collapse',
      'collapsing',
      'collapsed',
      'active',
      'disabled',
      'visually-hidden',
      'visually-hidden-focusable',
    ],
    // Regex patterns - keep anything matching these
    deep: [
      // Bootstrap JS-toggled states
      /^dropdown/,
      /^navbar/,
      /^modal/,
      /^offcanvas/,
      /^tooltip/,
      /^popover/,
      /^accordion/,
      /^alert/,
      /^btn-close/,
      /^carousel/,
      // Dark mode
      /data-bs-theme/,
      // Print styles
      /d-print/,
    ],
  },

  // Don't remove @font-face rules
  fontFace: true,

  // Don't remove @keyframes
  keyframes: true,

  // Don't remove CSS variables (Bootstrap 5 relies heavily on these)
  variables: true,
};
