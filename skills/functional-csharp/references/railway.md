# Railway-oriented programming in C#

Two tracks: success and failure. Steps compose; the first failure short-circuits
the rest. Coined by Scott Wlaschin.

## The staircase it replaces

```csharp
public Result<Order> Place(CartDto dto)
{
    var cart = ValidateCart(dto);
    if (cart.IsFailure) return Result.Fail<Order>(cart.Error);

    var customer = LoadCustomer(dto.CustomerId);
    if (customer.IsFailure) return Result.Fail<Order>(customer.Error);

    var credit = CheckCredit(customer.Value, cart.Value);
    if (credit.IsFailure) return Result.Fail<Order>(credit.Error);

    return CreateOrder(customer.Value, cart.Value);
}
```

Every step repeats the same check. `Bind` factors it out.

## Bind / Map / Tap

```csharp
public static Result<TOut> Bind<TIn, TOut>(
    this Result<TIn> r, Func<TIn, Result<TOut>> f)
    => r.IsSuccess ? f(r.Value) : Result.Fail<TOut>(r.Error);

public static Result<TOut> Map<TIn, TOut>(
    this Result<TIn> r, Func<TIn, TOut> f)
    => r.IsSuccess ? Result.Ok(f(r.Value)) : Result.Fail<TOut>(r.Error);

public static Result<T> Tap<T>(this Result<T> r, Action<T> act)
{
    if (r.IsSuccess) act(r.Value);
    return r;
}
```

| Operation | Signature shape | Use |
|---|---|---|
| `Map` | `T -> U` | transform a success value |
| `Bind` | `T -> Result<U>` | chain a step that can itself fail |
| `Tap` | `T -> void` | side effect (log, metric) without changing the value |
| `MapError` | `E -> F` | translate the error |
| `Else`/`Compensate` | `E -> Result<T>` | recover back onto the success track |
| `Match` | both tracks → one value | collapse at the boundary |

The rule: if the function you're applying returns a `Result`, use `Bind`. If it
returns a plain value, use `Map`. Using `Map` with a Result-returning function
gives you `Result<Result<T>>` — the nesting `Bind` exists to flatten.

```csharp
public Result<Order> Place(CartDto dto) =>
    ValidateCart(dto)
        .Bind(cart => LoadCustomer(dto.CustomerId).Map(c => (cart, c)))
        .Bind(x => CheckCredit(x.c, x.cart))
        .Bind(CreateOrder)
        .Tap(o => _logger.LogInformation("Placed {OrderId}", o.Id));
```

## LINQ query syntax

Implement `Select` and `SelectMany` and the compiler's query syntax becomes
do-notation — each `from` binds a step's success value, and all of them stay in
scope. This is the cleanest form when later steps need several earlier values.

```csharp
public static Result<TResult> SelectMany<TA, TB, TResult>(
    this Result<TA> source,
    Func<TA, Result<TB>> bind,
    Func<TA, TB, TResult> project)
    => source.IsFailure
        ? Result.Fail<TResult>(source.Error)
        : bind(source.Value) is var b && b.IsFailure
            ? Result.Fail<TResult>(b.Error)
            : Result.Ok(project(source.Value, b.Value));
```

```csharp
var result =
    from cart     in ValidateCart(dto)
    from customer in LoadCustomer(dto.CustomerId)
    from credit   in CheckCredit(customer, cart)     // cart still in scope
    select CreateOrder(customer, cart, credit);
```

Short-circuits on the first failure, no nesting, no repeated checks.

## Async

`Task<Result<T>>` needs async-aware combinators or every step becomes
`(await x).Bind(...)`.

```csharp
public static async Task<Result<TOut>> BindAsync<TIn, TOut>(
    this Task<Result<TIn>> task, Func<TIn, Task<Result<TOut>>> f)
{
    var r = await task.ConfigureAwait(false);
    return r.IsSuccess ? await f(r.Value).ConfigureAwait(false)
                       : Result.Fail<TOut>(r.Error);
}

var order = await ValidateCartAsync(dto)
    .BindAsync(LoadCustomerAsync)
    .BindAsync(CheckCreditAsync)
    .MapAsync(CreateOrder);
```

ErrorOr ships `.ThenAsync()`; CSharpFunctionalExtensions and LanguageExt have full
async families. Prefer theirs over hand-rolling — the overload matrix
(`Task`/`ValueTask` × sync/async selector) is tedious and easy to get subtly wrong.

## Fail-fast vs accumulate

`Bind` stops at the first error — correct for dependent steps. Form validation
wants every error at once, which is `Validation`, not `Result`:

```csharp
// LanguageExt
Validation<Error, Customer> customer =
    (ValidateName(dto.Name), ValidateEmail(dto.Email), ValidateAge(dto.Age))
        .Apply((n, e, a) => new Customer(n, e, a));
// -> Success(customer) or Fail([all three errors])
```

ErrorOr carries `List<Error>` natively, so accumulation is available without a
separate type. Hand-rolled version:

```csharp
public static Result<T> Combine<T>(T value, params Result[] checks)
{
    var errors = checks.Where(c => c.IsFailure).Select(c => c.Error).ToImmutableList();
    return errors.IsEmpty ? Result.Ok(value) : Result.Fail<T>(errors);
}
```

Use fail-fast for sequential dependencies (can't check credit before loading the
customer); use accumulation for independent field validation.

## Typed errors

```csharp
public abstract record OrderError
{
    private OrderError() { }
    public sealed record EmptyCart                            : OrderError;
    public sealed record InsufficientCredit(Money Short)      : OrderError;
    public sealed record CustomerNotFound(CustomerId Id)      : OrderError;
    public sealed record UpstreamUnavailable(string Service)  : OrderError;
}
```

The union lets the shell translate exhaustively, and adding a case surfaces every
place that must decide:

```csharp
public static IResult ToHttp(OrderError e) => e switch
{
    OrderError.EmptyCart              => Results.BadRequest("Cart is empty"),
    OrderError.InsufficientCredit ic  => Results.BadRequest($"Short by {ic.Short}"),
    OrderError.CustomerNotFound nf    => Results.NotFound(nf.Id),
    OrderError.UpstreamUnavailable u  => Results.StatusCode(502),
};
```

## Converting exceptions at the edge

Third-party and BCL code throws. Convert once, where it happens:

```csharp
public static Result<T> Try<T>(Func<T> f, Func<Exception, string> onError)
{
    try { return Result.Ok(f()); }
    catch (Exception ex) { return Result.Fail<T>(onError(ex)); }
}

var parsed = Try(() => JsonSerializer.Deserialize<Dto>(body)!,
                 ex => $"malformed body: {ex.Message}");
```

Catch specific exception types, not `Exception`, wherever you can name them.
Never catch and discard — that is the one thing worse than throwing.

## When NOT to use Result

- The failure means the program is broken (null argument on a public API,
  impossible state) — throw.
- Startup/configuration failures — throw and let the host fail fast.
- The caller has no meaningful recovery — an exception carries the stack trace,
  which is more useful than a string.
- A codebase that consistently uses exceptions and isn't migrating — consistency
  beats a half-converted mixture.

Result is for failures that are *expected*, *recoverable*, and *part of the
domain*. Everything else is an exception.
