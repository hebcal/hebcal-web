import {getIpAddress} from './getIpAddress.js';
import nodemailer from 'nodemailer';
import {htmlToText} from 'nodemailer-html-to-text';

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
 * @param {any} ctx
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
    vid: ctx.state.visitorId,
    duration: Date.now() - startTime,
    mail: result,
  };
  ctx.logger.info(logInfo);
  return result;
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
