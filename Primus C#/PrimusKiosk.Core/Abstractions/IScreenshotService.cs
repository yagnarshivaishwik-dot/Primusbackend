namespace PrimusKiosk.Core.Abstractions;

public interface IScreenshotService
{
    Task<string> CaptureAndUploadAsync(CancellationToken cancellationToken);
}
