<?php
/* Copy of hebcal-web views/partials/footer.ejs */
defined( 'ABSPATH' ) || exit;
// The post/page's publish date (www uses the render time instead).
// Archives, search and the blog index have no single date, so it is omitted there.
$hebcal_post = is_singular() ? get_queried_object() : null;
?>
</main>
<?php if ( ! is_404() ) { get_sidebar(); } ?>
</div><!-- .row -->
<footer class="hebcal-footer d-print-none">
<div class="row">
<div class="col">
<ul class="bullet-list-inline">
<?php if ( $hebcal_post instanceof WP_Post ) : ?>
<li><time datetime="<?php echo esc_attr( get_post_time( 'c', true, $hebcal_post ) ); ?>"><?php echo esc_html( get_the_date( 'F j, Y', $hebcal_post ) ); ?></time></li>
<?php endif; ?>
<li><a href="/home/about">About</a></li>
<li><a href="/home/privacy-policy">Privacy</a></li>
<li><a href="/home/help">Help</a></li>
<li><a href="/home/about/contact">Contact</a></li>
<li><a href="/home/developer-apis">Developer APIs</a></li>
</ul>
<p class="small">Except where otherwise noted, content on this site is licensed under a <a
rel="license" href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.
This website includes location data created by <a href="https://www.geonames.org/">GeoNames</a>
and <a href="https://www.maxmind.com/">MaxMind</a>, also licensed under Creative Commons.
</p>
</div><!-- .col -->
</div><!-- .row -->
</footer>
</div><!-- .container -->
<?php wp_footer(); ?>
<?php if ( hebcal_matomo_enabled() ) : ?>
<script>
var _paq = window._paq = window._paq || [];
(function(){
var d=document,href=window.location.href,utm_={};
for (const [k, v] of new URL(href).searchParams) { if (k.startsWith('utm_')) utm_[k]=v; }
var c=d.querySelector('link[rel="canonical"]'),url=new URL(c?c.href:href);
url.search='';
for (const [k, v] of Object.entries(utm_)) url.searchParams.set(k, v);
_paq.push(['setCustomUrl', url.href]);
_paq.push(['disableCookies']);
var m=d.cookie.match(/(?:^|;\s*)C=([^;]*)/);
if (m) {
  var uid=new URLSearchParams(m[1]).get('uid');
  if (uid) { _paq.push(['setVisitorId', uid.substring(0,4)+uid.substring(24)]); _paq.push(['setUserId', uid]); }
} else { var h=d.cookie.match(/(?:^|;\s*)hebcal=([^;]*)/); if (h) _paq.push(['setUserId', h[1]]); }
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
var u='/ma/';
_paq.push(['setTrackerUrl', u+'ma.php']);
_paq.push(['setSiteId', '1']);
var g=d.createElement('script'),s=d.getElementsByTagName('script')[0];
g.async=true; g.src=u+'ma.js'; s.parentNode.insertBefore(g,s);
})();
</script>
<?php endif; ?>
</body>
</html>
