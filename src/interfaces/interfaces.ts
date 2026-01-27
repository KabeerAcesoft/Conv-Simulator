import { CONVERSATION_STATE, DIALOG_TYPES } from 'src/constants/constants';

export type KVPObject = Record<
  string,
  boolean | number | string | null | undefined
>;

export interface ICredentials {
  account_id: string;
  [key: string]: any;
}

export type KVPObjectString = Record<string, string>;

export interface IUser {
  favorite_models: string[];
  is_cc_user: boolean;
  account_ids: string[];
  is_lpa: boolean;
  created_at: number;
  display_name: string;
  created_by: string;
  uid?: number;
  consumer_jwt: null;
  updated_by: string;
  assigned_models: string[];
  photo_url: string;
  email: string;
  terms_agreed: boolean;
  account_id: string;
  updated_at: number;
  permissions: string[];
  roles: string[];
}

interface Participant {
  id: string;
  role: string;
}

export interface ParticipantDetails extends Participant {
  state: string;
  agentId?: string;
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  agentPhoto?: string;
  agentType?: string;
}

interface MetaData {
  sessionState: string;
  dialogId: string;
  mode: string;
  notificationKey: string;
}

interface Dialog {
  dialogId: string;
  participants: string[];
  participantsDetails: Participant[];
  dialogType: DIALOG_TYPES;
  channelType: string;
  metaData: MetaData;
  state: string;
  creationTs: number;
  endTs?: number;
  metaDataLastUpdateTs?: number;
  closedBy?: string;
  closedCause?: string;
}

interface TTR {
  ttrType: string;
  value: number;
}
interface ConversationHandlerDetails {
  accountId: string;
  skillId: string;
}
interface ConversationDetails {
  skillId: string;
  participants: Participant[];
  dialogs: Dialog[];
  brandId: string;
  state: string;
  stage: CONVERSATION_STATE;
  closeReason: string;
  startTs: number;
  endTs: number;
  metaDataLastUpdateTs: number;
  ttr: TTR;
  conversationHandlerDetails: ConversationHandlerDetails;
}
interface Result {
  convId: string;
  effectiveTTR: number;
  conversationDetails: ConversationDetails;
}
interface Change {
  type: string;
  result: Result;
}
interface Body {
  sentTs: number;
  changes: Change[];
}
export interface ExChangeEvent {
  kind: string;
  body: {
    changes: Change[];
    sentTs: number;
  };
  type: string;
}

export interface GoogleImageSearchResult {
  kind: string;
  title: string;
  htmlTitle: string;
  link: string;
  displayLink: string;
  snippet: string;
  htmlSnippet: string;
  mime: string;
  fileFormat: string;
  image: {
    byteSize: number;
    contextLink: string;
    height: number;
    thumbnailHeight: number;
    thumbnailLink: string;
    thumbnailWidth: number;
    width: number;
  };
}
