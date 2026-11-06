import { Injectable } from '@nestjs/common';
import type { OpsJobRuntimeSnapshot } from './ops-job.constants';

@Injectable()
export class OpsRuntimeRegistry {
  private readonly providers = new Map<string, () => OpsJobRuntimeSnapshot[]>();

  register(source: string, provider: () => OpsJobRuntimeSnapshot[]): void {
    this.providers.set(source, provider);
  }

  unregister(source: string): void {
    this.providers.delete(source);
  }

  list(): OpsJobRuntimeSnapshot[] {
    const byName = new Map<string, OpsJobRuntimeSnapshot>();
    for (const provider of this.providers.values()) {
      for (const snap of provider()) {
        byName.set(snap.jobName, snap);
      }
    }
    return [...byName.values()];
  }
}
