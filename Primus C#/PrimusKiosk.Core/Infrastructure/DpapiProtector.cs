using System.Security.Cryptography;
using System.Text;

namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Wraps Windows DPAPI (Data Protection API) with a Base64-friendly string surface.
/// LocalMachine scope is used so credentials survive user-profile changes on the kiosk.
/// </summary>
public static class DpapiProtector
{
    public static string Protect(string plaintext, DataProtectionScope scope = DataProtectionScope.LocalMachine)
    {
        if (string.IsNullOrEmpty(plaintext))
        {
            return string.Empty;
        }

        var bytes = Encoding.UTF8.GetBytes(plaintext);
        var protectedBytes = ProtectedData.Protect(bytes, optionalEntropy: null, scope);
        return Convert.ToBase64String(protectedBytes);
    }

    public static string Unprotect(string protectedText, DataProtectionScope scope = DataProtectionScope.LocalMachine)
    {
        if (string.IsNullOrEmpty(protectedText))
        {
            return string.Empty;
        }

        try
        {
            var bytes = Convert.FromBase64String(protectedText);
            var unprotectedBytes = ProtectedData.Unprotect(bytes, optionalEntropy: null, scope);
            return Encoding.UTF8.GetString(unprotectedBytes);
        }
        catch (CryptographicException)
        {
            // Corrupted or scope mismatch; treat as empty to trigger re-provisioning.
            return string.Empty;
        }
        catch (FormatException)
        {
            return string.Empty;
        }
    }

    public static byte[] ProtectBytes(byte[] plaintext, DataProtectionScope scope = DataProtectionScope.LocalMachine)
        => ProtectedData.Protect(plaintext, optionalEntropy: null, scope);

    public static byte[] UnprotectBytes(byte[] protectedBytes, DataProtectionScope scope = DataProtectionScope.LocalMachine)
        => ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, scope);
}
