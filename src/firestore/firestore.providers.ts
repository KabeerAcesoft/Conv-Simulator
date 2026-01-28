import { Firestore } from '@google-cloud/firestore';

import {
  ServiceWorkerDto,
  SimulationConfigurationDto,
  SimulationPromptDto,
} from 'src/Controllers/Configuration/configuration.dto';
import {
  ApplicationSettingsDto,
  GlobalApplicationSettingsDto,
  InfluencesDto,
  PersistentIdentityDto,
  PersonaDto,
  ScenarioDto,
  SimulationCategory,
} from 'src/Controllers/Database/database.dto';
import {
  SimulationConversation,
  TaskStatus,
} from 'src/Controllers/Simulation/simulation.dto';
import { AppUserDto } from 'src/Controllers/users/users.dto';
import {
  CredentialsDocument,
  UsersDocument,
} from 'src/Controllers/users/users.interfaces';

/**
 * 🔹 Firestore Injection Token
 */
export const FirestoreDatabaseProvider = 'firestoredb';

/**
 * 🔹 Firestore Provider (SAFE FOR CLOUD RUN)
 * This will NOT crash the app if credentials are missing.
 */
export const firestoreProvider = {
  provide: FirestoreDatabaseProvider,
  useFactory: async () => {
    try {
      console.log('🔥 Initializing Firestore...');

      const db = new Firestore({
        projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
      });

      console.log('✅ Firestore initialized');
      return db;
    } catch (err) {
      console.error('❌ Firestore init failed — app will still start', err);
      return null; // 👈 prevents startup crash
    }
  },
};

/**
 * 🔹 Collections (used elsewhere in app)
 */
export const FirestoreCollectionProviders: string[] = [
  UsersDocument.collectionName,
  CredentialsDocument.collectionName,
  InfluencesDto.collectionName,
  AppUserDto.collectionName,
  TaskStatus.collectionName,
  SimulationPromptDto.collectionName,
  ScenarioDto.collectionName,
  ApplicationSettingsDto.collectionName,
  PersonaDto.collectionName,
  SimulationCategory.collectionName,
  SimulationConversation.collectionName,
  SimulationConfigurationDto.collectionName,
  ServiceWorkerDto.collectionName,
  PersistentIdentityDto.collectionName,
  GlobalApplicationSettingsDto.collectionName,
];
