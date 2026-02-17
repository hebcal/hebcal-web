#!/bin/sh

set -x

compress_file() {
    file=$1
    brotli -f --keep --best "${file}"
    gzip -f --keep --best "${file}"
    zstd -f --keep -19 "${file}"
}

if [ ! -e node_modules/geolite2-redist/dbs/GeoLite2-City.mmdb ]; then
  node -e "import('geolite2-redist').then(geolite => geolite.downloadDbs())"
fi

npm run build

rm -f ./static/i/$npm_package_config_sprite
ln -s sprite1.svg ./static/i/$npm_package_config_sprite
compress_file ./static/i/$npm_package_config_sprite
compress_file ./static/i/$npm_package_config_clientapp
compress_file ./static/i/$npm_package_config_csprite
compress_file ./static/i/$npm_package_config_mainCss
compress_file ./static/simple.min.css

# deploy for prod
rsync -av ./fonts/ /var/www/fonts/
rsync -av ./static/ /var/www/html/
rsync -av ./package.json /var/www/
rsync -av ./src/ /var/www/dist/
rsync -av ./views/ /var/www/views/
rsync -av ./node_modules/ /var/www/node_modules/
rsync -av ./node_modules/geolite2-redist/dbs/GeoLite2-*.mmdb /var/www/
