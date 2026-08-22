---
name: vertical-slice
description: >
  Apply vertical slice architecture to organize code by feature instead of by technical
  layer. Use when adding a new feature, endpoint, command, query, or use case. Use when
  deciding whether to create new files or edit existing ones. Use when implementing CQRS,
  mediator pattern, plugin architecture, event-driven patterns, or auto-discovery
  registration. Use when the user asks about additive architecture, feature folders, or
  minimizing edit surface. Also trigger when you notice yourself about to add a new method
  to an existing controller or service — that is the moment this skill is most needed.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Vertical Slice Architecture

## Golden Rule

> **Prefer creating new files that plug into the system over editing existing files.**

Vertical Slice Architecture (VSA) organizes code around features/use cases, not
technical layers. Each "slice" is a self-contained unit owning its feature
vertically — from API endpoint through validation, business logic, and data
access.

**Key insight: new features should be additions, not modifications.** Add a feature
→ create new folder with new files. Don't open existing controller and add method.
Don't grow shared service class. System discovers new slice automatically.

Additive development: fewer merge conflicts, smaller blast radius, independently
testable and deletable features.

---

## Decision Framework

Before implementing, walk through this decision tree:

### Step 1: NEW use case, feature, or endpoint?

**YES** → Create new slice: new folder with handler, request, response, validator,
endpoint files. **STOP.**

### Step 2: VARIANT of existing feature?

Different input/output/business rules, same domain.

**YES** → Create new slice sharing domain types/interfaces but own handler. Don't
add conditional branches to existing handler. **STOP.**

### Step 3: CROSS-CUTTING concern?

Logging, validation, authorization, caching, rate limiting, error handling,
transactions.

**YES** → Implement as middleware, pipeline behavior, or decorator. New files
wrapping all handlers uniformly. Don't edit individual slices. **STOP.**

### Step 4: BUG FIX in existing behavior?

**YES** → Edit existing slice's handler. Correct case for modifying existing file.
**STOP.**

### Step 5: Extending existing feature with side effect?

E.g., "when order created, also send confirmation email."

**YES** → Observer/Domain Events: publish event from existing slice (if not
already), handle extension in **NEW file** subscribing to event. Existing slice
changes minimally (one emit line) or not at all. **STOP.**

### Step 6: None of the above?

Edit existing file as last resort. But consider whether requirement reveals
missing abstraction for future additive work.

### Red Flags

Stop and ask "Should this be a new slice?" when you notice:

- Adding `if/elif/else` or `switch/case` branch for **different use case**
- Adding **unrelated method** to controller/service class
- Importing new domain-specific dependencies into **shared module**
- File's import list growing past **15 imports**
- PR touches **more than 3 existing files** for single new feature
- Adding new route to file with **5+ routes**

---

## Slice Anatomy

A vertical slice is a folder containing everything for one use case:

```
features/
  orders/
    create_order/
      command.ext          # Input DTO / request shape
      handler.ext          # Business logic
      response.ext         # Output DTO
      validator.ext        # Input validation rules
      endpoint.ext         # HTTP/API wiring (route, method, status codes)
      handler_test.ext     # Tests for this slice
    get_order/
      query.ext
      handler.ext
      response.ext
      endpoint.ext
      handler_test.ext
    cancel_order/
      ...
  users/
    register_user/
      ...
    get_user_profile/
      ...
```

### File-Level N-Tier Separation

Within one slice's folder, each file carries exactly one layer: `endpoint.ext` is
presentation wiring, `handler.ext` is business logic — never both in same file.
Keeps layers decoupled (handler testable without HTTP, endpoint stays thin) while
preserving slice's vertical ownership; separation by file responsibility, not
re-introduced technical layer folders.

### The Anti-Pattern (Layered Architecture)

```
src/
  controllers/     # all endpoints
  services/        # all business logic
  repositories/    # all data access
  models/          # all DTOs
```

Adding a feature touches 4+ files across layers. Shared services grow; handlers
couple through service; testing needs full stack; deleting feature is surgical
nightmare.

---

## Cross-Cutting Concerns (without editing slices)

### Middleware / Pipeline Behaviors

Wrap every request uniformly — logging, validation, auth, transactions, retries.
New behavior = new middleware file. Applied via pipeline (MediatR
`IPipelineBehavior`, FastAPI middleware, Express middleware).

### Observer / Domain Events Pattern

Slices communicate through **events** — immutable facts ("order created",
"user registered"). Publisher emits event; any number of subscribers react in
their own handler files. Publisher never knows who subscribes.

**Use when:**
- Feature A action triggers behavior in Feature B
- Add reactions to existing events without editing emitter
- Side effects (email, audit log, analytics) separate from core logic
- Multiple independent systems react to same trigger

**Key principle**: New reaction = new subscriber file. Publisher unchanged.

### Mediator Pattern

Dispatcher sits between caller and handler. Caller sends request object; mediator
routes to correct handler. Neither knows the other directly. Mediator discovers
handlers automatically (assembly scanning, decorator registry, convention).

**Use when:**
- CQRS (commands and queries as separate slices)
- Cross-cutting concerns applied uniformly via pipeline behaviors
- API layer shouldn't depend on business logic implementations

---

## Language Quick Start

### Python (FastAPI)

New feature = new folder under `features/`:

```
features/orders/create_order/
  __init__.py
  command.py       # CreateOrderCommand dataclass
  handler.py       # handle(cmd) -> response
  response.py      # CreateOrderResponse dataclass
  endpoint.py      # @router.post("/orders")
  test_handler.py  # pytest
```

Auto-discovery: `features/__init__.py` uses `pkgutil.walk_packages()` to import
all modules. Each endpoint module defines a `router` included by app.

Complete mediator, event bus, plugin context: `references/python.md`

### C# (ASP.NET Core + MediatR)

New feature = new folder under `Features/`:

```
Features/Orders/CreateOrder/
  CreateOrderCommand.cs     # IRequest<CreateOrderResponse>
  CreateOrderHandler.cs     # IRequestHandler<,>
  CreateOrderResponse.cs    # response record
  CreateOrderValidator.cs   # AbstractValidator<>
  CreateOrderEndpoint.cs    # app.MapPost(...)
  CreateOrderTests.cs       # xUnit
```

Auto-discovery: `builder.Services.AddMediatR(cfg =>
cfg.RegisterServicesFromAssembly(...))` finds all handlers. Minimal API endpoints
register via `IEndpointDefinition` convention.

Complete pipeline behaviors, domain events, project structure: `references/csharp.md`

### TypeScript (Express / React)

**Backend** — new feature = new folder under `features/`:

```
features/orders/create-order/
  command.ts        # CreateOrderCommand type + Zod schema
  handler.ts        # handleCreateOrder(cmd) -> response
  response.ts       # CreateOrderResponse type
  endpoint.ts       # express Router with POST /orders
  handler.test.ts   # vitest/jest
```

**Frontend (React)** — new feature = new folder under `features/`:

```
features/orders/create-order/
  use-create-order.ts       # React hook
  create-order-form.tsx     # Component
  create-order.api.ts       # API call
  create-order.schema.ts    # Zod validation
  create-order.test.tsx     # Test
```

Auto-discovery: features index scans directories and collects routers/registrations.

Complete mediator, event bus, plugin registration: `references/typescript.md`

---

## Execution Notes

### When Generating New Code

1. **Create the slice folder first**, then create each constituent file
2. Each file single clear responsibility
3. Ensure auto-discovery finds new slice — verify registration pattern
4. Write test file alongside handler, not afterthought

### When Reviewing Existing Code

Flag these violations:
- Controllers with >5 action methods → split into endpoint-per-file
- Service classes >300 lines → extract into per-feature handlers
- Single PR modifying >5 existing files for one feature → suggest vertical slice refactor

### When NOT to Refactor

- **Do not rewrite existing working code** into vertical slices unless user explicitly asks
- **Do not split a file** that is small, focused, and serves one use case
- **Do not add ceremony** (separate request/response files) when simple function will do
- Apply vertical slices to **new features going forward**, not retroactively

### Testing

Each slice independently testable:
- Test handler directly with request object — no HTTP server needed
- Mock only external dependencies (database, external APIs), not other slices
- If testing slice requires importing from another slice, that's a coupling smell
