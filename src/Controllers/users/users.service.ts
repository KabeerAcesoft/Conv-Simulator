import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CollectionReference } from '@google-cloud/firestore';

import { ICredentials } from 'src/interfaces/interfaces';
import { decrypt, encrypt } from 'src/utils/encryption';

import {
  CredentialsDocument,
  UserData,
  UsersDocument,
} from './users.interfaces';

export const context = '[UsersService]';

@Injectable()
export class UsersService {
  constructor(
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger,
    @Inject(UsersDocument.collectionName)
    private usersCollection: CollectionReference<UsersDocument>,
    @Inject(CredentialsDocument.collectionName)
    private credentialsCollection: CollectionReference<CredentialsDocument>,
  ) {
    this.logger.setContext(context);
  }

  async getUsers(accountId: string): Promise<UserData[]> | null {
    try {
      const snapshot = await this.usersCollection
        .where('account_id', '==', accountId)
        .get();

      const users: UserData[] = [];

      snapshot.forEach((document_) => {
        users.push(document_.data() as UserData);
      });

      return users;
    } catch (error) {
      this.logger.error({
        fn: 'getUsers',
        message: 'Error getting users',
        error: error.message,
      });

      throw new InternalServerErrorException('Error getting users');
    }
  }

  async getUser(id: string): Promise<UserData> {
    try {
      const document_ = await this.usersCollection.doc(id).get();

      return document_.data() as UserData;
    } catch (error) {
      this.logger.error({
        fn: 'getUser',
        message: `Error getting user with id ${id}`,
        error: error.message,
      });

      throw new InternalServerErrorException(
        `Error getting user with id ${id}`,
      );
    }
  }

  /**
   * Decrypts and parses a credential value
   */
  private async decryptCredentialValue(value: any): Promise<any> {
    const decryptedValue = await decrypt(value);

    try {
      return JSON.parse(decryptedValue);
    } catch {
      return decryptedValue;
    }
  }

  /**
   * Processes a single credential field
   */
  private async processCredentialField(
    credentials: ICredentials,
    key: string,
    value: any,
  ): Promise<void> {
    if (key === 'account_id' || !value) {
      return;
    }

    const decryptedValue = await this.decryptCredentialValue(value);

    Object.defineProperty(credentials, key, {
      value: decryptedValue,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  /**
   * Processes all fields in a credential document
   */
  private async processCredentialDocument(
    credentials: ICredentials,
    data: any,
  ): Promise<void> {
    for (const key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;

      const descriptor = Object.getOwnPropertyDescriptor(data, key);
      const value = descriptor?.value;

      await this.processCredentialField(credentials, key, value);
    }
  }

  async getCredentials(accountId: string): Promise<ICredentials> | null {
    try {
      const snapshot = await this.credentialsCollection
        .where('account_id', '==', accountId)
        .get();

      const credentials: ICredentials = {
        account_id: accountId,
      };

      for (const document_ of snapshot.docs) {
        const data = document_.data();

        await this.processCredentialDocument(credentials, data);
      }

      return credentials;
    } catch (error) {
      this.logger.error({
        fn: 'getCredentials',
        message: `Error getting credentials for account ${accountId}`,
        error: error.message,
      });

      throw new InternalServerErrorException(
        `Error getting credentials for account ${accountId}`,
      );
    }
  }

  async setCredentials(
    accountId: string,
    data: ICredentials,
  ): Promise<ICredentials> {
    try {
      const _credentials = await this.getCredentials(accountId);

      const credentials: ICredentials = {
        account_id: accountId,
      };

      delete data.accountId;

      for (const key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;

        const descriptor = Object.getOwnPropertyDescriptor(data, key);
        const value = descriptor?.value;

        if (value !== undefined) {
          const encryptedData = await encrypt(JSON.stringify(value));

          Object.defineProperty(credentials, key, {
            value: encryptedData,
            enumerable: true,
            writable: true,
            configurable: true,
          });

          Object.defineProperty(_credentials, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      }

      await this.credentialsCollection.doc(accountId).set({
        account_id: accountId,
        ...credentials,
      });

      return _credentials;
    } catch (error) {
      this.logger.error({
        fn: 'setCredentials',
        message: `Error setting credentials for account ${accountId}`,
        error: error.message,
      });

      throw new InternalServerErrorException(
        `Error setting credentials for account ${accountId}`,
      );
    }
  }
}
