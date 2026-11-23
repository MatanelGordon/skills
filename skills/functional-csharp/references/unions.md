# Discriminated unions in C#

## C# 15 on .NET 11: `closed` and `union`

.NET 11 shipped on 10 November 2026 (STS, supported to November 2028) with
C# 15, which adds two ways to get compiler-checked unions. Both need a project
that targets `net11.0`. .NET 10 is the LTS release, also supported to November
2028, so many codebases will stay on the encodings further down for a while.
Checked against Microsoft Learn, November 2026.

**A closed hierarchy** is the native form of Encoding 1:

```csharp
public closed record class OrderState
{
    public sealed record Unpaid(DateTimeOffset CreatedAt)          : OrderState;
    public sealed record Paid(DateTimeOffset PaidAt, Money Amount) : OrderState;
}

public static string Describe(OrderState s) => s switch
{
    OrderState.Unpaid   => "Awaiting payment",
    OrderState.Paid p   => $"Paid {p.Amount}",
    // no `_` arm and no warning: every direct case is handled
};
```

- A `closed` class is implicitly abstract; direct subtypes must be in the same
  assembly. Derivation is not transitive, so keep the cases `sealed`.
- A switch over `OrderState?` must also handle `null`.

**A union** composes existing types without a common base:

```csharp
public union Lookup(Order, NotFound);

Lookup found = new NotFound(id);          // implicit conversion from each case type
string text = found switch
{
    Order o    => o.Id.ToString(),
    NotFound n => $"missing {n.Id}",
    null       => "no value",             // a default Lookup holds null
};
```

- The generated union is a struct holding `object?`, so value-type cases are
  boxed. A custom `[Union]` type can store them without boxing.
- Prefer a `null` arm to `_`: a discard also swallows a case added later, and
  the compiler can no longer warn about it.

Use `closed` for states that carry their own data and belong together; use
`union` for a return value that is one of several types that already exist.

## Encoding 1 — sealed record hierarchy (.NET 10 and earlier)

```csharp
public abstract record Shape
{
    private Shape() { }                          // no external subclassing

    public sealed record Circle(double Radius)              : Shape;
    public sealed record Rect(double W, double H)           : Shape;
    public sealed record Triangle(double B, double H)       : Shape;
}

public static double Area(Shape s) => s switch
{
    Shape.Circle c   => Math.PI * c.Radius * c.Radius,
    Shape.Rect r     => r.W * r.H,
    Shape.Triangle t => t.B * t.H / 2,
    _ => throw new UnreachableException(),   // required — see exhaustiveness below
};
```

The private constructor is essential — without it any assembly can add a case and
your "exhaustive" switches silently stop being exhaustive at runtime. Nesting the
cases inside the parent gives the `Shape.Circle` spelling, which reads well and
keeps the namespace clean.

### Exhaustiveness: what you actually get

Verified on .NET 8, and still true on .NET 10. A C# 15 `closed` base removes the
problem:

| Switch over a record hierarchy | Result |
|---|---|
| all cases, no `_` arm | **CS8509 warning** — "the pattern '_' is not covered" |
| all cases + `null =>` arm | **CS8509 warning** — "the pattern 'not null' is not covered" |
| all cases + `_ =>` arm | compiles clean |

The compiler does **not** treat a private-constructor hierarchy as closed, so
CS8509 fires whether or not your case list is complete. It therefore carries no
information about missing cases, and `<WarningsAsErrors>CS8509</WarningsAsErrors>`
would just force a `_` arm everywhere. Write `_ => throw new UnreachableException()`
and don't pretend the compiler is checking you.

For real compile-time exhaustiveness, use a `Match` method — one delegate per
case. Adding a case changes the signature, breaking every call site:

```csharp
public abstract record Shape
{
    private Shape() { }
    public sealed record Circle(double R) : Shape;
    public sealed record Sq(double S)     : Shape;

    public T Match<T>(Func<Circle, T> circle, Func<Sq, T> sq) => this switch
    {
        Circle c => circle(c),
        Sq q     => sq(q),
        _        => throw new UnreachableException(),
    };
}

double area = shape.Match(
    circle: c => Math.PI * c.R * c.R,
    sq:     q => q.S * q.S);          // compiles clean, 0 warnings
```

Hand-writing `Match` for every union is tedious. **Dunet** (`[Union]` partial
record, source-generates `Match`/`MatchAsync`) and **OneOf** (`OneOfBase<...>`)
do it for you and are the practical answer.

Use switch expressions for local branching where a missed case is cheap; use
`Match` at boundaries and for core domain decisions where it is not.

### Pattern matching

```csharp
public static decimal Fee(Order o) => o switch
{
    { State: OrderState.Shipped, Total.Amount: > 100 } => 0m,
    { State: OrderState.Shipped }                      => 4.99m,
    { State: OrderState.Paid }                         => 2.99m,
    _                                                  => 0m,
};

// list patterns — ImmutableArray<T> and T[] support all of them. ImmutableList<T>
// supports [] and [var x, ..] but cannot capture a slice (`.. var rest`):
// error CS1503, no Range indexer. Verified on .NET 8.
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

## Encoding 2 — OneOf (structural, no hierarchy)

When the cases are unrelated existing types and you don't want a common base:

```csharp
public OneOf<Order, NotFound, Conflict> Fetch(OrderId id) => ...

var response = Fetch(id).Match(
    order    => Results.Ok(order),
    notFound => Results.NotFound(),
    conflict => Results.Conflict(conflict.Reason));
```

`Match` requires a handler per case, so exhaustiveness is enforced by the method
signature. Good for API returns; less good for domain modeling, where the named
hierarchy documents intent better.

## Encoding 3 — LanguageExt

```csharp
using LanguageExt;
using static LanguageExt.Prelude;

Option<User> found = FindUser(id);
int age = found.Match(Some: u => u.Age, None: () => 0);

Either<Error, User> result = ValidateUser(dto);
Fin<User> f = ...;                      // Either<Error, T> specialised for errors

Validation<Error, User> v =
    (ValidateName(n), ValidateEmail(e)).Apply((nm, em) => new User(nm, em));
```

`Option<T>` replaces `null`, `Either<L,R>` replaces exception-or-value,
`Validation` accumulates errors, `Eff`/`IO` model effects. Import the
`Prelude` statically for the camelCase constructor functions (`Some`, `None`,
`Right`, `Left`).

Powerful, but it changes how a codebase reads. Adopt it as a team decision, not
in one file — a mixed codebase where half the methods return `Fin<T>` and half
throw is worse than either style consistently applied.

## Choosing

| Situation | Encoding |
|---|---|
| Domain states with meaningful names | sealed record hierarchy |
| Ad-hoc N-way return from a handler | OneOf |
| Team already fluent in FP, wants Option/Either/Validation throughout | LanguageExt |
| Success-or-error specifically | ErrorOr / CSharpFunctionalExtensions |
| Targeting .NET 11 or later | `closed` record hierarchy for states; `union` for one-of-existing-types |

## State machines

Unions shine for state transitions, because the *data* of each state differs:

```csharp
public abstract record Subscription
{
    private Subscription() { }
    public sealed record Trial(DateOnly EndsOn)                       : Subscription;
    public sealed record Active(DateOnly RenewsOn, Money Price)       : Subscription;
    public sealed record Cancelled(DateOnly EndedOn, string Reason)   : Subscription;
}

// Transitions are pure functions returning the new state (or an error)
public static Result<Subscription> Cancel(Subscription s, DateOnly on, string why) =>
    s switch
    {
        Subscription.Trial or Subscription.Active
            => Result.Ok<Subscription>(new Subscription.Cancelled(on, why)),
        Subscription.Cancelled
            => Result.Fail<Subscription>("already cancelled"),
        _   => throw new UnreachableException(),   // not needed with a C# 15 `closed` base
    };
```

Compare with `class Subscription { Status S; DateOnly? EndsOn; DateOnly? RenewsOn;
Money? Price; string? Reason; }` — five nullable fields, dozens of representable
states, a handful legal, and every consumer writing `!` or `?.` to cope.

## Serialization

Unions need a type discriminator on the wire. With `System.Text.Json`:

```csharp
[JsonPolymorphic(TypeDiscriminatorPropertyName = "$type")]
[JsonDerivedType(typeof(Circle),   "circle")]
[JsonDerivedType(typeof(Rect),     "rect")]
public abstract record Shape { /* ... */ }
```

Use explicit string discriminators, never type names — type names are refactoring
hazards and leak internals to clients. Keep the wire contract as a separate DTO
union from the domain union when the two can evolve independently.
