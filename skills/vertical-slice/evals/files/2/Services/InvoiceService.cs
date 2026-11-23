namespace Billing.Services;

public record Invoice(Guid Id, string CustomerEmail, decimal Total, DateOnly DueDate, bool IsPaid);

public record CreateInvoiceRequest(string CustomerEmail, decimal Total, DateOnly DueDate);

public interface IInvoiceService
{
    Task<Invoice?> GetAsync(Guid id);
    Task<Invoice> CreateAsync(CreateInvoiceRequest request);
    Task<Invoice?> MarkPaidAsync(Guid id);
}

public class InvoiceService : IInvoiceService
{
    private readonly BillingDbContext _db;

    public InvoiceService(BillingDbContext db) => _db = db;

    public async Task<Invoice?> GetAsync(Guid id) => await _db.Invoices.FindAsync(id);

    public async Task<Invoice> CreateAsync(CreateInvoiceRequest request)
    {
        var invoice = new Invoice(Guid.NewGuid(), request.CustomerEmail, request.Total, request.DueDate, false);
        _db.Invoices.Add(invoice);
        await _db.SaveChangesAsync();
        return invoice;
    }

    public async Task<Invoice?> MarkPaidAsync(Guid id)
    {
        var invoice = await _db.Invoices.FindAsync(id);
        if (invoice is null) return null;

        var paid = invoice with { IsPaid = true };
        _db.Entry(invoice).CurrentValues.SetValues(paid);
        await _db.SaveChangesAsync();
        return paid;
    }
}
