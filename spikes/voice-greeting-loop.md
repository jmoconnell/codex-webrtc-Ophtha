# Voice Greeting Loop Spike Plan

## 1. Objectives & Success Criteria
- Demonstrate end-to-end voice session: patient browser authenticates, joins WebRTC call, GPT Realtime streams greeting, audio plays back within 2 seconds of connect.
- Measure baseline media latency (capture round-trip audio time and transcript delay).
- Validate browser permission prompts, token handoff, and TURN connectivity in a controlled environment.
- Produce notes on gaps (API limits, bandwidth issues, auth friction) to inform production design.

### Success Metrics
- Connection setup (post-login to greeting playback) in < 6 seconds.
- Audio round-trip latency < 500 ms average during greeting exchange.
- Stable stream for at least 60 seconds without disconnect.
- Ability to capture transcript snippet for audit log proof-of-concept.

## 2. Scope & Assumptions
- Single patient-facing flow; clinician/MD dashboards out of scope.
- Use temporary auth (pre-seeded demo accounts) without full MFA to reduce setup time.
- No persistence of PHI beyond transient session logs; store metrics locally for analysis.
- Rely on OpenAI GPT Realtime model (Aug 28 2025) for STT+TTS+LLM streaming.
- Target modern Chromium browser on desktop for initial tests; mobile/safari deferred.

## 3. Minimal Stack Selection
- **Frontend**: Vite + React SPA for login screen, WebRTC session page, basic chat/log view.
- **Auth Stub**: Lightweight Node/Express server issuing signed JWT after username/password+DOB check against in-memory list.
- **Signaling & Session Service**: Node/Express + ws (or Fastify) managing WebSocket signaling, generating WebRTC offers for AI endpoint, and relaying GPT tokens.
- **Media Handling**: Use OpenAI’s Realtime WebRTC endpoint as remote peer; configure TURN via OpenAI or custom coturn if needed.
- **Env Mgmt**: dotenv for secrets, pnpm/npm for dependencies.
- **Instrumentation**: Simple metrics logging (timestamps, latency) via console and optional Influx/CSV dump.

## 4. Implementation Steps
1. **Bootstrap Repo Structure**
   - `/frontend` React app (login page, session view with audio indicator, transcript panel).
   - `/server` Node service for auth + signaling + GPT orchestration.
   - Common `.env` templates and README instructions.
2. **Authentication Stub**
   - Implement `/api/login` endpoint verifying hard-coded demo users; return JWT with short TTL.
   - Protect `/api/session-token` endpoint requiring JWT; issue ephemeral session credentials.
3. **WebRTC Signaling Flow**
   - Set up WebSocket channel for exchanging SDP/ICE between browser and server.
   - Server requests new GPT Realtime session (OpenAI Realtime Sessions API) and retrieves AI peer offer.
   - Relay SDP answer back to browser; manage ICE candidates bi-directionally.
4. **Voice Pipeline Integration**
   - Configure GPT Realtime with system prompt for greeting persona.
   - Subscribe to streaming transcript events; forward text to frontend for UI log.
   - Ensure TTS audio from GPT Realtime is routed back through WebRTC connection to browser.
5. **Greeting Trigger**
   - Upon first user connection, send `session.update` with greeting script (introduce assistant, consent reminder).
   - Optionally play short chime before greeting.
6. **Latency Measurements**
   - Timestamp key events: login success, SDP exchange completion, first audio frame received, first transcript item.
   - Render metrics overlay in frontend; log to server for analysis.
7. **Permissions & Errors**
   - Handle mic permission denial gracefully (prompt alternative path).
   - Capture and display connection errors, ICE failure reasons.
8. **Testing & Demo Script**
   - Manual test plan covering initial login, session start, greeting playback, disconnect.
   - Document instructions for reproducing spike with required environment variables (API key, TURN credentials).

## 5. Validation & Deliverables
- Working demo accessible via localhost with README walkthrough.
- Log file summarizing latency metrics and qualitative observations.
- Identified blockers (e.g., missing TURN, audio glitches) with proposed mitigations.
- Recommendation on production approach based on spike results.

## 6. Risks & Mitigations
- **TURN/Firewall issues**: fall back to public STUN/TURN services; document network requirements.
- **Browser autoplay restrictions**: ensure greeting audio starts after user interaction (e.g., click “Connect”).
- **Model quota/limits**: monitor OpenAI rate limits; include retry/backoff.
- **Latency variability**: run multiple trials, note network environment.

## 7. Follow-Up Questions
- Are we targeting shared OpenAI TURN infrastructure or deploying dedicated coturn for PHI compliance?
- Do we need voice consents recorded as audio snippets during spike?
- Should we integrate provisional logging to S3 or keep local only for now?

