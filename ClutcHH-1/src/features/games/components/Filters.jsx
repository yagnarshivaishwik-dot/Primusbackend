import { Toggle } from '@/components/common';
import useFiltersStore from '@/app/store/useFiltersStore';
import { GAME_TAGS } from '../constants';

export default function Filters() {
  const { tags, free, toggleTag, setFree } = useFiltersStore();

  return (
    <div style={{ padding: 16, borderRadius: 12, background: '#2E3033' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#9CA3AF', fontSize: 12, textTransform: 'uppercase' }}>License</span>
        <Toggle checked={free} onChange={setFree} label="Free to play" />
      </div>
      <div style={{ color: '#9CA3AF', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Tags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {GAME_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 0,
              fontSize: 12,
              cursor: 'pointer',
              background: tags.includes(tag) ? '#E8364F' : '#1a1a2e',
              color: tags.includes(tag) ? '#fff' : '#9CA3AF',
            }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
