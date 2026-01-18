# Privacy Policy

**Effective Date:** January 18, 2026

## 1. Overview

Octocode ("we", "us", or "our") is an open-source project committed to protecting the privacy of developers. This policy explains how we handle data within the Octocode CLI, MCP Server, and VS Code Extension.

## 2. Data Collection & Classification

We collect **de-identified telemetry data** to maintain the stability and performance of our tools. This data is pseudonymous: it allows us to see trends without identifying you personally.

### What We Collect
- **Command Usage**: Which commands (e.g., `octocode/research`, `octocode/plan`) are executed.
- **Tool Usage**: Which specific tools (e.g., `githubSearchCode`) are utilized.
- **Performance Metrics**: Execution time, success/failure rates, and error codes.
- **Session IDs**: Randomly generated UUIDs used to group related events within a single session.

### What We DO NOT Collect
- **Source Code**: Your code stays on your machine. We never upload or "peek" at your local files.
- **Secrets & Env Vars**: We do not collect API keys, passwords, or environment variables.
- **PII**: We do not collect names, emails, or IP addresses (IPs are anonymized before storage).

## 3. Legal Basis (GDPR/CCPA)

For users in the EEA and UK, we process data based on **Legitimate Interest** (Article 6(1)(f) GDPR). This allows us to monitor the health of the open-source tool and provide a stable experience for the community.

## 4. Data Retention

We retain telemetry logs for a maximum of **360 days**. After this period, data is either permanently deleted or aggregated into high-level statistics that contain no session identifiers.

## 5. Your Rights

Under global privacy laws, you have the right to:
- **Access/Export**: Request a copy of the telemetry data associated with your session ID.
- **Deletion**: Request that your session data be purged from our logs.
- **Opt-Out**: Disable all future collection at any time.

## 6. How to Opt-Out

You can disable telemetry by using any of the following methods:

**Environment Variable:**
```bash
export OCTOCODE_TELEMETRY_DISABLED=1
```

**Config File:**
Set `telemetry: false` in your `.octocoderc` file.

**VS Code Settings:**
Disable "Octocode: Enable Telemetry" in the extension settings.

## 7. Contact & Issues

For privacy inquiries or to exercise your data rights, please open a Privacy Issue on our GitHub repository or contact the maintainers at bgauryy@octocodeai.com.
