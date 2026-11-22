<?php
/* Copy of hebcal-web views/partials/header.ejs + header-and-navbar.ejs + navbar.ejs */
defined( 'ABSPATH' ) || exit;
$hebcal_logo_img  = '<svg width="77" height="21"><use href="' . esc_attr( HEBCAL_SPRITE ) . '#hebcal-logo"></use></svg>';
$hebcal_logo_attr = 'class="navbar-brand" id="logo" title="Hebcal Jewish Calendar"';
?><!DOCTYPE html>
<html <?php language_attributes(); ?> data-bs-theme="auto"><head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<script>
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.setAttribute('data-bs-theme', 'dark');
}
</script>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="visually-hidden-focusable" href="#content">Skip to content</a>
<nav class="navbar navbar-expand-lg bg-body-tertiary">
<div class="container-fluid">
  <a href="/" <?php echo $hebcal_logo_attr; ?>><?php echo $hebcal_logo_img; ?></a>
  <button class="navbar-toggler d-print-none" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
    <span class="navbar-toggler-icon"></span>
  </button>
  <div class="collapse navbar-collapse d-print-none" id="navbarSupportedContent">
    <?php hebcal_navbar_menu(); ?>
    <form class="d-flex d-print-none" role="search" method="get" id="searchform" action="<?php echo esc_url( home_url( '/' ) ); ?>">
      <input name="s" id="sitesearch" type="text" class="form-control me-2" placeholder="Search" aria-label="Search" enterkeyhint="search" value="<?php echo esc_attr( get_search_query() ); ?>">
    </form>
<?php if ( hebcal_login_enabled() ) : ?>
    <ul class="navbar-nav ms-2 d-print-none">
      <li class="nav-item" id="acct-signin"><a class="nav-link" href="/login">
        <svg class="icon icon-sm mt-n1"><use href="<?php echo esc_attr( HEBCAL_SPRITE ); ?>#bi-person-circle"></use></svg> Sign in</a></li>
      <li class="nav-item" id="acct-account" hidden><a class="nav-link" href="/account" title="Your account">
        <svg class="icon icon-sm mt-n1"><use href="<?php echo esc_attr( HEBCAL_SPRITE ); ?>#bi-person-circle"></use></svg> Account</a></li>
    </ul>
    <script>
    (function(){try{var m=document.cookie.match(/(?:^|;\s*)C=([^;]*)/);
    if(m&&/(?:^|&)hu=1(?:&|$)/.test(m[1])){
    document.getElementById('acct-signin').hidden=true;
    document.getElementById('acct-account').hidden=false;}}catch(e){}})();
    </script>
<?php endif; ?>
  </div>
</div>
</nav>
<div class="container">
<div class="row">
<main id="content" class="<?php echo is_404() ? 'col' : 'col-md-8 col-sm-12'; ?>">
