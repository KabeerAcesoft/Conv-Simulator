# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Solution

The LivePerson Conversation Simulator Backend is a NestJS API service that uses 'synthetic customers' to simulate messaging conversations with agents in the LivePerson Conversational Cloud. This enables training human agents, testing bots/AI, and running mystery shopping exercises.

## Development Commands

```bash
npm install --legacy-peer-deps  # Install dependencies (required flag due to peer dependency conflicts)
npm run start:dev               # Development with hot reload
npm run start:debug             # Development with debug mode
npm run build                   # Build for production
npm run start:prod              # Run production build
npm run lint                    # ESLint with auto-fix
npm run format                  # Prettier formatting
npm run type-check              # TypeScript type checking
npm run test                    # Run Jest tests
npm run test:watch              # Jest in watch mode
npm run test:cov                # Coverage report
npm run test:debug              # Debug tests
npm run test:e2e                # End-to-end tests
```

## Architecture Overview

### Core Framework & Technologies
- **NestJS** - Node.js framework with TypeScript
- **Google Firestore** - Primary database for data persistence
- **Redis** - Distributed caching layer
- **Firebase Admin** - Authentication and Firebase integration
- **JWT + Passport.js** - Authentication strategy
- **Pino** - Structured logging
- **OpenAI** - AI integration for conversation simulation

### Key Service Layers

#### **Controllers** (`src/Controllers/`)
Business logic organized by functional domain:

- **Simulation** - Core simulation engine and task orchestration
- **ConnectorAPI** - LivePerson platform integration layer
- **ConversationalCloud** - Real-time messaging and conversation state management
- **Scheduler** - Background job processing and task scheduling
- **AccountConfig** - LivePerson account configuration and user management
- **AIStudio** - AI flow execution and conversation orchestration
- **Cache** - Redis-based distributed caching operations
- **Database** - Firestore database abstraction layer
- **Configuration** - Application settings and feature toggles

#### **Authentication** (`src/auth/`)
JWT-based authentication with role-based access control, middleware, guards, and local strategy implementation.

#### **Common Services** (`src/common/`)
Shared utilities and cross-cutting concerns:
- Global exception handling and validation pipes
- Security middleware and rate limiting
- Circuit breaker, retry logic, and graceful shutdown
- Tracing, timeout interceptors, and audit logging
- Metrics collection and observability

#### **Firebase Integration** (`src/firestore/`)
Firestore module configuration, providers, and document management patterns.

### Application Architecture Patterns

#### **Event-Driven Processing**
- Webhook processing for real-time LivePerson events
- Background task queuing and asynchronous processing
- Service worker coordination and conversation orchestration

#### **Multi-Tier Caching Strategy**
- Redis distributed cache with in-memory fallback
- Cache-aside pattern with automatic invalidation
- Performance optimization for high-frequency operations

#### **Security & Observability**
- Helmet security middleware with environment-specific CSP
- Pino structured logging with request tracing
- Custom metrics collection and health check endpoints
- Graceful shutdown handling with proper cleanup

## Environment Configuration

### Local Development Constraints
When running locally, configure these environment variables to avoid conflicts with production:

```bash
RESTRICT_ACCOUNT=true
DEVELOPER_ACCOUNT_ID=31487986,70071528
```

### Required External Services
- LivePerson Conversational Cloud account and API access
- Google Cloud Firestore database instance
- Redis instance for distributed caching
- Firebase project for authentication

### Tunneling Requirements
The simulation API requires external webhook access for LivePerson callbacks. Use ngrok or similar:

```bash
ngrok http 8081  # Point to localhost:8081 where API runs
```

## Important Development Notes

### Installation Requirements
- Always use `--legacy-peer-deps` flag with npm install due to dependency conflicts
- Environment files (`.env`, `.development.env`) must be in the root directory
- Application processes LivePerson account configurations on startup and signs in service workers

### Service Architecture
- **Startup Process**: Configurations retrieved for all installed accounts, service workers signed in
- **Local Isolation**: Use `RESTRICT_ACCOUNT` and `DEVELOPER_ACCOUNT_ID` to prevent production token invalidation
- **Background Processing**: Scheduler service manages conversation queuing and task distribution
- **Real-time Updates**: Webhook processing for LivePerson events with conversation state management

### Key Integration Points
- **LivePerson APIs**: ConnectorAPI and ConversationalCloud services for platform integration
- **AI Processing**: OpenAI integration for synthetic customer conversation generation
- **Caching Layer**: Redis for conversation state, task queues, and distributed locking
- **Database Operations**: Firestore for persistent storage of tasks, configurations, and conversation data

## Docker Deployment

### Development
```bash
docker-compose -f docker-compose.dev.yml up --build
```

### Production
```bash
docker-compose up --build
```

Production deployments use Docker Swarm secrets for secure credential management and include comprehensive health checks.