# Security Policy

## Reporting Security Vulnerabilities

**DO NOT** create public GitHub issues for security vulnerabilities.

### How to Report

Please report security vulnerabilities by emailing:
**security@famoria.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

### What to Expect

- **Acknowledgment:** Within 24 hours
- **Initial Assessment:** Within 72 hours
- **Fix Timeline:** Depends on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release cycle

### Disclosure Policy

- We follow responsible disclosure
- We will credit security researchers (with permission)
- We request 90 days before public disclosure

## Security Scope

### In Scope
- Authentication & authorization bypasses
- Cryptographic implementation flaws
- Data leakage vulnerabilities
- Firestore security rules bypasses
- Storage bucket access issues
- XSS, CSRF, injection attacks
- Privacy violations

### Out of Scope
- Social engineering attacks
- Physical device compromise
- Denial of Service (DoS)
- Issues in third-party dependencies (report to maintainers)
- Previously known issues

## Security Measures

### Encryption
- AES-256-GCM for data at rest
- TLS 1.3 for data in transit
- Argon2id for key derivation
- RSA-4096 for key wrapping
- Hardware-backed key storage

### Access Control
- Principle of least privilege
- Firestore security rules enforcement
- Role-based access control (RBAC)
- Zero-trust architecture

### Privacy
- GDPR compliant
- End-to-end encryption for Private Albums
- Consent-based AI processing
- Comprehensive audit logging

## Security Contact

**Email:** security@famoria.com
**PGP Key:** [To be published]

---

**Last Updated:** December 2024
**Version:** 1.0.0
