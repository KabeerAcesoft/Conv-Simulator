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

export const FirestoreDatabaseProvider = 'firestoredb';

export const FirestoreOptionsProvider = 'firestoreOptions';

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
