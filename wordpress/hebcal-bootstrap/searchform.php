<?php defined( 'ABSPATH' ) || exit; $hebcal_sid = 's-' . wp_unique_id(); ?>
<form role="search" method="get" class="d-flex mb-4" action="<?php echo esc_url( home_url( '/' ) ); ?>">
  <label class="visually-hidden" for="<?php echo esc_attr( $hebcal_sid ); ?>">Search</label>
  <input type="search" id="<?php echo esc_attr( $hebcal_sid ); ?>" class="form-control me-2" name="s" value="<?php echo esc_attr( get_search_query() ); ?>" placeholder="Search">
  <button type="submit" class="btn btn-primary">Search</button>
</form>
