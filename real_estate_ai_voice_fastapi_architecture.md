# Real Estate AI Voice Lead Capture — FastAPI Backend Architecture

## 1. Purpose

This document defines the backend architecture for a production-oriented AI voice lead capture platform for real-estate businesses.

Core workflow:

Customer calls
→ Telephony provider
→ FastAPI voice layer
→ AI conversation / extraction
→ Lead service
→ PostgreSQL
→ Existing client CRM
→ Dashboard

The system is a modular monolith. It is intentionally not a microservices architecture.

Primary goals:

- Clean separation of responsibilities
- Strong validation and predictable errors
- Multi-tenant data isolation
- Reliable CRM synchronization
- AI provider independence
- Voice provider independence
- Testability
- Production-oriented failure handling
- Lightweight local development without Docker

---

# 2. Architecture Principles

## 2.1 Modular monolith

There is one FastAPI application, but internally it is divided into clear modules.

Do not create microservices prematurely.

The initial system should be:

Next.js
→ FastAPI
→ PostgreSQL

with external integrations for:

- LLM
- Telephony
- CRM

## 2.2 Dependency direction

Normal API flow:

Routes
→ Services
→ Repositories
→ Database

External integration flow:

Services
→ Integration interfaces
→ Provider adapters
→ External API

AI flow:

Services / Voice
→ AI layer
→ LLM provider

Routes must not contain business logic.

Repositories must not contain business workflows.

AI code must not directly manipulate the database.

CRM adapters must not decide business rules.

---

# 3. High-Level Architecture

```text
                         CUSTOMER
                            |
                         Phone Call
                            |
                            v
                    +---------------+
                    |  TELEPHONY    |
                    |    TWILIO     |
                    +-------+-------+
                            |
                     Webhook / Events
                            |
                            v
+--------------------------------------------------------------+
|                         FASTAPI                              |
|                                                              |
|  +-----------+       +-----------+       +---------------+   |
|  |   Voice   | ----> | AI Agent  | ----> | Lead Service  |   |
|  |  Service  |       |           |       |               |   |
|  +-----------+       +-----+-----+       +-------+-------+   |
|                              |                     |           |
|                              v                     v           |
|                             LLM               PostgreSQL      |
|                                                    |           |
|                                                    v           |
|                                              CRM Service       |
|                                                    |           |
|                                                    v           |
|                                             CRM Provider       |
+----------------------------------------------------+----------+
                                                     |
                                                     v
                                               Client CRM


                         +-------------+
                         |   Next.js   |
                         |  Dashboard  |
                         +------+------+ 
                                |
                              REST API
                                |
                                v
                             FastAPI
```

---

# 4. Backend Directory Structure

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   ├── router.py
│   │   └── routes/
│   │       ├── auth.py
│   │       ├── leads.py
│   │       ├── calls.py
│   │       ├── voice.py
│   │       ├── crm.py
│   │       └── health.py
│   │
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── exceptions.py
│   │   └── logging.py
│   │
│   ├── db/
│   │   ├── session.py
│   │   ├── base.py
│   │   └── dependencies.py
│   │
│   ├── models/
│   │   ├── company.py
│   │   ├── user.py
│   │   ├── lead.py
│   │   ├── call.py
│   │   └── crm_connection.py
│   │
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── lead.py
│   │   ├── call.py
│   │   ├── voice.py
│   │   └── crm.py
│   │
│   ├── services/
│   │   ├── lead_service.py
│   │   ├── call_service.py
│   │   ├── voice_service.py
│   │   └── crm_service.py
│   │
│   ├── repositories/
│   │   ├── lead_repository.py
│   │   ├── call_repository.py
│   │   └── crm_repository.py
│   │
│   ├── ai/
│   │   ├── agent.py
│   │   ├── prompts.py
│   │   ├── schemas.py
│   │   └── tools.py
│   │
│   ├── integrations/
│   │   ├── telephony/
│   │   │   ├── base.py
│   │   │   └── twilio.py
│   │   │
│   │   └── crm/
│   │       ├── base.py
│   │       └── hubspot.py
│   │
│   └── utils/
│
├── migrations/
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── alembic.ini
├── pyproject.toml
└── .env
```

---

# 5. `app/main.py`

## Responsibility

Application entry point.

It creates the FastAPI application and registers:

- routers
- middleware
- exception handlers
- startup/shutdown behavior

Conceptually:

```python
app = FastAPI()
app.include_router(api_router)
```

## Should contain

- FastAPI app creation
- application-level configuration
- middleware registration
- router registration
- global exception handlers

## Should NOT contain

- database queries
- lead business logic
- AI calls
- CRM API calls
- telephony business logic

---

# 6. `app/api/router.py`

## Responsibility

Central API router.

It combines all API route modules.

Example route groups:

```text
/api/v1/auth
/api/v1/leads
/api/v1/calls
/api/v1/voice
/api/v1/crm
/api/v1/health
```

This file should primarily assemble routers.

---

# 7. API Route Layer

Location:

```text
app/api/routes/
```

## Responsibility

The route layer is the HTTP boundary.

A route should:

1. Receive the HTTP request
2. Validate request data through Pydantic
3. Resolve authentication dependencies
4. Call a service
5. Convert the result into a response schema
6. Return the HTTP response

Example:

```text
POST /api/v1/leads
        |
        v
LeadCreate
        |
        v
current_user
        |
        v
LeadService.create_lead()
        |
        v
LeadResponse
        |
        v
201 Created
```

## Route layer must NOT

- write SQL queries
- contain complex business rules
- call the LLM directly
- call CRM APIs directly
- construct large workflows
- contain provider-specific logic

---

# 8. Route Modules

## `routes/auth.py`

Handles authentication-related HTTP endpoints.

Possible endpoints:

```text
POST /auth/login
POST /auth/logout
GET  /auth/me
```

Responsibilities:

- receive authentication requests
- call authentication service
- return authenticated user information
- establish/clear session or token state

Authentication implementation should eventually be separated further if it becomes complex.

---

## `routes/leads.py`

Possible endpoints:

```text
POST   /leads
GET    /leads
GET    /leads/{lead_id}
PATCH  /leads/{lead_id}
DELETE /leads/{lead_id}
```

The route calls `LeadService`.

Example:

```text
POST /leads
→ LeadCreate
→ authentication
→ LeadService.create_lead()
→ LeadResponse
→ 201 Created
```

---

## `routes/calls.py`

Possible endpoints:

```text
GET /calls
GET /calls/{call_id}
GET /calls/{call_id}/transcript
```

Responsible for dashboard-facing call APIs.

It should not process the actual telephony webhook itself.

---

## `routes/voice.py`

This is the external webhook boundary.

Possible endpoints:

```text
POST /webhooks/voice
POST /webhooks/voice/events
```

Responsibilities:

- verify provider signature
- parse provider event
- pass event to `VoiceService`
- return provider-compatible response

This route must be extremely thin.

---

## `routes/crm.py`

Possible endpoints:

```text
POST /crm/connect
GET  /crm/status
POST /crm/test
DELETE /crm/disconnect
```

Responsible for CRM connection management.

---

## `routes/health.py`

Possible endpoints:

```text
GET /health
GET /health/ready
```

Example:

```json
{
  "status": "ok"
}
```

Readiness checks can verify required dependencies such as PostgreSQL.

---

# 9. `schemas/`

Pydantic schemas define the API contract.

Schemas describe:

- what the API accepts
- what the API returns
- validation rules

Do NOT treat SQLAlchemy models as your public API contract.

---

# 10. Lead Schemas

File:

```text
app/schemas/lead.py
```

Recommended schemas:

```text
LeadCreate
LeadUpdate
LeadResponse
LeadListResponse
```

## `LeadCreate`

Input from an API client.

Example:

```json
{
  "name": "Rahul Sharma",
  "phone": "+91...",
  "property_type": "3BHK",
  "budget_min": 7000000,
  "budget_max": 8000000,
  "preferred_location": "Wardha Road"
}
```

## `LeadResponse`

Output returned to the frontend.

Do not expose internal secrets or database-only fields.

---

# 11. Database Models

Location:

```text
app/models/
```

These are SQLAlchemy persistence models.

Example:

```text
Lead
├── id
├── company_id
├── name
├── phone
├── email
├── property_type
├── budget_min
├── budget_max
├── preferred_location
├── purchase_timeline
├── purpose
├── status
├── lead_score
├── ai_summary
├── crm_sync_status
├── crm_record_id
├── created_at
└── updated_at
```

Database models represent persistence structure.

They should not contain:

- HTTP behavior
- LLM prompts
- CRM API calls
- telephony behavior

---

# 12. Core Database Entities

## Company

Represents a real-estate business using the platform.

Relationships:

```text
Company
├── Users
├── Leads
├── Calls
└── CRMConnection
```

## User

Represents an employee/agent/admin.

Important fields may include:

```text
id
company_id
name
email
role
created_at
```

## Lead

Represents a potential customer.

## Call

Represents one phone conversation.

One lead may have multiple calls:

```text
Lead
├── Call 1
├── Call 2
└── Call 3
```

## CRMConnection

Stores the relationship between a company and its external CRM.

Credentials must be securely handled. Never expose secrets through API responses.

---

# 13. `db/session.py`

Responsible for SQLAlchemy database engine/session configuration.

Flow:

```text
FastAPI request
→ DB session
→ SQLAlchemy
→ PostgreSQL
```

The application should use dependency injection to provide a session to services/repositories.

Do not create a raw database connection in every route.

---

# 14. `db/dependencies.py`

Contains FastAPI dependencies.

Typical dependencies:

```text
get_db()
get_current_user()
get_current_company()
```

Example:

```text
HTTP request
→ get_current_user()
→ authenticated user
→ route
```

Dependencies should handle cross-cutting request concerns, not business workflows.

---

# 15. `db/base.py`

Provides the SQLAlchemy declarative base and model registration strategy.

All models should ultimately be discoverable by Alembic for migrations.

---

# 16. Repository Layer

Location:

```text
app/repositories/
```

Repositories answer:

> How do I persist and retrieve data?

Example:

```text
LeadRepository
├── create()
├── get_by_id()
├── list()
├── update()
└── delete()
```

Repository returns database entities or appropriate persistence results.

Repositories should not decide:

- whether a lead is qualified
- how lead score is calculated
- whether CRM sync should happen
- what an AI should say

Those are service/domain concerns.

---

# 17. Service Layer

Location:

```text
app/services/
```

This is the main business-logic layer.

## `lead_service.py`

Responsibilities:

- create leads
- update leads
- enforce business rules
- calculate/assign lead state
- coordinate CRM synchronization when appropriate

Example:

```text
create_lead()
→ validate business rules
→ calculate score
→ repository.create()
→ CRM service
→ return lead
```

## `call_service.py`

Responsibilities:

- create call records
- update call state
- store transcript
- retrieve call history
- coordinate post-call processing

## `voice_service.py`

Responsibilities:

- process telephony events
- start/end voice sessions
- coordinate voice-agent operations
- hand completed conversations to call/lead processing

## `crm_service.py`

Responsibilities:

- select the company's CRM provider
- synchronize leads
- handle CRM connection state
- translate provider failures into application-level errors
- coordinate retryable operations

---

# 18. Service vs Repository

This distinction must remain clear.

Repository:

> How do I access the database?

Examples:

```text
get_lead()
save_lead()
update_lead()
```

Service:

> What should the application do?

Examples:

```text
create_qualified_lead()
process_completed_call()
sync_lead_to_crm()
```

Correct:

```text
Route
→ Service
→ Repository
→ Database
```

Incorrect:

```text
Route
→ Database
```

---

# 19. AI Layer

Location:

```text
app/ai/
```

## `agent.py`

Responsible for AI-agent orchestration.

It handles:

- conversation instructions
- model interaction
- tool selection
- conversation state where appropriate

It should not directly write database records.

---

## `prompts.py`

Contains:

- system prompts
- extraction prompts
- summary prompts
- other reusable prompt templates

Do not scatter large prompts throughout routes/services.

---

## `schemas.py`

Contains AI-specific Pydantic schemas.

Example:

```text
ExtractedLead
```

Possible output:

```json
{
  "name": "Rahul Sharma",
  "property_type": "3BHK",
  "budget_min": 7000000,
  "budget_max": 8000000,
  "preferred_location": "Wardha Road",
  "purchase_timeline": "1-2 months"
}
```

---

## `tools.py`

Contains tools available to the AI agent.

Examples:

```text
search_properties()
capture_lead()
request_human_transfer()
get_company_information()
```

The AI should call tools rather than directly manipulating application state.

Correct:

```text
AI
→ tool
→ service
→ repository
```

Incorrect:

```text
AI
→ raw SQL
```

---

# 20. AI Validation

Never blindly trust model output.

Required pipeline:

```text
LLM
→ structured output
→ Pydantic validation
→ business validation
→ database
```

If extraction fails:

1. Preserve the call/transcript
2. Mark extraction as failed
3. Retry if appropriate
4. Avoid losing the original conversation

The transcript is valuable evidence and should not depend on successful AI extraction.

---

# 21. Telephony Integration

Location:

```text
app/integrations/telephony/
```

## `base.py`

Defines the abstraction for a telephony provider.

Conceptually:

```text
TelephonyProvider
├── answer_call()
├── end_call()
├── transfer_call()
└── process_event()
```

The exact interface depends on the chosen provider.

---

## `twilio.py`

Implements the telephony provider interface for Twilio.

The rest of your application should not need to know Twilio-specific implementation details.

Architecture:

```text
VoiceService
→ TelephonyProvider
→ TwilioAdapter
→ Twilio API
```

This makes switching providers possible later.

---

# 22. CRM Integration

Location:

```text
app/integrations/crm/
```

## `base.py`

Defines the common CRM contract.

Conceptually:

```text
CRMProvider
├── create_lead()
├── update_lead()
├── add_note()
└── create_activity()
```

---

## `hubspot.py`

Implements the contract for HubSpot.

Later you could add:

```text
hubspot.py
zoho.py
salesforce.py
```

without changing core lead logic.

---

# 23. CRM Synchronization

The critical rule:

> Local lead creation must not depend on successful CRM synchronization.

Example:

```text
Call completed
→ Lead created locally
→ CRM sync
→ CRM fails
```

The lead must remain in your database.

Recommended state:

```text
PENDING
→ SYNCING
→ SYNCED
```

or:

```text
SYNCING
→ FAILED
→ RETRY
```

Useful fields:

```text
crm_sync_status
crm_record_id
crm_last_error
crm_last_synced_at
```

---

# 24. Error Architecture

File:

```text
app/core/exceptions.py
```

Define application-level errors such as:

```text
LeadNotFoundError
CallNotFoundError
CRMConnectionError
CRMAuthenticationError
VoiceProviderError
AIProcessingError
PermissionDeniedError
```

Global exception handlers convert these into HTTP responses.

Examples:

```text
LeadNotFoundError
→ 404 Not Found
```

```text
PermissionDeniedError
→ 403 Forbidden
```

```text
CRMConnectionError
→ 502 Bad Gateway
```

---

# 25. HTTP Status Conventions

Use predictable status codes.

```text
200 OK
Successful read/update/action

201 Created
Resource successfully created

204 No Content
Successful operation with no response body

400 Bad Request
Malformed or invalid request

401 Unauthorized
Authentication missing/invalid

403 Forbidden
Authenticated but not permitted

404 Not Found
Resource does not exist

409 Conflict
Operation conflicts with current state

422 Unprocessable Entity
Request schema validation failure

429 Too Many Requests
Rate limit exceeded

500 Internal Server Error
Unexpected internal failure

502 Bad Gateway
External upstream provider failure

503 Service Unavailable
Service temporarily unavailable
```

---

# 26. Error Response Format

Use a consistent structure.

Example:

```json
{
  "error": {
    "code": "LEAD_NOT_FOUND",
    "message": "Lead not found",
    "request_id": "req_123"
  }
}
```

For validation errors:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "phone",
        "message": "Invalid phone number"
      }
    ],
    "request_id": "req_123"
  }
}
```

Do not expose:

- stack traces
- API keys
- access tokens
- database credentials
- internal secrets

in production responses.

---

# 27. Authentication and Authorization

Dashboard requests should follow:

```text
Browser
→ FastAPI
→ authentication dependency
→ current user
→ authorization
→ service
```

The backend determines:

1. Who is the user?
2. Which company do they belong to?
3. What role do they have?
4. Can they access this resource?

Example roles:

```text
ADMIN
MANAGER
AGENT
```

The frontend must never be the only place enforcing permissions.

---

# 28. Multi-Tenancy

The platform supports multiple real-estate companies.

Structure:

```text
Company
├── Users
├── Leads
├── Calls
└── CRMConnection
```

Every company-owned resource should have:

```text
company_id
```

Every database query must be scoped to the authenticated company.

Example:

```text
GET /leads/123

Current user
→ company_id = A

Lead 123
→ company_id = B

Result
→ 404 or appropriate authorization response
```

Do not rely on frontend filtering to enforce tenant isolation.

---

# 29. Security Rules

## Never commit secrets

`.env` must be ignored by Git.

Use environment variables for:

```text
DATABASE_URL
LLM_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
CRM_CLIENT_ID
CRM_CLIENT_SECRET
JWT_SECRET
```

## Never return secrets

Do not include:

```text
access_token
refresh_token
client_secret
API keys
```

in response schemas.

## Encrypt sensitive integration credentials

CRM credentials should be protected at rest in production.

## Verify webhooks

Telephony and CRM webhook endpoints must verify provider signatures where supported.

## Rate limit public endpoints

Especially:

```text
auth
webhooks
public lead endpoints
```

---

# 30. Configuration

File:

```text
app/core/config.py
```

Responsible for centralized application settings.

Application code should use:

```text
settings.database_url
settings.llm_api_key
```

rather than repeatedly reading environment variables.

Configuration should support separate environments:

```text
development
test
production
```

---

# 31. Logging

File:

```text
app/core/logging.py
```

Use structured logging.

Example:

```text
INFO call.started
call_id=123
provider_call_id=abc
```

Example:

```text
INFO lead.created
lead_id=456
company_id=789
```

Example:

```text
ERROR crm.sync.failed
lead_id=456
provider=hubspot
```

Never log secrets or unnecessary sensitive customer information.

---

# 32. Request IDs

Each HTTP request should eventually receive a request ID.

Flow:

```text
HTTP Request
→ request_id = abc123
→ services
→ logs
→ error response
```

When debugging production issues:

```text
request_id=abc123
```

allows the entire request path to be traced.

---

# 33. Complete Normal API Flow

Example:

```text
POST /api/v1/leads
        |
        v
Route
        |
        v
LeadCreate validation
        |
        v
Authentication
        |
        v
LeadService.create_lead()
        |
        v
Business validation
        |
        v
LeadRepository.create()
        |
        v
SQLAlchemy
        |
        v
PostgreSQL
        |
        v
Lead model
        |
        v
LeadResponse
        |
        v
201 Created
```

---

# 34. Complete Voice Flow

```text
Customer
    |
    v
Telephony Provider
    |
    v
FastAPI Voice Webhook
    |
    v
VoiceService
    |
    v
AI Agent
    |
    +--> conversation
    |
    +--> tools
    |
    +--> LLM
    |
    v
CallService
    |
    v
Transcript stored
    |
    v
AI Lead Extraction
    |
    v
Pydantic Validation
    |
    v
LeadService
    |
    +-------------------+
    |                   |
    v                   v
PostgreSQL          CRMService
                        |
                        v
                  CRM Provider
                        |
                        v
                    Client CRM
```

---

# 35. Post-Call Processing

When a call ends:

```text
1. Receive call-ended event
2. Verify provider event
3. Update Call status
4. Store transcript
5. Generate summary
6. Extract structured lead
7. Validate extracted lead
8. Create/update Lead
9. Calculate lead score
10. Sync CRM
11. Store CRM record ID
12. Expose result to dashboard
```

If CRM fails:

```text
Lead remains saved locally.
CRM status becomes FAILED.
Retry can happen later.
```

---

# 36. Development Mode

Because the development machine has limited RAM and API credits, the project should support mock mode.

```text
Mock Transcript
      |
      v
FastAPI
      |
      v
AI Extraction
      |
      v
Lead
      |
      v
CRM
      |
      v
Dashboard
```

This lets the backend be developed without making real phone calls for every test.

---

# 37. Live Mode

Production-like flow:

```text
Real Phone
    |
    v
Telephony Provider
    |
    v
FastAPI
    |
    v
Voice Agent
    |
    v
Lead
    |
    v
CRM
    |
    v
Dashboard
```

Core business services should remain the same in both modes.

---

# 38. Testing Architecture

```text
tests/
├── unit/
│   ├── test_lead_service.py
│   ├── test_lead_scoring.py
│   └── test_ai_extraction.py
│
└── integration/
    ├── test_leads_api.py
    ├── test_voice_webhook.py
    └── test_crm_sync.py
```

## Unit tests

Test business logic without external APIs.

Example:

```text
Input:
Budget = ₹80L
Timeline = 1 month
Site visit = yes

Expected:
Lead score = expected value
```

## Integration tests

Test multiple components together.

Example:

```text
FastAPI
→ Service
→ Repository
→ Test PostgreSQL
```

External APIs should generally be mocked in automated tests.

---

# 39. API Versioning

Use:

```text
/api/v1/
```

Example:

```text
/api/v1/leads
/api/v1/calls
/api/v1/crm
```

This allows future API evolution without immediately breaking existing clients.

---

# 40. Pagination

Never return an unlimited number of records.

Bad:

```text
GET /leads
→ every lead ever created
```

Better:

```text
GET /leads?page=1&page_size=20
```

Response:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 200
  }
}
```

---

# 41. Idempotency

Webhook systems can send duplicate events.

Example:

```text
Call-ended event
→ received once

Call-ended event
→ received again
```

The system must not create duplicate leads or duplicate processing.

Use provider event IDs / idempotency keys.

Conceptually:

```text
provider_event_id
→ check whether already processed
→ if yes, return safely
→ if no, process
```

This is especially important for:

- telephony webhooks
- CRM webhooks
- payment-like external callbacks
- asynchronous events

---

# 42. Retry Strategy

Only retry operations that are safe to retry.

Good retry candidates:

```text
CRM temporary network failure
LLM temporary provider failure
temporary database connection issue
```

Do not blindly retry:

```text
invalid CRM credentials
invalid request
permission denied
```

Those require intervention rather than repeated attempts.

---

# 43. Important Business Invariant

The local database is the source of truth for your application.

Therefore:

```text
AI extraction failure
→ call still exists

CRM failure
→ lead still exists

CRM unavailable
→ lead still exists

Dashboard unavailable
→ lead still exists
```

External integrations should not be allowed to destroy your internal state.

---

# 44. What Each Layer Owns

| Layer | Responsibility |
|---|---|
| Routes | HTTP |
| Schemas | Input/output validation |
| Dependencies | Request-scoped dependencies |
| Services | Business logic |
| Repositories | Database access |
| Models | Database representation |
| AI | AI interaction/orchestration |
| Integration adapters | External provider communication |
| Core | Cross-cutting application concerns |
| Tests | Behavior verification |

---

# 45. What Each Layer Must NOT Do

| Layer | Must NOT |
|---|---|
| Routes | Perform business workflows |
| Schemas | Query database |
| Services | Depend on HTTP details unnecessarily |
| Repositories | Call CRM/LLM |
| Models | Call external APIs |
| AI | Directly write database |
| CRM adapter | Decide lead business rules |
| Telephony adapter | Create arbitrary database records |
| Frontend | Enforce security alone |

---

# 46. Example Dependency Graph

```text
                 API ROUTES
                     |
                     v
                 SERVICES
                /        \
               v          v
        REPOSITORIES     AI
             |            |
             v            v
        POSTGRESQL       LLM


              SERVICES
                  |
                  v
          INTEGRATION LAYER
             /         \
            v           v
       TELEPHONY       CRM
```

The dependency direction should remain predictable.

---

# 47. Production Request Example

Request:

```http
POST /api/v1/leads
Authorization: ...
Content-Type: application/json
```

Body:

```json
{
  "name": "Rahul Sharma",
  "phone": "+91...",
  "property_type": "3BHK",
  "budget_min": 7500000,
  "budget_max": 8500000,
  "preferred_location": "Wardha Road"
}
```

Processing:

```text
HTTP
→ Router
→ Pydantic
→ Auth
→ LeadService
→ Business validation
→ Repository
→ PostgreSQL
→ CRMService
→ CRMProvider
```

Response:

```http
201 Created
```

```json
{
  "data": {
    "id": "lead_123",
    "name": "Rahul Sharma",
    "property_type": "3BHK",
    "budget_min": 7500000,
    "budget_max": 8500000,
    "preferred_location": "Wardha Road",
    "crm_sync_status": "synced"
  }
}
```

---

# 48. Production Failure Example

CRM is unavailable.

```text
Customer call
→ AI conversation
→ transcript
→ lead extraction
→ LeadService
→ PostgreSQL SUCCESS
→ CRM FAILURE
```

Final state:

```text
Lead:
status = NEW
crm_sync_status = FAILED
crm_record_id = null
```

Dashboard:

```text
CRM Sync: Failed
[Retry]
```

The customer lead is not lost.

---

# 49. Recommended Initial Technology Stack

```text
Frontend:
Next.js
TypeScript
Tailwind
shadcn/ui

Backend:
Python
FastAPI
Pydantic

Database:
PostgreSQL
SQLAlchemy 2
Alembic

AI:
LLM API
Structured outputs
Tool calling

Voice:
Telephony provider
Provider adapter

CRM:
One CRM initially
CRM adapter architecture

Testing:
Pytest
HTTPX
Playwright for frontend

Development:
Native Python
Native Node.js
Hosted PostgreSQL if local resources are constrained

No Docker initially.
No local LLM.
No Redis until a real requirement exists.
```

---

# 50. MVP Boundary

Do not build the entire platform at once.

The first vertical slice should be:

```text
Mock/Real Call
      ↓
Transcript
      ↓
AI extraction
      ↓
Pydantic validation
      ↓
LeadService
      ↓
PostgreSQL
      ↓
CRM adapter
      ↓
CRM
      ↓
Dashboard
```

Only after this works should you add:

- real-time voice streaming
- human transfer
- property search tools
- advanced lead scoring
- appointment scheduling
- background workers
- Redis
- multiple CRM providers
- analytics

---

# 51. Architecture Rules for This Project

1. Keep FastAPI as a modular monolith.
2. Routes stay thin.
3. Business logic belongs in services.
4. Database access belongs in repositories.
5. SQLAlchemy models are not API schemas.
6. AI cannot directly manipulate the database.
7. External providers must be behind adapters/interfaces.
8. Local lead creation must not depend on CRM availability.
9. Verify webhook signatures.
10. Make webhook processing idempotent.
11. Scope all tenant-owned data by `company_id`.
12. Never trust frontend authorization.
13. Never expose secrets.
14. Validate AI outputs before persistence.
15. Preserve transcripts even when extraction fails.
16. Use consistent HTTP errors.
17. Add request IDs for observability.
18. Test business logic independently.
19. Don't introduce Redis/Celery until the application needs them.
20. Don't introduce microservices until there is a real operational reason.
21. Don't add a technology simply because it appears in a tutorial.
22. Keep provider-specific code isolated.
23. Prefer explicit failure states over silently swallowing errors.
24. Make external operations retryable only when safe.
25. Keep the core lead domain independent from voice and CRM providers.

---

# 52. Target Mental Model

When implementing any feature, think:

```text
What does the user/client want?
        ↓
What business operation represents that?
        ↓
Which service owns it?
        ↓
What data does it need?
        ↓
Which repository accesses that data?
        ↓
Does it need an external provider?
        ↓
Which adapter handles that provider?
        ↓
What can fail?
        ↓
What should happen if it fails?
        ↓
How do we test it?
```

That process should happen before writing the implementation.

---

# 53. Final Architecture

```text
                           CUSTOMER
                              |
                           PHONE
                              |
                              v
                      +---------------+
                      |  TELEPHONY    |
                      +-------+-------+
                              |
                           WEBHOOK
                              |
                              v
                    +-------------------+
                    |   FastAPI Routes  |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    |     Services      |
                    +----+---------+----+
                         |         |
              +----------+         +----------+
              v                               v
       +--------------+                +-------------+
       | Repositories |                | AI Service  |
       +------+-------+                +------+------+
              |                               |
              v                               v
       +--------------+                     LLM
       | PostgreSQL   |
       +--------------+
              ^
              |
       +------+-------+
       | CRM Service  |
       +------+-------+
              |
              v
       +--------------+
       | CRM Adapter  |
       +------+-------+
              |
              v
        Client's CRM


                 Next.js Dashboard
                        |
                        v
                    FastAPI API
```

This is the backend architecture to treat as the **baseline engineering specification** for the project.

