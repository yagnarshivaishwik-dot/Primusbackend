import { Tabs } from '@/components/common';
import useFiltersStore from '@/app/store/useFiltersStore';
import { LAUNCHERS } from '../constants';

export default function LauncherTabs() {
  const { launcher, setLauncher } = useFiltersStore();
  const tabs = ['All', ...LAUNCHERS];
  return (
    <Tabs
      tabs={tabs}
      value={launcher || 'All'}
      onChange={(v) => setLauncher(v === 'All' ? null : v)}
    />
  );
}
