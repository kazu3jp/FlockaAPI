import type { Env } from '../types';

/**
 * MailChannels Email APIを使用してメールを送信する
 * 無料アカウント登録とAPIキーが必要
 */
export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  apiKey?: string
): Promise<boolean> {
  try {
    if (!apiKey) {
      console.error('MailChannels API key is required');
      return false;
    }

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
        ...(textContent ? [{
          type: 'text/plain',
          value: textContent,
        }] : []),
      ],
    };

    console.log('Sending email via MailChannels Email API:', {
      to,
      from: 'noreply@flocka.net',
      subject,
    });

    const response = await fetch(mailChannelsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('MailChannels Email API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      
      // APIキーが無効な場合の詳細なエラーメッセージ
      if (response.status === 401) {
        console.error('Invalid MailChannels API key. Please check your API key configuration.');
      } else if (response.status === 403) {
        console.error('MailChannels API access forbidden. Please verify your account status.');
      }
      
      return false;
    }

    const responseData = await response.json();
    console.log('Email sent successfully via MailChannels Email API:', responseData);
    return true;
  } catch (error) {
    console.error('Failed to send email via MailChannels Email API:', error);
    return false;
  }
}

/**
 * メール認証用のHTMLテンプレートを生成する
 */
export function generateVerificationEmailHTML(verificationUrl: string): string {
  return `
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
          このリンクは24時間後に無効になります。<br>
          もしボタンがクリックできない場合は、以下のURLをコピーしてブラウザに貼り付けてください：<br>
          <span style="word-break: break-all;">${verificationUrl}</span>
        </p>
      </div>
    </body>
    </html>
  `;
}

/**
 * メール認証用のテキストテンプレートを生成する
 */
export function generateVerificationEmailText(verificationUrl: string): string {
  return `
Flockaへようこそ！

アカウントの作成ありがとうございます。
以下のURLをクリックして、メールアドレスの確認を完了してください。

${verificationUrl}

このリンクは24時間後に無効になります。

-- 
Flockaチーム
  `.trim();
}

/**
 * メール認証メールを送信する
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  apiKey: string,
  baseUrl: string = 'https://flocka.net'
): Promise<boolean> {
  const verificationUrl = `${baseUrl}/auth/verify?token=${verificationToken}`;
  const subject = 'Flocka - メールアドレスの確認';
  const htmlContent = generateVerificationEmailHTML(verificationUrl);
  const textContent = generateVerificationEmailText(verificationUrl);

  return await sendEmail(email, subject, htmlContent, textContent, apiKey);
}
