import { Inject, Injectable } from '@nestjs/common';

import { Firestore } from '@google-cloud/firestore';

import { FirestoreDatabaseProvider } from '../firestore/firestore.providers';

@Injectable()
export class FirebaseRepository {
  #db: Firestore;

  constructor(@Inject(FirestoreDatabaseProvider) database: Firestore) {
    this.#db = database;
    this.#db.settings({ ignoreUndefinedProperties: true });
  }
}
