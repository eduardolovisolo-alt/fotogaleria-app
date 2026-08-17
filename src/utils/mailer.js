const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

async function sendPasswordResetEmail(to, resetUrl) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'Recuperar contraseña - FotoGalería Pro',
    html: `
      <p>Recibimos un pedido para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}">Hacé click acá para elegir una nueva contraseña</a></p>
      <p>Este enlace vence en 1 hora. Si no lo pediste vos, ignorá este email.</p>
    `,
  });
}

module.exports = { sendPasswordResetEmail };
