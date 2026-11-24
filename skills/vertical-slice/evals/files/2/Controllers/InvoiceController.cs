using Billing.Services;
using Microsoft.AspNetCore.Mvc;

namespace Billing.Controllers;

[ApiController]
[Route("api/invoices")]
public class InvoiceController : ControllerBase
{
    private readonly IInvoiceService _invoices;

    public InvoiceController(IInvoiceService invoices) => _invoices = invoices;

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var invoice = await _invoices.GetAsync(id);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateInvoiceRequest request)
    {
        var invoice = await _invoices.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = invoice.Id }, invoice);
    }

    [HttpPost("{id:guid}/pay")]
    public async Task<IActionResult> MarkPaid(Guid id)
    {
        var invoice = await _invoices.MarkPaidAsync(id);
        return invoice is null ? NotFound() : Ok(invoice);
    }
}
