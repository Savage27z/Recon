'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';

type LoadState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/webhook')
      .then((r) => {
        if (!r.ok) throw new Error(`load failed (${r.status})`);
        return r.json();
      })
      .then((data: { url: string; secret: string }) => {
        setUrl(data.url ?? '');
        setSecret(data.secret ?? '');
        setLoadState('ready');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoadState('error');
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveState('saving');
    try {
      const res = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `save failed (${res.status})`);
      setSaveState('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState('error');
    }
  }

  return (
    <>
      <PageHeader label="Dashboard" title="Settings" />
      <div className="bg-card border border-border rounded-[18px] p-8 max-w-[520px]">
        <h2 className="text-[16px] font-extrabold m-0 mb-3">Webhook</h2>
        <p className="text-muted text-[14px] leading-relaxed m-0 mb-5">
          Recon POSTs a signed payload here on every matched payment. Leave
          blank to disable delivery.
        </p>

        {loadState === 'loading' ? (
          <p className="text-muted text-[13px]">Loading…</p>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-[14px]">
            <div>
              <label className="text-[12.5px] font-bold text-muted mb-[6px] block">
                Webhook URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app.example.com/webhooks/recon"
                className="w-full border border-border rounded-[10px] px-[14px] py-[10px] font-mono text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-bold text-muted mb-[6px] block">
                Webhook secret
              </label>
              <input
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="min. 16 characters — used to sign X-Recon-Signature"
                className="w-full border border-border rounded-[10px] px-[14px] py-[10px] font-mono text-[13px]"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={saveState === 'saving'}
                className="bg-orange text-white font-extrabold text-[14px] rounded-[10px] px-5 py-[12px] disabled:opacity-60"
              >
                {saveState === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
            {saveState === 'saved' ? (
              <p className="text-[13px] text-muted">Saved.</p>
            ) : null}
            {error ? (
              <p className="text-[13px]" style={{ color: '#C0392B' }}>
                {error}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </>
  );
}
