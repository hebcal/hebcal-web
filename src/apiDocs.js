import {CACHE_CONTROL_7DAYS} from './cacheControl.js';

export async function apiDocs(ctx) {
  ctx.set('Cache-Control', CACHE_CONTROL_7DAYS);
  return ctx.render('api-docs', {
    title: 'Hebcal REST APIs - OpenAPI / Swagger UI',
  });
}
