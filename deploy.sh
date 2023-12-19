#!/bin/sh

set -x

compress_file() {
    file=$1
    brotli -f --keep --best "${file}"
    gzip -f --keep --best "${file}"
}

if [ ! -e node_modules/geolite2-redist/dbs/GeoLite2-City.mmdb ]; then
  node -e "import('geolite2-redist').then(geolite => geolite.downloadDbs())"
fi

mkdir -p ./dist && rsync -av ./src/ ./dist/

# for testing out of local
rsync -av ./views/ ./dist/views/

npx rollup -c

compress_file ./static/i/$npm_package_config_sprite
compress_file ./static/i/$npm_package_config_clientapp
compress_file ./static/i/$npm_package_config_typeaheadcss
compress_file ./static/i/$npm_package_config_csprite

# deploy for prod
rsync -av ./fonts/ /var/www/fonts/
rsync -av ./static/ /var/www/html/
rsync -av ./package.json /var/www/
rsync -av ./dist/ /var/www/dist/
rsync -av ./node_modules/ /var/www/node_modules/
rsync -av ./node_modules/geolite2-redist/dbs/GeoLite2-*.mmdb /var/www/
