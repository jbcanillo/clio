import { DatabaseBackup } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/layout/Panel';
import { BackupRestore } from '../components/features/BackupRestore';

/** Backup and restore on one page (also shown as a panel in Settings). */
export default function BackupRestorePage({ onToast }: { onToast?: (msg: string, type: string) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <PageHeader title="Backup & restore" subtitle="Download an encrypted copy of everything in Clio, or bring one back." className="mb-2" />
      <Panel title="Backup & restore" icon={<DatabaseBackup size={18} />}>
        <BackupRestore onToast={onToast} />
      </Panel>
    </div>
  );
}
