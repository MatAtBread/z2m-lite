var StaticServer = require('static-server');
var server = new StaticServer({
  rootPath: 'www',          // required, the root of the server file tree
  port: 8088,               // required, the port to listen
  cors: '*'                // optional, defaults to undefined
});
 
server.start(function () {
  console.log('Server listening to', server.port);
});