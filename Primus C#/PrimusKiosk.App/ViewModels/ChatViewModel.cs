using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.App.ViewModels;

public sealed partial class ChatViewModel : ObservableObject
{
    private readonly IPrimusApiClient _api;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    private string _draft = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SendCommand))]
    private bool _isSending;

    public ObservableCollection<ChatMessageDto> Messages { get; }

    public ChatViewModel(SystemStore systemStore, IPrimusApiClient api)
    {
        _api = api;
        Messages = systemStore.ChatMessages;
    }

    private bool CanSend() => !IsSending && !string.IsNullOrWhiteSpace(Draft);

    [RelayCommand(CanExecute = nameof(CanSend))]
    private async Task SendAsync(CancellationToken cancellationToken)
    {
        var body = Draft.Trim();
        if (string.IsNullOrWhiteSpace(body)) return;

        IsSending = true;
        try
        {
            await _api.SendChatMessageAsync(body, cancellationToken).ConfigureAwait(false);
            Draft = string.Empty;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to send chat message.");
        }
        finally
        {
            IsSending = false;
        }
    }
}
