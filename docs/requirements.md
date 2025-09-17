# AI Ophthalmology Assistant Requirements

## 1. Purpose & Scope
- Deliver a voice-first ophthalmology assistant that handles delegated patient interactions (triage, education, follow-ups) under supervising MD oversight.
- Support multimodal data ingestion (live video, images, documents) for diagnosis support and visit documentation.
- Maintain compliance with HIPAA and relevant telehealth regulations while integrating GPT Realtime (Aug 28 2025 version) for conversational intelligence.

## 2. Stakeholders
- **Patients**: Existing and new ophthalmology/optometry patients receiving remote guidance.
- **Supervising Physicians (MD/OD)**: Review, supervise, and intervene during AI-assisted encounters.
- **Clinical Support Staff**: Technicians, schedulers, triage nurses supporting visit prep and follow-up tasks.
- **Compliance & Security Admins**: Oversee privacy, auditing, and regulatory adherence.
- **Platform Operations**: Maintain infrastructure, observability, and deployment.

## 3. User Roles & Permissions
- **Patient**: Initiate sessions, share audio/video, upload ophthalmic images and documents, view visit summaries.
- **AI Assistant**: Provide scoped medical guidance through GPT Realtime; invoke approved backend functions only.
- **Supervising MD/OD**: Monitor live sessions, join/override audio, approve outputs, annotate records.
- **Clinical Staff**: Manage patient queue, review uploads, schedule follow-ups, prepare charts.
- **Administrator**: Provision accounts, manage permissions, review audit logs.
- Apply least-privilege RBAC aligned with HIPAA and log all sensitive access.

## 4. Visit Scenarios
- **Initial Intake**: Collect chief complaint, history, medication review; flag high-risk symptoms for MD handoff.
- **Post-Op & Chronic Follow-Up**: Monitor recovery metrics, medication adherence, symptom changes.
- **Medication Refill Check**: Confirm indications, review contraindications, prepare request for MD approval.
- **Urgent Symptom Triage**: Identify red-flag symptoms (vision loss, severe pain) and escalate.
- **Lab/Imaging Review**: Walk patient through results; allow MD to annotate and approve explanations.
- Define required inputs, outputs, and escalation triggers per scenario.

## 5. Authentication & Identity Proofing
- Pre-register patients with username + strong password (min length, complexity, breach checks) and DOB verification.
- Enforce MFA (SMS/email OTP or authenticator app) especially for PHI access.
- Clinicians/staff use SSO or federated identity with role assertions.
- Secure credential storage (Argon2/bcrypt) and encrypt DOB/PHI at rest.
- Implement throttling, account lockouts, and comprehensive audit logs.
- Present privacy notice and telehealth consent on first login; store acceptance timestamps.

## 6. First Login Greeting Flow
- After authentication, redirect patients to visit lobby; request mic/camera permissions immediately.
- Auto-initialize WebRTC session and GPT Realtime stream; play scripted TTS greeting while showing chat transcript.
- Provide visual connection status, waveform activity, and controls to pause voice or switch to text.
- Ensure clinicians/staff bypass auto-greeting and land on dashboards instead.

## 7. Realtime Interaction & Media Handling
- WebRTC audio/video with target <500 ms round-trip audio latency; adaptive bitrate for bandwidth fluctuations.
- Streaming STT/TTS pipeline integrated with GPT Realtime; support multilingual voices roadmap.
- Maintain synchronized chat log with timestamps, captions, and searchable transcripts.
- Support screen sharing, image annotation (fundus, OCT, visual fields), and document viewer for PDFs.
- Enforce file type whitelist, max upload sizes, anti-malware scanning, and per-upload metadata tagging.

## 8. AI Behavior & Safety Controls
- Structured prompting defining scope of practice, disclaimers, consent reminders, and escalation thresholds.
- Function calling for EHR lookups, scheduling, medication database queries with strict approval rules.
- Real-time moderation and hallucination detection; auto-escalate flagged responses to MD review.
- Capture prompt/response pairs, decisions, and escalations for audit while applying PHI safeguards.
- Provide MD "whisper" channel to guide AI without exposing content to patient.

## 9. Supervising MD Experience
- Dashboard with live session monitor, ability to join audio/video, annotate transcripts, approve or edit patient instructions.
- Review queue for pending escalations, lab results, and visit summaries awaiting sign-off.
- Analytics on assistant performance, unresolved escalations, and patient satisfaction metrics.

## 10. Documentation & Handoff Requirements
- Auto-generate visit summaries, action plans, and medication recommendations pending MD approval.
- Push finalized notes and structured data back to EHR (FHIR resources where possible).
- Store transcripts, audio, video, and uploaded media with retention policies and secure access controls.
- Enable patient access to summaries only after MD approval; audit all downloads.

## 11. Compliance & Security
- HIPAA-compliant encryption in transit (TLS 1.3+) and at rest (FIPS 140-2 validated modules).
- Obtain BAAs with OpenAI and any third-party service; document data flow diagrams.
- Implement comprehensive audit logging, tamper-resistant storage, and periodic access reviews.
- Define data residency, backup/DR, incident response, vulnerability scanning, and penetration testing cadence.
- Address state-by-state telehealth regulations, consent requirements, and licensure coverage for MDs.

## 12. Integrations
- EHR/EMR APIs for patient demographics, allergies, meds, visit history; support bidirectional sync.
- Scheduling systems for booking follow-ups and MD consults.
- Insurance eligibility verification and payment processing (if needed).
- Identity verification services (KBA, photo ID) for new patient onboarding.

## 13. Non-Functional Requirements
- Availability target 99.5% monthly; graceful degradation when GPT Realtime unavailable (fallback to text guidance or live staff).
- Horizontal scalability for concurrent sessions; prioritize low-latency media routing.
- Observability (metrics, logs, traces) with automated alerting.
- Accessibility compliance WCAG 2.1 AA (captions, high-contrast, keyboard navigation).
- Privacy-by-design: minimize data capture, apply data retention limits, support deletion/exports.

## 14. Open Questions
- Jurisdictions/licensure where service operates and corresponding regulatory nuances.
- Scope of delegated advice vs. mandatory MD involvement per visit type.
- Storage location and residency requirements for PHI.
- MD workload expectations for reviewing/approving AI outputs.
- Knowledge base curation and update responsibilities.
- Contingency plan when patients decline voice or lack compatible devices.

## 15. Next Steps
1. Review requirements with clinical, compliance, and product leads; document feedback.
2. Prioritize scenarios and define MVP vs. phased enhancements.
3. Select technical stack and draft system architecture diagrams.
4. Prototype WebRTC + GPT Realtime greeting flow with guardrails.
5. Outline testing/validation plan (clinical pilot, security assessment, usability studies).
