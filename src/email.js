import nodemailer from 'nodemailer';

/**
 * @param {Object<string,any>} iniConfig
 * @return {nodemailer.Transporter}
 */
export function makeEmailTransport(iniConfig) {
  const transporter = nodemailer.createTransport({
    host: iniConfig['hebcal.email.shabbat.host'],
    port: 465,
    secure: true,
    auth: {
      user: iniConfig['hebcal.email.shabbat.user'],
      pass: iniConfig['hebcal.email.shabbat.password'],
    },
  });
  return transporter;
}
