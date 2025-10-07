import { findClosestColor as syncFind } from './ColorMatcher';

type ResolveMap = { [id: string]: (res: any) => void };
let worker: any = null;
let pending: ResolveMap = {};
let nextId = 1;

async function createWorkerIfNeeded() {
  if (worker) return worker;
  try {
    let Threads: any = null;
    try { Threads = require('react-native-worker-threads'); } catch (_e) { Threads = null; }
    if (!Threads) {
      try { Threads = require('react-native-threads'); } catch (_e) { Threads = null; }
    }
    if (!Threads) throw new Error('no-threads-lib');
    if (Threads.spawn) {
      worker = Threads.spawn('./services/colorWorker.js');
      if (worker.on) {
        worker.on('message', (msg: any) => {
          try {
            const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
            if (data && data.type === 'result' && data.id) {
              const r = pending[String(data.id)];
              if (r) {
                r(data.result);
                delete pending[String(data.id)];
              }
            }
          } catch (_e) {}
        });
      }
    } else {
      worker = new Threads.Thread('./services/colorWorker.js');
      worker.onmessage = (msg: any) => {
        try {
          const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (data && data.type === 'result' && data.id) {
            const r = pending[String(data.id)];
            if (r) {
              r(data.result);
              delete pending[String(data.id)];
            }
          }
        } catch (_e) {}
      };
    }
    worker.onmessage = (msg: any) => {
      try {
        const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
        if (data && data.type === 'result' && data.id) {
          const r = pending[String(data.id)];
          if (r) {
            r(data.result);
            delete pending[String(data.id)];
          }
        }
      } catch (_e) {}
    };
    worker.postMessage = worker.postMessage || worker.post || (worker.send && ((m: any) => worker.send(m)));
    return worker;
  } catch (e) {
    return null;
  }
}

export async function findClosestColorAsync(rgb: number[], topN = 3): Promise<any> {
  const w = await createWorkerIfNeeded();
  if (!w) {
    try {
      return Promise.resolve(syncFind(rgb, topN));
    } catch (e) {
      return Promise.resolve(null);
    }
  }
  const id = String(nextId++);
  return new Promise((resolve) => {
    pending[id] = resolve;
    try {
      const msg = { type: 'match', id, rgb, topN };
      w.postMessage(JSON.stringify(msg));
      setTimeout(async () => {
        if (pending[id]) {
          try {
            const _res = syncFind(rgb, topN);
            pending[id](_res);
            delete pending[id];
          } catch (e) {
            pending[id](null);
            delete pending[id];
          }
        }
      }, 800);
    } catch (e) {
      try {
        const _res = syncFind(rgb, topN);
        delete pending[id];
        resolve(_res);
      } catch (_e) {
        delete pending[id];
        resolve(null);
      }
    }
  });
}

export default { findClosestColorAsync };

export async function pingWorker(timeout = 800): Promise<boolean> {
  try {
    const w = await createWorkerIfNeeded();
    if (!w) return false;
    return await new Promise<boolean>((resolve) => {
      const id = String(nextId++);
  const onResolved = (_res: any) => { resolve(true); };
      pending[id] = onResolved;
      try {
        const msg = { type: 'match', id, rgb: [0,0,0], topN: 1 };
        w.postMessage(JSON.stringify(msg));
      } catch (e) {
        delete pending[id];
        resolve(false);
      }
      setTimeout(() => {
        if (pending[id]) {
          delete pending[id];
          resolve(false);
        }
      }, timeout);
    });
  } catch (_e) {
    return false;
  }
}
