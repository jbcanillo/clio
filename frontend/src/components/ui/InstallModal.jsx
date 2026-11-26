import React from 'react';

const InstallModal = ({ onInstall, onDismiss }) => {
  return (
    <div className="fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-[60] mx-auto max-w-md animate-fade-in">
      <div className="p-4 rounded-lg shadow-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="flex items-start gap-3">
          <img src="/logo.png" alt="" width={40} height={40} className="brand-medallion h-10 w-10 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Install Clio</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>
              Add Clio to your home screen for quick access, even offline.
            </p>
            <div className="flex gap-2">
              <button onClick={onInstall} className="btn btn-primary btn-sm">
                Install
              </button>
              <button onClick={onDismiss} className="btn btn-ghost btn-sm">
                Not now
              </button>
            </div>
          </div>
          <button onClick={onDismiss} className="ml-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallModal;
