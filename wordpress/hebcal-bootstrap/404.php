<?php
defined( 'ABSPATH' ) || exit;
status_header( 404 );
get_header();
?>
<h1 class="mt-4">Page not found</h1>
<p class="lead">Sorry, we couldn’t find that page. Try searching:</p>
<?php get_search_form(); ?>
<?php get_footer(); ?>
