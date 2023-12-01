import dayjs from 'dayjs';

const otherCookies = ['hebcal', '_ga', '__gpi', '__gads', 'FCNEC'];
const expiresPast = new Date(1000);

// eslint-disable-next-line require-jsdoc
export function delCookie(ctx) {
  ctx.set('Cache-Control', 'private');
  const optout = (ctx.request.querystring === 'optout');
  const cookieVal = optout ? 'opt_out' : '0';
  // Either future or in the past (1970-01-01T00:00:01.000Z)
  const expires = optout ? dayjs().add(399, 'd').toDate() : expiresPast;
  ctx.cookies.set('C', cookieVal, {
    expires: expires,
    overwrite: true,
    httpOnly: false,
  });
  for (const cookieName of otherCookies) {
    ctx.cookies.set(cookieName, '0', {
      expires: expiresPast,
      overwrite: true,
      httpOnly: false,
    });
  }
  return ctx.render('optout', {
    title: optout ? 'Opt-Out Complete' : 'Cookie Deleted',
    optout,
  });
}
