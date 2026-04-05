# FireTech Messager Server - Final Report and Design Document

Course deadline context: Week 13 (10 April)

Repository (public): https://github.com/dhurghamCreation/FireTech-Messager-Server
Live deployment target: https://firetech-messager-server.onrender.com

---

## Abstract

FireTech Messager Server is a real-time web chat application inspired by modern community chat platforms. The project provides authenticated user access, channel-based communication, direct messaging, profile editing, friend requests, a shop/inventory module, and responsive browser-based UI interactions. The backend uses Node.js, Express, Socket.IO, and Sequelize with PostgreSQL for persistence. The frontend is implemented with HTML, CSS, and vanilla JavaScript.

The main engineering objectives were:
- Deliver low-latency real-time messaging across clients.
- Keep account and message data persistent across restarts.
- Support deployment on cloud infrastructure and reproducible local/server execution.
- Provide a clean user interface across desktop/mobile form factors.

The delivered system is reproducible on Ubuntu servers, Raspberry Pi devices, and Render cloud deployment (with PostgreSQL configured).

---

## Methodology

### 1) Development Method

An iterative implementation approach was used:
1. Build baseline chat server/client.
2. Add authentication and user profile management.
3. Add persistent storage and schema design.
4. Add social and gamification features (friends/shop/inventory).
5. Improve deployment, HTTPS, and reliability.
6. Validate with functional and non-functional checks.

### 2) Block Diagram

```text
[ Browser Client (index.html + client.js) ]
            |  HTTPS + REST + Socket.IO
            v
[ Node.js + Express + Socket.IO (server.js) ]
            |  Sequelize ORM
            v
[ PostgreSQL Database ]

Optional cloud runtime:
[ Render Web Service ] ----> [ Render/Managed PostgreSQL ]
```

### 3) Functional Requirements (FRD)

Implemented FRs:
1. User registration/login with token-based authentication.
2. Real-time channel messaging with Socket.IO.
3. Persistent user/account/message data in PostgreSQL.
4. Profile read/update APIs.
5. Friend requests and friend list management.
6. Shop listing, purchase flow, and inventory tracking.
7. Media-enabled messaging support fields and upload handling.
8. Deployment support for cloud hosting (Render) and local/server installs.

Partially met FRs:
1. Voice/video calling support is scaffolded but full production-grade voice rooms are not fully complete end-to-end.
2. Some advanced moderation/admin controls are limited.

Not fully met FRs:
1. Advanced role-permission hierarchy per channel/server.
2. Full message reaction/threading/search system.

### 4) Non-Functional Requirements (NFR)

Implemented NFRs:
1. Security: password hashing (bcrypt), token auth (JWT), environment variable secrets.
2. Availability: startup retry for transient PostgreSQL connectivity failures.
3. Performance: event-based real-time architecture with Socket.IO.
4. Portability: runs on Windows, Ubuntu, Raspberry Pi, and Render cloud.
5. Maintainability: modular endpoint/event structure and project documentation.

Partially met NFRs:
1. Scalability: current design is suitable for small-medium loads; horizontal scaling strategy is not fully implemented.
2. Observability: logs exist, but centralized monitoring/alerting is limited.

Not fully met NFRs:
1. Automated integration/performance test suite coverage.
2. Full CI/CD quality gates and load testing pipeline.

---

## Implementation

### 1) Tools and Technology Stack

Backend:
- Node.js
- Express.js
- Socket.IO
- Sequelize ORM
- PostgreSQL
- bcryptjs, jsonwebtoken, multer, cors, dotenv

Frontend:
- HTML5
- CSS3
- Vanilla JavaScript
- Font Awesome icons

DevOps/Deployment:
- GitHub (version control/public repository)
- Render (web service deployment)
- render.yaml infrastructure blueprint

### 2) Core Implementation Details

Authentication and security:
- Registration/login endpoints.
- Password hashing with bcrypt.
- JWT token generation and middleware verification.

Persistence and data model:
- Sequelize models include User, Channel, Message, ShopItem, Inventory, FriendRequest, DirectMessage.
- PostgreSQL connection via DATABASE_URL.
- Production check blocks startup when DATABASE_URL is missing.
- Retry mechanism handles transient DB startup errors.

Real-time system:
- Socket.IO for online presence, room membership, message delivery, and typing/member updates.

Deployment readiness:
- Dynamic port support via process.env.PORT.
- Render blueprint includes health check and DB binding options.
- Linux reproducibility steps added in README.

### 3) Reproducibility Evidence (Ubuntu / Raspberry Pi)

From README reproducibility section:
1. Install apt packages (Node dependencies + PostgreSQL).
2. Clone public repo.
3. Create PostgreSQL user/database.
4. Configure .env with DATABASE_URL/JWT_SECRET.
5. npm install + npm start.
6. Validate `/api/version` endpoint.

This workflow supports both Ubuntu server and Raspberry Pi OS (Debian-based).

### 4) Front Layout Figures/Screenshots (Required)

Insert these screenshots in the final Word report:
1. Figure 1 - Login/Register page.
2. Figure 2 - Main chat interface with channel list.
3. Figure 3 - Friends modal.
4. Figure 4 - Shop modal and inventory.
5. Figure 5 - Mobile responsive view.
6. Figure 6 - Render deployment live status/logs.

Suggested caption style: "Figure X. <Short description>"

---

## Team Participation and Management

Use this section for team-shared report part.

### 1) Team Roles and Participation

Replace with your actual team details:

| Member | Role | Main Contributions |
|---|---|---|
| Member A | Backend Lead | API endpoints, DB schema, deployment fixes |
| Member B | Frontend Lead | UI screens, responsive layout, client logic |
| Member C | QA/Docs | Testing, README/report, screenshot preparation |

### 2) Project Management Approach

- Used a requirement-driven approach with FR/NFR checkpoints.
- Split work into backend, frontend, deployment, and validation tasks.
- Conducted periodic merge/review updates through GitHub commits.

### 3) Meetings and Progress Tracking (last two weeks)

Document your exact tools and cadence (example):
- Communication: WhatsApp/Discord/Telegram.
- Task tracking: GitHub Issues + shared checklist.
- Meeting schedule: 3 short sync meetings per week + daily chat updates.
- Progress evidence: commit timeline and feature completion log.

### 4) FRDs Not Met

- Full production-grade voice/video calls with robust TURN enforcement and complete UX controls.
- Advanced threaded conversations and reactions.

### 5) NFRs Not Met

- Comprehensive automated test coverage for all API/socket flows.
- Full observability stack (metrics dashboards, alerting, tracing).

### 6) How the Application Was Improved

- Added production-safe DATABASE_URL validation.
- Added DB startup retry logic for transient network resets.
- Added Render deployment blueprint improvements.
- Added Ubuntu/Raspberry Pi reproducibility instructions.
- Added in-code GenAI usage disclosure comments.

---

## Reflection (Individual - must differ per member)

Important: this section must be written separately by each team member in their own words.

### Template for Each Member

1. Learning experience and self-learning:
- What technical concepts were learned (real-time events, auth, DB design, deployment).
- What was learned independently and how.

2. How GenAI was used:
- Mention specific coding tasks where GenAI helped (scaffolding, debugging, refactoring, deployment fixes).
- Mention that report writing itself was done by the student, not GenAI, per course policy.

3. How GenAI helped self-learning:
- Faster explanation of unfamiliar errors.
- Alternative implementation options.
- Clarifying architecture trade-offs.

4. Where GenAI was not helpful:
- Cases where generated code was outdated/inaccurate for this codebase.
- Required manual verification from official docs, peers, or Stack Overflow.

5. Previous programming experience:
- Describe prior exposure to JS/Node/web apps/databases.

6. Why tools were chosen:
- Node/Express/Socket.IO for rapid real-time web app development.
- PostgreSQL + Sequelize for structured persistence.
- Render for simple deployment workflow.
- Mention whether choices came from self-learning, online docs, or GenAI suggestions.

---

## GenAI Compliance Statement

GenAI was used for selected coding support tasks only. Disclosures were added directly in code comments in:
- server.js
- client.js
- index.html

Each disclosure includes prompt summaries used to generate or improve those sections.

No claim is made that GenAI authored final report reflection content; each team member must provide an individual reflection.

---

## Submission Checklist

1. Public GitHub repository link included.
2. Reproducible Ubuntu/Raspberry Pi setup instructions included.
3. Design and implementation details included.
4. FR/NFR met and unmet points included.
5. Team management/process section included.
6. Individual reflection section prepared separately per member.
7. Front layout screenshots inserted with captions.
8. GenAI usage disclosures added in code comments.

---

## Appendix A - Key Runtime Variables

- PORT
- HOST
- NODE_ENV
- DATABASE_URL
- JWT_SECRET
- CORS_ORIGIN
- TURN_URLS (optional)
- TURN_USERNAME (optional)
- TURN_CREDENTIAL (optional)

## Appendix B - Key Verification Endpoints

- GET /api/version
- POST /api/register
- POST /api/login
- GET /api/profile/:userId
- GET /api/rtc-config
