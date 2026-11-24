using Billing.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddDbContext<BillingDbContext>();
builder.Services.AddScoped<IInvoiceService, InvoiceService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();

var app = builder.Build();

app.MapControllers();
app.Run();
