# Security Resources for Node.js/TypeScript Applications

> Security libraries, tools, and best practices for Node.js/TypeScript web and mobile applications

**🎯 Purpose:** Security resources for AI agents building Node.js/TypeScript applications  
**🌐 Focus:** Node.js security libraries, middleware, and scanning tools  
**🔐 Topics:** Input validation, XSS/CSRF protection, rate limiting, security headers  
**📅 Updated:** October 14, 2025

---

## Quick Reference

### Essential Security Middleware
- **Security Headers:** `helmetjs/helmet` (11K+ ⭐) - Essential Express security headers
- **CORS:** `expressjs/cors` (7K+ ⭐) - Cross-origin resource sharing
- **Rate Limiting:** `express-rate-limit/express-rate-limit` (3.2K+ ⭐) - Prevent brute-force/DDoS
- **CSRF Protection:** `expressjs/csurf` (2.7K+ ⭐) - CSRF token validation

### Input Validation
- **TypeScript-First:** `colinhacks/zod` (36K+ ⭐) - TypeScript schema validation
- **Node.js Standard:** `hapijs/joi` (21K+ ⭐) - Powerful data validation
- **String Validation:** `validatorjs/validator.js` (23K+ ⭐) - String validators/sanitizers

### Password Hashing
- **Standard:** `kelektiv/node.bcrypt.js` (7.5K+ ⭐) - bcrypt for Node.js
- **Modern:** `ranisalt/node-argon2` (2K+ ⭐) - Argon2 (more secure)

### Security Scanning
- **OWASP Projects:** `OWASP/NodeGoat` (2K+ ⭐) - Vulnerable app for learning
- **Static Analysis:** `ajinabraham/nodejsscan` (2.7K+ ⭐) - Security code scanner
- **Secrets Detection:** `trufflesecurity/trufflehog` (19K+ ⭐) - Find secrets in code

### OWASP Top 10 (2025)
1. **Broken Access Control** - Authorization failures
2. **Cryptographic Failures** - Sensitive data exposure
3. **Injection** - SQL, NoSQL, command injection
4. **Insecure Design** - Missing security controls
5. **Security Misconfiguration** - Default configs, verbose errors
6. **Vulnerable Components** - Outdated dependencies
7. **Authentication Failures** - Weak auth/session
8. **Data Integrity Failures** - Insecure deserialization
9. **Logging Failures** - Insufficient monitoring
10. **SSRF** - Server-side request forgery

### Decision Guide
| Need | Choose | Why |
|------|--------|-----|
| Express Security | Helmet + CORS | Essential headers + CORS |
| Rate Limiting | express-rate-limit | Prevent brute-force/DDoS |
| Input Validation | Zod or Joi | TypeScript-first vs runtime |
| Password Hashing | bcrypt or argon2 | Industry standard vs modern |
| Security Scanning | nodejsscan + Snyk | Static analysis + dependency check |

---

## ⚡ ESSENTIAL Security Middleware

### HTTP Security Headers

**⭐ helmetjs/helmet** (10,535 stars) ⚡ ESSENTIAL
- **Description:** Help secure Express apps with various HTTP headers
- 🔗 https://github.com/helmetjs/helmet
- **Key Features:**
  - Sets Content Security Policy (CSP)
  - Prevents clickjacking (X-Frame-Options)
  - Removes X-Powered-By header
  - Sets Strict-Transport-Security (HSTS)
  - Works with Express, Connect, and similar frameworks
- **Use Case:** Essential first line of defense for Express/Node.js applications
- **2025 Update:** Full support for modern CSP directives and security headers

```typescript
import helmet from 'helmet';
app.use(helmet());
```

### CORS (Cross-Origin Resource Sharing)

**⭐ expressjs/cors** (6,889 stars) ⚡ ESSENTIAL
- **Description:** CORS middleware for Express.js
- 🔗 https://github.com/expressjs/cors
- **Key Features:**
  - Simple and configurable CORS middleware
  - Supports dynamic origin validation
  - Pre-flight request handling
  - Credentials support
- **Use Case:** Essential for securing cross-origin requests in Node.js APIs

```typescript
import cors from 'cors';
app.use(cors({ origin: 'https://yourdomain.com' }));
```

### Rate Limiting & Throttling

**⭐ express-rate-limit/express-rate-limit** (3,157 stars) ⚡ ESSENTIAL
- **Description:** Basic rate-limiting middleware for the Express web server
- 🔗 https://github.com/express-rate-limit/express-rate-limit
- **Key Features:**
  - Flexible rate limiting with Redis, Memcached, or in-memory stores
  - Per-route or global rate limiting
  - Custom key generators (IP, user ID, etc.)
  - Configurable responses and headers
- **Use Case:** Prevent brute-force attacks, API abuse, and DDoS

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

**⭐ nestjs/throttler** (673 stars)
- **Description:** A rate limiting module for NestJS to work with Fastify, Express, GQL, Websockets, and RPC
- 🔗 https://github.com/nestjs/throttler
- **Use Case:** Rate limiting for NestJS applications

**⭐ arcjet/arcjet-js** (555 stars)
- **Description:** Bot detection, rate limiting, email validation, attack protection for Node.js, Next.js, Deno, Bun, Remix, SvelteKit
- 🔗 https://github.com/arcjet/arcjet-js
- **Key Features:**
  - AI-powered bot detection
  - Rate limiting with multiple strategies
  - Email validation
  - Attack protection
  - Data redaction
- **Use Case:** Modern security platform for Node.js applications

---

## 🔍 Input Validation & Sanitization

### Schema Validation

**⭐ hapijs/joi** (21,173 stars) ⚡ ESSENTIAL
- **Description:** The most powerful data validation library for JS
- 🔗 https://github.com/hapijs/joi
- **Key Features:**
  - Object schema description and validation
  - Rich validation rules (strings, numbers, dates, objects, arrays)
  - Custom error messages
  - Extensible with custom validators
  - Works in Node.js and browsers
- **Use Case:** Runtime validation for API inputs, configuration, and data

```typescript
import Joi from 'joi';

const schema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
});

const { error, value } = schema.validate(req.body);
```

**⭐ colinhacks/zod** (36,000+ stars) ⚡ HIGHLY RECOMMENDED
- **Description:** TypeScript-first schema validation with static type inference
- 🔗 https://github.com/colinhacks/zod
- **Key Features:**
  - TypeScript-first with excellent type inference
  - Zero dependencies
  - Works in Node.js and browsers
  - Composable schemas
  - Parse, don't validate philosophy
- **Use Case:** TypeScript applications requiring type-safe validation
- **Note:** Listed in tooling.md but essential for security

**⭐ validatorjs/validator.js** (23,000+ stars) ⚡ ESSENTIAL
- **Description:** String validation library
- 🔗 https://github.com/validatorjs/validator.js
- **Key Features:**
  - Email, URL, IP, credit card validation
  - Sanitization functions (trim, escape, stripLow)
  - Works in Node.js and browsers
  - No dependencies
- **Use Case:** Simple string validation and sanitization

```typescript
import validator from 'validator';

validator.isEmail('foo@bar.com'); // true
validator.isURL('http://example.com'); // true
validator.escape('<script>alert("xss")</script>'); // &lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;
```

### HTML Sanitization (XSS Prevention)

**⭐ cure53/DOMPurify** (14,000+ stars) ⚡ ESSENTIAL
- **Description:** DOM-only XSS sanitizer for HTML, MathML and SVG
- 🔗 https://github.com/cure53/DOMPurify
- **Key Features:**
  - Fast and tolerant XSS sanitizer
  - Works in browsers and Node.js (with jsdom)
  - Removes all dangerous HTML while keeping safe HTML
  - Highly configurable
- **Use Case:** Sanitize user-generated HTML content

**⭐ apostrophecms/sanitize-html** (3,800+ stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Clean up user-submitted HTML, preserving whitelisted elements
- 🔗 https://github.com/apostrophecms/sanitize-html
- **Key Features:**
  - Simple whitelist-based HTML sanitization
  - Configurable allowed tags and attributes
  - Works in Node.js
  - Great for markdown-to-HTML workflows
- **Use Case:** Server-side HTML sanitization for Node.js

```typescript
import sanitizeHtml from 'sanitize-html';

const clean = sanitizeHtml(dirty, {
  allowedTags: ['b', 'i', 'em', 'strong', 'a'],
  allowedAttributes: { 'a': ['href'] }
});
```

### Express Validation Middleware

**⭐ express-validator/express-validator** (7,000+ stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Express middleware for validator.js
- 🔗 https://github.com/express-validator/express-validator
- **Key Features:**
  - Built on top of validator.js
  - Middleware-based validation for Express
  - Sanitization functions
  - Custom validators and sanitizers
- **Use Case:** Request validation in Express applications

```typescript
import { body, validationResult } from 'express-validator';

app.post('/user', [
  body('email').isEmail(),
  body('password').isLength({ min: 8 })
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Process request
});
```

---

## 🔐 Password Security

### Password Hashing

**⭐ kelektiv/node.bcrypt.js** (7,500+ stars) ⚡ ESSENTIAL
- **Description:** bcrypt for NodeJS
- 🔗 https://github.com/kelektiv/node.bcrypt.js
- **Key Features:**
  - Secure password hashing with salt
  - Configurable cost factor (work factor)
  - Synchronous and asynchronous methods
  - Native C++ implementation for performance
- **Use Case:** Industry-standard password hashing for Node.js

```typescript
import bcrypt from 'bcrypt';

// Hash password
const saltRounds = 10;
const hash = await bcrypt.hash(myPlaintextPassword, saltRounds);

// Compare password
const match = await bcrypt.compare(myPlaintextPassword, hash);
```

**⭐ ranisalt/node-argon2** (2,000+ stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Node.js bindings for Argon2 hashing algorithm
- 🔗 https://github.com/ranisalt/node-argon2
- **Key Features:**
  - Winner of Password Hashing Competition 2015
  - More secure than bcrypt against GPU attacks
  - Configurable memory, time, and parallelism costs
  - Native implementation
- **Use Case:** Modern, more secure password hashing
- **Note:** Recommended over bcrypt for new applications

```typescript
import argon2 from 'argon2';

// Hash password
const hash = await argon2.hash(password);

// Verify password
const match = await argon2.verify(hash, password);
```

---

## 🛡️ CSRF Protection

**⭐ expressjs/csurf** (2,500+ stars - archived but still used)
- **Description:** CSRF token middleware for Express
- 🔗 https://github.com/expressjs/csurf
- **Note:** Package is archived. Consider alternatives like `csrf-csrf` or built-in framework solutions
- **Use Case:** CSRF protection for forms and state-changing operations

**⭐ Psifi-Solutions/csrf-csrf** (300+ stars) ⚡ RECOMMENDED
- **Description:** CSRF protection middleware for Express and Connect
- 🔗 https://github.com/Psifi-Solutions/csrf-csrf
- **Key Features:**
  - Modern CSRF protection
  - Double submit cookie pattern
  - Configurable token generation
  - Works with Express
- **Use Case:** Modern CSRF protection for Express applications

---

## 🔍 Security Scanning & Auditing

### Static Security Analysis

**⭐ lirantal/awesome-nodejs-security** (2,932 stars) ⚡ ESSENTIAL
- **Description:** Awesome Node.js Security resources
- 🔗 https://github.com/lirantal/awesome-nodejs-security
- **Use Case:** Comprehensive collection of Node.js security tools, articles, and resources

**⭐ ajinabraham/nodejsscan** (2,510 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** nodejsscan is a static security code scanner for Node.js applications
- 🔗 https://github.com/ajinabraham/nodejsscan
- **Key Features:**
  - Static Application Security Testing (SAST)
  - Detects insecure code patterns
  - Command-line and web interface
  - Supports JavaScript and TypeScript
- **Use Case:** Automated security scanning in CI/CD pipelines

**⭐ OWASP/NodeGoat** (1,983 stars) ⚡ ESSENTIAL
- **Description:** The OWASP NodeGoat project provides an environment to learn how OWASP Top 10 security risks apply to Node.js applications
- 🔗 https://github.com/OWASP/NodeGoat
- **Key Features:**
  - Vulnerable Node.js application for learning
  - Demonstrates OWASP Top 10 vulnerabilities
  - Solutions and fixes provided
  - Great for security training
- **Use Case:** Learning OWASP Top 10 in Node.js context

### Dependency Scanning

**⭐ lirantal/is-website-vulnerable** (1,999 stars)
- **Description:** Finds publicly known security vulnerabilities in a website's frontend JavaScript libraries
- 🔗 https://github.com/lirantal/is-website-vulnerable
- **Key Features:**
  - Scans website for vulnerable JavaScript libraries
  - Command-line tool
  - Reports known CVEs
- **Use Case:** Quick check for vulnerable frontend dependencies

**⭐ lirantal/npq** (1,397 stars)
- **Description:** Safely install npm packages by auditing them pre-install stage
- 🔗 https://github.com/lirantal/npq
- **Key Features:**
  - Pre-install npm package auditing
  - Checks for known vulnerabilities
  - License compatibility checks
  - Package age and maintenance status
- **Use Case:** Safe npm package installation with security checks

**⭐ RetireJS/retire.js** (3,700+ stars)
- **Description:** Scanner detecting the use of JavaScript libraries with known vulnerabilities
- 🔗 https://github.com/RetireJS/retire.js
- **Key Features:**
  - Detects vulnerable JavaScript libraries
  - Command-line, Grunt, Gulp, and browser extensions
  - Database of known vulnerable libraries
- **Use Case:** Continuous monitoring of JavaScript dependencies

---

## 🔒 Access Control & Authorization

**⭐ onury/accesscontrol** (2,266 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Role and Attribute based Access Control for Node.js
- 🔗 https://github.com/onury/accesscontrol
- **Key Features:**
  - Role-Based Access Control (RBAC)
  - Attribute-Based Access Control (ABAC)
  - Resource and action permissions
  - Chainable, friendly API
- **Use Case:** Fine-grained authorization for Node.js applications

```typescript
import AccessControl from 'accesscontrol';
const ac = new AccessControl();

ac.grant('user')
  .readOwn('profile')
  .updateOwn('profile');

ac.grant('admin')
  .extend('user')
  .readAny('profile')
  .updateAny('profile');

const permission = ac.can('user').readOwn('profile');
```

**⭐ casbin/node-casbin** (2,800+ stars)
- **Description:** Authorization library that supports access control models like ACL, RBAC, ABAC
- 🔗 https://github.com/casbin/node-casbin
- **Key Features:**
  - Supports multiple access control models
  - Policy storage in files or databases
  - Role hierarchy and domains
  - Scalable and high-performance
- **Use Case:** Complex authorization requirements in microservices

---

## 📱 React Native Security

### Secure Storage

**⭐ emeraldsanto/react-native-encrypted-storage** (575 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** React Native wrapper around EncryptedSharedPreferences and Keychain
- 🔗 https://github.com/emeraldsanto/react-native-encrypted-storage
- **Key Features:**
  - Secure, encrypted storage for React Native
  - Uses Android EncryptedSharedPreferences
  - Uses iOS Keychain
  - Simple async API
- **Use Case:** Storing sensitive data (tokens, credentials) in React Native apps

```typescript
import EncryptedStorage from 'react-native-encrypted-storage';

// Store
await EncryptedStorage.setItem('user_token', token);

// Retrieve
const token = await EncryptedStorage.getItem('user_token');
```

### Runtime Application Self-Protection (RASP)

**⭐ talsec/Free-RASP-Community** (440 stars)
- **Description:** SDK providing threat detection & security monitoring for mobile devices
- 🔗 https://github.com/talsec/Free-RASP-Community
- **Key Features:**
  - Works with Flutter, React Native, Android, iOS
  - Detects rooted/jailbroken devices
  - Detects debugging and tampering
  - Runtime threat monitoring
  - Free community edition
- **Use Case:** Mobile app security and threat detection

---

## 🚀 Additional Security Tools

### Electron Security

**⭐ doyensec/electronegativity** (1,026 stars)
- **Description:** Identify misconfigurations and security anti-patterns in Electron applications
- 🔗 https://github.com/doyensec/electronegativity
- **Key Features:**
  - Static analysis for Electron apps
  - Detects security misconfigurations
  - Command-line and programmatic API
- **Use Case:** Security scanning for Electron applications

### JavaScript Obfuscation

**⭐ javascript-obfuscator/javascript-obfuscator** (15,365 stars)
- **Description:** A powerful obfuscator for JavaScript and Node.js
- 🔗 https://github.com/javascript-obfuscator/javascript-obfuscator
- **Key Features:**
  - Code obfuscation for JavaScript
  - Variable and function name mangling
  - String encryption
  - Control flow flattening
- **Use Case:** Protecting client-side JavaScript code (not a substitute for proper security)

### JWT Security

**⭐ auth0/node-jsonwebtoken** (18,000+ stars) ⚡ ESSENTIAL
- **Description:** JSON Web Token implementation for Node.js
- 🔗 https://github.com/auth0/node-jsonwebtoken
- **Note:** Also listed in auth.md
- **Security Considerations:**
  - Use RS256 (asymmetric) for production, not HS256
  - Short expiration times (15 minutes)
  - Implement refresh token rotation
  - Never store in localStorage (use httpOnly cookies)

---

## 📚 Best Practices & Guidelines

### OWASP Resources

**⭐ OWASP Top 10** ⚡ ESSENTIAL
- The standard awareness document for web application security
- 🔗 https://owasp.org/www-project-top-ten/
- **Use Case:** Understanding the most critical web application security risks

**⭐ OWASP API Security Top 10** ⚡ ESSENTIAL
- API-specific security risks
- 🔗 https://owasp.org/www-project-api-security/
- **Use Case:** Securing REST and GraphQL APIs

**⭐ OWASP Mobile Top 10**
- Security vulnerabilities specific to mobile applications
- 🔗 https://owasp.org/www-project-mobile-top-10/
- **Use Case:** Mobile app security guidelines for React Native

### Security Guides

**⭐ Hack-with-Github/Awesome-Hacking** (99,010 stars)
- Collection of resources for hackers, pentesters and security researchers
- 🔗 https://github.com/Hack-with-Github/Awesome-Hacking
- **Use Case:** Security and hacking resources

**⭐ trimstray/the-book-of-secret-knowledge** (189,614 stars) ⚡ ESSENTIAL
- Collection of security manuals, cheatsheets, hacks, and tools
- 🔗 https://github.com/trimstray/the-book-of-secret-knowledge
- **Use Case:** Comprehensive security knowledge base

**⭐ qazbnm456/awesome-web-security** (12,551 stars)
- Curated list of Web Security materials and resources
- 🔗 https://github.com/qazbnm456/awesome-web-security
- **Use Case:** Comprehensive web security knowledge base

---

## 🎯 Security Checklist for Node.js Apps

**Authentication & Authorization**
- [ ] Use secure password hashing (bcrypt, argon2)
- [ ] Implement proper session management (see auth.md)
- [ ] Use OAuth 2.1 or OpenID Connect for third-party auth
- [ ] Implement RBAC with libraries like accesscontrol or casbin
- [ ] Never store passwords in plain text

**Input Validation**
- [ ] Validate all user inputs with Joi, Zod, or express-validator
- [ ] Sanitize HTML inputs with DOMPurify or sanitize-html
- [ ] Use parameterized queries to prevent SQL injection
- [ ] Validate file uploads (type, size, content)

**HTTP Security**
- [ ] Use Helmet.js for security headers
- [ ] Configure CORS properly with express cors
- [ ] Enable HTTPS with TLS 1.3
- [ ] Implement CSRF protection for state-changing operations
- [ ] Set secure, httpOnly, sameSite cookies

**Rate Limiting & DoS Protection**
- [ ] Implement rate limiting with express-rate-limit
- [ ] Use different limits for different endpoints
- [ ] Consider distributed rate limiting with Redis
- [ ] Implement request size limits

**Dependency Security**
- [ ] Run `npm audit` regularly
- [ ] Use Snyk or similar tools for continuous monitoring
- [ ] Keep dependencies up to date
- [ ] Review dependency licenses
- [ ] Use `npq` for pre-install security checks

**Secrets Management**
- [ ] Never commit secrets to Git
- [ ] Use environment variables for configuration
- [ ] Use secrets management tools (Vault, Doppler, AWS Secrets Manager)
- [ ] Implement secret rotation
- [ ] Scan for secrets in pre-commit hooks

**Logging & Monitoring**
- [ ] Log security events (failed auth, suspicious activity)
- [ ] Don't log sensitive data (passwords, tokens, PII)
- [ ] Implement centralized logging
- [ ] Set up alerts for security events
- [ ] Monitor for unusual patterns

**API Security**
- [ ] Implement proper error handling (don't leak stack traces)
- [ ] Use API versioning
- [ ] Implement request/response validation
- [ ] Use API gateways for centralized security
- [ ] Document security requirements in OpenAPI specs

---

*Part of octocode-mcp resources collection*

