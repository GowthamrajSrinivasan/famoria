# Threat Model

## Overview

This document defines the threats Famoria's encryption system is designed to defend against.

---

## Threat Actors

### 1. External Attackers
**Capability:** Remote access, no credentials
**Motivation:** Data theft, ransomware, reputation damage
**Access:** Public internet, API endpoints

### 2. Malicious Insiders
**Capability:** Backend access, database access
**Motivation:** Data exfiltration, sabotage
**Access:** Firebase Console, production databases

### 3. Cloud Provider Compromise
**Capability:** Physical access to servers, database dumps
**Motivation:** Government requests, data mining
**Access:** Google Cloud infrastructure

### 4. Device Thieves
**Capability:** Physical device access
**Motivation:** Data access, identity theft
**Access:** User's phone/computer

---

## Attack Scenarios

### ✅ PROTECTED AGAINST

#### 1. Database Breach
**Scenario:** Attacker gains full Firestore database dump
**Mitigation:**
- All photo data encrypted with AES-256-GCM
- Album keys encrypted with user public keys
- Private album keys never stored
- Metadata encrypted for Private Albums

**Result:** ✅ Attacker sees only encrypted blobs

---

#### 2. Storage Bucket Compromise
**Scenario:** Attacker downloads all Firebase Storage files
**Mitigation:**
- All photos stored as encrypted blobs (octet-stream)
- No plaintext files ever uploaded
- IVs stored separately in Firestore
- Auth tags validated on decryption

**Result:** ✅ Attacker cannot decrypt photos

---

#### 3. Malicious Insider
**Scenario:** Firebase admin attempts to view user photos
**Mitigation:**
- Keys stored hardware-backed on user devices
- Private album keys derived on-device, never transmitted
- No server-side decryption capability
- Zero-knowledge architecture

**Result:** ✅ Admin cannot decrypt any photos

---

#### 4. Network Interception (MITM)
**Scenario:** Attacker intercepts upload traffic
**Mitigation:**
- TLS 1.3 for all network traffic
- Certificate pinning (post-launch)
- Photos encrypted before upload
- Only encrypted blobs transmitted

**Result:** ✅ Attacker sees encrypted traffic only

---

#### 5. Account Takeover
**Scenario:** Attacker steals user credentials
**Mitigation:**
- Private album keys require passphrase (not stored)
- Hardware-backed keys require biometric
- Key rotation on suspicious activity
- Audit logs track all access

**Result:** ✅ Limited access without device + biometric

---

#### 6. Legal/Government Request
**Scenario:** Court order demands user data
**Mitigation:**
- Family album keys encrypted with user public key
- Private album keys not stored anywhere
- Only user can decrypt their own data
- Transparent disclosure policy

**Result:** ✅ We cannot provide plaintext data

---

### ⚠️ PARTIALLY PROTECTED

#### 7. Device Compromise (Unlocked)
**Scenario:** Malware on unlocked device
**Mitigation:**
- Memory wiping after crypto operations
- Keys protected by OS-level security
- No plaintext caching

**Limitation:** ⚠️ If device is unlocked, attacker may access decrypted data in memory

---

#### 8. AI Processing Visibility
**Scenario:** Google AI service sees photo during processing
**Mitigation:**
- Only with explicit user consent
- Temporary processing (deleted within 1 hour)
- Not used for training
- Comprehensive audit logs

**Limitation:** ⚠️ Temporary visibility required for cloud AI features

---

### ❌ NOT PROTECTED AGAINST

#### 9. Physical Device Theft (Unlocked)
**Scenario:** Thief steals unlocked, unencrypted device
**Mitigation:** User education, OS-level encryption
**Limitation:** ❌ No app-level defense possible

---

#### 10. User Error (Lost Passphrase)
**Scenario:** User forgets master passphrase for Private Album
**Mitigation:** Recovery methods, repeated warnings
**Limitation:** ❌ Private album data unrecoverable by design

---

#### 11. Social Engineering
**Scenario:** Attacker tricks user into sharing photos
**Mitigation:** User education, UI warnings
**Limitation:** ❌ Cannot prevent user from sharing willingly

---

#### 12. Traffic Analysis
**Scenario:** Attacker analyzes upload patterns to infer behavior
**Mitigation:** (Future) Traffic obfuscation, padding
**Limitation:** ⚠️ Patterns may leak metadata (not P0)

---

## Security Guarantees

### What We Guarantee

✅ **Zero-Knowledge Storage**
- We cannot decrypt your photos
- Database dumps reveal nothing
- Storage breaches reveal nothing

✅ **User Control**
- You choose encryption level
- You control AI consent
- You manage recovery methods

✅ **Transparency**
- All AI processing logged
- Consent clearly disclosed
- Privacy dashboard shows everything

### What We Don't Guarantee

❌ **Zero-Knowledge AI**
- Cloud AI requires seeing photos
- We are honest about this trade-off

❌ **Device Security**
- Cannot protect against device malware
- Cannot protect against physical theft

❌ **User Error Protection**
- Lost passphrases are unrecoverable
- User must manage recovery methods

---

## Risk Assessment Matrix

| Threat | Likelihood | Impact | Mitigation Priority |
|--------|-----------|--------|---------------------|
| Database breach | Medium | Critical | ✅ P0 (Complete) |
| Storage breach | Medium | Critical | ✅ P0 (Complete) |
| Malicious insider | Low | Critical | ✅ P0 (Complete) |
| MITM attack | Low | High | ✅ P0 (Complete) |
| Account takeover | Medium | High | ✅ P0 (Complete) |
| Device theft (locked) | Medium | Medium | ✅ P0 (Complete) |
| Device theft (unlocked) | Low | High | ⚠️ P1 (User education) |
| Traffic analysis | Low | Low | ⚠️ P2 (Future) |
| Lost passphrase | High | Medium | ⚠️ P0 (UX warnings) |

---

## Security Assumptions

### What We Assume

1. **Cryptographic Primitives Work**
   - AES-256-GCM is secure
   - Argon2id is secure
   - RSA-4096 is secure (pre-quantum)
   - Web Crypto API is correctly implemented

2. **Platform Security**
   - iOS Secure Enclave is secure
   - Android Keystore is secure
   - TLS 1.3 is secure
   - Firebase infrastructure is secure

3. **User Behavior**
   - Users will not share passphrases
   - Users will enable biometric auth
   - Users will configure recovery methods
   - Users will lock their devices

### What We Don't Assume

❌ Users will read security warnings
❌ Users will remember complex passphrases
❌ Devices are free from malware
❌ Network is always secure

---

## Incident Response

### If Breach Detected

1. **Immediate Actions** (< 1 hour)
   - Revoke all affected keys
   - Force password resets
   - Enable additional auth factors

2. **Investigation** (< 24 hours)
   - Determine scope
   - Identify attack vector
   - Assess data exposure

3. **Remediation** (< 72 hours)
   - Patch vulnerability
   - Notify affected users
   - Update security controls

4. **Post-Mortem** (< 1 week)
   - Document incident
   - Update threat model
   - Implement preventions

### Notification Requirements

- **GDPR:** Within 72 hours of discovery
- **Users:** Immediate if personal data exposed
- **Regulators:** As required by jurisdiction

---

## Compliance

### Standards Followed

- ✅ OWASP Mobile Top 10
- ✅ NIST Cryptographic Standards
- ✅ GDPR Privacy Requirements
- ✅ Apple App Store Security Guidelines
- ✅ Google Play Security Requirements

---

**Last Updated:** December 2024
**Version:** 1.0.0
**Next Review:** March 2025
