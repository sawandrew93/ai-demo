// Example: Manual HTTPS server setup (if you have certificate files)
const https = require('https');
const fs = require('fs');

// Only use this if you have certificate files
if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT_PATH) {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH)
  };
  
  const httpsServer = https.createServer(options, app);
  httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
  });
  
  // Redirect HTTP to HTTPS
  const httpApp = express();
  httpApp.use((req, res) => {
    res.redirect(`https://${req.headers.host}${req.url}`);
  });
  httpApp.listen(80);
}