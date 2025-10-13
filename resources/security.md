# Security Best Practices Resources

> Security guidelines, tools, and best practices for Node.js/TypeScript applications

**🎯 Purpose:** Security resources for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers securing Node.js applications
**🌐 Focus:** OWASP Top 10, Node.js security, secrets management
**📱 Mobile:** Mobile app security, API security for React Native backends
**⚙️ Runtime:** Node.js security tools, npm audit, dependency scanning

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **security guidance** to help AI agents:
1. **Apply OWASP Top 10** - Prevent injection, broken auth, XSS, CSRF
2. **Secure Node.js** - Node.js security best practices and patterns
3. **Manage secrets** - Environment variables, vaults, secret scanning
4. **Scan dependencies** - npm audit, Snyk, supply chain security
5. **Secure APIs** - Rate limiting, CORS, authentication for web + mobile

**Generation Priorities:**
- ⚡ **OWASP Top 10 2025** - Essential security vulnerabilities to prevent
- ⚡ **Helmet.js** - Security headers for Express/Node.js
- ⚡ **Zod validation** - Runtime input validation with TypeScript
- ⚡ **Secrets management** - Never commit secrets, use env vars/vaults

---

## Application Security

### OWASP Top 10 (2025)

The OWASP Top 10:2025 is scheduled for release at the OWASP Global AppSec Conference in November 2025. Current key security risks include:

1. **Broken Access Control** - Failures in restricting user permissions leading to unauthorized access
2. **Cryptographic Failures** - Improper encryption exposing sensitive data
3. **Injection** (including XSS) - User input manipulation attacks
4. **Insecure Design** - Security flaws in architecture and design phase
5. **Security Misconfiguration** - Improper security settings across the stack
6. **Vulnerable and Outdated Components** - Using libraries with known vulnerabilities
7. **Identification and Authentication Failures** - Weak authentication mechanisms
8. **Software and Data Integrity Failures** - Compromised CI/CD pipelines and supply chain
9. **Security Logging and Monitoring Failures** - Insufficient visibility into security events
10. **Server-Side Request Forgery (SSRF)** - Unauthorized server-side requests

### Essential Application Security Practices

- **Access Control**: Implement "default deny" with server-side validation
- **Data Protection**: Use AES-256 encryption at rest, TLS 1.3 in transit
- **Password Security**: Use bcrypt or Argon2 for hashing, never plain text
- **Input Validation**: Sanitize all user input, use prepared statements for databases
- **Secure Design**: Integrate threat modeling from the start of development
- **Shift-Left Security**: Test security at commit time, not just pre-deployment

### OWASP Resources

**⭐ OWASP Top 10 Project** ⚡ ESSENTIAL
- The standard awareness document for web application security
- 🔗 https://owasp.org/www-project-top-ten/
- **Use Case:** Understanding the most critical web application security risks

**⭐ OWASP ASVS (Application Security Verification Standard)** ⚡ ESSENTIAL
- Version 5.0.0 released May 2025 - comprehensive application security requirements
- 🔗 https://owasp.org/www-project-application-security-verification-standard/
- **Use Case:** Security verification framework for applications

**⭐ OWASP Web Security Testing Guide (WSTG)** ⚡ ESSENTIAL
- Comprehensive framework for testing web application security
- 🔗 https://owasp.org/www-project-web-security-testing-guide/
- **Use Case:** Penetration testing best practices

**⭐ OWASP Mobile Top 10**
- Security vulnerabilities specific to mobile applications
- 🔗 https://owasp.org/www-project-mobile-top-10/
- **Use Case:** Mobile app security guidelines

### Web Security Resources

**⭐ qazbnm456/awesome-web-security** (12,551 stars)
- Curated list of Web Security materials and resources
- 🔗 https://github.com/qazbnm456/awesome-web-security
- **Use Case:** Comprehensive web security knowledge base

**⭐ trimstray/the-book-of-secret-knowledge** (189,614 stars) ⚡ ESSENTIAL
- Collection of security manuals, cheatsheets, hacks, and tools
- 🔗 https://github.com/trimstray/the-book-of-secret-knowledge
- **Use Case:** Comprehensive security knowledge base

**⭐ Hack-with-Github/Awesome-Hacking** (99,010 stars)
- Collection of resources for hackers, pentesters and security researchers
- 🔗 https://github.com/Hack-with-Github/Awesome-Hacking
- **Use Case:** Security and hacking resources

---

## API Security

### 2025 API Security Trends

- **APIs are the #1 attack vector** in cloud-native stacks
- **AI-powered threat detection** using ML to detect abnormal API behavior in real-time
- **Passwordless authentication** emerging with WebAuthn and FIDO2
- **Zero-trust architecture** for all API access
- **Shift-left security** starting at commit time through CI/CD pipelines

### API Security Best Practices

> **💡 For detailed authentication implementation guides, see [oauth.md](./oauth.md)** - covers OAuth 2.0/2.1, JWT libraries, NextAuth.js, Passport.js, passwordless auth, and more.

**Authentication & Authorization**
- Use OAuth 2.0/2.1, OpenID Connect, or JWT for strong authentication
- Implement Multi-Factor Authentication (MFA) for sensitive operations
- Apply least-privilege principles and granular access controls
- Never expose API keys in client-side code or version control

**API Gateway Implementation**
- Centralize API traffic through a gateway for consistent security policies
- Implement rate limiting to prevent abuse and DDoS attacks
- Use API gateways for request validation, transformation, and routing
- Enable proper logging and monitoring at the gateway level

**Data Protection**
- Encrypt data in transit using TLS 1.2+ (prefer TLS 1.3)
- Encrypt sensitive data at rest with AES-256
- Implement proper error handling that doesn't leak sensitive information
- Validate and sanitize all input data

**Monitoring & Testing**
- Real-time behavioral monitoring for anomaly detection
- Automated API security testing in CI/CD pipelines
- Conduct load tests to model abuse scenarios
- Track API requests, responses, and errors with comprehensive logging

### API Security Resources

**⭐ GitGuardian/APISecurityBestPractices** (1,953 stars) ⚡ ESSENTIAL
- Resources to keep secrets out of source code
- 🔗 https://github.com/GitGuardian/APISecurityBestPractices
- **Use Case:** API security and secrets management best practices

**⭐ OWASP API Security Project** ⚡ ESSENTIAL
- OWASP API Security Top 10 and testing guidelines
- 🔗 https://owasp.org/www-project-api-security/
- **Use Case:** Understanding API-specific security risks

---

## Infrastructure Security

### Container Security

**2025 Container Security Trends**
- **Rapid attack timelines**: AKS clusters face first attack within 18 minutes, EKS within 28 minutes
- **Supply chain security**: 60% of container breaches in 2024 were due to misconfigurations
- **Agentless monitoring**: 15-20% cost reduction per deployment
- **AI-driven analytics**: 70% improvement in incident detection accuracy

**Container Security Best Practices**
- Scan images for vulnerabilities before deployment
- Use minimal base images (Alpine, distroless) to reduce attack surface
- Never run containers as root - use non-privileged users
- Implement image signing and verification
- Regularly update and patch container images
- Use read-only file systems where possible

**⭐ aquasecurity/trivy** (29,392 stars) ⚡ ESSENTIAL
- Comprehensive security scanner for containers, Kubernetes, code, and clouds
- Finds vulnerabilities, misconfigurations, secrets, and generates SBOM
- 🔗 https://github.com/aquasecurity/trivy
- **Use Case:** Multi-purpose security scanning for containers and infrastructure

**⭐ docker/docker-bench-security** (9,502 stars) ⚡ ESSENTIAL
- Automated checks for Docker security best practices
- Based on CIS Docker Benchmark
- 🔗 https://github.com/docker/docker-bench-security
- **Use Case:** Validating Docker deployment security

### Kubernetes Security

**2025 Kubernetes Security Trends**
- **Zero-trust architecture**: "Never trust, always verify" with micro-segmentation
- **Improved security posture**: 50% reduction in publicly exposed pods with severe vulnerabilities
- **Version compliance**: 54% of clusters now run on supported versions (up from 42%)
- **Policy-as-code frameworks**: Minimizing misconfigurations at scale

**Kubernetes Security Best Practices**
- Enable RBAC (Role-Based Access Control) with least privilege
- Use Network Policies to control pod-to-pod communication
- Implement Pod Security Standards (restricted mode for production)
- Enable audit logging and monitor cluster activity
- Scan for CIS Kubernetes Benchmark compliance
- Use secrets management tools, never hardcode credentials
- Keep Kubernetes versions up to date (within supported window)
- Implement image admission controllers (e.g., OPA Gatekeeper)

**⭐ aquasecurity/kube-bench** (7,756 stars) ⚡ ESSENTIAL
- Validates Kubernetes deployment against CIS Kubernetes Benchmark
- Automated security compliance checking
- 🔗 https://github.com/aquasecurity/kube-bench
- **Use Case:** Kubernetes security validation and compliance

**⭐ freach/kubernetes-security-best-practice** (2,713 stars)
- Comprehensive Kubernetes security best practices guide
- 🔗 https://github.com/freach/kubernetes-security-best-practice
- **Use Case:** Kubernetes security guidelines and patterns

**⭐ aws/aws-eks-best-practices** (2,135 stars)
- Best practices for AWS EKS including security, reliability, and cost optimization
- 🔗 https://github.com/aws/aws-eks-best-practices
- **Use Case:** AWS EKS production best practices

---

## Secrets Management

### Critical Issue: Secrets Sprawl

**2025 Secrets Management Challenges**
- **96% of organizations struggle with secrets sprawl** (credentials scattered across code, configs, scripts)
- **88% of data breaches involved compromised credentials** (Verizon 2025 Report)
- **Agentic AI complications**: Autonomous agents generate and rotate secrets faster than humans can track
- **Non-human access**: Automation and service accounts create exponential growth in secrets

### Secrets Management Best Practices

**Never Commit Secrets to Version Control**
- Use .gitignore to exclude .env, credentials files, and config files with secrets
- Scan commits for accidentally committed secrets using pre-commit hooks
- Use tools like GitGuardian or TruffleHog to detect secrets in repositories
- If secrets are exposed, rotate them immediately - removing from Git history isn't enough

**Automated Lifecycle Management**
- Implement automated creation, distribution, rotation, and destruction
- High-risk secrets should rotate daily; infrastructure certificates monthly
- Eliminate manual processes to prevent human error
- Use automated rotation schedules based on secret sensitivity

**Shift-Left Security**
- Scan for secrets at the PR level before merging
- Integrate secrets scanning in CI/CD pipelines
- Allow developers to fix issues before they reach production
- Use pre-commit hooks for local secret detection

**Access Control & Auditing**
- Implement least-privilege access to secrets
- Track who accessed secrets, when, and what changes were made
- Generate compliance documentation (SOC 2, ISO 27001, HIPAA)
- Monitor for potential security gaps with vulnerability scanners

**Developer-Friendly Integration**
- Provide CLI tools that integrate with developer workflows
- Sync with CI/CD pipelines for seamless access
- Use environment-based secret injection (avoid hardcoding)
- Make secrets management simple and fast, not complex

### Secrets Management Tools

**⭐ HashiCorp Vault** ⚡ ESSENTIAL
- Industry-standard secrets management platform
- Supports dynamic secrets, encryption as a service, automated rotation
- 🔗 https://www.vaultproject.io/
- **Use Case:** Enterprise-grade secrets management

**⭐ Doppler**
- Modern secrets management for development teams
- Seamless CI/CD integration with developer-friendly workflows
- 🔗 https://www.doppler.com/
- **Use Case:** Developer-focused secrets management

**⭐ AWS Secrets Manager**
- Native AWS secrets management with automatic rotation
- Integrated with AWS services and IAM
- 🔗 https://aws.amazon.com/secrets-manager/
- **Use Case:** AWS-native secrets management

**⭐ Infisical**
- Open-source secrets management platform
- Developer-friendly with modern workflows
- 🔗 https://infisical.com/
- **Use Case:** Open-source secrets management

**⭐ SOPS (Secrets OPerationS)**
- File-based secrets encryption with version control support
- Uses AWS KMS, GCP KMS, Azure Key Vault, or PGP
- 🔗 https://github.com/mozilla/sops
- **Use Case:** Encrypted secrets in Git repositories

**⭐ External Secrets Operator**
- Kubernetes operator to sync external secrets into Kubernetes
- Supports Vault, AWS, GCP, Azure secret managers
- 🔗 https://external-secrets.io/
- **Use Case:** Kubernetes secrets synchronization

---

## Security Scanning & Tools

### Vulnerability Scanning

**2025 Vulnerability Trends**
- **30,000+ vulnerabilities disclosed in 2024** (17% increase)
- **48,675-58,956 new CVEs predicted for 2025**
- **154% increase in cloud vulnerabilities** year-over-year
- **Ransomware and social engineering** remain top threats

### Essential Security Tools

**⭐ aquasecurity/trivy** (29,392 stars) ⚡ ESSENTIAL
- Comprehensive scanner: containers, Kubernetes, IaC, code repositories, clouds
- Detects vulnerabilities, misconfigurations, secrets, and generates SBOM
- 🔗 https://github.com/aquasecurity/trivy
- **Use Case:** All-in-one security scanning

**⭐ GitGuardian**
- Automated secrets detection in code repositories
- Real-time monitoring and alerting for exposed credentials
- 🔗 https://www.gitguardian.com/
- **Use Case:** Secrets detection in repositories

**⭐ TruffleHog**
- Find credentials and secrets in Git history
- 🔗 https://github.com/trufflesecurity/trufflehog
- **Use Case:** Historical secrets scanning

**⭐ Snyk**
- Developer-first security platform
- Scans code, dependencies, containers, and IaC
- 🔗 https://snyk.io/
- **Use Case:** Developer-focused security testing

**⭐ OWASP ZAP (Zed Attack Proxy)**
- Free web application security scanner
- 🔗 https://www.zaproxy.org/
- **Use Case:** Web application penetration testing

**⭐ SonarQube**
- Code quality and security analysis
- Detects bugs, vulnerabilities, and code smells
- 🔗 https://www.sonarqube.org/
- **Use Case:** Static application security testing (SAST)

---

## Quick Reference

### Security Checklist

**Application Security**
- [ ] Validate and sanitize all user input
- [ ] Use parameterized queries/prepared statements for databases
- [ ] Implement proper authentication and authorization
- [ ] Use secure password hashing (bcrypt, Argon2)
- [ ] Enable HTTPS with TLS 1.3
- [ ] Set secure HTTP headers (CSP, HSTS, X-Frame-Options)
- [ ] Keep dependencies updated and scan for vulnerabilities
- [ ] Implement proper error handling (don't leak sensitive info)
- [ ] Follow OWASP Top 10 guidelines

**API Security**
- [ ] Use OAuth 2.0/2.1 or JWT for authentication
- [ ] Implement rate limiting and throttling
- [ ] Use API gateway for centralized security policies
- [ ] Encrypt data in transit (TLS 1.3) and at rest (AES-256)
- [ ] Validate all API inputs and sanitize outputs
- [ ] Implement comprehensive API logging and monitoring
- [ ] Never expose API keys in client code
- [ ] Use API versioning for backward compatibility

**Infrastructure Security**
- [ ] Scan container images for vulnerabilities (Trivy)
- [ ] Run containers as non-root users
- [ ] Use minimal base images (Alpine, distroless)
- [ ] Enable Kubernetes RBAC with least privilege
- [ ] Implement Network Policies for pod isolation
- [ ] Use Pod Security Standards (restricted mode)
- [ ] Run CIS benchmark checks (docker-bench, kube-bench)
- [ ] Keep infrastructure components updated

**Secrets Management**
- [ ] Never commit secrets to version control
- [ ] Use .gitignore for .env and credential files
- [ ] Implement automated secret rotation
- [ ] Use secrets management tools (Vault, Doppler, AWS Secrets Manager)
- [ ] Scan for secrets in pre-commit hooks
- [ ] Use environment variables for configuration
- [ ] Implement least-privilege access to secrets
- [ ] Enable comprehensive audit logging

**Security Testing**
- [ ] Run SAST (Static Application Security Testing) in CI/CD
- [ ] Perform DAST (Dynamic Application Security Testing) regularly
- [ ] Scan dependencies for known vulnerabilities
- [ ] Test for OWASP Top 10 vulnerabilities
- [ ] Conduct penetration testing periodically
- [ ] Perform load testing with abuse scenarios
- [ ] Implement automated security testing in pipelines

### Essential Tools by Category

**General Security**
- `trimstray/the-book-of-secret-knowledge` - Comprehensive security knowledge
- `Lissy93/personal-security-checklist` - 300+ security tips

**Application Security**
- OWASP Top 10 - Critical web app security risks
- OWASP ASVS - Security verification standard
- OWASP WSTG - Security testing guide

**API Security**
- `GitGuardian/APISecurityBestPractices` - API security guidance
- OWASP API Security Top 10 - API-specific risks

**Container Security**
- `aquasecurity/trivy` - Comprehensive container scanner
- `docker/docker-bench-security` - Docker security validation

**Kubernetes Security**
- `aquasecurity/kube-bench` - K8s CIS benchmark checks
- `freach/kubernetes-security-best-practice` - K8s security guide

**Secrets Management**
- HashiCorp Vault - Enterprise secrets management
- Doppler - Developer-friendly secrets platform
- AWS Secrets Manager - AWS-native solution

**Scanning Tools**
- Trivy - Multi-purpose security scanner
- Snyk - Developer-first security platform
- OWASP ZAP - Web app security testing

### Top 3 Security Essentials for 2025

1. **Shift-Left Security** - Test security from commit time through CI/CD, not just before deployment
2. **Secrets Management** - Automate rotation, never commit to Git, use dedicated tools (96% of orgs struggle with this)
3. **Zero-Trust Architecture** - Never trust, always verify - for APIs, infrastructure, and all access

### Critical 2025 Security Practices

- **AI-Powered Defense**: Leverage AI-driven anomaly detection for real-time threat identification
- **Supply Chain Security**: 60% of breaches from misconfigurations - use policy-as-code frameworks
- **Rapid Response**: Clusters face attacks within 18-28 minutes - implement immediate security measures
- **Automated Lifecycle**: Manual processes cause breaches - automate creation, rotation, and destruction
- **Comprehensive Scanning**: 48K-59K new CVEs expected in 2025 - continuous vulnerability scanning is critical

---

**⚠️ Remember**: Security is not a one-time task - it's a continuous process. Stay updated on the latest threats, regularly patch and update systems, and always follow the principle of least privilege.

---

*Part of octocode-mcp resources collection*
