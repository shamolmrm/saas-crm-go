import nodemailer from 'nodemailer'

let _transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  return _transporter
}

export interface SendEmailOptions {
  to:      string | string[]
  subject: string
  html:    string
  text?:   string
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const transporter = getTransporter()

  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? 'CRM <noreply@example.com>',
      to:      Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject: opts.subject,
      html:    opts.html,
      text:    opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    })
  } catch (err) {
    // Log the error but don't crash the caller — email failure shouldn't take down the API
    console.error('Email send failed:', err)
    throw new Error('Email delivery failed. The SMTP server may be unreachable.')
  }
}
