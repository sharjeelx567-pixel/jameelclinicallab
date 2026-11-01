// Vercel function: every request is rewritten here (see vercel.json) and handed
// to the compiled NestJS app. Built by `npm run build` into ../dist.
module.exports = require('../dist/serverless.js').default;
