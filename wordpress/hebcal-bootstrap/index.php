<?php
defined( 'ABSPATH' ) || exit;
get_header();

if ( is_home() && ! is_front_page() ) {
	echo '<h1 class="mt-4 mb-4">' . esc_html( single_post_title( '', false ) ) . '</h1>';
} elseif ( is_search() ) {
	echo '<h1 class="mt-4 mb-4">' . esc_html( sprintf( __( 'Search results for “%s”', 'hebcal-bootstrap' ), get_search_query() ) ) . '</h1>';
} elseif ( is_archive() ) {
	the_archive_title( '<h1 class="mt-4 mb-2">', '</h1>' );
	the_archive_description( '<div class="lead mb-4">', '</div>' );
}

if ( have_posts() ) {
	while ( have_posts() ) {
		the_post();
		get_template_part( 'template-parts/content', is_singular() ? 'single' : 'excerpt' );
	}
	if ( ! is_singular() ) {
		hebcal_pagination();
	}
} else {
	echo '<p class="mt-4">' . esc_html__( 'Nothing found.', 'hebcal-bootstrap' ) . '</p>';
	get_search_form();
}

get_footer();
