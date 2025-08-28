import type { Env } from '../types';

/**
 * 簡素化されたメール送信機能
 * MailChannels Email APIを使用
 */
export async function sendVerificationEmail(
  to: string,
  verificationToken: string,
  apiKey: string,
  baseUrl: string = 'https://api.flocka.net'
): Promise<boolean> {
  try {
    if (!apiKey) {
      console.error('MailChannels API key is required');
      return false;
    }

    const verificationUrl = `${baseUrl}/auth/verify?token=${verificationToken}`;
    const subject = 'Flocka - メールアドレスの確認';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Flocka - メールアドレスの確認</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
          <h1 style="color: #333; margin-bottom: 20px;">Flockaへようこそ！</h1>
          <p style="color: #666; margin-bottom: 30px;">
            アカウントの作成ありがとうございます。<br>
            以下のボタンをクリックして、メールアドレスの確認を完了してください。
          </p>
          <a href="${verificationUrl}" 
             style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold;">
            メールアドレスを確認する
          </a>
          <p style="color: #888; margin-top: 30px; font-size: 14px;">
            このリンクは24時間後に無効になります。
          </p>
        </div>
      </body>
      </html>
    `;

    const mailChannelsUrl = 'https://api.mailchannels.net/tx/v1/send';
    
    const emailData = {
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: {
        email: 'noreply@flocka.net',
        name: 'Flocka',
      },
      subject,
      content: [
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
    };

    const response = await fetch(mailChannelsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      console.error('Failed to send verification email:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}
