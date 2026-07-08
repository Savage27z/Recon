export type EthProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function getProvider(): EthProvider | null {
  const w = window as unknown as { ethereum?: EthProvider };
  return w.ethereum ?? null;
}
