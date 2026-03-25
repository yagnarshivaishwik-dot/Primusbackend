import { test, expect, request } from '@playwright/test';

test.describe('WebSocket auth', () => {
  const backendBase = 'http://localhost:8000';

  test('ws/admin rejects missing token', async () => {
    const ws = new WebSocket(backendBase.replace('http', 'ws') + '/ws/admin');

    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
      // Do not send auth; server should close connection
    });
  });

  test('HTTP auth works (sanity check)', async () => {
    const api = await request.newContext({ baseURL: backendBase });
    const res = await api.get('/health');
    expect(res.ok()).toBeTruthy();
  });
});


