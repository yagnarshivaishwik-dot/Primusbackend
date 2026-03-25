using PrimusKiosk.Infrastructure;
using Xunit;

namespace PrimusKiosk.Tests;

public class DpapiProtectorTests
{
    [Fact]
    public void RoundTrip_Works()
    {
        const string secret = "super-secret-token";

        var protectedValue = DpapiProtector.Protect(secret);
        Assert.False(string.IsNullOrWhiteSpace(protectedValue));
        Assert.NotEqual(secret, protectedValue);

        var unprotected = DpapiProtector.Unprotect(protectedValue);
        Assert.Equal(secret, unprotected);
    }

    [Fact]
    public void Unprotect_Invalid_ReturnsEmpty()
    {
        var result = DpapiProtector.Unprotect("not-base64");
        Assert.Equal(string.Empty, result);
    }
}


