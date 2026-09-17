import nodemailer from 'nodemailer';
import { ApiError } from './errors.js';
import { logger } from './logger.js';
import { getSmtpConfig } from '../services/system.js';

export type MailInput = { to: string; subject: string; text: string; html?: string };

export async function isSmtpConfigured(): Promise<boolean> {
  return (await getSmtpConfig()) !== null;
}

/** Envía un correo. Lanza 503 SMTP_NOT_CONFIGURED si no hay configuración. */
export async function sendMail(input: MailInput): Promise<void> {
  const config = await getSmtpConfig();
  if (!config) throw ApiError.smtpNotConfigured();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

/** Igual que `sendMail` pero nunca lanza: devuelve si se envió. */
export async function trySendMail(input: MailInput): Promise<boolean> {
  try {
    await sendMail(input);
    return true;
  } catch (error) {
    logger.warn({ err: error, to: input.to }, 'No fue posible enviar el correo');
    return false;
  }
}
