import { DynamicModule, Module } from '@nestjs/common';

import { Firestore, Settings } from '@google-cloud/firestore';

import {
  FirestoreCollectionProviders,
  FirestoreDatabaseProvider,
  FirestoreOptionsProvider,
} from './firestore.providers';

interface FirestoreModuleOptions {
  imports: any[];
  useFactory: (...arguments_: any[]) => Settings;
  inject: any[];
}

@Module({})
export class FirestoreModule {
  static forRoot(options: FirestoreModuleOptions): DynamicModule {
    const optionsProvider = {
      provide: FirestoreOptionsProvider,
      useFactory: options.useFactory,
      inject: options.inject,
    };

    const databaseProvider = {
      provide: FirestoreDatabaseProvider,
      useFactory: (config: Settings) => {
        const database = new Firestore(config);

        database.settings({ ignoreUndefinedProperties: true });

        return database;
      },
      inject: [FirestoreOptionsProvider],
    };

    const collectionProviders = FirestoreCollectionProviders.map(
      (providerName) => ({
        provide: providerName,
        useFactory: (database) => database.collection(providerName),
        inject: [FirestoreDatabaseProvider],
      }),
    );

    return {
      global: true,
      module: FirestoreModule,
      imports: options.imports,
      providers: [optionsProvider, databaseProvider, ...collectionProviders],
      exports: [databaseProvider, ...collectionProviders],
    };
  }
}
