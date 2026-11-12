import { Global, Logger, Module } from '@nestjs/common';
import { usage } from '../common/usage-monitor';
import { getEnv } from '../config/env';
import { FirebaseService } from '../firebase/firebase.service';
import { DataStore } from './data-store';
import { FirestoreDataStore } from './firestore-data-store';
import { MemoryDataStore } from './memory-data-store';

@Global()
@Module({
  providers: [
    FirebaseService,
    {
      provide: DataStore,
      inject: [FirebaseService],
      useFactory: (firebase: FirebaseService): DataStore => {
        const env = getEnv();
        if (env.DATA_BACKEND === 'memory') {
          new Logger('DatabaseModule').warn(
            '⚠ DEVELOPMENT IN-MEMORY DATA STORE — nothing is persisted; all data is lost on restart.',
          );
          return usage.instrument(new MemoryDataStore());
        }
        // Counted for the usage monitor (in-process counters only; see common/usage-monitor.ts).
        return usage.instrument(new FirestoreDataStore(firebase.firestore));
      },
    },
  ],
  exports: [DataStore, FirebaseService],
})
export class DatabaseModule {}
