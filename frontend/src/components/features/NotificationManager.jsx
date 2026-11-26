import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';

// One-time prompt to allow notifications. Ongoing control lives in the avatar menu and Settings,
// so nothing stays on screen once the prompt is answered or dismissed.
const NotificationManager = () => {
  const { permission, supported, requestPermission } = useNotifications();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(supported && permission === 'default');
  }, [permission, supported]);

  if (!show) return null;

  const enable = async () => {
    const granted = await requestPermission();
    setShow(!granted);
  };

  return (
    <div className="fixed bottom-24 right-4 left-4 z-50 mx-auto max-w-sm md:bottom-6 rounded-xl border border-hairline bg-card p-4 shadow-modal sm:left-auto">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <div className="flex-1">
          <h4 className="mb-1 text-sm font-semibold">Enable push notifications</h4>
          <p className="mb-3 text-sm text-ink-soft">Get notified when reminders are due.</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" onClick={enable}>
              Enable
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShow(false)} aria-label="Dismiss">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationManager;
