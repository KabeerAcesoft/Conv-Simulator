export class UserData {
  uid?: number;
  id: number | string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  roles?: string[];
  permissions?: string[];
  active: boolean;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

export class UsersDocument {
  static readonly collectionName = 'users';
  id: number | string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  active: boolean;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

export class CredentialsDocument {
  static readonly collectionName = 'credentials';
  account_id: string;
  [key: string]: any;
}
