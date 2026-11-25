// Script to test sending an inbound email directly to your Web/Desktop app webhook
const http = require('http');

const payload = JSON.stringify({
  from: 'client-john@example.com',
  fromName: 'John Doe',
  to: 'info@devgeeksnexus.com',
  subject: 'Inquiry regarding Nexus Mail capabilities',
  text: 'Hi DevGeeksNexus team,\n\nWe would love to learn more about your services.\n\nBest regards,\nJohn',
  html: '<p>Hi DevGeeksNexus team,</p><p>We would love to learn more about your services.</p><p>Best regards,<br/><strong>John</strong></p>',
  date: new Date().toISOString(),
  messageId: `<inquiry_${Date.now()}@example.com>`,
  attachments: [],
});

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/inbound',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-webhook-secret': 'nexus_mail_secret_change_in_production',
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('Webhook Response Status:', res.statusCode);
      console.log('Webhook Response Body:', data);
    });
  }
);

req.on('error', (e) => {
  console.error('Error sending test inbound email:', e.message);
  console.log('Ensure web app is running on http://localhost:3000 first (npm run dev:web)');
});

req.write(payload);
req.end();
