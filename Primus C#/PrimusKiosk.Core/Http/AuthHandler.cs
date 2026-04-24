using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.Core.Http;

/// <summary>
/// Attaches the Bearer token to outgoing requests. On a 401 we attempt a single silent
/// refresh against <c>POST /api/auth/refresh</c>, replay the original request with the new
/// token, and propagate the result. Repeated 401s bubble up to the caller.
/// </summary>
public sealed class AuthHandler : DelegatingHandler
{
    private readonly ITokenStore _tokenStore;
    private readonly AuthStore _authStore;
    private readonly IServiceProvider _services;

    private static readonly SemaphoreSlim RefreshGate = new(1, 1);

    public AuthHandler(
        ITokenStore tokenStore,
        AuthStore authStore,
        IServiceProvider services)
    {
        _tokenStore = tokenStore;
        _authStore = authStore;
        _services = services;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        await AttachTokenAsync(request, cancellationToken).ConfigureAwait(false);

        var response = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
        if (response.StatusCode != HttpStatusCode.Unauthorized)
        {
            return response;
        }

        Log.Debug("Auth 401 on {Method} {Path}; attempting token refresh.", request.Method, request.RequestUri?.AbsolutePath);

        if (!await TryRefreshAsync(cancellationToken).ConfigureAwait(false))
        {
            _authStore.SignOut();
            return response;
        }

        response.Dispose();
        var retry = await CloneAsync(request, cancellationToken).ConfigureAwait(false);
        await AttachTokenAsync(retry, cancellationToken).ConfigureAwait(false);
        return await base.SendAsync(retry, cancellationToken).ConfigureAwait(false);
    }

    private async Task AttachTokenAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var tokens = _authStore.Tokens ?? await _tokenStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (tokens is null || string.IsNullOrWhiteSpace(tokens.AccessToken))
        {
            return;
        }

        request.Headers.Authorization = new AuthenticationHeaderValue(tokens.TokenType, tokens.AccessToken);
    }

    private async Task<bool> TryRefreshAsync(CancellationToken cancellationToken)
    {
        await RefreshGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var current = _authStore.Tokens ?? await _tokenStore.LoadAsync(cancellationToken).ConfigureAwait(false);
            if (current is null || string.IsNullOrWhiteSpace(current.RefreshToken))
            {
                return false;
            }

            var api = (IPrimusApiClient)_services.GetService(typeof(IPrimusApiClient))!;
            if (api is null)
            {
                return false;
            }

            var refreshed = await api.RefreshAsync(current.RefreshToken!, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(refreshed.AccessToken))
            {
                return false;
            }

            _authStore.UpdateTokens(refreshed);
            await _tokenStore.SaveAsync(refreshed, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Token refresh failed.");
            return false;
        }
        finally
        {
            RefreshGate.Release();
        }
    }

    private static async Task<HttpRequestMessage> CloneAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri)
        {
            Version = request.Version,
            VersionPolicy = request.VersionPolicy,
        };

        foreach (var header in request.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (request.Content is not null)
        {
            var bytes = await request.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
            var content = new ByteArrayContent(bytes);
            foreach (var header in request.Content.Headers)
            {
                content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
            clone.Content = content;
        }

        foreach (var (key, value) in request.Options)
        {
            clone.Options.TryAdd(key, value);
        }

        return clone;
    }
}
