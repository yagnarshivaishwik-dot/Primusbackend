using System.Collections.Generic;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Http.ApiContracts;
using PrimusKiosk.Core.Infrastructure;
using Serilog;

namespace PrimusKiosk.App.ViewModels;

/// <summary>
/// First-run setup: operator enters the Azure backend URL and a license key, we probe /health,
/// register the PC against /api/clientpc/register, and persist credentials to disk.
/// </summary>
public sealed partial class SetupViewModel : ObservableObject
{
    private readonly INavigationService _navigation;
    private readonly IPrimusApiClient _api;
    private readonly IHardwareFingerprintProvider _fingerprint;
    private readonly IDeviceCredentialStore _credentialStore;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(RegisterCommand))]
    private string _apiBaseUrl = string.Empty;

    [ObservableProperty]
    private string _pcName = Environment.MachineName;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(RegisterCommand))]
    private string _licenseKey = string.Empty;

    [ObservableProperty]
    private string? _errorMessage;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(RegisterCommand))]
    private bool _isBusy;

    [ObservableProperty]
    private string _busyMessage = "Registering device...";

    public SetupViewModel(
        INavigationService navigation,
        IPrimusApiClient api,
        IHardwareFingerprintProvider fingerprint,
        IDeviceCredentialStore credentialStore)
    {
        _navigation = navigation;
        _api = api;
        _fingerprint = fingerprint;
        _credentialStore = credentialStore;
    }

    private bool CanRegister()
        => !IsBusy
           && !string.IsNullOrWhiteSpace(ApiBaseUrl)
           && !string.IsNullOrWhiteSpace(LicenseKey);

    [RelayCommand(CanExecute = nameof(CanRegister))]
    private async Task RegisterAsync(CancellationToken cancellationToken)
    {
        ErrorMessage = null;
        IsBusy = true;
        try
        {
            BusyMessage = "Saving backend URL...";
            var normalized = ApiBaseUrl.TrimEnd('/');
            var wsUrl = normalized.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                ? "wss://" + normalized[8..]
                : normalized.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
                    ? "ws://" + normalized[7..]
                    : normalized;

            OverridesWriter.Save(new Dictionary<string, object?>
            {
                ["Primus:ApiBaseUrl"] = normalized,
                ["Primus:WsBaseUrl"] = wsUrl,
            });

            BusyMessage = "Probing backend...";
            if (!await _api.PingAsync(cancellationToken).ConfigureAwait(false))
            {
                ErrorMessage = "Could not reach the backend at /health. Check the URL and network.";
                return;
            }

            BusyMessage = "Computing hardware fingerprint...";
            var fingerprint = await _fingerprint.GetFingerprintAsync(cancellationToken).ConfigureAwait(false);

            BusyMessage = "Registering device...";
            var creds = await _api.RegisterPcAsync(new DeviceRegistrationRequest
            {
                Name = PcName,
                LicenseKey = LicenseKey,
                HardwareFingerprint = fingerprint,
                Capabilities = new[] { "screenshot", "commands", "heartbeat" },
            }, cancellationToken).ConfigureAwait(false);

            if (!creds.IsValid())
            {
                ErrorMessage = "Backend returned an incomplete registration response.";
                return;
            }

            await _credentialStore.SaveAsync(creds, cancellationToken).ConfigureAwait(false);

            _navigation.NavigateTo<LoginViewModel>();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Setup/registration failed");
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }
}
