import Modal from '@/components/common/Modal';
import { Button } from '@/components/common';
import useUIStore from '@/app/store/useUIStore';

export default function TrackingModal() {
  const { trackingModalOpen, closeTrackingModal } = useUIStore();
  return (
    <Modal
      open={trackingModalOpen}
      title="Session Tracking"
      onClose={closeTrackingModal}
      footer={<Button onClick={closeTrackingModal}>Got it</Button>}
    >
      We track your session time to award XP and coins. You can pause tracking at any time
      from the session timer in the top navigation.
    </Modal>
  );
}
