#!/bin/sh

set -x

compress_file() {
    file=$1
    brotli -f --keep --best "${file}"
    gzip -f --keep --best "${file}"
}

npm run build

rm -f ./static/i/$npm_package_config_sprite
ln -s sprite1.svg ./static/i/$npm_package_config_sprite
compress_file ./static/i/$npm_package_config_sprite
compress_file ./static/i/$npm_package_config_clientapp
compress_file ./static/i/$npm_package_config_csprite
compress_file ./static/i/$npm_package_config_mainCss
compress_file ./static/favicon.svg

# deploy for prod
rsync -a ./fonts/ /var/www/fonts/
rsync -a node_modules/simpledotcss/simple.min.css static/simple.min.css
rsync -a ./static/ /var/www/html/
rsync -a ./package.json /var/www/
rsync -a ./src/ /var/www/dist/
rsync -a ./views/ /var/www/views/
rsync -a ./node_modules/ /var/www/node_modules/
