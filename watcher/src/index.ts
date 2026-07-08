import { loadConfig } from './config.ts';
import { makeClient } from './chain.ts';
import { Store } from './db.ts';
import { run } from './watcher.ts';

const cfg = loadConfig();
const client = makeClient(cfg.rpcUrl, cfg.chainId);
const store = new Store(cfg.dbPath);

await run(client, store, cfg);
