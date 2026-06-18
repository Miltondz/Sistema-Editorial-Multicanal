const { generateKeyPairSync } = require('crypto')
const fs = require('fs')
const path = require('path')

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const escaped = pem.trim().replace(/\n/g, '\\n')

const envPath = path.join(__dirname, '..', '.env.local')
const existing = fs.readFileSync(envPath, 'utf8')

// Remove old JWT_PRIVATE_KEY and SITE_URL lines before writing new ones
const stripped = existing
  .split('\n')
  .filter(l => !l.startsWith('JWT_PRIVATE_KEY=') && !l.startsWith('SITE_URL='))
  .join('\n')
  .trimEnd()

const next = `${stripped}\nJWT_PRIVATE_KEY="${escaped}"\nSITE_URL=http://localhost:3001\n`
fs.writeFileSync(envPath, next)

console.log('Done. RSA PKCS#8 JWT_PRIVATE_KEY written to .env.local')
