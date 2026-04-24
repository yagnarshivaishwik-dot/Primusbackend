using FluentAssertions;
using PrimusKiosk.Core.Device;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.Models;
using Xunit;

namespace PrimusKiosk.Tests.Device;

public sealed class DeviceCredentialStoreTests : IDisposable
{
    private readonly string _tempRoot;

    public DeviceCredentialStoreTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), "PrimusKioskTests-" + Guid.NewGuid().ToString("N"));
        PrimusPaths.RootOverride = _tempRoot;
        PrimusPaths.EnsureDirectories();
    }

    [Fact]
    public async Task SaveAndLoad_RoundTrips()
    {
        var store = new DeviceCredentialStore();
        var creds = new DeviceCredentials
        {
            PcId = "pc-42",
            DeviceSecret = "super-secret-value",
            LicenseKey = "LIC-001",
            HardwareFingerprint = "abcdef",
        };

        await store.SaveAsync(creds, CancellationToken.None);
        var loaded = await store.LoadAsync(CancellationToken.None);

        loaded.Should().NotBeNull();
        loaded!.PcId.Should().Be("pc-42");
        loaded.DeviceSecret.Should().Be("super-secret-value");
        loaded.LicenseKey.Should().Be("LIC-001");
    }

    [Fact]
    public async Task LoadAsync_WhenMissing_ReturnsNull()
    {
        var store = new DeviceCredentialStore();
        (await store.LoadAsync(CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task ClearAsync_RemovesFile()
    {
        var store = new DeviceCredentialStore();
        await store.SaveAsync(new DeviceCredentials
        {
            PcId = "pc",
            DeviceSecret = "s",
            LicenseKey = "L",
            HardwareFingerprint = "fp",
        }, CancellationToken.None);

        await store.ClearAsync(CancellationToken.None);

        File.Exists(PrimusPaths.DeviceCredentialsPath).Should().BeFalse();
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* ignore */ }
        PrimusPaths.RootOverride = null;
    }
}
