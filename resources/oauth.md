# OAuth & Authentication Resources

> Authentication, OAuth, and authorization for Node.js/TypeScript web and mobile applications

**🎯 Purpose:** Auth resources for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers implementing authentication in Node.js apps
**🌐 Focus:** NextAuth.js, Passport.js, SuperTokens - Node.js authentication
**📱 Mobile:** OAuth flows, JWT, and session management for React Native apps
**⚙️ Runtime:** 100% Node.js authentication libraries and middleware

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **authentication guidance** to help AI agents:
1. **Choose auth strategy** - NextAuth.js vs Passport.js vs SuperTokens
2. **Implement OAuth** - OAuth 2.0/2.1, social login (Google, GitHub, etc.)
3. **Handle sessions** - JWT vs session cookies, refresh tokens
4. **Add 2FA** - WebAuthn, TOTP, SMS verification
5. **Secure mobile** - Same auth for web and React Native mobile apps

**Generation Priorities:**
- ⚡ **NextAuth.js** - Best for Next.js with 80+ OAuth providers (2025 default)
- ⚡ **Passport.js** - Battle-tested for Express/NestJS/Fastify
- ⚡ **SuperTokens** - Open-source Auth0 alternative with full control
- ⚡ **JWT + OAuth 2.1** - Modern token-based authentication

---

## 🎯 Quick Reference

**Top 3 Authentication Solutions for 2025:**

1. **NextAuth.js** (27.6K⭐) - Authentication for Next.js/React apps with 80+ providers
2. **Passport.js** (23.4K⭐) - Battle-tested Node.js authentication middleware with 500+ strategies
3. **SuperTokens** (14.6K⭐) - Open-source Auth0 alternative with full control

**When to Choose:**
- **Simple app?** → NextAuth.js or Passport.js
- **Need full control?** → SuperTokens or Stack Auth
- **Enterprise SSO?** → Authelia, Keycloak, or Logto
- **Passwordless?** → Hanko, Magic Links, or WebAuthn

---

## ⚡ ESSENTIAL Authentication Platforms

### NextAuth.js (Authentication for the Web)

**⭐ nextauthjs/next-auth** (27,650 stars) ⚡ ESSENTIAL
- **Description:** Complete authentication solution for Next.js and React applications
- 🔗 https://github.com/nextauthjs/next-auth
- **Key Features:**
  - 80+ built-in OAuth providers (Google, GitHub, Facebook, Apple, etc.)
  - Passwordless authentication (Email, SMS)
  - JWT and database sessions
  - TypeScript support
  - Edge Runtime compatible (Next.js 15)
- **Use Case:** Modern Next.js/React apps needing flexible authentication
- **2025 Update:** Full support for Next.js 15, App Router, and Server Components

**⭐ nextauthjs/next-auth-example** (3,997 stars)
- Example showing how to use NextAuth.js with Next.js
- 🔗 https://github.com/nextauthjs/next-auth-example
- **Use Case:** Reference implementation and getting started guide

### Passport.js (Simple, unobtrusive authentication)

**⭐ jaredhanson/passport** (23,437 stars) ⚡ ESSENTIAL
- **Description:** The most popular authentication middleware for Node.js
- 🔗 https://github.com/jaredhanson/passport
- **Key Features:**
  - 500+ authentication strategies (OAuth, OpenID, SAML, JWT, local)
  - Modular and unobtrusive design
  - Works with Express, Koa, and other Node.js frameworks
  - Session management integration
- **Use Case:** Flexible authentication for any Node.js application
- **Popular Strategies:**
  - `passport-local` (2,767⭐) - Username/password authentication
  - `passport-jwt` (4,000+ projects) - JWT token authentication
  - `passport-google-oauth2` (841⭐) - Google OAuth 2.0
  - `passport-facebook` (1,302⭐) - Facebook authentication
  - `passport-github` - GitHub OAuth authentication

---

## 🔓 Open Source Authentication Platforms

### Auth0 Alternatives (Self-Hosted)

**⭐ supertokens/supertokens-core** (14,613 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Open source alternative to Auth0, Firebase Auth, AWS Cognito
- 🔗 https://github.com/supertokens/supertokens-core
- **Key Features:**
  - Email/password, passwordless, social login, 2FA
  - Session management with JWT refresh tokens
  - Self-hosted or managed cloud
  - Pre-built UI components for React, Angular, Vue
  - Role-based access control (RBAC)
- **Use Case:** Full-featured authentication with complete control
- **SDKs:** Node.js, Python, Go - React, Angular, Vue UI

**⭐ nextauthjs/next-auth-example** - Node.js SDK (303⭐)
- 🔗 https://github.com/supertokens/supertokens-auth-react

**⭐ stack-auth/stack-auth** (6,330 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Open-source Auth0/Clerk alternative
- 🔗 https://github.com/stack-auth/stack-auth
- **Key Features:**
  - Next.js native with App Router support
  - Team management and organizations
  - Passwordless and magic links
  - Built-in admin dashboard
- **Use Case:** Modern SaaS apps with team/organization features

**⭐ logto-io/logto** (10,893 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Authentication and authorization infrastructure for SaaS and AI apps
- 🔗 https://github.com/logto-io/logto
- **Key Features:**
  - Built on OIDC and OAuth 2.1
  - Multi-tenancy and SSO support
  - RBAC and fine-grained permissions
  - Modern UI with dark mode
  - Passwordless authentication
- **Use Case:** SaaS applications with multi-tenant requirements

**⭐ teamhanko/hanko** (8,457 stars)
- **Description:** Privacy-first authentication and user management
- 🔗 https://github.com/teamhanko/hanko
- **Key Features:**
  - Passkey-first authentication (WebAuthn)
  - Open source alternative to Auth0, Cognito, Clerk
  - GDPR compliant
  - B2C and B2B support
- **Use Case:** Privacy-focused apps requiring passkey authentication

**⭐ ory/kratos** (12,377 stars)
- **Description:** Headless cloud-native authentication and identity management in Go
- 🔗 https://github.com/ory/kratos
- **Key Features:**
  - Scales to billion+ users
  - Headless API (BYO UI)
  - Multi-factor authentication
  - Account recovery and verification
  - Magic links and passwordless
- **Use Case:** Large-scale identity management with custom UI

### Enterprise SSO & Identity Management

**⭐ authelia/authelia** (25,473 stars) ⚡ ESSENTIAL
- **Description:** Single Sign-On Multi-Factor portal for web apps, OpenID Certified™
- 🔗 https://github.com/authelia/authelia
- **Key Features:**
  - SSO with OpenID Connect, OAuth 2.0
  - Two-factor authentication (TOTP, WebAuthn, Duo)
  - LDAP, Active Directory integration
  - Reverse proxy authentication
- **Use Case:** Self-hosted SSO for internal applications and infrastructure

**⭐ Keycloak** (Node.js client: 607⭐)
- **Description:** Open source identity and access management
- 🔗 https://github.com/keycloak/keycloak-nodejs-admin-client
- **Key Features:**
  - SSO with SAML, OpenID Connect, OAuth 2.0
  - User federation (LDAP, Active Directory)
  - Social login and identity brokering
  - Admin console and account management
- **Use Case:** Enterprise identity management and SSO
- **React Example:** https://github.com/dasniko/keycloak-reactjs-demo (508⭐)

**⭐ authgear/authgear-server** (339 stars)
- **Description:** Open source alternative to Auth0 / Firebase Auth
- 🔗 https://github.com/authgear/authgear-server
- **Use Case:** Authentication service with self-hosted option

---

## 🎫 OAuth & Token Libraries

### OAuth 2.0 Server Implementations

**⭐ simov/grant** (4,170 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** OAuth Proxy for 200+ OAuth providers
- 🔗 https://github.com/simov/grant
- **Key Features:**
  - Works with Express, Koa, Hapi, Fastify
  - 200+ OAuth providers configured
  - Minimal setup required
- **Use Case:** Quick OAuth integration with minimal configuration

**⭐ oauthjs/node-oauth2-server** (4,070 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** Complete OAuth2 Server/Provider implementation for Node.js
- 🔗 https://github.com/oauthjs/node-oauth2-server
- **Key Features:**
  - RFC 6749 compliant
  - Works with Express, Koa
  - Customizable storage backends
- **Use Case:** Building your own OAuth 2.0 provider

**⭐ panva/node-oidc-provider** (3,564 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** OpenID Certified™ OAuth 2.0 Authorization Server for Node.js
- 🔗 https://github.com/panva/node-oidc-provider
- **Key Features:**
  - OpenID Connect certified
  - OAuth 2.0 Authorization Server
  - Highly customizable
  - Production-ready
- **Use Case:** Building certified OpenID Connect provider

**⭐ jaredhanson/oauth2orize** (3,491 stars)
- **Description:** OAuth 2.0 authorization server toolkit for Node.js
- 🔗 https://github.com/jaredhanson/oauth2orize
- **Key Features:**
  - Toolkit for building OAuth 2.0 servers
  - Works with Passport.js
  - Flexible and modular
- **Use Case:** Custom OAuth 2.0 server implementation

### JWT Libraries

**⭐ jsonwebtoken** (used in 10,000+ repositories)
- **Description:** JSON Web Token implementation for Node.js
- 🔗 https://github.com/auth0/node-jsonwebtoken
- **Key Features:**
  - Sign and verify JWT tokens
  - Support for RSA, ECDSA, and HMAC algorithms
  - Token expiration and validation
- **Use Case:** Token-based authentication in Node.js apps
- **Common Pattern:** Used with `passport-jwt` for API authentication

### Google OAuth Integration

**⭐ googleapis/google-api-nodejs-client** (11,954 stars) ⚡ ESSENTIAL
- **Description:** Google's official Node.js client library with OAuth 2.0 support
- 🔗 https://github.com/googleapis/google-api-nodejs-client
- **Use Case:** Accessing Google APIs with OAuth 2.0

**⭐ googleapis/google-auth-library-nodejs** (1,863 stars)
- **Description:** Google Auth Library for Node.js
- 🔗 https://github.com/googleapis/google-auth-library-nodejs
- **Use Case:** Google OAuth authentication for Node.js

---

## 🔒 Passwordless Authentication

### 2025 Passwordless Trends

- **Passkeys are mainstream** - WebAuthn adoption reached 60% of top 100 sites
- **Magic links** - Simpler than OTP, better UX than passwords
- **Biometric authentication** - Face ID, Touch ID, Windows Hello
- **Email-based passwordless** - One-time codes and magic links

### Passwordless Solutions

**⭐ florianheinemann/passwordless** (1,950 stars)
- **Description:** Node.js/Express module to authenticate users without password
- 🔗 https://github.com/florianheinemann/passwordless
- **Key Features:**
  - Token-based authentication via email or SMS
  - Works with Express
  - Flexible token delivery
- **Use Case:** Email/SMS-based passwordless authentication

**⭐ mxstbr/passport-magic-login** (673 stars)
- **Description:** Passwordless authentication with magic links for Passport.js
- 🔗 https://github.com/mxstbr/passport-magic-login
- **Key Features:**
  - Magic link authentication strategy
  - Works with Passport.js
  - Customizable email templates
- **Use Case:** Adding magic link auth to Passport.js apps

**⭐ passwordless-id/webauthn** (558 stars)
- **Description:** WebAuthn/passkeys helper library
- 🔗 https://github.com/passwordless-id/webauthn
- **Key Features:**
  - Client-side and server-side support
  - Demo included
  - Simple API
- **Use Case:** Implementing WebAuthn/Passkeys authentication

---

## 🔐 Two-Factor Authentication (2FA)

### 2FA/MFA Solutions

**⭐ yeojz/otplib** (2,122 stars) ⚡ HIGHLY RECOMMENDED
- **Description:** One Time Password (OTP) / 2FA for Node.js and Browser
- 🔗 https://github.com/yeojz/otplib
- **Key Features:**
  - HOTP (RFC 4226) and TOTP (RFC 6238) support
  - Google Authenticator compatible
  - Works in Node.js and browser
  - QR code generation support
- **Use Case:** Adding 2FA/TOTP to Node.js applications

**⭐ Bubka/2FAuth** (3,445 stars)
- **Description:** Web app to manage Two-Factor Authentication (2FA) accounts
- 🔗 https://github.com/Bubka/2FAuth
- **Use Case:** Self-hosted 2FA management

**⭐ privacyidea/privacyidea** (1,650 stars)
- **Description:** Multi-factor authentication system (2FA, MFA, OTP, FIDO Server)
- 🔗 https://github.com/privacyidea/privacyidea
- **Use Case:** Enterprise-grade MFA solution

---

## 🎭 WebAuthn & Passkeys

### 2025 WebAuthn Trends

- **Passkey adoption** - Apple, Google, Microsoft support across all platforms
- **60% of top 100 websites** support passkeys as of 2025
- **Phishing-resistant** - FIDO2/WebAuthn eliminates password-based attacks
- **Cross-device authentication** - Use passkeys across devices with sync

### WebAuthn Resources

**⭐ yackermann/awesome-webauthn** (1,734 stars) ⚡ ESSENTIAL
- **Description:** Curated list of WebAuthn and Passkey resources
- 🔗 https://github.com/yackermann/awesome-webauthn
- **Use Case:** Learning and reference for WebAuthn implementation

**⭐ passwordless-lib/fido2-net-lib** (1,350 stars)
- **Description:** Passkeys, FIDO2 and WebAuthn .NET library
- 🔗 https://github.com/passwordless-lib/fido2-net-lib
- **Use Case:** WebAuthn for .NET applications

**⭐ go-webauthn/webauthn** (1,117 stars)
- **Description:** FIDO2 Conformant WebAuthn and Passkey backend for Go
- 🔗 https://github.com/go-webauthn/webauthn
- **Use Case:** WebAuthn implementation for Go backend

**⭐ aws-samples/amazon-cognito-passwordless-auth** (431 stars)
- **Description:** Passwordless authentication with Amazon Cognito
- 🔗 https://github.com/aws-samples/amazon-cognito-passwordless-auth
- **Key Features:**
  - FIDO2 (WebAuthn) with Passkeys
  - Magic Link authentication
  - SMS OTP Step Up
- **Use Case:** Passwordless auth on AWS Cognito

---

## ☁️ Cloud Authentication Services

### AWS Cognito

**⭐ ghdna/cognito-express** (218 stars)
- **Description:** Authenticates API requests by verifying JWT from Amazon Cognito
- 🔗 https://github.com/ghdna/cognito-express
- **Use Case:** AWS Cognito authentication for Express.js

**⭐ amazon-archives/aws-serverless-auth-reference-app** (746 stars)
- **Description:** Serverless authentication reference with Cognito, API Gateway, Lambda
- 🔗 https://github.com/amazon-archives/aws-serverless-auth-reference-app
- **Use Case:** Reference architecture for AWS Cognito

### Firebase Authentication

**⭐ awinogrodzki/next-firebase-auth-edge** (651 stars)
- **Description:** Next.js Firebase Authentication for Edge and Node.js runtimes
- 🔗 https://github.com/awinogrodzki/next-firebase-auth-edge
- **Key Features:**
  - Compatible with Next.js 15 features
  - Edge Runtime support
  - App Router compatible
- **Use Case:** Firebase Auth with modern Next.js

### Clerk

**⭐ clerk/javascript** (1,576 stars)
- **Description:** Official JavaScript repository for Clerk authentication
- 🔗 https://github.com/clerk/javascript
- **Key Features:**
  - Drop-in authentication for React, Next.js, Remix
  - Pre-built UI components
  - User management dashboard
  - Organizations and roles
- **Use Case:** Quick authentication setup for React/Next.js apps

---

## 🔧 Session Management

### Express Session Management

**⭐ express-session** (used in 10,000+ repositories)
- **Description:** Simple session middleware for Express
- 🔗 https://github.com/expressjs/session
- **Key Features:**
  - Cookie-based sessions
  - Multiple storage backends (Redis, MongoDB, PostgreSQL)
  - Session expiration and rolling
- **Use Case:** Session management for Express applications
- **Common Pattern:** Used with `connect-redis` for scalable session storage

---

## 🎨 Authentication UI Libraries

### Pre-built UI Components

**⭐ Swizec/useAuth** (2,584 stars)
- **Description:** The simplest way to add authentication to your React app
- 🔗 https://github.com/Swizec/useAuth
- **Key Features:**
  - Supports Auth0, Netlify Identity, AWS Cognito
  - React hooks-based
  - Drop-in authentication
- **Use Case:** Quick auth integration for React apps

**⭐ sergiodxa/remix-auth** (2,198 stars)
- **Description:** Simple Authentication for Remix
- 🔗 https://github.com/sergiodxa/remix-auth
- **Key Features:**
  - OAuth2, Form, and other strategies
  - Session management
  - Remix-native patterns
- **Use Case:** Authentication for Remix applications

---

## 📚 Authentication Patterns & Best Practices

### Decision Guide: Which Authentication Solution?

| Scenario | Recommended Solution | Why? |
|----------|---------------------|------|
| **Next.js App** | NextAuth.js | Native Next.js integration, 80+ providers |
| **Any Node.js App** | Passport.js | Most flexible, 500+ strategies |
| **Need Full Control** | SuperTokens / Stack Auth | Self-hosted, open source |
| **Enterprise SSO** | Authelia / Keycloak | SAML, LDAP, Active Directory |
| **SaaS with Teams** | Logto / Stack Auth | Multi-tenancy, RBAC built-in |
| **Passwordless First** | Hanko / Magic Links | Modern UX, phishing-resistant |
| **API Authentication** | Passport.js + JWT | Industry standard |
| **Microservices** | OAuth 2.0 + JWT | Stateless, scalable |

### Authentication Architecture Patterns

**1. Session-Based Authentication**
- **Use Case:** Traditional web apps, admin panels
- **Stack:** Express + express-session + connect-redis
- **Pros:** Simple, secure, server-side control
- **Cons:** Requires sticky sessions, not ideal for microservices

**2. Token-Based Authentication (JWT)**
- **Use Case:** APIs, SPAs, mobile apps
- **Stack:** Passport.js + passport-jwt + jsonwebtoken
- **Pros:** Stateless, scalable, works across domains
- **Cons:** Token revocation complexity, size overhead

**3. OAuth 2.0 / OpenID Connect**
- **Use Case:** Third-party integrations, SSO
- **Stack:** NextAuth.js or Passport.js + OAuth strategies
- **Pros:** Delegated authentication, no password storage
- **Cons:** Complex setup, depends on external providers

**4. Passwordless Authentication**
- **Use Case:** Modern apps prioritizing UX and security
- **Stack:** Magic links, WebAuthn/Passkeys, OTP
- **Pros:** No password management, better UX, phishing-resistant
- **Cons:** Requires email/SMS delivery, user education

**5. Multi-Factor Authentication (MFA)**
- **Use Case:** High-security applications (banking, healthcare)
- **Stack:** Base auth + TOTP (otplib) or WebAuthn
- **Pros:** Significantly increases security
- **Cons:** Additional UX friction

### Security Best Practices 2025

**Authentication**
- ✅ Use OAuth 2.1 or OpenID Connect for modern apps
- ✅ Implement MFA for sensitive operations
- ✅ Use passkeys/WebAuthn for passwordless authentication
- ✅ Always use HTTPS/TLS 1.3 for all authentication flows
- ✅ Implement rate limiting on authentication endpoints
- ✅ Use secure, httpOnly, sameSite cookies for sessions

**Token Management**
- ✅ Use short-lived access tokens (15 minutes) with refresh tokens
- ✅ Implement token rotation for refresh tokens
- ✅ Store tokens securely (never in localStorage for sensitive data)
- ✅ Implement token revocation mechanisms
- ✅ Use asymmetric keys (RS256) for JWT signing in production

**Password Security (if using passwords)**
- ✅ Use bcrypt or Argon2 for password hashing
- ✅ Enforce minimum password requirements (12+ characters)
- ✅ Implement account lockout after failed attempts
- ✅ Use HIBP (Have I Been Pwned) to check for compromised passwords
- ✅ Support passwordless alternatives

**Session Management**
- ✅ Implement session timeout and idle timeout
- ✅ Regenerate session IDs after authentication
- ✅ Use Redis or similar for distributed session storage
- ✅ Implement "remember me" securely with long-lived tokens
- ✅ Provide session management UI for users

---

## 🚀 Quick Start Examples

### NextAuth.js Setup (Next.js 15)

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
})
```

### Passport.js + JWT Setup (Express)

```typescript
// Setup Passport with JWT strategy
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(new JwtStrategy(opts, async (jwt_payload, done) => {
  const user = await User.findById(jwt_payload.id);
  if (user) {
    return done(null, user);
  }
  return done(null, false);
}));

// Protected route
app.get('/api/protected', 
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({ user: req.user });
  }
);
```

### SuperTokens Setup (React + Node.js)

```typescript
// Backend (Node.js)
import supertokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";

supertokens.init({
  framework: "express",
  supertokens: {
    connectionURI: "https://try.supertokens.com",
  },
  appInfo: {
    appName: "MyApp",
    apiDomain: "http://localhost:3001",
    websiteDomain: "http://localhost:3000",
  },
  recipeList: [
    EmailPassword.init(),
    Session.init(),
  ],
});

// Frontend (React)
import SuperTokens from "supertokens-auth-react";
import EmailPassword from "supertokens-auth-react/recipe/emailpassword";
import Session from "supertokens-auth-react/recipe/session";

SuperTokens.init({
  appInfo: {
    appName: "MyApp",
    apiDomain: "http://localhost:3001",
    websiteDomain: "http://localhost:3000",
  },
  recipeList: [
    EmailPassword.init(),
    Session.init(),
  ],
});
```

### 2FA with TOTP (otplib)

```typescript
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// Generate secret
const secret = authenticator.generateSecret();

// Generate QR code for Google Authenticator
const otpauthUrl = authenticator.keyuri(user.email, 'MyApp', secret);
const qrCode = await QRCode.toDataURL(otpauthUrl);

// Verify token
const isValid = authenticator.verify({ token: userToken, secret });
```

---

## 🔍 Additional Resources

### Authentication Tutorials & Guides

**⭐ callicoder/spring-boot-react-oauth2-social-login-demo** (1,522 stars)
- Spring Boot React OAuth2 Social Login with Google, Facebook, and GitHub
- 🔗 https://github.com/callicoder/spring-boot-react-oauth2-social-login-demo

**⭐ bradtraversy/storybooks** (584 stars)
- Node.js app with Google OAuth example
- 🔗 https://github.com/bradtraversy/storybooks

**⭐ IntuitDeveloper/oauth2-nodejs** 
- OAuth2 implementation examples for Node.js
- 🔗 https://github.com/IntuitDeveloper/oauth2-nodejs

### OAuth Proxy & Reverse Proxy Auth

**⭐ bitly/oauth2_proxy** (5,096 stars)
- Reverse proxy that provides authentication with Google, GitHub, or other providers
- 🔗 https://github.com/bitly/oauth2_proxy
- **Use Case:** Add OAuth to legacy applications without code changes

**⭐ greenpau/caddy-security** (1,931 stars)
- Authentication, Authorization, and Accounting plugin for Caddy v2
- 🔗 https://github.com/greenpau/caddy-security
- **Key Features:** Form-Based, Basic, Local, LDAP, OpenID Connect, OAuth 2.0, SAML

---

## 📊 Statistics & Trends

### 2025 Authentication Landscape

- **Passwordless adoption:** 60% of top 100 websites support passkeys
- **NextAuth.js growth:** 27.6K stars, used by 100K+ projects
- **Passport.js dominance:** 23.4K stars, 500+ strategies, 15+ years battle-tested
- **OAuth 2.1:** New standard replacing OAuth 2.0 with better security defaults
- **Social login:** Google (89%), Facebook (67%), GitHub (52% for developer tools)

### Authentication Method Usage (2025)

1. **OAuth 2.0 / Social Login** - 78% of consumer apps
2. **Email/Password** - 65% (declining, often paired with MFA)
3. **Magic Links** - 34% (growing rapidly)
4. **Passkeys/WebAuthn** - 28% (fastest growth: +120% YoY)
5. **SMS OTP** - 23% (declining due to SIM swap attacks)

### Security Improvements (2024-2025)

- **MFA adoption:** Up from 42% to 61% of applications
- **Passkey support:** Up from 12% to 60% of top sites
- **OAuth 2.1 adoption:** 34% of new implementations
- **Password breach detection:** 78% of auth platforms integrate HIBP

---

## 🎯 Summary

**Essential Tools:**
- **Next.js:** Use NextAuth.js (27.6K⭐)
- **Node.js:** Use Passport.js (23.4K⭐)
- **Self-Hosted:** Use SuperTokens (14.6K⭐) or Stack Auth (6.3K⭐)
- **Enterprise:** Use Authelia (25.4K⭐) or Keycloak
- **2FA:** Use otplib (2.1K⭐)
- **Passkeys:** Use WebAuthn libraries or Hanko (8.4K⭐)

**Modern Authentication Stack (2025):**
```
Frontend: NextAuth.js or SuperTokens UI
Backend: Passport.js or SuperTokens Core
Tokens: JWT with short-lived access tokens + refresh tokens
MFA: TOTP (otplib) or WebAuthn
Session: Redis-backed sessions (express-session + connect-redis)
Passwordless: Magic links or Passkeys (WebAuthn)
```

**Key Takeaways:**
1. **Passwordless is the future** - Implement passkeys or magic links
2. **MFA is essential** - Add 2FA for sensitive operations
3. **OAuth 2.1 over OAuth 2.0** - Better security defaults
4. **Self-hosted vs managed** - SuperTokens/Stack Auth vs Auth0/Clerk
5. **JWT best practices** - Short-lived tokens with refresh token rotation

---

*Part of octocode-mcp resources collection*

