// Patches @neondatabase/serverless for local PostgreSQL development.
// The app hardcodes neonConfig.pipelineConnect = "password" which only works
// with Neon's cloud proxy. This patch disables it for local development.
const { neonConfig } = require('@neondatabase/serverless');
Object.defineProperty(neonConfig, 'pipelineConnect', {
  get: function() { return false; },
  set: function() {},
  configurable: true
});
