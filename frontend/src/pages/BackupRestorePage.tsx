import { PageHeader } from '../components/layout/PageHeader';
import { BackupRestore } from '../components/features/BackupRestore';

/** Backup and restore on one page, side by side on wider screens (opened from the menu). */
export default function BackupRestorePage({ onToast }: { onToast?: (msg: string, type: string) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-2 md:max-w-4xl">
      <PageHeader title="Backup & restore" subtitle="Download an encrypted copy of everything in Clio, or bring one back." className="mb-2" />
      <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card sm:p-5">
        <BackupRestore onToast={onToast} />
      </div>
    </div>
  );
}
