import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Button, Card } from '@/components/common';
import useSessionStore from '@/app/store/useSessionStore';
import { api } from '@/app/api/client';
import { ROUTES } from '@/app/routes/paths';

/**
 * Edit profile — wired to POST /api/v1/auth/me (update self).
 */
export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { user, refreshMe } = useSessionStore();
  const [birthdate, setBirthdate] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (user?.raw?.birthdate) setBirthdate(user.raw.birthdate.slice(0, 10));
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await api('/api/v1/auth/me', {
        method: 'POST',
        body: birthdate ? { birthdate } : {},
      });
      await refreshMe();
      setFeedback({ type: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlaceholderPage title="Edit Profile" subtitle={user?.email || ''} backTo={ROUTES.mainProfile}>
      <Card>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ color: '#E5E7EB', fontSize: 13 }}>
            <div style={{ marginBottom: 6, color: '#9CA3AF' }}>Name</div>
            <input
              value={user?.name || ''}
              disabled
              style={{ width: '100%', padding: '10px 12px', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB' }}
            />
          </label>
          <label style={{ color: '#E5E7EB', fontSize: 13 }}>
            <div style={{ marginBottom: 6, color: '#9CA3AF' }}>Email</div>
            <input
              value={user?.email || ''}
              disabled
              style={{ width: '100%', padding: '10px 12px', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB' }}
            />
          </label>
          <label style={{ color: '#E5E7EB', fontSize: 13 }}>
            <div style={{ marginBottom: 6, color: '#9CA3AF' }}>Birthdate</div>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#E5E7EB' }}
            />
          </label>
          {feedback && (
            <div
              role="status"
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                background: feedback.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${feedback.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                color: feedback.type === 'error' ? '#fca5a5' : '#86efac',
              }}
            >
              {feedback.text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="ghost" type="button" onClick={() => navigate(ROUTES.mainProfile)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      <div style={{ marginTop: 14, color: '#6B7280', fontSize: 12 }}>
        Only birthdate is user-editable. Contact an admin to change your name, email or role.
      </div>
    </PlaceholderPage>
  );
}
