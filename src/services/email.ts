import nodemailer from 'nodemailer';
import { config } from '../config';
import logger from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false, // STARTTLS on port 587
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

export async function sendVerificationCode(toEmail: string, code: string): Promise<void> {
  const mailOptions = {
    from: config.smtp.from,
    to: toEmail,
    subject: 'CVMA Minnesota Discord Verification Code',
    text:
      `Your verification code is: ${code}\n\n` +
      'This code expires in 10 minutes.\n\n' +
      'If you did not request this, please ignore this email.',
    html:
      '<p>Your verification code is:</p>' +
      `<h2 style="letter-spacing: 4px;">${code}</h2>` +
      '<p>This code expires in 10 minutes.</p>' +
      '<p>If you did not request this, please ignore this email.</p>',
  };

  await transporter.sendMail(mailOptions);
  logger.info(`Verification code sent to ${toEmail}`);
}
