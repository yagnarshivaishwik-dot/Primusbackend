using System.Security.Cryptography;
using FluentAssertions;
using PrimusKiosk.Core.Infrastructure;
using Xunit;

namespace PrimusKiosk.Tests.Device;

public sealed class DpapiProtectorTests
{
    [Fact]
    public void RoundTrip_Works()
    {
        var plaintext = "primus-device-secret-sample-42";
        var ciphertext = DpapiProtector.Protect(plaintext, DataProtectionScope.CurrentUser);

        ciphertext.Should().NotBeNullOrWhiteSpace();
        ciphertext.Should().NotBe(plaintext);

        var roundTrip = DpapiProtector.Unprotect(ciphertext, DataProtectionScope.CurrentUser);
        roundTrip.Should().Be(plaintext);
    }

    [Fact]
    public void Unprotect_Invalid_ReturnsEmpty()
    {
        var garbage = "not-a-valid-base64!";
        DpapiProtector.Unprotect(garbage).Should().BeEmpty();
    }

    [Fact]
    public void Protect_EmptyInput_ReturnsEmpty()
    {
        DpapiProtector.Protect(string.Empty).Should().BeEmpty();
    }
}
