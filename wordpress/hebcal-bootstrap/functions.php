<?php
/**
 * Hebcal Bootstrap theme.
 *
 * Shares /i/style-5.3.9a.css and the Bootstrap 5.3.9 bundle with
 * www.hebcal.com (hebcal-web). Keep HEBCAL_MAIN_CSS / HEBCAL_SPRITE in sync
 * with "config" in hebcal-web's package.json.
 */

defined( 'ABSPATH' ) || exit;

const HEBCAL_MAIN_CSS = '/i/style-5.3.9a.css';
const HEBCAL_SPRITE   = '/i/sprite15.svg';
const HEBCAL_BS_JS    = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.9/dist/js/bootstrap.bundle.min.js';
const HEBCAL_BS_SRI   = 'sha384-WyOxWvTyr1QaMPfiPJSv76iReVthorl5uWlFtZPyK0IEB0hGzo9y5Bp9mYanr8Bu';

/** Set to false (e.g. via a child theme or plugin filter) to drop the Matomo snippet. */
function hebcal_matomo_enabled() {
	return (bool) apply_filters( 'hebcal_matomo_enabled', true );
}

/** Show the "Sign in" / "Account" navbar element, like hebcal-web with loginEnabled. */
function hebcal_login_enabled() {
	return (bool) apply_filters( 'hebcal_login_enabled', true );
}

add_action( 'after_setup_theme', function () {
	add_theme_support( 'title-tag' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'html5', array( 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ) );
} );

/**
 * Full URL for a path at the root of this host (not under /home/).
 * WP_Styles prefixes a "/i/..." src with site_url(), which would give
 * /home/i/..., so enqueued assets need scheme://host spelled out.
 */
function hebcal_root_url( $path ) {
	$p = wp_parse_url( home_url() );
	return $p['scheme'] . '://' . $p['host'] . ( isset( $p['port'] ) ? ':' . $p['port'] : '' ) . $path;
}

add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style( 'hebcal-main', hebcal_root_url( HEBCAL_MAIN_CSS ), array(), null );
	wp_enqueue_style( 'hebcal-bootstrap-theme', get_stylesheet_uri(), array( 'hebcal-main' ), wp_get_theme()->get( 'Version' ) );

	wp_enqueue_script( 'bootstrap', HEBCAL_BS_JS, array(), null, array( 'in_footer' => true, 'strategy' => 'defer' ) );

	if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
		wp_enqueue_script( 'comment-reply' );
	}
} );

// SRI + CORS for the jsDelivr bundle, matching hebcal-web's <script> tag.
add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	if ( 'bootstrap' === $handle ) {
		$tag = str_replace( ' src=', ' integrity="' . HEBCAL_BS_SRI . '" crossorigin="anonymous" src=', $tag );
	}
	return $tag;
}, 10, 2 );

/** Same items as MENU_ITEMS in hebcal-web's views/partials/navbar.ejs. */
function hebcal_default_menu_items() {
	return array(
		array( '/holidays/', 'Holidays', 'Jewish Holidays' ),
		array( '/converter', 'Date Converter', 'Hebrew Date Converter' ),
		array( '/shabbat', 'Shabbat', 'Shabbat Times' ),
		array( '/sedrot/', 'Torah', 'Torah Readings' ),
		array( '/yahrzeit', 'Yahrzeit', 'Yahrzeit, Birthday + Anniversary dates' ),
		array( '/home/about', 'About', 'About' ),
		array( '/home/help', 'Help', 'Help' ),
	);
}

/** Request path, without query string or trailing slash (except "/"). */
function hebcal_request_path() {
	$path = (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
	return '/' === $path ? $path : untrailingslashit( $path );
}

/**
 * Navbar <ul>, always the hebcal-web list. Deliberately not a WP menu
 * location: WP maps the previous theme's menu onto it on theme switch,
 * which silently replaced these links.
 */
function hebcal_navbar_menu() {
	$current = hebcal_request_path();
	echo '<ul class="navbar-nav me-auto mb-2 mb-lg-0 d-print-none">';
	foreach ( hebcal_default_menu_items() as list( $path, $title, $tooltip ) ) {
		$active = ( '/' !== $path && untrailingslashit( $path ) === $current ) ? ' active" aria-current="page' : '';
		printf(
			'<li class="nav-item"><a class="nav-link%s" href="%s" title="%s">%s</a></li>',
			$active, esc_url( $path ), esc_attr( $tooltip ), esc_html( $title )
		);
	}
	echo '</ul>';
}

/** Bootstrap pagination for archives and search. */
function hebcal_pagination() {
	$links = paginate_links( array( 'type' => 'array', 'prev_text' => '&laquo;', 'next_text' => '&raquo;' ) );
	if ( ! $links ) {
		return;
	}
	echo '<nav aria-label="Pages"><ul class="pagination">';
	foreach ( $links as $link ) {
		$active = str_contains( $link, 'page-numbers current' ) ? ' active' : '';
		$link   = str_replace( array( 'page-numbers current', 'page-numbers' ), 'page-link', $link );
		echo '<li class="page-item' . $active . '">' . $link . '</li>';
	}
	echo '</ul></nav>';
}

add_action( 'widgets_init', function () {
	register_sidebar( array(
		'id'            => 'sidebar-1',
		'name'          => __( 'Right sidebar', 'hebcal-bootstrap' ),
		'description'   => __( 'Shown in the right column. When empty, Recent Posts and Categories are shown.', 'hebcal-bootstrap' ),
		'before_widget' => '<section id="%1$s" class="widget %2$s mb-4">',
		'after_widget'  => '</section>',
		'before_title'  => '<h2 class="widget-title">',
		'after_title'   => '</h2>',
	) );
} );

/** "Posted on <date> by <author>" line for posts. */
function hebcal_posted_on() {
	printf(
		'<p class="entry-meta">Posted on <a href="%1$s"><time datetime="%2$s">%3$s - %4$s</time></a> by <a href="%5$s">%6$s</a></p>',
		esc_url( get_permalink() ),
		esc_attr( get_the_date( 'c' ) ),
		esc_html( get_the_date() ),
		esc_html( get_the_time() ),
		esc_url( get_author_posts_url( get_the_author_meta( 'ID' ) ) ),
		esc_html( get_the_author() )
	);
}

// Bootstrap classes on the comment form's submit button.
add_filter( 'comment_form_defaults', function ( $d ) {
	$d['class_submit'] = 'btn btn-primary';
	return $d;
} );
