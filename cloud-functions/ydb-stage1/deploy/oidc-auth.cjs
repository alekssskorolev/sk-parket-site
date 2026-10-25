'use strict';
// Run only inside a trusted main-branch GitHub Actions job with id-token: write.
// No long-lived Yandex Cloud key is created, stored in GitHub, or printed.
const fs = require('node:fs');
const audience = 'https://github.com/alekssskorolev/sk-parket-site/ref/refs/heads/main';
(async () => {
  if (process.env.GITHUB_REPOSITORY !== 'alekssskorolev/sk-parket-site' || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Deployment is restricted to the intended repository and main branch');
  }
  const tokenURL = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (tokenURL.protocol !== 'https:' || !tokenURL.hostname.endsWith('.actions.githubusercontent.com')) {
    throw new Error('Unexpected GitHub OIDC endpoint');
  }
  tokenURL.searchParams.set('audience', audience);
  const oidcResponse = await fetch(tokenURL, {
    headers: {Authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},
    signal: AbortSignal.timeout(30000),
  });
  if (!oidcResponse.ok) throw new Error('GitHub OIDC request failed: ' + oidcResponse.status);
  const {value: jwt} = await oidcResponse.json();
  if (typeof jwt !== 'string') throw new Error('GitHub returned no OIDC token');
  console.log('::add-mask::' + jwt);
  // This is a scope assertion, not signature verification: Yandex verifies the JWT.
  const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  if (claims.iss !== 'https://token.actions.githubusercontent.com' || claims.aud !== audience ||
      claims.sub !== 'repo:alekssskorolev/sk-parket-site:ref:refs/heads/main') {
    throw new Error('Unexpected OIDC scope: ' + JSON.stringify({issuer: claims.iss, audience: claims.aud, subject: claims.sub}));
  }
  const response = await fetch('https://auth.yandex.cloud/oauth/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: process.env.YC_DEPLOY_SA_ID,
      subject_token: jwt,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Yandex IAM exchange failed: ' + response.status);
  const result = await response.json();
  if (typeof result.access_token !== 'string' || /[\r\n]/.test(result.access_token)) throw new Error('Missing IAM token');
  console.log('::add-mask::' + result.access_token);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'token=' + result.access_token + '\n');
  console.log('Short-lived IAM token acquired for the main-branch deployment');
})().catch(error => {console.error(error.message);process.exitCode = 1;});
