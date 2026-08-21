# Discriminated unions in C#

## Status of native unions

Native union types are a **.NET 11 preview** feature (announced April 2026), not
in any released version. Proposed syntax:

```csharp
public record Success<T>(T Value);
public record Failure(string Message);
public union Result<T>(Success<T>, Failure);       // PREVIEW — verify before using

string describe = result switch
{
    Success<int> s => $"Value: {s.Value}",
    Failure f      => $"Error: {f.Message}",
};
```

Noted caveats from the preview: mixing value types with reference types causes
boxing in the initial release; all-reference-type unions avoid it. **Check the
current .NET/C# version and release notes before writing this** — if the target
is .NET 10 LTS (released Nov 2025, supported to Nov 2028), use the encodings below.

## Encoding 1 — sealed record hierarchy (default)

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

Verified on .NET 8 — do not assume better:

| Switch over a record hierarchy | Result |
|---|---|
| all cases, no `_` arm | **CS8509 warning** — "the pattern '_' is not covered" |
| all cases + `null =>` arm | **CS8509 warning** — "the pattern 'not null' is not covered" |
| all cases + `_ =>` arm | no warning |

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
| Targeting .NET 11+ once released | native `union` (re-check status) |

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
