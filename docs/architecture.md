# AI Ophthalmology Assistant Architecture Blueprint

## 1. Architectural Goals
- Deliver low-latency voice-first interactions (sub-500 ms audio RTT) with fallback to text/video.
- Enforce HIPAA-grade security, auditing, and data segregation across all services.
- Enable MD supervision and intervention in real time while keeping the AI assistant within approved scope.
- Support gradual feature expansion (e.g., additional languages, devices) through modular services.
- Provide resilience when GPT Realtime or media services are degraded via graceful fallback modes.

## 2. High-Level Component Map
```
[Patient/Clinician Clients]
   |  (HTTPS/WebRTC)                     
[Edge: CDN + WAF]                        
   |                                     
[API Gateway]----->[Auth Service]---->[Identity Provider / MFA]
   |                    |
   |                    +-->[User Directory / PHI DB]
   v
[Session Orchestrator]--------------------+
   |                                      |
   |                         [Compliance & Audit Service]
   |                                      |
   +-->[Realtime Media Layer (SFU/MCU)]---+---[Voice I/O Service (STT/TTS)]
             |                     |                 |
             |                     |                 v
             |                     |      [GPT Realtime Orchestrator]
             |                     |                 |
             |                     v                 v
             |            [Assistant Policy Engine]  |
             |                     |                 |
             |                     +-->[Function Gateway]--->[EHR/Billing/Schedule APIs]
             v
   +-->[Content & Artifact Service]---->[Object Storage (images, PDFs, video)]
   |
   +-->[Transcription & Summary Service]-->[Document Store / Vector Index]

[Monitoring & Observability Stack] taps all services
```

## 3. Client Applications
- **Patient Web Client**: SPA (React/Next as baseline) that handles login (username/password/DOB + MFA), mic/camera permissions, WebRTC session, chat log, media uploads, and accessibility controls.
- **Clinician Dashboard**: Role-aware SPA view showing session queue, live monitor, join/override controls, transcript review, escalation approvals, analytics.
- **Admin Console**: Limited-access interface for provisioning, audit review, and system health.
- **Device Support**: Desktop browsers (Chromium, Safari), mobile web PWA baseline; native wrappers optional in later phases.

## 4. Realtime Media & Voice Stack
- **Signaling**: Session Orchestrator handles WebRTC signaling (offer/answer exchange) via secure WebSocket; stores session state.
- **Media Routing**: Deploy scalable SFU (e.g., Mediasoup, LiveKit) for audio/video distribution; configure TURN/ICE servers for NAT traversal.
- **Voice Processing Pipeline**:
  - Patient audio is streamed through SFU to Voice I/O Service.
  - STT engine performs streaming transcription (OpenAI Realtime STT or hybrid with domain vocabulary tuning).
  - Transcripts feed GPT Realtime Orchestrator via streaming API; assistant responses returned incrementally.
  - TTS engine synthesizes assistant audio and returns to patient via SFU; text mirrored in chat UI.
- **Fallback Modes**: When bandwidth low or permissions denied, downgrade to audio-only or text chat while maintaining continuous transcripts.

## 5. AI Orchestration Layer
- **GPT Realtime Orchestrator**: Manages session context, prompt templates, persona instruction, and streaming interactions with OpenAI’s Aug 28 2025 Realtime endpoint.
- **Assistant Policy Engine**: Enforces rules, checks for scope violations, inserts disclaimers, triggers escalation flows based on symptom keywords or model uncertainty.
- **Safety Filters**: Integrate moderation endpoints and custom heuristics (e.g., hallucination detector, differential diagnosis guardrails).
- **Function Gateway**: Exposes vetted functions (EHR fetch, scheduling, medication DB) using secure API keys or service accounts; maintains allowlists per role.
- **MD Whisper Channel**: Separate low-latency text channel enabling supervising physicians to inject guidance that is visible to assistant but hidden from patient.

## 6. Core Backend Services
- **Auth Service**: Handles credential verification (Argon2/bcrypt hashes), DOB check, MFA challenges, session tokens (short-lived JWT + refresh). Integrates with external IdP for clinicians.
- **Session Orchestrator**: Coordinates lifecycle of visits, maintains participant roster, manages state transitions (greeting, active consult, escalation, wrap-up).
- **Content & Artifact Service**: Receives uploads (images, PDFs), scans for malware, extracts metadata (e.g., exam type, eye), stores in encrypted object storage, and links to session.
- **Transcription & Summary Service**: Persists streaming transcripts, generates visit summaries and action plans, queues items for MD approval.
- **Compliance & Audit Service**: Centralizes audit logs, access records, consent receipts, escalation events; writes to append-only storage (e.g., WORM bucket).
- **Integration Hub**: Connectors for EHR/EMR (FHIR), scheduling, billing, insurance eligibility, identity verification.
- **Notification Service**: Sends alerts to MD/staff for escalations via secure email/SMS/in-app notifications.

## 7. Data Storage Layer
- **Primary PHI Database**: Encrypted relational DB (PostgreSQL with row-level security) storing user profiles, visit metadata, consents, configuration.
- **Session Store**: In-memory cache (Redis) for active session state, WebRTC tokens, rate limiting counters.
- **Artifact Storage**: Encrypted object store (S3-compatible) for media uploads, assistant audio, video recordings.
- **Document Repository**: Searchable store (OpenSearch/Elastic) for transcripts, summaries, MD annotations; backed by long-term archive.
- **Vector Index**: Optional embedding store for knowledge base retrieval augmented generation (RAG) with domain-safe content.
- **Audit Log Vault**: Write-once storage with retention policies meeting HIPAA and regulatory requirements.

## 8. Security & Compliance Controls
- TLS 1.3 across all HTTPS/WebSocket channels; DTLS-SRTP for WebRTC media encryption.
- Fine-grained RBAC enforced at API Gateway and within services; privilege escalation detection.
- PHI encryption at rest with key management via HSM/KMS; periodic key rotation.
- Comprehensive logging with immutable audit trail, anomaly detection, and SIEM integration.
- Data minimization: only relevant clinical context retrieved per visit; implement data retention and deletion workflows.
- Business Associate Agreements with OpenAI and infrastructure vendors; document data flow diagrams and perform DPIAs/PIAs.
- Continuous security testing: SAST/DAST, penetration tests, tabletop incident response drills.

## 9. Observability & Operations
- **Monitoring Stack**: Metrics (Prometheus), logs (ELK or OpenSearch), traces (OpenTelemetry) aggregated into NOC dashboard.
- **Alerting**: On-call rotations, alert thresholds for latency, error rates, dropped media packets, GPT Realtime failures, security anomalies.
- **CI/CD**: Git-based pipelines with automated tests, security scans, infrastructure as code (Terraform), blue/green or canary deploys.
- **Resilience**: Multi-AZ deployment, auto-scaling for SFU and AI services, message queues to buffer events during outages.
- **Disaster Recovery**: Daily encrypted backups, tested restore runbooks, RTO/RPO targets aligned with regulatory expectations.

## 10. Data Flow Highlights
1. Patient authenticates via Auth Service -> receives session token -> redirected to visit lobby.
2. Session Orchestrator establishes WebRTC signaling; media flows through SFU to Voice I/O.
3. STT streams transcript to GPT Realtime Orchestrator -> assistant responds -> TTS returns voice through SFU and text to UI.
4. Assistant requests patient data via Function Gateway -> Integration Hub -> EHR; responses filtered by policy engine before use.
5. Escalation triggers notify Supervising MD via Notification Service; MD joins session or reviews queue in dashboard.
6. Visit artifacts stored by Content Service; summaries queued for MD approval -> after sign-off, Integration Hub posts to EHR and patient portal.
7. Audit Service records all access and decisions; monitoring stack tracks system health.

## 11. Fallback & Graceful Degradation
- If GPT Realtime unavailable: switch to scripted flows, route to live staff, or display message encouraging call-in.
- If WebRTC fails: switch to PSTN bridge or asynchronous chat with delayed voice notes.
- Maintain offline queue for uploads when connectivity intermittent; sync when connection restored.

## 12. Future Considerations
- Native mobile apps with push notifications and local biometrics.
- Expanded language support and on-device edge STT for low bandwidth regions.
- Integration with ophthalmic diagnostic devices (OCT, autorefractors) via secure device gateways.
- Federated learning or feedback loops with MD-approved cases to enhance domain prompts while maintaining privacy.
- Analytics dashboards for outcomes tracking and quality assurance.
