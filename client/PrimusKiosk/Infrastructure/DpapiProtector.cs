using System;
using System.Security.Cryptography;
using System.Text;

namespace PrimusKiosk.Infrastructure;

public static class DpapiProtector
{
    public static string Protect(string plaintext)
    {
        if (string.IsNullOrEmpty(plaintext)) return string.Empty;

        var bytes = Encoding.UTF8.GetBytes(plaintext);
        var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.LocalMachine);
        return Convert.ToBase64String(protectedBytes);
    }

    public static string Unprotect(string protectedText)
    {
        if (string.IsNullOrEmpty(protectedText)) return string.Empty;

        try
        {
            var bytes = Convert.FromBase64String(protectedText);
            var unprotectedBytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(unprotectedBytes);
        }
        catch
        {
            return string.Empty;
        }
    }
}


