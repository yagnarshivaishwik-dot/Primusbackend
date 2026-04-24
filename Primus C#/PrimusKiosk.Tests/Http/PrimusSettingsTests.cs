using FluentAssertions;
using PrimusKiosk.Core.Infrastructure;
using Xunit;

namespace PrimusKiosk.Tests.Http;

public sealed class PrimusSettingsTests
{
    [Fact]
    public void IsConfigured_BothUrlsPresent_ReturnsTrue()
    {
        var s = new PrimusSettings { ApiBaseUrl = "https://a", WsBaseUrl = "wss://a" };
        s.IsConfigured().Should().BeTrue();
    }

    [Fact]
    public void IsConfigured_Missing_ReturnsFalse()
    {
        new PrimusSettings { ApiBaseUrl = "", WsBaseUrl = "" }.IsConfigured().Should().BeFalse();
        new PrimusSettings { ApiBaseUrl = "https://a", WsBaseUrl = "" }.IsConfigured().Should().BeFalse();
        new PrimusSettings { ApiBaseUrl = "", WsBaseUrl = "wss://a" }.IsConfigured().Should().BeFalse();
    }
}
