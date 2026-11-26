import type { ReactNode } from 'react';
import { Cloud, DatabaseBackup, Eye, HardDrive, KeyRound, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/layout/Panel';

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-hairline text-sm">
      {rows.map(([what, how]) => (
        <div key={what} className="grid gap-1 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
          <dt className="font-semibold text-ink">{what}</dt>
          <dd className="text-ink-soft">{how}</dd>
        </div>
      ))}
    </dl>
  );
}

const List = ({ children }: { children: ReactNode }) => <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">{children}</ul>;

/** What Clio stores, what leaves your server and what is (and isn't) protected. Mirrors docs/PRIVACY.md. */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageHeader
        title="Privacy notice"
        subtitle="Clio is a personal, self-hosted app: you run the server and you hold the data. Here is what is stored, where it goes, and what is protected."
        className="mb-2"
      />

      <Panel title="What is stored, and where" icon={<HardDrive size={18} />}>
        <Rows rows={[
          ['Notes, diary, journal, reminders, profile', 'Markdown files in your vault on your server. Plain text: encrypt the server disk if you need encryption at rest.'],
          ['Photos', 'Image files in the vault (Clio/Attachments), next to your notes.'],
          ['OpenRouter API key', 'On your server, encrypted (AES-256-GCM). It is never sent back to the browser.'],
          ['Notifications and sync state', 'On your server: push endpoints and ids, no note text.'],
          ['Sign-in session', "Kept in the server's memory and this browser tab. It ends after 8 hours, on sign-out (Lock), or when the server restarts."],
          ['Notes written offline', 'In this browser, encrypted with a key made from your password and kept only in memory until they sync.'],
        ]} />
      </Panel>

      <Panel title="What leaves your server" icon={<Cloud size={18} />}>
        <List>
          <li>
            <strong className="text-ink">To OpenRouter and the AI model you chose:</strong> what you type in the chat, Clio's instructions, and what its
            tools find for that answer (matching notes, reminders, what it just saved). That provider's own privacy policy applies.
          </li>
          <li>
            <strong className="text-ink">To your browser's push service</strong> (Google, Apple or Mozilla): check-in nudges, and a reminder's title with the
            start of its notes, encrypted for your device. The push service can see that a message was sent.
          </li>
          <li><strong className="text-ink">Nothing else.</strong> No analytics, no tracking, no third-party scripts.</li>
        </List>
      </Panel>

      <Panel title="Your private diary" icon={<Eye size={18} />}>
        <List>
          <li>Diary days and journal entries are marked private. Clio's AI cannot search them unless you switch on <em>Share private diary with Clio this session</em> in the chat.</li>
          <li>That switch lasts only for the current sign-in. It turns itself off when you sign in again or the server restarts.</li>
          <li>Your own screens (Diary, search) always show your private entries to you.</li>
          <li>Notes, reminders and Clio's memory of you are not private: Clio can use them to answer you.</li>
        </List>
      </Panel>

      <Panel title="Backups" icon={<DatabaseBackup size={18} />}>
        <List>
          <li>A backup from <em>Backup &amp; restore</em> is one file with everything above except the API key and settings.</li>
          <li>It is encrypted in your browser (AES-256-GCM, key made from your backup password with PBKDF2-SHA256, 600,000 rounds) before it is saved. The server never sees the password.</li>
          <li>Without the password the file cannot be opened, by you or anyone else. Keep the file and the password in different places.</li>
        </List>
      </Panel>

      <Panel title="Protecting the AI from your notes" icon={<ShieldCheck size={18} />}>
        <p className="text-sm text-ink-soft">
          Text from your notes reaches the model marked as data, not instructions, and Clio's AI has no way to delete or overwrite a note: deleting
          always asks you first. This lowers, but cannot remove, the risk that a strange note steers the AI.
        </p>
      </Panel>

      <Panel title="Access" icon={<KeyRound size={18} />}>
        <List>
          <li>One password protects everything. After 5 wrong tries, sign-in locks for 15 minutes.</li>
          <li>Anyone with the password, or with access to the server and its disks, can read everything.</li>
          <li>If something goes wrong talking to the AI provider, the server's error log may contain your messages. Treat that log as private.</li>
        </List>
      </Panel>

      <Panel title="Deleting your data" icon={<Trash2 size={18} />}>
        <p className="text-sm text-ink-soft">
          Remove the vault and data volumes on your server, revoke your OpenRouter key, and clear this site's data in your browser (that removes offline
          notes and the notification subscription). Delete any backup files you downloaded.
        </p>
      </Panel>

      <p className="flex items-center gap-2 px-1 text-xs text-ink-muted">
        <Lock aria-hidden="true" size={12} /> This is a plain description of how Clio works, not legal advice.
      </p>
    </div>
  );
}
