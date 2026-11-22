<?php
/* Right column. Widgets from Appearance → Widgets → "Right sidebar", or Recent Posts + Categories by default. */
defined( 'ABSPATH' ) || exit;
$hebcal_widget_args = array(
	'before_widget' => '<section class="widget %s mb-4">',
	'after_widget'  => '</section>',
	'before_title'  => '<h2 class="widget-title">',
	'after_title'   => '</h2>',
);
?>
<aside class="col-md-4 col-sm-12 d-print-none" aria-label="Sidebar">
<?php
if ( is_active_sidebar( 'sidebar-1' ) ) {
	dynamic_sidebar( 'sidebar-1' );
} else {
	the_widget( 'WP_Widget_Recent_Posts', array( 'title' => __( 'Recent Posts' ), 'number' => 5 ), $hebcal_widget_args );
	the_widget( 'WP_Widget_Categories', array( 'title' => __( 'Categories' ) ), $hebcal_widget_args );
}
?>
</aside>
