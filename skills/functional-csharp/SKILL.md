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
matching, switch expressions, LINQ, and immutable collections cover most needs.

## The five rules

1. **Records, not classes,** for data. Immutable by construction.
2. **Static pure functions** for logic. No hidden state, no `this`, no ambient dependencies.
3. **Sealed record hierarchies** for "one of N states", matched exhaustively.
4. **`Result`/`ErrorOr` for expected failures.** Exceptions are for bugs and infrastructure.
5. **Pure core, imperative shell.** EF entities and I/O never reach the domain.

**Scope:** apply at domain boundaries and in new domain code. Framework conventions
(ASP.NET models, EF entities), stdlib exception culture, and surrounding codebase
win when they conflict — see "Don't be dogmatic".

## Start with the compiler

```xml
<!-- Directory.Build.props or csproj -->
<PropertyGroup>
  <Nullable>enable</Nullable>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup>
```

Without nullable reference types enabled, records and unions compile but null
warnings never fire. Treat warnings as errors so CS8509 is visible.

---

## Records and immutability

```csharp
// ✗ Anemic mutable class — any caller can corrupt it
public class Order { public decimal Total { get; set; } public OrderStatus Status { get; set; } }

// ✓ Immutable record with value equality and non-destructive update
public sealed record Order(OrderId Id, Money Total, OrderState State);
var repriced = order with { Total = newTotal };   // original untouched
```

- `sealed record` for domain data; `readonly record struct` for small values
  (`Money`, `Quantity`, ids) to avoid allocation.
- Every property init-only. If you type `set;`, stop and ask why.
- `with` for updates — shallow copy, so nested records need nested `with`.
- Records give structural equality free.

### Collections

`List<T>` in a record breaks immutability — reference readonly, contents not.

```csharp
using System.Collections.Immutable;
using System.Collections.Frozen;

public sealed record Order(OrderId Id, ImmutableList<OrderLine> Lines);
var updated = order with { Lines = order.Lines.Add(line) };
```

| Use | For |
|---|---|
| `ImmutableArray<T>` | **default** for domain collections — compact, fast read, list patterns |
| `ImmutableList<T>` | frequent mid-collection inserts/removals (tree, structural sharing) |
| `FrozenDictionary<K,V>` / `FrozenSet<T>` | built once, read many — lookup tables, config |
| `IReadOnlyList<T>` | parameters, when only promising not to mutate |

`ImmutableArray<T>.Add` copies (O(n)); `ImmutableList<T>.Add` shares (O(log n)).
Pick by access: mostly-read → array, frequently-rebuilt → list.

Avoid `IEnumerable<T>` in domain models: deferred execution means value can change
between enumerations. Materialize at boundary with `.ToImmutableList()`.

## Discriminated unions

C# has no native DU **in a released version** — .NET 11 preview only
(`public union Result<T>(Success<T>, Failure);`); don't use in production. Verify
availability first. Stable encoding:

```csharp
public abstract record OrderState
{
    private OrderState() { }  // seals hierarchy externally
    public sealed record Unpaid(DateTimeOffset CreatedAt) : OrderState;
    public sealed record Paid(DateTimeOffset PaidAt, Money Amount) : OrderState;
    public sealed record Shipped(DateTimeOffset ShippedAt, string Track) : OrderState;
}
```

Private constructor makes it a real closed union — no outside type can extend.

```csharp
public static string Describe(OrderState state) => state switch
{
    OrderState.Unpaid u => $"Unpaid since {u.CreatedAt}",
    OrderState.Paid p => $"Paid {p.Amount} at {p.PaidAt}",
    OrderState.Shipped s => $"Shipped {s.Track} at {s.ShippedAt}",
    _ => throw new UnreachableException()  // CS8509 is only a warning
};
```

Add a `Match` method to every union; don't trust switch exhaustiveness.

## Result for expected failures

```csharp
public readonly record struct Result<T>(T Value, Error? Error)
{
    public bool IsOk => Error is null;
    public static Result<T> Ok(T v) => new(v, null);
    public static Result<T> Fail(Error e) => new(default!, e);
    public TResult Match<TResult>(Func<T, TResult> ok, Func<Error, TResult> fail) =>
        IsOk ? ok(Value) : fail(Error!);
}
```

- Exceptions for: infrastructure faults, invariant violations, programmer errors.
- `Result`/`ErrorOr` for: validation, business rules, missing records, concurrency.
- `Result.Combine` accumulates errors; `Bind` chains; async via `Result.Task`.

## Parameter management

1–3 positional parameters ordered by importance. 4+ parameters → environment/context
record. Order: data first, dependencies/services last, callbacks last.

```csharp
// ✗ Six loose parameters
public static Result<Order> Place(string sku, int qty, decimal price,
    string email, IClock clock, Func<Order, bool> validate) { ... }

// ✓ Data grouped, dependency second, callback last
public sealed record PlaceOrder(string Sku, int Qty, decimal Price, string Email);
public static Result<Order> Place(PlaceOrder request, IClock clock,
    Func<Order, bool>? validate = null) { ... }
```

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

Domain records never EF change-tracked entities — map explicitly at edge.
Inject `TimeProvider`/`IClock` rather than `DateTime.UtcNow` in logic.

## Decider pattern

Split "what should happen" from "how it is stored": pure `Decide` turns command +
state into events, paired with mechanical `Evolve` fold applying one event to
state. All rules in `Decide`; `Evolve` never decides.

```csharp
public static ImmutableList<OrderEvent> Decide(OrderState state, Command cmd) => cmd switch
{
    Pay p when state is OrderState.Unpaid => [new OrderPaid(p.Amount, p.At)],
    Ship s when state is OrderState.Paid => [new OrderShipped(s.Tracking, s.At)],
    _ => [],
};

public static OrderState Evolve(OrderState state, OrderEvent e) => (state, e) switch
{
    (OrderState.Unpaid, OrderPaid p) => new OrderState.Paid(p.Amount, p.At),
    (OrderState.Paid, OrderShipped s) => new OrderState.Shipped(s.At, s.Tracking),
    _ => state,
};
```

Shell persists events and folds `Evolve` to rebuild state. `Decide` tests are
table-driven — no mocks, no DB, no clock.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| mutable class with `get; set;` | `sealed record` init-only + `with` |
| abstract base class | sealed record hierarchy + switch expression |
| interface with one implementation | static function, or `Func<,>` parameter |
| `enum` + nullable fields | discriminated union (one case per state) |
| `throw` on validation failure | `Result<T>` / `ErrorOr<T>` |
| `List<T>` on domain type | `ImmutableArray<T>` default / `ImmutableList<T>` if rebuilt often |
| `Dictionary` lookup | `FrozenDictionary` |
| `string`/`Guid` identifiers | `readonly record struct` value objects |
| stateful service with fields | static pure functions taking explicit inputs |
| `DateTime.UtcNow` in logic | `TimeProvider` injected into shell |
| switch statement | switch expression (no fall-through, must return) |
| switch over union without `Match` | add `Match`; don't trust exhaustiveness (CS8509) |
| null checks everywhere | `Option`/`Maybe`, or union case |
| Strategy / Template Method | pass a `Func<,>` |

## Review checklist

- [ ] Domain types are records; no `set;` accessors
- [ ] Collections `ImmutableArray` default (`ImmutableList` when rebuild-heavy) / `FrozenDictionary`, not `List`/`Dictionary`
- [ ] States are sealed record unions; every union boundary exposes `Match`, switch exhaustiveness only warning (CS8509); any default is `_ => throw new UnreachableException()`
- [ ] Expected failures return `Result`/`ErrorOr` with typed errors
- [ ] Identifiers/validated strings are value objects, not primitives
- [ ] Logic is `static` and takes everything as parameters
- [ ] No `DateTime.UtcNow`, DB, HTTP, logging inside domain functions
- [ ] EF entities don't escape repository/shell layer
- [ ] `<Nullable>enable</Nullable>` + warnings-as-errors in effect

## Don't be dogmatic

C# is not F#. Keep interfaces where DI genuinely needs seams (repositories,
external clients) — target is interfaces invented for one implementation, not all
abstraction. Use exceptions for infrastructure faults and contract violations.
`LanguageExt` is excellent but team decision, not unilateral; ErrorOr or
CSharpFunctionalExtensions give most value with less onboarding. Match existing
conventions.

Deeper material: `references/railway.md` (Result composition, validation
accumulation, async), `references/unions.md` (DU encodings and .NET 11 preview).
