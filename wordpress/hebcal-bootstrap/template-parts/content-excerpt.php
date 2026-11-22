<?php defined( 'ABSPATH' ) || exit; ?>
<article id="post-<?php the_ID(); ?>" <?php post_class( 'mb-4' ); ?>>
<?php the_title( '<h2 class="h4 entry-title"><a href="' . esc_url( get_permalink() ) . '">', '</a></h2>' ); ?>
<?php if ( 'post' === get_post_type() ) : ?>
<?php hebcal_posted_on(); ?>
<?php endif; ?>
<div class="entry-summary"><?php the_excerpt(); ?></div>
</article>
