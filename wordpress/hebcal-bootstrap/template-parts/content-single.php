<?php defined( 'ABSPATH' ) || exit; ?>
<article id="post-<?php the_ID(); ?>" <?php post_class( 'mt-4' ); ?>>
<?php the_title( '<h1 class="entry-title">', '</h1>' ); ?>
<?php if ( 'post' === get_post_type() ) { hebcal_posted_on(); } ?>
<?php if ( has_post_thumbnail() ) { the_post_thumbnail( 'large', array( 'class' => 'img-fluid mb-4' ) ); } ?>
<div class="entry-content">
<?php
the_content();
wp_link_pages( array( 'before' => '<nav class="mt-3">' . __( 'Pages:', 'hebcal-bootstrap' ), 'after' => '</nav>' ) );
?>
</div>
<?php if ( 'post' === get_post_type() ) : ?>
<?php if ( has_category() ) : ?><p class="mt-4 mb-1">Categories: <?php the_category( ', ' ); ?></p><?php endif; ?>
<?php the_tags( '<p>' . __( 'Tags: ', 'hebcal-bootstrap' ), ', ', '</p>' ); ?>
<?php the_post_navigation( array( 'prev_text' => '&laquo; %title', 'next_text' => '%title &raquo;' ) ); ?>
<?php endif; ?>
</article>
<?php
if ( comments_open() || get_comments_number() ) {
	comments_template();
}
