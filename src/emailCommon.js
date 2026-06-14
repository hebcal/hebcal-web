import {getIpAddress} from './getIpAddress.js';
import nodemailer from 'nodemailer';
import {htmlToText} from 'nodemailer-html-to-text';
import {xmlEsc} from './sanitize.js';

/** Empty spacer line used between paragraphs in HTML email bodies. */
export const BLANK = '<div>&nbsp;</div>';

/**
 * @param {Object<string,any>} iniConfig
 * @return {nodemailer.Transporter}
 */
export function makeEmailTransport(iniConfig) {
  if (process.env.NODE_ENV === 'production') {
    return nodemailer.createTransport({host: 'localhost', port: 25});
  }
  const transporter = nodemailer.createTransport({
    host: iniConfig['hebcal.email.shabbat.host'],
    port: 465,
    secure: true,
    pool: true,
    auth: {
      user: iniConfig['hebcal.email.shabbat.user'],
      pass: iniConfig['hebcal.email.shabbat.password'],
    },
  });
  return transporter;
}

/**
 * @param {import('koa').Context} ctx
 * @param {any} message
 * @return {Promise}
 */
export async function mySendMail(ctx, message) {
  const startTime = Date.now();
  message.from = 'Hebcal <shabbat-owner@hebcal.com>';
  message.replyTo = 'no-reply@hebcal.com';
  const ip = getIpAddress(ctx);
  message.headers = message.headers || {};
  message.headers['X-Originating-IP'] = `[${ip}]`;
  // console.log(message);
  const transporter = makeEmailTransport(ctx.iniConfig);
  if (message.html && !message.text) {
    transporter.use('compile', htmlToText({
      wordwrap: 74,
      ignoreImage: true,
      ignoreHref: true,
      selectors: [
        {selector: 'img', format: 'skip'},
        {selector: 'a', options: {ignoreHref: true}},
      ],
    }));
  }
  const result = await transporter.sendMail(message);
  delete result.ehlo;
  const logInfo = {
    url: ctx.request.originalUrl,
    duration: Date.now() - startTime,
    mail: result,
  };
  ctx.logger.info(logInfo);
  return result;
}

/**
 * Sends a transactional email fire-and-forget, logging any delivery error
 * instead of propagating it (so the HTTP response succeeds regardless).
 * @param {import('koa').Context} ctx
 * @param {any} message
 */
export function sendMailLogErr(ctx, message) {
  mySendMail(ctx, message).catch((err) => {
    ctx.logger.error(err);
  });
}

/**
 * Builds an RFC 5322 Message-ID local part of the form `<id>.<timestamp>`.
 * @param {string} id subscription identifier
 * @return {string}
 */
export function makeMessageId(id) {
  return `${id}.${Date.now()}`;
}

/**
 * Builds the HTML body for a "please confirm your subscription" verification
 * email. The Shabbat and Yahrzeit flows share an identical layout, footer and
 * tracking pixel; only the descriptive sentences differ.
 * @param {Object} opts
 * @param {string} opts.intro sentence(s) after "Hello," describing the request
 * @param {string} opts.confirmPrompt sentence prompting the user to click the link
 * @param {string} opts.url confirmation link
 * @param {string} opts.declineText sentence for users who did not make the request
 * @param {string} opts.email recipient address (shown in the footer)
 * @param {string} opts.ip originating IP address (shown in the footer)
 * @param {string} opts.utmParam campaign UTM query string for the footer link
 * @param {string} opts.imgOpen tracking pixel HTML
 * @return {string}
 */
export function makeVerificationEmailHtml(opts) {
  const {intro, confirmPrompt, url, declineText, email, ip, utmParam, imgOpen} = opts;
  return `<div dir="ltr" style="font-size:18px;font-family:georgia,'times new roman',times,serif;">
<div>Hello,</div>
${BLANK}
<div>${intro}</div>
${BLANK}
<div>${confirmPrompt}</div>
${BLANK}
<div><a href="${url}">${url}</a></div>
${BLANK}
<div>${declineText}</div>
${BLANK}
<div style="font-size:16px">Kol Tuv,
<br>Hebcal.com</div>
${BLANK}
<div style="font-size:11px;color:#999;font-family:arial,helvetica,sans-serif">
<div>This email was sent to ${xmlEsc(email)} by <a href="https://www.hebcal.com/?${utmParam}">Hebcal.com</a>.
Hebcal is a free Jewish calendar and holiday web site.</div>
${BLANK}
<div>[${ip}]</div>
</div>
${imgOpen}</div>
`;
}

/**
 * @param {string} msgid
 * @param {string} loc
 * @param {string} utmCampaign
 * @return {string}
 */
export function getImgOpenHtml(msgid, loc, utmCampaign) {
  loc = encodeURIComponent(loc);
  // eslint-disable-next-line max-len
  return `<img src="https://www.hebcal.com/email/open?msgid=${msgid}&amp;loc=${loc}&amp;utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=${utmCampaign}" alt="" width="1" height="1" border="0" style="height:1px!important;width:1px!important;border-width:0!important;margin-top:0!important;margin-bottom:0!important;margin-right:0!important;margin-left:0!important;padding-top:0!important;padding-bottom:0!important;padding-right:0!important;padding-left:0!important">`;
}


// eslint-disable-next-line max-len
const validEmailRe = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * @param {string} email
 * @return {boolean}
 */
export function validateEmail(email) {
  return validEmailRe.test(String(email).toLowerCase());
}
