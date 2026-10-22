'use strict';
const nodemailer=require('nodemailer');

function createMailer(env=process.env){
  const host=env.SMTP_HOST||'smtp.gmail.com';
  const port=Number(env.SMTP_PORT||465);
  const user=(env.SMTP_USER||'').trim();
  const pass=(env.SMTP_APP_PASSWORD||'').replace(/\s/g,'');
  const from=(env.MAIL_FROM||user).trim();
  if(!user||!pass||!from)return async()=>{throw new Error('Email service is not configured. Add SMTP_USER and SMTP_APP_PASSWORD to .env.');};
  const transport=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass}});
  return async({to,name,otp})=>{
    const plainName=String(name||'there').replace(/[\r\n]/g,' ').trim();
    const safeName=plainName.replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));
    const code=String(otp).replace(/\D/g,'');
    await transport.sendMail({
      from:`Motor Vision <${from}>`,to,
      subject:`${code} is your Motor Vision password reset code`,
      text:`Hello ${plainName},\n\nYour Motor Vision password reset code is: ${code}\n\nEnter it on the Motor Vision website with your new password. The code expires in 10 minutes and can be used once. If you did not request it, ignore this email.`,
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;color:#1b2b3e"><h2>Reset your Motor Vision password</h2><p>Hello ${safeName},</p><p>Enter this code on the Motor Vision website to choose a new password:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0;padding:14px 18px;display:inline-block;border-radius:8px;background:#eef7f4;color:#087e81">${code}</p><p>The code expires in 10 minutes and can be used once.</p><p style="font-size:12px;color:#72808d">If you did not request this, you can ignore this email. Never share this code with anyone.</p></div>`
    });
  };
}

module.exports={createMailer};
