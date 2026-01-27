# Services Overview

This document provides a high-level summary of the key services and architectural components in the LivePerson Conversation Simulator Backend.

## Core Architecture Components

### Authentication (`/auth`)
**Purpose**: Handles user authentication, authorization, and access control  
**Key Components**:
- JWT-based authentication strategy
- Role-based access control (RBAC) with decorators
- Authentication middleware and guards
- Request validation interceptors
- Local authentication strategy for user login

**Files**: `auth.module.ts`, `auth.middleware.ts`, `local.strategy.ts`, `roles.guard.ts`, `auth.decorators.ts`

---

### Common (`/common`)
**Purpose**: Shared utilities, decorators, DTOs, and cross-cutting concerns  
**Key Components**:
- **Decorators**: API versioning (`api-version.decorator.ts`)
- **DTOs**: Shared data transfer objects (`shared.dto.ts`)
- **Filters**: Global exception handling (`global-exception.filter.ts`)
- **Guards**: Rate limiting protection (`rate-limit.guard.ts`)
- **Interceptors**: Caching, timeout, and tracing functionality
- **Middleware**: Security middleware for request protection
- **Pipes**: Request validation pipeline
- **Services**: Circuit breaker, audit logging, metrics, retry logic, graceful shutdown

**Key Features**: Centralized error handling, request/response transformation, security enforcement, observability

---

### Configuration (`/config`)
**Purpose**: Application configuration management and environment handling  
**Key Components**:
- Environment-specific configuration schemas
- Configuration validation and type safety
- Environment service for configuration access
- Support for multiple deployment environments (dev, staging, prod)

**Files**: `configuration.schema.ts`, `environment.service.ts`

---

### Controllers
**Purpose**: Business logic controllers organized by functional domain

#### **AIStudio** 
- Integration with LivePerson's AI Studio platform
- Flow execution and conversation flow management
- Prompt handling and AI conversation orchestration

#### **AccountConfig**
- LivePerson account configuration management
- User management and permissions
- Application installation and webhook configuration
- API key management and service worker authentication

#### **Cache**
- Redis-based distributed caching layer
- Task, conversation, and queue state management
- Performance optimization for high-frequency operations
- Distributed locking mechanisms

#### **Configuration**
- Application settings and feature toggle management  
- Account-specific configuration storage
- Service worker and API configuration management

#### **ConnectorAPI**
- Core LivePerson platform integration layer
- Conversation creation, management, and closure
- Consumer authentication and message publishing
- Webhook event processing for real-time updates

#### **ConversationalCloud**
- LivePerson Conversational Cloud API integration
- Real-time messaging and conversation state management
- Agent and consumer interaction handling

#### **Database**
- Firestore database abstraction layer
- CRUD operations for tasks, conversations, and configurations
- Data persistence and retrieval optimization

#### **HelperService**
- Utility services for domain resolution and API helpers
- Cross-service functionality and shared business logic

#### **Scheduler**
- Background job processing and task scheduling
- Queue management for conversation simulations
- Service worker coordination and task distribution
- Response timing and conversation flow control

#### **Simulation** 
- Core simulation engine and orchestration
- Conversation analysis and scoring
- Task lifecycle management (creation, execution, completion)
- AI-powered synthetic customer simulation

#### **Users**
- User management and profile handling
- User authentication context and permissions

---

### Firebase (`/Firebase`)
**Purpose**: Firebase/Firestore integration and document management  
**Key Components**:
- Firestore module configuration and providers
- Document repositories and data access patterns
- Firebase authentication integration (if used)

---

### Health (`/health`)
**Purpose**: Application health monitoring and readiness checks  
**Key Components**:
- Health check endpoints for load balancers
- Service dependency monitoring
- System status reporting

---

### Metrics (`/metrics`)
**Purpose**: Application performance monitoring and observability  
**Key Components**:
- Custom metrics collection and export
- Performance monitoring endpoints
- Integration with monitoring systems (Prometheus, etc.)

---

### Security (`/security`)
**Purpose**: Security services and compliance enforcement  
**Key Components**:
- Security policy enforcement
- Data encryption and protection
- Compliance monitoring and audit trails

---

### Utils (`/utils`)
**Purpose**: Utility functions and helper services  
**Key Components**:
- **Encryption**: Data encryption/decryption utilities (`encryption.ts`)
- **HelperService**: Common business logic and API utilities
- **HttpExceptionFilter**: HTTP error handling and formatting
- **Timezones**: Timezone handling and conversion utilities
- **Consumer Names**: Synthetic customer name generation
- **MemCache**: In-memory caching utilities

---

## Service Integration Patterns

### **Event-Driven Architecture**
- Webhook processing for real-time LivePerson events
- Event queuing and background processing
- Asynchronous conversation state management

### **Caching Strategy**
- Multi-tier caching (Redis + in-memory)
- Cache-aside pattern with automatic fallback
- Distributed cache invalidation and consistency

### **Microservice Communication**
- REST API integration with LivePerson platform
- Internal service communication through dependency injection
- Error handling and circuit breaker patterns

### **Data Flow**
1. **Authentication** → User requests authenticated via JWT
2. **Controllers** → Business logic processing and validation  
3. **Cache/Database** → Data persistence and retrieval
4. **External APIs** → LivePerson platform integration
5. **Background Processing** → Async task execution and scheduling

## Key Technologies
- **Framework**: NestJS (Node.js)
- **Database**: Google Firestore 
- **Cache**: Redis
- **Authentication**: JWT + Passport.js
- **Monitoring**: Pino logging + custom metrics
- **Integration**: LivePerson Conversational Cloud APIs
- **Queue**: In-memory + Redis-based task queuing