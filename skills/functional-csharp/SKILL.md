---
name: functional-csharp
description: >
  Write C# in a functional style — records and immutability, pure static functions,
  sealed-record discriminated unions with exhaustive switch expressions, and
  Result/Option types instead of exceptions for expected failures. Use whenever writing,
  reviewing, or refactoring C# / .NET code: domain models, services, ASP.NET handlers,
  business rules, error handling, or state machines. Also use when tempted to add a
  mutable property, an abstract base class, an interface with one implementation, or a
  `throw` for a validation failure; when a class has nullable fields only valid in
  certain combinations; or when choosing between exceptions and Result. Covers
  records/with, ImmutableList/FrozenDictionary, pattern matching, railway-oriented
  programming, ErrorOr/OneOf/LanguageExt, value objects, and functional core +
  imperative shell.
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

---

## Records and immutability

```csharp
// ✗ Anemic mutable class — any caller can corrupt it at any time
public class Order
{
    public decimal Total { get; set; }
    public OrderStatus Status { get; set; }
}

// ✓ Immutable record with value equality and non-destructive update
public sealed record Order(OrderId Id, Money Total, OrderState State);

var repriced = order with { Total = newTotal };   // original untouched
```

- `sealed record` for domain data; `readonly record struct` for small values
  (`Money`, `Quantity`, ids) to avoid allocation.
- Every property init-only. If you type `set;` in a domain model, stop and ask why.
- `with` for updates — it is a shallow copy, so nested records need nested `with`.
- Records give you structural equality free, which is what you almost always want
  for values and almost never get right by hand.

### Collections

`List<T>` in a record is a hole in your immutability — the reference is readonly,
the contents are not.

```csharp
using System.Collections.Immutable;
using System.Collections.Frozen;

public sealed record Order(OrderId Id, ImmutableList<OrderLine> Lines);

var updated = order with { Lines = order.Lines.Add(line) };  // structural sharing
```

| Use | For |
|---|---|
| `ImmutableArray<T>` | **default** for domain collections — compact, fast to read, supports list patterns |
| `ImmutableList<T>` | frequent inserts/removals mid-collection (tree, structural sharing); no list-pattern support |
| `FrozenDictionary<K,V>` / `FrozenSet<T>` | built once, read many — lookup tables, config |
| `IReadOnlyList<T>` | parameters, when you only need to promise you won't mutate |

Note `ImmutableArray<T>.Add` copies the whole array (O(n)); `ImmutableList<T>.Add`
shares structure (O(log n)). Pick by access pattern: mostly-read → array,
frequently-rebuilt → list.

Avoid `IEnumerable<T>` in domain models: deferred execution means the value can
change between enumerations, or be enumerated twice at a cost. Materialize at the
boundary with `.ToImmutableList()`.

## Discriminated unions

C# has no native DU **in a released version** — it is a .NET 11 preview feature
(`public union Result<T>(Success<T>, Failure);`), so don't write it in production
today. Verify current availability before using it. The stable encoding:

```csharp
public abstract record OrderState
{
    private OrderState() { }                      // seals the hierarchy externally

    public sealed record Unpaid(DateTimeOffset CreatedAt)                : OrderState;
    public sealed record Paid(DateTimeOffset PaidAt, Money Amount)       : OrderState;
    public sealed record Shipped(DateTimeOffset ShippedAt, string Track) : OrderState;
}
```

The private constructor is what makes it a real closed union — no outside type can
extend it, so the compiler knows the case list is complete.

```csharp
public static string Describe(OrderState state) => state switch
{
    OrderState.Unpaid            => "Awaiting payment",
    OrderState.Paid p            => $"Paid {p.Amount}",
    OrderState.Shipped s         => $"Shipped ({s.Track})",
    _ => throw new UnreachableException(),
};
```

**Know what the compiler does and does not give you here.** C# does *not* treat a
private-constructor record hierarchy as a closed union: a switch over it always
warns CS8509 ("not exhaustive"), because a reference type can also be `null` —
and adding a `null` arm just changes the warning to "'not null' is not covered".
Verified on .NET 8. So CS8509 fires whether or not your cases are complete, which
means **you cannot use it as an exhaustiveness gate**, and `_ => throw` is the
normal thing to write rather than a mistake.

For genuine compile-time exhaustiveness, put a `Match` method on the union — one
delegate per case, so adding a case breaks every caller at compile time:

```csharp
public abstract record OrderState
{
    private OrderState() { }
    // ... cases ...

    public T Match<T>(
        Func<Unpaid, T> unpaid,
        Func<Paid, T> paid,
        Func<Shipped, T> shipped) => this switch
    {
        Unpaid u  => unpaid(u),
        Paid p    => paid(p),
        Shipped s => shipped(s),
        _ => throw new UnreachableException(),
    };
}

var text = state.Match(
    unpaid:  _ => "Awaiting payment",
    paid:    p => $"Paid {p.Amount}",
    shipped: s => $"Shipped ({s.Track})");
```

Writing that by hand is tedious — **Dunet** (source generator) or **OneOf**
generate it for you. Use switch expressions for local branching, and `Match` at
the boundaries where a missed case would be a real bug.

**This replaces** the enum-plus-nullable-fields pattern, where `Status = Shipped`
with `Tracking = null` is representable and someone will eventually construct it.

### Pattern matching

```csharp
public static decimal Fee(Order o) => o switch
{
    { State: OrderState.Shipped, Total.Amount: > 100 } => 0m,
    { State: OrderState.Shipped }                      => 4.99m,
    { State: OrderState.Paid }                         => 2.99m,
    _                                                  => 0m,
};

// list patterns — need ImmutableArray<T>, T[] or another sliceable type.
// ImmutableList<T> does NOT support them (no Range indexer). Verified.
ImmutableArray<OrderLine> lines = [..order.Lines];
var summary = lines switch
{
    []                       => "empty",
    [var only]               => $"one: {only.Sku}",
    [var first, .. var rest] => $"{first.Sku} +{rest.Length}",
};
```

Prefer switch *expressions* over switch statements — they return a value, cannot
fall through, and force every path to produce something.

## Errors as values

```csharp
// ✗ Expected failure as an exception: invisible in the signature, costly,
//   and callers routinely forget to catch it
public User Register(string email)
{
    if (!email.Contains('@')) throw new ValidationException("bad email");
    ...
}

// ✓ Failure is part of the return type
public static Result<User> Register(string email) =>
    Email.TryParse(email)
         .Bind(CreateUser)
         .Map(WithDefaults);
```

Use a library rather than hand-rolling — they are small, battle-tested, and
consistent:

| Library | Best for |
|---|---|
| **ErrorOr** | pragmatic default; `ErrorOr<T>`, one or many `Error`s, built-in `.Then()`/`.Match()`, low ceremony |
| **OneOf** | genuine N-way returns (`OneOf<Found, NotFound, Conflict>`) |
| **CSharpFunctionalExtensions** | small `Result`/`Maybe`, mature, minimal learning curve |
| **LanguageExt** | full FP: `Option`, `Either`, `Fin`, `Validation`, `Eff`/`IO`, immutable collections — powerful, steep, adopt team-wide or not at all |

```csharp
// ErrorOr, railway style
public static ErrorOr<Order> Place(Cart cart, Customer c) =>
    ValidateCart(cart)
        .Then(v => CheckCredit(c, v))
        .Then(CreateOrder)
        .Else(errors => Error.Failure(description: Summarize(errors)));
```

`Bind`/`Then` short-circuits: once on the failure track, later steps are skipped.
That is railway-oriented programming, and it removes the nested `if (result.
IsFailure) return result;` staircase.

**Exceptions are still correct for**: programmer error (`ArgumentNullException` on
a public API contract), truly exceptional infrastructure faults, and anything the
caller cannot act on. Don't wrap the whole world in `Result` — Andrew Lock's
caveat applies: don't apply the pattern just because you can.

Type your errors. A `Result<T, string>` throws away the caller's ability to react
differently to "not found" versus "conflict".

## Value objects over primitives

```csharp
// ✗ Primitive obsession — nothing stops Register(phone, email)
public static void Register(string email, string phone) { }

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
an `Email`, it is valid, permanently, with no re-checking anywhere downstream. Do
this for ids especially — `OrderId` and `CustomerId` as bare `Guid`s are one
transposition away from a production incident.

## Pure functions and pipelines

```csharp
// static local functions cannot capture `this` or locals — purity, enforced
public decimal ComputeTotal(Order order)
{
    return Sum(order.Lines);
    static decimal Sum(IEnumerable<OrderLine> ls) => ls.Sum(l => l.Price * l.Quantity);
}
```

Two extension methods carry most pipelines:

```csharp
public static TOut Map<TIn, TOut>(this TIn x, Func<TIn, TOut> f) => f(x);
public static T Tap<T>(this T x, Action<T> act) { act(x); return x; }

var total = order.Map(ApplyFees).Map(ApplyDiscount).Map(ApplyTax);
```

LINQ is already functional — lean on it. `Select`/`Where`/`Aggregate` over `for`
loops that mutate an accumulator, when it reads better.

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

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| mutable class with `get; set;` | `sealed record` with init-only properties + `with` |
| abstract base class | sealed record hierarchy + switch expression |
| interface with exactly one implementation | a static function, or a `Func<,>` parameter |
| `enum` + nullable fields | discriminated union (one case per state) |
| `throw` on validation failure | `Result<T>` / `ErrorOr<T>` |
| `List<T>` on a domain type | `ImmutableList<T>` |
| `Dictionary` lookup table | `FrozenDictionary` |
| `string`/`Guid` identifiers | `readonly record struct` value objects |
| stateful service with private fields | static pure functions taking explicit inputs |
| `DateTime.UtcNow` inside logic | `TimeProvider` injected into the shell |
| switch statement | switch expression (no fall-through, must return) |
| `_ => throw` default arm | omit it, let the compiler warn on new cases |
| null checks everywhere | `Option`/`Maybe`, or a union case |
| Strategy / Template Method | pass a `Func<,>` |

## Review checklist

- [ ] Domain types are records; no `set;` accessors
- [ ] Collections are `ImmutableList`/`FrozenDictionary`, not `List`/`Dictionary`
- [ ] States are sealed record unions; switch expressions have no `_` catch-all
- [ ] Expected failures return `Result`/`ErrorOr` with typed errors
- [ ] Identifiers and validated strings are value objects, not primitives
- [ ] Logic is `static` and takes everything it needs as parameters
- [ ] No `DateTime.UtcNow`, DB, HTTP, or logging inside domain functions
- [ ] EF entities do not escape the repository/shell layer

## Don't be dogmatic

C# is not F#. Keep interfaces where DI genuinely needs seams (repositories,
external clients) — the target is interfaces invented for one implementation, not
all abstraction. Use exceptions for infrastructure faults and contract violations.
`LanguageExt` is excellent but is a team decision, not a unilateral one; ErrorOr
or CSharpFunctionalExtensions give most of the value with far less onboarding.
Match the conventions already in the codebase.

Deeper material: `references/railway.md` (Result composition, validation
accumulation, async), `references/unions.md` (DU encodings and the .NET 11
preview syntax).
