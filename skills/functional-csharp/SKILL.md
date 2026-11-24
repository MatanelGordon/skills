---
name: functional-csharp
description: >
  Apply functional C# conventions when writing, reviewing, or refactoring .NET
  code, especially domain models, business rules, handlers, state machines, and
  expected-error handling. Use when mutable state, inheritance, nullable-state
  combinations, or exceptions obscure the model. Prefer records, immutable
  data, discriminated unions, pure functions, exhaustive matching, and
  Result/Option while respecting framework constraints.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Functional C#

Modern C# is a good functional language wearing an OOP costume. Records, pattern
matching, switch expressions, LINQ, and immutable collections cover most of what
you need — and the compiler enforces far more than most C# codebases ask of it.

## The five rules

1. **Records, not classes,** for anything that is data. Immutable by construction.
2. **Static pure functions** for logic. No hidden state, no `this`, no ambient dependencies.
3. **Sealed record hierarchies** for "one of N states", matched exhaustively.
4. **`Result`/`ErrorOr` for expected failures.** Exceptions are for bugs and infrastructure.
5. **Pure core, imperative shell.** EF entities and I/O never reach the domain.

**Scope:** apply these rules at domain boundaries and in new domain code.
Framework conventions (ASP.NET models, EF entities), stdlib exception culture,
and the surrounding codebase win when they conflict — see "Don't be dogmatic".

## Start with the compiler

```xml
<!-- Directory.Build.props or csproj -->
<PropertyGroup>
  <Nullable>enable</Nullable>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup>
```

Without nullable reference types, records and unions still compile but the
null warnings the rest of this skill relies on never fire.

## Records and immutability

```csharp
// ✗ class Order { public decimal Total { get; set; } … }   any caller can corrupt it
// ✓ Immutable record with value equality and non-destructive update
public sealed record Order(OrderId Id, Money Total, OrderState State);

var repriced = order with { Total = newTotal };   // original untouched
```

- `sealed record` for domain data; `readonly record struct` for small values
  (`Money`, `Quantity`, ids) to avoid allocation.
- Every property init-only. If you type `set;` in a domain model, stop and ask why.
- `with` is a shallow copy, so nested records need nested `with`.
- Records give structural equality for free, which is what values need and
  what hand-written `Equals` rarely gets right.

### Collections

`List<T>` in a record is a hole in your immutability — the reference is readonly,
the contents are not.

| Use | For |
|---|---|
| `ImmutableArray<T>` | **default** for domain collections — compact, fast to read; the one to use with slice patterns such as `[var first, .. var rest]`; `Add` copies the array, O(n) |
| `ImmutableList<T>` | frequently rebuilt collections (structural sharing, O(log n) `Add`); **not** with `.. var rest`: it has no slice support (error CS1503) |
| `FrozenDictionary<K,V>` / `FrozenSet<T>` | built once, read many — lookup tables, config |
| `IReadOnlyList<T>` | parameters, when you only need to promise you won't mutate |

Avoid `IEnumerable<T>` in domain models: deferred execution means the value can
change between enumerations, or cost twice. Materialize at the boundary with
`.ToImmutableArray()`.

## Discriminated unions

**Check the target framework first.** The compiler checks unions only from
C# 15 on .NET 11 (released November 2026). .NET 10 (LTS, supported to November
2028) and earlier need the encoding below.

```csharp
public abstract record OrderState
{
    private OrderState() { }                      // closes the hierarchy

    public sealed record Unpaid(DateTimeOffset CreatedAt)                : OrderState;
    public sealed record Paid(DateTimeOffset PaidAt, Money Amount)       : OrderState;
    public sealed record Shipped(DateTimeOffset ShippedAt, string Track) : OrderState;
}
```

- **This replaces enum-plus-nullable-fields,** where `Status = Shipped` with
  `Tracking = null` is representable and someone will eventually construct it.

**On .NET 10 and earlier:**

- **The compiler will not tell you a case is missing.** A switch expression
  over this hierarchy warns CS8509 whenever it has no `_` arm, even when every
  case is handled, so the warning says nothing about missing cases. Write
  `_ => throw new UnreachableException()`: it catches a missed case at run
  time only.
- **For a compile-time check, give the union a `Match` method** with one
  delegate parameter per case: adding a case then breaks every caller.
  Hand-write it, or let **Dunet** or **OneOf** generate it. Use `Match` at
  boundaries where a missed case would be a real bug.

**On .NET 11 and later:**

- **Mark the base `closed`** (`public closed record class OrderState { … }`)
  and drop the private constructor. A switch expression that handles every
  case then needs no `_` arm, and a new case warns at every switch that misses
  it. Keep the cases `sealed`, and add a `null` arm when the value can be null.
- **For "one of several existing types"** (an `Order` or a `NotFound`),
  `public union Lookup(Order, NotFound);` does the same without a base type.
  It is a struct that boxes value-type cases, and its default value holds
  null, so add a `null` arm wherever a default can reach the switch.

Prefer switch *expressions* over switch statements on every version: they
return a value and cannot fall through.

Read `references/unions.md` before writing a `Match` method, a property or list
pattern, a state machine, or JSON for a union, and when choosing between
`closed`, `union`, the record hierarchy, OneOf and LanguageExt.

## Errors as values

```csharp
// ✗ throw new ValidationException("bad email")   invisible in the signature,
//   costly, and callers routinely forget to catch it
// ✓ Failure is part of the return type
public static Result<User> Register(string email) =>
    Email.TryParse(email)
         .Bind(CreateUser)
         .Map(WithDefaults);
```

Use a library rather than hand-rolling:

| Library | Best for |
|---|---|
| **ErrorOr** | pragmatic default; `ErrorOr<T>`, one or many `Error`s, built-in `.Then()`/`.Match()`, low ceremony |
| **OneOf** | genuine N-way returns (`OneOf<Found, NotFound, Conflict>`) |
| **CSharpFunctionalExtensions** | small `Result`/`Maybe`, mature, minimal learning curve |
| **LanguageExt** | full FP: `Option`, `Either`, `Validation`, effects — powerful, steep, adopt team-wide or not at all |

- Chain fallible steps with `.Then()`/`Bind` instead of an
  `if (result.IsError) return …;` staircase. The first failure short-circuits:
  later steps are skipped. That is railway-oriented programming.
- **Type your errors.** A `Result<T, string>` throws away the caller's ability
  to react differently to "not found" versus "conflict".
- **Exceptions are still correct for** programmer error (`ArgumentNullException`
  on a public API contract), infrastructure faults, and anything the caller
  cannot act on. Don't wrap the whole world in `Result`.

Read `references/railway.md` before chaining more than two fallible steps,
collecting every validation error at once, composing `Task<Result<T>>`, or
converting a thrown exception at the edge.

## Value objects over primitives

```csharp
// ✗ Register(string email, string phone)   nothing stops Register(phone, email)
// ✓ The compiler now enforces meaning
public readonly record struct Email
{
    private Email(string value) => Value = value;
    public string Value { get; }

    public static Result<Email> TryParse(string raw) =>
        raw.Contains('@') ? new Email(raw) : Result.Fail<Email>("invalid email");
}
```

Private constructor + static `TryParse` is *parse, don't validate*: once you hold
an `Email`, it is valid, with no re-checking downstream. Do this for ids
especially — `OrderId` and `CustomerId` as bare `Guid`s are one transposition
away from a production incident.

## Pure functions

- Logic is `static` and takes everything it needs as parameters. A `static`
  local function cannot capture `this` or locals, so the compiler enforces it.
- LINQ is already functional: `Select`/`Where`/`Aggregate` over a loop that
  mutates an accumulator, when it reads better.
- Mutation that never leaves the function is fine: a builder, an array filled
  in a hot loop. Immutability is about what crosses the boundary.
- **Parameters:** 1–3 positional, data first, dependencies next, callbacks
  last. Four or more: group the data into one request record, as in
  `Place(PlaceOrder request, IClock clock, Func<Order, bool>? validate = null)`.

## Decider pattern

For command-driven or event-sourced state, split deciding from storing:

```csharp
// Signatures only; references/patterns.md has the bodies.
static ImmutableList<OrderEvent> Decide(OrderState state, Command cmd);  // every business rule lives here
static OrderState Evolve(OrderState state, OrderEvent e);                // applies one event; never decides
```

The shell persists the events and folds `Evolve` to rebuild state, so `Decide`
is tested with tables: no mocks, no database, no clock.

Read `references/patterns.md` before writing a Decider, a left-to-right
pipeline (`Map`/`Tap`), or regrouping a long parameter list.

## Functional core, imperative shell

```csharp
// SHELL (impure): gather
var entity = await _db.Orders.FindAsync(id, ct);
var order  = entity.ToDomain();

// CORE (pure): decide — no DB, no clock, no logger
var decision = OrderRules.Ship(order, _clock.UtcNow, carrier);

// SHELL (impure): act
return decision.Match(
    shipped => { entity.Apply(shipped); return _db.SaveChangesAsync(ct); },
    errors  => Results.BadRequest(errors));
```

Domain records are never EF change-tracked entities — map explicitly at the edge.
Inject `TimeProvider`/`IClock` rather than calling `DateTime.UtcNow` in logic;
that alone removes most of the need for mocking.

## Habit → replacement

Also the review checklist: each row is a finding and its fix.

| Reach for | Instead |
|---|---|
| mutable class with `get; set;` | `sealed record` with init-only properties + `with` |
| abstract base class | sealed record hierarchy + switch expression |
| interface with exactly one implementation | a static function, or a `Func<,>` parameter |
| `enum` + nullable fields | discriminated union (one case per state) |
| `throw` on validation failure | `Result<T>` / `ErrorOr<T>` with typed errors |
| `List<T>` on a domain type | `ImmutableArray<T>` (default) / `ImmutableList<T>` if rebuilt often |
| `Dictionary` lookup table | `FrozenDictionary` |
| `string`/`Guid` identifiers, validated strings | `readonly record struct` value objects |
| stateful service with private fields | static pure functions taking explicit inputs |
| `DateTime.UtcNow`, DB, HTTP or logging inside logic | `TimeProvider` and I/O in the shell; pass values in |
| EF entity used as a domain type | map to a domain record at the repository/shell edge |
| switch statement | switch expression |
| switch over a record union | .NET 11: `closed` base, no `_` arm. Earlier: a `Match` method, and `_ => throw new UnreachableException()` in switches |
| null checks everywhere | `Option`/`Maybe`, or a union case |
| Strategy / Template Method | pass a `Func<,>` |
| nullable reference types off | `<Nullable>enable</Nullable>` + warnings as errors |

## Don't be dogmatic

C# is not F#. Keep interfaces where DI genuinely needs seams (repositories,
external clients) — the target is interfaces invented for one implementation, not
all abstraction. Use exceptions for infrastructure faults and contract violations.
`LanguageExt` is excellent but is a team decision, not a unilateral one; ErrorOr
or CSharpFunctionalExtensions give most of the value with far less onboarding.
Match the conventions already in the codebase.
