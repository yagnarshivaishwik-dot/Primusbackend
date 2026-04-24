using System.Net;
using System.Net.Http;
using Polly;
using Polly.Extensions.Http;

namespace PrimusKiosk.Core.Http;

/// <summary>
/// Polly policy factories used by the typed HTTP client pipeline.
/// </summary>
public static class RetryPolicies
{
    public static IAsyncPolicy<HttpResponseMessage> BuildRetry(int attempts)
    {
        var rng = new Random();
        var count = Math.Max(1, attempts);

        return HttpPolicyExtensions
            .HandleTransientHttpError()
            .OrResult(r => r.StatusCode == HttpStatusCode.TooManyRequests)
            .OrResult(r => r.StatusCode == HttpStatusCode.RequestTimeout)
            .WaitAndRetryAsync(count, retryAttempt =>
            {
                var baseDelay = TimeSpan.FromMilliseconds(300 * Math.Pow(2, retryAttempt - 1));
                var jitter = TimeSpan.FromMilliseconds(rng.Next(0, 250));
                return baseDelay + jitter;
            });
    }

    public static IAsyncPolicy<HttpResponseMessage> BuildTimeout(TimeSpan timeout)
        => Policy.TimeoutAsync<HttpResponseMessage>(timeout);
}
