using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace PrimusKiosk.Services;

public class OfflineQueueService
{
    private readonly AppStateService _appState;
    private readonly BackendClient _backend;
    private readonly string _dbPath;
    private readonly CancellationTokenSource _cts = new();

    public OfflineQueueService(AppStateService appState, BackendClient backend)
    {
        _appState = appState;
        _backend = backend;
        _dbPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "PrimusKiosk", "kiosk.sqlite");

        try
        {
            var dir = Path.GetDirectoryName(_dbPath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            Initialize();
            _ = Task.Run(ProcessLoopAsync);
        }
        catch (Exception ex)
        {
            // Do not crash the kiosk on queue init failure; just log and continue without offline replay.
            Serilog.Log.Error(ex, "Failed to initialize offline queue; operating without local queueing.");
        }
    }

    private void Initialize()
    {
        using var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText =
            @"CREATE TABLE IF NOT EXISTS queued_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_utc TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0
              );";
        cmd.ExecuteNonQuery();
    }

    public void Enqueue(string type, string payloadJson)
    {
        using var conn = new SqliteConnection($"Data Source={_dbPath}");
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText =
            "INSERT INTO queued_events (type, payload, created_utc, retry_count) VALUES ($t, $p, $c, 0);";
        cmd.Parameters.AddWithValue("$t", type);
        cmd.Parameters.AddWithValue("$p", payloadJson);
        cmd.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("O"));
        cmd.ExecuteNonQuery();
    }

    private async Task ProcessLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                if (_appState.IsConnected)
                {
                    await DrainOnceAsync();
                }
            }
            catch (Exception ex)
            {
                Serilog.Log.Warning(ex, "Offline queue processing failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), _cts.Token);
        }
    }

    private async Task DrainOnceAsync()
    {
        var events = new List<(long id, string type, string payload, int retry)>();
        using (var conn = new SqliteConnection($"Data Source={_dbPath}"))
        {
            conn.Open();
            using var select = conn.CreateCommand();
            select.CommandText = "SELECT id, type, payload, retry_count FROM queued_events ORDER BY created_utc ASC LIMIT 50;";
            using var reader = select.ExecuteReader();
            while (reader.Read())
            {
                events.Add((reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3)));
            }
        }

        foreach (var ev in events)
        {
            var success = await TrySendEventAsync(ev.type, ev.payload);
            using var conn = new SqliteConnection($"Data Source={_dbPath}");
            conn.Open();
            using var cmd = conn.CreateCommand();
            if (success)
            {
                cmd.CommandText = "DELETE FROM queued_events WHERE id = $id;";
                cmd.Parameters.AddWithValue("$id", ev.id);
            }
            else
            {
                cmd.CommandText = "UPDATE queued_events SET retry_count = retry_count + 1 WHERE id = $id;";
                cmd.Parameters.AddWithValue("$id", ev.id);
            }

            cmd.ExecuteNonQuery();
        }
    }

    private Task<bool> TrySendEventAsync(string type, string payload)
    {
        // For now just log; server-side handlers would be implemented in real backend.
        Serilog.Log.Information("Replaying queued event {Type} payload-length={Length}", type, payload?.Length ?? 0);
        return Task.FromResult(true);
    }
}


