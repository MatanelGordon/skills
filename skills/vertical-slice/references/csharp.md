# C# Vertical Slice Patterns

## Table of Contents

1. [Slice Folder Template](#slice-folder-template)
2. [MediatR Auto-Discovery Setup](#mediatr-auto-discovery-setup)
3. [Complete Command Example](#complete-command-example)
4. [Pipeline Behaviors for Cross-Cutting](#pipeline-behaviors-for-cross-cutting)
5. [Domain Events with INotification](#domain-events-with-inotification)
6. [Endpoint Registration Convention](#endpoint-registration-convention)
7. [Testing a Slice](#testing-a-slice)

---

## Slice Folder Template

```
src/
  Features/
    Orders/
      CreateOrder/
        CreateOrderCommand.cs       # IRequest<CreateOrderResponse>
        CreateOrderHandler.cs       # IRequestHandler<,>
        CreateOrderResponse.cs      # Response record
        CreateOrderValidator.cs     # AbstractValidator<CreateOrderCommand>
        CreateOrderEndpoint.cs      # Minimal API endpoint
        CreateOrderTests.cs         # xUnit tests
      GetOrder/
        GetOrderQuery.cs
        GetOrderHandler.cs
        GetOrderResponse.cs
        GetOrderEndpoint.cs
        GetOrderTests.cs
      CancelOrder/
        ...
    Users/
      RegisterUser/
        ...
  Shared/
    Behaviors/
      ValidationBehavior.cs         # IPipelineBehavior for FluentValidation
      LoggingBehavior.cs            # IPipelineBehavior for logging
    Domain/
      Events/
        OrderCreatedEvent.cs        # INotification
  Program.cs                        # Composition root — wires everything
```

---

## MediatR Auto-Discovery Setup

```csharp
// Program.cs
using MediatR;
using FluentValidation;

var builder = WebApplication.CreateBuilder(args);

// MediatR: scans this assembly for ALL IRequestHandler<> and INotificationHandler<>
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(Program).Assembly));

// FluentValidation: scans for ALL AbstractValidator<> implementations
builder.Services.AddValidatorsFromAssembly(typeof(Program).Assembly);

// Pipeline behaviors: applied to every MediatR request in order
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));

var app = builder.Build();

// Register all endpoints (see Endpoint Registration Convention section)
app.MapEndpoints(typeof(Program).Assembly);

app.Run();
```

After this setup, adding a new feature means creating files that implement `IRequestHandler<>`, `AbstractValidator<>`, or `INotificationHandler<>` — MediatR and FluentValidation discover them automatically. **Zero changes to Program.cs.**

---

## Complete Command Example

```csharp
// Features/Orders/CreateOrder/CreateOrderCommand.cs
public record CreateOrderCommand(
    string CustomerId,
    List<OrderItemDto> Items,
    decimal Total
) : IRequest<CreateOrderResponse>;

public record OrderItemDto(string Sku, int Quantity);
```

```csharp
// Features/Orders/CreateOrder/CreateOrderResponse.cs
public record CreateOrderResponse(
    Guid OrderId,
    string Status
);
```

```csharp
// Features/Orders/CreateOrder/CreateOrderValidator.cs
using FluentValidation;

public class CreateOrderValidator : AbstractValidator<CreateOrderCommand>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty();
        RuleFor(x => x.Total).GreaterThan(0);
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.Sku).NotEmpty();
            item.RuleFor(i => i.Quantity).GreaterThan(0);
        });
    }
}
```

```csharp
// Features/Orders/CreateOrder/CreateOrderHandler.cs
using MediatR;

public class CreateOrderHandler : IRequestHandler<CreateOrderCommand, CreateOrderResponse>
{
    private readonly AppDbContext _db;
    private readonly IPublisher _publisher;

    public CreateOrderHandler(AppDbContext db, IPublisher publisher)
    {
        _db = db;
        _publisher = publisher;
    }

    public async Task<CreateOrderResponse> Handle(
        CreateOrderCommand request, CancellationToken ct)
    {
        var order = new Order
        {
            Id = Guid.NewGuid(),
            CustomerId = request.CustomerId,
            Items = request.Items.Select(i => new OrderItem(i.Sku, i.Quantity)).ToList(),
            Total = request.Total,
            Status = "Created"
        };

        _db.Orders.Add(order);
        await _db.SaveChangesAsync(ct);

        // Publish domain event — subscribers are in separate files
        await _publisher.Publish(new OrderCreatedEvent(order.Id, order.CustomerId, order.Total), ct);

        return new CreateOrderResponse(order.Id, order.Status);
    }
}
```

```csharp
// Features/Orders/CreateOrder/CreateOrderEndpoint.cs
public class CreateOrderEndpoint : IEndpointDefinition
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/orders", async (CreateOrderCommand command, ISender sender) =>
        {
            var result = await sender.Send(command);
            return Results.Created($"/api/orders/{result.OrderId}", result);
        })
        .WithTags("Orders")
        .Produces<CreateOrderResponse>(StatusCodes.Status201Created)
        .ProducesValidationProblem();
    }
}
```

---

## Pipeline Behaviors for Cross-Cutting

Pipeline behaviors are **new files** that wrap all MediatR requests. Adding a new behavior = adding a new file + one line in `Program.cs`.

```csharp
// Shared/Behaviors/ValidationBehavior.cs
using FluentValidation;
using MediatR;

public class ValidationBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
        => _validators = validators;

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        if (!_validators.Any()) return await next();

        var context = new ValidationContext<TRequest>(request);
        var failures = _validators
            .Select(v => v.Validate(context))
            .SelectMany(r => r.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count > 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```

```csharp
// Shared/Behaviors/LoggingBehavior.cs
using MediatR;
using Microsoft.Extensions.Logging;
using System.Diagnostics;

public class LoggingBehavior<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
        => _logger = logger;

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken ct)
    {
        var name = typeof(TRequest).Name;
        _logger.LogInformation("Handling {RequestName}", name);

        var sw = Stopwatch.StartNew();
        var response = await next();
        sw.Stop();

        _logger.LogInformation("Handled {RequestName} in {ElapsedMs}ms", name, sw.ElapsedMilliseconds);
        return response;
    }
}
```

Every request goes through validation and logging automatically. Individual handlers never import or call these behaviors — MediatR composes the pipeline.

---

## Domain Events with INotification

Events are `INotification`. Handlers are `INotificationHandler<>`. MediatR discovers them via assembly scanning. Each handler is a **separate file**.

```csharp
// Shared/Domain/Events/OrderCreatedEvent.cs
using MediatR;

public record OrderCreatedEvent(
    Guid OrderId,
    string CustomerId,
    decimal Total
) : INotification;
```

```csharp
// Features/Notifications/OnOrderCreated/SendConfirmationEmail.cs  ← NEW FILE
using MediatR;

public class SendConfirmationEmail : INotificationHandler<OrderCreatedEvent>
{
    private readonly IEmailService _email;

    public SendConfirmationEmail(IEmailService email) => _email = email;

    public async Task Handle(OrderCreatedEvent notification, CancellationToken ct)
    {
        await _email.SendAsync(
            to: notification.CustomerId,
            subject: $"Order {notification.OrderId} confirmed",
            body: $"Your order for ${notification.Total} has been placed.");
    }
}
```

```csharp
// Features/Analytics/OnOrderCreated/TrackOrderAnalytics.cs  ← ANOTHER NEW FILE
using MediatR;

public class TrackOrderAnalytics : INotificationHandler<OrderCreatedEvent>
{
    private readonly IAnalyticsService _analytics;

    public TrackOrderAnalytics(IAnalyticsService analytics) => _analytics = analytics;

    public async Task Handle(OrderCreatedEvent notification, CancellationToken ct)
    {
        await _analytics.TrackAsync("order_created", new
        {
            notification.OrderId,
            notification.Total
        });
    }
}
```

Each new reaction to `OrderCreatedEvent` is a new file. The `CreateOrderHandler` that publishes the event never changes.

---

## Endpoint Registration Convention

Auto-discover endpoints so new slices don't require editing `Program.cs`:

```csharp
// Shared/IEndpointDefinition.cs
public interface IEndpointDefinition
{
    void MapEndpoint(IEndpointRouteBuilder app);
}
```

```csharp
// Shared/EndpointExtensions.cs
using System.Reflection;

public static class EndpointExtensions
{
    public static void MapEndpoints(this WebApplication app, Assembly assembly)
    {
        var endpointTypes = assembly.GetTypes()
            .Where(t => t.IsAssignableTo(typeof(IEndpointDefinition))
                     && t is { IsAbstract: false, IsInterface: false });

        foreach (var type in endpointTypes)
        {
            var endpoint = (IEndpointDefinition)Activator.CreateInstance(type)!;
            endpoint.MapEndpoint(app);
        }
    }
}
```

Now each slice's endpoint file implements `IEndpointDefinition` and is automatically registered. Adding a new endpoint = creating a new file. **Program.cs never changes after initial setup.**

---

## Testing a Slice

```csharp
// Features/Orders/CreateOrder/CreateOrderTests.cs
using MediatR;
using Moq;
using Xunit;

public class CreateOrderTests
{
    private readonly Mock<AppDbContext> _dbMock = new();
    private readonly Mock<IPublisher> _publisherMock = new();

    [Fact]
    public async Task Handle_ValidCommand_ReturnsCreatedResponse()
    {
        // Arrange
        var handler = new CreateOrderHandler(_dbMock.Object, _publisherMock.Object);
        var command = new CreateOrderCommand(
            CustomerId: "cust-123",
            Items: [new OrderItemDto("WIDGET-1", 2)],
            Total: 49.99m);

        _dbMock.Setup(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.Equal("Created", result.Status);
        Assert.NotEqual(Guid.Empty, result.OrderId);
    }

    [Fact]
    public async Task Handle_ValidCommand_PublishesOrderCreatedEvent()
    {
        // Arrange
        var handler = new CreateOrderHandler(_dbMock.Object, _publisherMock.Object);
        var command = new CreateOrderCommand("cust-123", [new("WIDGET-1", 2)], 49.99m);

        _dbMock.Setup(db => db.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        // Act
        await handler.Handle(command, CancellationToken.None);

        // Assert
        _publisherMock.Verify(p => p.Publish(
            It.Is<OrderCreatedEvent>(e =>
                e.CustomerId == "cust-123" && e.Total == 49.99m),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

The handler is tested in isolation — no HTTP server, no middleware, no other slices. Dependencies are mocked at the constructor boundary.
