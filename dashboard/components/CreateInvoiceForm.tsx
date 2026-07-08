'use client';

import { useState } from 'react';
import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';
import { getProvider } from '@/lib/wallet';
import { CHAIN_ID_HEX, EXPLORER_URL, INVOICE_REGISTRY, TOKENS } from '@/lib/chain';

const ABI = [
  {
    type: 'function',
    name: 'createInvoice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'dueDate', type: 'uint64' },
    ],
    outputs: [],
  },
] as const;

function randomInvoiceId(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Buffer.from(bytes).toString('hex')}` as Hex;
}

type Status = 'idle' | 'connecting' | 'awaiting-signature' | 'confirming' | 'done' | 'error';

export function CreateInvoiceForm({ onCreated }: { onCreated?: () => void }) {
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<Address | ''>(TOKENS[0]?.address ?? '');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: Hex; txHash: Hex } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const provider = getProvider();
    if (!provider) {
      setError('No wallet found. Install MetaMask or another injected wallet.');
      setStatus('error');
      return;
    }
    if (!token) {
      setError('Select a token.');
      setStatus('error');
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Enter a valid amount.');
      setStatus('error');
      return;
    }
    if (!dueDate) {
      setError('Select a due date.');
      setStatus('error');
      return;
    }

    try {
      setStatus('connecting');
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const from = accounts[0];
      if (!from) throw new Error('No account returned by wallet');

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CHAIN_ID_HEX }],
        });
      } catch {
        // best-effort — server/chain itself rejects a mismatched network
      }

      const id = randomInvoiceId();
      const amountBase = parseUnits(amount, 6);
      const dueDateSec = BigInt(Math.floor(new Date(dueDate).getTime() / 1000));

      const data = encodeFunctionData({
        abi: ABI,
        functionName: 'createInvoice',
        args: [id, amountBase, token as Hex, dueDateSec],
      });

      setStatus('awaiting-signature');
      const txHash = (await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: INVOICE_REGISTRY, data }],
      })) as Hex;

      setStatus('confirming');
      await waitForReceipt(provider, txHash);

      setResult({ id, txHash });
      setStatus('done');
      setAmount('');
      setDueDate('');
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  const busy = status === 'connecting' || status === 'awaiting-signature' || status === 'confirming';

  return (
    <div className="bg-card border border-border rounded-[18px] p-6 mb-6">
      <h2 className="text-[16px] font-extrabold m-0 mb-1">New invoice</h2>
      <p className="text-muted text-[13.5px] leading-relaxed m-0 mb-5">
        Signs and submits a real <code className="font-mono">createInvoice</code> transaction from
        your merchant wallet — Recon's watcher picks it up automatically.
      </p>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="text-[12.5px] font-bold text-muted mb-[6px] block">Amount</label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            className="w-full border border-border rounded-[10px] px-[14px] py-[10px] font-mono text-[13px]"
          />
        </div>
        <div>
          <label className="text-[12.5px] font-bold text-muted mb-[6px] block">Token</label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value as Address)}
            className="w-full border border-border rounded-[10px] px-[14px] py-[10px] font-mono text-[13px] bg-card"
          >
            {TOKENS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[12.5px] font-bold text-muted mb-[6px] block">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-border rounded-[10px] px-[14px] py-[10px] font-mono text-[13px]"
          />
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={busy}
            className="bg-orange text-white font-extrabold text-[14px] rounded-[10px] px-5 py-[12px] disabled:opacity-60"
          >
            {status === 'connecting'
              ? 'Connecting…'
              : status === 'awaiting-signature'
                ? 'Awaiting signature…'
                : status === 'confirming'
                  ? 'Confirming…'
                  : 'Create invoice'}
          </button>
        </div>
      </form>
      {error ? (
        <p className="text-[13px] mt-4" style={{ color: '#C0392B' }}>
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="text-[13px] mt-4 text-muted">
          Created —{' '}
          <a
            className="font-mono underline"
            href={`${EXPLORER_URL}/tx/${result.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            view transaction
          </a>
        </p>
      ) : null}
    </div>
  );
}

async function waitForReceipt(
  provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> },
  txHash: Hex,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = (await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    })) as { status?: Hex } | null;
    if (receipt) {
      if (receipt.status === '0x0') throw new Error('Transaction reverted');
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Timed out waiting for confirmation');
}
