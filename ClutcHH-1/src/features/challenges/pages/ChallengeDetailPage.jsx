import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Button, Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';
import { listEvents, progressEvent } from '@/features/quests/services/eventsService';

export default function ChallengeDetailPage() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listEvents().then((rows) => {
      if (cancelled) return;
      setEvent(rows.find((e) => String(e.id) === String(id)) || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const handleProgress = async () => {
    setPosting(true);
    setFeedback(null);
    try {
      await progressEvent(id, 1);
      setFeedback({ type: 'ok', text: 'Progress recorded.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message || 'Could not record progress.' });
    } finally {
      setPosting(false);
    }
  };

  return (
    <PlaceholderPage
      title={event?.name || 'Challenge'}
      subtitle={event?.description || ''}
      backTo={ROUTES.challenges}
    >
      {loading && <Card><div style={{ color: '#9CA3AF' }}>Loading…</div></Card>}
      {!loading && !event && (
        <Card>
          <div style={{ color: '#9CA3AF' }}>Challenge not found or no longer active.</div>
        </Card>
      )}
      {!loading && event && (
        <Card>
          <div style={{ color: '#E5E7EB', lineHeight: 1.6 }}>
            {event.description || 'No description provided by admin.'}
          </div>
          <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 10 }}>
            {event.endTime ? `Ends ${new Date(event.endTime).toLocaleString()}` : 'Ongoing'}
          </div>
          {feedback && (
            <div
              role="status"
              style={{
                marginTop: 12,
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
          <div style={{ marginTop: 16 }}>
            <Button onClick={handleProgress} disabled={posting}>
              {posting ? 'Saving…' : 'Log progress'}
            </Button>
          </div>
        </Card>
      )}
    </PlaceholderPage>
  );
}
