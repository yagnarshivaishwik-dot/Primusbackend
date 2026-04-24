using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Http;

/// <summary>
/// Signs outbound HTTP requests that target device-scoped endpoints with HMAC-SHA256.
///
/// Matches <c>backend/app/utils/security.py::verify_device_signature</c>:
///   * Canonical message: <c>(method + path + timestamp + nonce).encode("utf-8")</c>
///     CONCATENATED WITH THE RAW REQUEST BODY BYTES (no separators).
///   * Headers: <c>X-PC-ID</c>, <c>X-Device-Signature</c>, <c>X-Device-Timestamp</c>,
///     <c>X-Device-Nonce</c>.
///
/// The device secret is loaded lazily from the credential store on every send
/// and cleared from memory immediately after signing. Requests to non-signed
/// paths pass through untouched so /api/auth/* and other JWT endpoints still
/// work via the <see cref="AuthHandler"/> below us in the pipeline.
/// </summary>
public sealed class HmacSigningHandler : DelegatingHandler
{
    // Endpoints that require device-signature auth on the backend. Anything
    // outside this list is JWT or unauthenticated and passes through.
    private static readonly string[] SignedPrefixes =
    {
        "/api/clientpc/",
        "/api/command/",
        "/api/screenshot/",
    };

    private readonly IDeviceCredentialStore _credentialStore;

    public HmacSigningHandler(IDeviceCredentialStore credentialStore)
    {
        _credentialStore = credentialStore;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri is null || !ShouldSign(request.RequestUri.AbsolutePath))
        {
            return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }

        var creds = await _credentialStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (creds is null || !creds.IsValid())
        {
            Log.Debug("HmacSigningHandler: device credentials not yet provisioned — sending unsigned (backend will 401).");
            return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            .ToString(System.Globalization.CultureInfo.InvariantCulture);
        var nonce = Guid.NewGuid().ToString("N"); // 32-char lowercase hex
        var method = request.Method.Method.ToUpperInvariant();
        var path = request.RequestUri.AbsolutePath;

        // Materialise the body bytes so we can include them in the canonical
        // message AND replay them as the request content (reading a stream
        // twice would throw).
        byte[] bodyBytes = Array.Empty<byte>();
        if (request.Content is not null)
        {
            bodyBytes = await request.Content
                .ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
            var originalContent = request.Content;
            var replacement = new ByteArrayContent(bodyBytes);
            foreach (var h in originalContent.Headers)
            {
                replacement.Headers.TryAddWithoutValidation(h.Key, h.Value);
            }
            request.Content = replacement;
        }

        // Canonical = (method + path + timestamp + nonce) UTF-8 bytes || raw body bytes
        var prefix = Encoding.UTF8.GetBytes(method + path + timestamp + nonce);
        var message = new byte[prefix.Length + bodyBytes.Length];
        Buffer.BlockCopy(prefix, 0, message, 0, prefix.Length);
        if (bodyBytes.Length > 0)
        {
            Buffer.BlockCopy(bodyBytes, 0, message, prefix.Length, bodyBytes.Length);
        }

        var secretBytes = Encoding.UTF8.GetBytes(creds.DeviceSecret);
        string signature;
        try
        {
            using var hmac = new HMACSHA256(secretBytes);
            signature = Convert.ToHexString(hmac.ComputeHash(message)).ToLowerInvariant();
        }
        finally
        {
            Array.Clear(secretBytes, 0, secretBytes.Length);
        }

        // Strip any stale headers a caller might have set manually, then apply
        // the fresh set. TryAddWithoutValidation silently no-ops on dupes so
        // we Remove first to keep the pipeline deterministic under retries.
        foreach (var h in new[] { "X-PC-ID", "X-Device-Signature", "X-Device-Timestamp", "X-Device-Nonce" })
        {
            request.Headers.Remove(h);
        }
        request.Headers.TryAddWithoutValidation("X-PC-ID", creds.PcId);
        request.Headers.TryAddWithoutValidation("X-Device-Signature", signature);
        request.Headers.TryAddWithoutValidation("X-Device-Timestamp", timestamp);
        request.Headers.TryAddWithoutValidation("X-Device-Nonce", nonce);

        return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private static bool ShouldSign(string path)
    {
        foreach (var prefix in SignedPrefixes)
        {
            if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }
}
