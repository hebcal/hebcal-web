# WordPress theme for www.hebcal.com/home/

`hebcal-bootstrap/` is a classic WordPress theme whose navbar and footer are
PHP copies of `views/partials/navbar.ejs` and `footer.ejs`, and which loads the
same `/i/style-5.3.9a.css` and Bootstrap 5.3.9 bundle as the rest of the site.
It is installed by hand through wp-admin; nothing deploys it automatically.

## Install or update

```bash
cd wordpress && rm -f hebcal-bootstrap.zip && zip -rq hebcal-bootstrap.zip hebcal-bootstrap -x '*/.*'
```

Upload the zip under Appearance → Themes → Add New → Upload Theme and choose
"Replace installed with uploaded". Bump `Version:` in `style.css` first.

## Keep in sync with hebcal-web

- `HEBCAL_MAIN_CSS` and `HEBCAL_SPRITE` in `functions.php` must match
  `config.mainCss` / `config.sprite` in `package.json`.
- The navbar links (`hebcal_default_menu_items()`) and footer links mirror
  `navbar.ejs` / `footer.ejs`. They are deliberately not WordPress menu
  locations: on a theme switch WordPress maps the old theme's menu onto them,
  which silently replaced the links.
- The main CSS is PurgeCSS'd against hebcal-web's templates only, so Bootstrap
  classes that hebcal-web never uses are missing from it. Check a class with
  `grep -c '\.col-lg-8' static/i/style-5.3.9a.css` before using it in the
  theme; the theme's own `style.css` supplies the few it needs plus the
  WordPress core content classes.
- Enqueued assets need a full URL (`hebcal_root_url()`): WordPress prefixes a
  bare `/i/...` with the site URL, giving a 404ing `/home/i/...`.
