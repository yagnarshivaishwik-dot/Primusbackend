using Microsoft.Data.Sqlite;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// SQLite-backed queue for offline replay of client-side events. Drained opportunistically
/// when the realtime transport reports Connected; remains durable across reboots.
/// </summary>
public sealed class OfflineQueueService : IOfflineQueue
{
    private readonly string _connectionString;
    private readonly Func<string, string, CancellationToken, Task<bool>> _sender;

    public OfflineQueueService(Func<string, string, CancellationToken, Task<bool>> sender)
    {
        _sender = sender;
        PrimusPaths.EnsureDirectories();
        _connectionString = $"Data Source={PrimusPaths.QueueDatabasePath}";
        EnsureSchema();
    }

    private void EnsureSchema()
    {
        using var conn = new SqliteConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS queued_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_utc TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0
            );
            """;
        cmd.ExecuteNonQuery();
    }

    public Task EnqueueAsync(string eventType, string payloadJson, CancellationToken cancellationToken)
    {
        using var conn = new SqliteConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "INSERT INTO queued_events (type, payload, created_utc, retry_count) VALUES ($t, $p, $c, 0);";
        cmd.Parameters.AddWithValue("$t", eventType);
        cmd.Parameters.AddWithValue("$p", payloadJson);
        cmd.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("O"));
        cmd.ExecuteNonQuery();
        return Task.CompletedTask;
    }

    public async Task<int> DrainAsync(CancellationToken cancellationToken)
    {
        var drained = 0;
        var events = LoadPending(50);

        foreach (var ev in events)
        {
            if (cancellationToken.IsCancellationRequested) break;

            bool success;
            try
            {
                success = await _sender(ev.Type, ev.Payload, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Offline queue sender threw for type {Type}", ev.Type);
                success = false;
            }

            using var conn = new SqliteConnection(_connectionString);
            conn.Open();
            using var cmd = conn.CreateCommand();
            if (success)
            {
                cmd.CommandText = "DELETE FROM queued_events WHERE id = $id;";
                drained++;
            }
            else
            {
                cmd.CommandText = "UPDATE queued_events SET retry_count = retry_count + 1 WHERE id = $id;";
            }
            cmd.Parameters.AddWithValue("$id", ev.Id);
            cmd.ExecuteNonQuery();
        }

        return drained;
    }

    public Task<int> PendingCountAsync(CancellationToken cancellationToken)
    {
        using var conn = new SqliteConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM queued_events;";
        var count = Convert.ToInt32(cmd.ExecuteScalar());
        return Task.FromResult(count);
    }

    private List<QueuedEvent> LoadPending(int limit)
    {
        var events = new List<QueuedEvent>();
        using var conn = new SqliteConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT id, type, payload FROM queued_events ORDER BY created_utc ASC LIMIT $limit;";
        cmd.Parameters.AddWithValue("$limit", limit);

        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            events.Add(new QueuedEvent(reader.GetInt64(0), reader.GetString(1), reader.GetString(2)));
        }
        return events;
    }

    private sealed record QueuedEvent(long Id, string Type, string Payload);
}
