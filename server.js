const http = require('http');
const fs = require('fs');
const html = fs.readFileSync('index.html');
http.createServer((_, res) => {
  res.writeHead(200, {'Content-Type':'text/html'});
  res.end(html);
}).listen(process.env.PORT || 3000);
