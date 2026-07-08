'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildSiweMessage } from '@/lib/siwe';
import { getProvider } from '@/lib/wallet';
import { CHAIN_ID, CHAIN_ID_HEX } from '@/lib/chain';

export default function SignInPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'signing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const provider = getProvider();
    if (!provider) {
      setError('No wallet found. Install MetaMask or another injected wallet.');
      setStatus('error');
      return;
    }

    try {
      setStatus('connecting');
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0];
      if (!address) throw new Error('No account returned by wallet');

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_ID_HEX }],
        });
      } catch {
        // Ignore — some wallets don't have the chain added; signing still
        // works, and the server independently rejects a mismatched Chain ID.
      }

      const nonceRes = await fetch('/api/auth/nonce');
      if (!nonceRes.ok) throw new Error('Failed to get a sign-in nonce');
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = buildSiweMessage({
        address,
        chainId: CHAIN_ID,
        nonce,
        issuedAt: new Date().toISOString(),
      });

      setStatus('signing');
      const signature = (await provider.request({
        method: 'personal_sign',
        params: [message, address],
      })) as string;

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(body.error ?? 'Sign-in verification failed');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-cream text-ink flex items-center justify-center px-4">
      <div className="bg-card border border-border rounded-[18px] p-8 max-w-[420px] w-full text-center">
        <div className="w-[44px] h-[44px] rounded-[10px] bg-orange flex items-center justify-center text-white font-black text-[18px] mx-auto mb-5">
          R
        </div>
        <h1 className="text-[20px] font-extrabold m-0 mb-2">Sign in to Recon</h1>
        <p className="text-muted text-[14px] leading-relaxed m-0 mb-6">
          Sign a message with your merchant wallet — no gas, no transaction. This
          only proves you control the address; it never leaves your device.
        </p>
        <button
          onClick={connect}
          disabled={status === 'connecting' || status === 'signing'}
          className="w-full bg-orange text-white font-extrabold text-[14px] rounded-[10px] px-4 py-[12px] disabled:opacity-60"
        >
          {status === 'connecting'
            ? 'Connecting…'
            : status === 'signing'
              ? 'Awaiting signature…'
              : 'Connect wallet'}
        </button>
        {error ? (
          <p className="text-[13px] mt-4" style={{ color: '#C0392B' }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
