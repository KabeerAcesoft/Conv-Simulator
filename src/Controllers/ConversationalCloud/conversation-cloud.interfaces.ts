import { MESSAGE_TYPES } from 'src/constants/constants';

interface Info {
  startTime: string;
  startTimeL: number;
  endTime: string;
  endTimeL: number;
  conversationEndTime: string;
  conversationEndTimeL: number;
  fullDialogEndTime: string;
  fullDialogEndTimeL: number;
  duration: number;
  conversationId: string;
  brandId: string;
  latestAgentId: string;
  latestAgentNickname: string;
  latestAgentFullName: string;
  latestAgentLoginName: string;
  agentDeleted: boolean;
  latestSkillId: number;
  latestSkillName: string;
  source: string;
  closeReason: string;
  closeReasonDescription: string;
  mcs: number;
  alertedMCS: number;
  status: string;
  fullDialogStatus: string;
  firstConversation: boolean;
  csatRate: number;
  device: string;
  browser: string;
  operatingSystem: string;
  latestAgentGroupId: number;
  latestAgentGroupName: string;
  latestQueueState: string;
  isPartial: boolean;
  pendingAgentSurvey: boolean;
}
interface Campaign {
  campaignEngagementId: string;
  campaignEngagementName: string;
  campaignId: string;
  campaignName: string;
  goalId: string;
  goalName: string;
  engagementAgentNote: string;
  engagementSource: string;
  visitorBehaviorId: string;
  visitorBehaviorName: string;
  engagementApplicationId: string;
  engagementApplicationName: string;
  engagementApplicationTypeId: string;
  engagementApplicationTypeName: string;
  visitorProfileId: string;
  visitorProfileName: string;
  lobId: number;
  lobName: string;
  locationId: string;
  locationName: string;
  profileSystemDefault: boolean;
  behaviorSystemDefault: boolean;
}
interface Monitoring {
  country: string;
  countryCode: string;
  state: string;
  city: string;
  isp: string;
  org: string;
  device: string;
  ipAddress: string;
  browser: string;
  operatingSystem: string;
  conversationStartPage: string;
  conversationStartPageTitle: string;
}
export interface MessageData {
  msg: {
    text: string;
  };
  quickReplies?: {
    content: string;
  };
}

export interface MessageDataRich {
  richContent: {
    content: string;
  };
}

export interface MessageRecord {
  type: MESSAGE_TYPES;
  messageData: MessageData | MessageDataRich;
  messageId: string;
  seq: number;
  dialogId: string;
  participantId: string;
  source: string;
  time: string;
  timeL: number;
  device: string;
  audience: string;
  sentBy: string;
  contextData?: {
    rawMetadata: string;
    structuredMetadata: {
      actionReason?: {
        reason: string;
      };
      botResponse?: {
        businessCases: string[];
        externalConversationId: string;
        intents: {
          confidence: string;
          confidenceScore: number;
          id: string;
        }[];
      };
    };
  };
}

interface AgentParticipant {
  agentFullName: string;
  agentNickname: string;
  agentLoginName: string;
  agentId: string;
  userType: string;
  userTypeName: string;
  role: string;
  agentGroupName: string;
  agentGroupId: number;
  time: string;
  timeL: number;
  permission: string;
  dialogId: string;
  contextData?: {
    rawMetadata: string;
    structuredMetadata: {
      actionReason?: {
        reason: string;
      };
      botResponse?: {
        businessCases: string[];
        externalConversationId: string;
        intents: {
          confidence: string;
          confidenceScore: number;
          id: string;
        }[];
      };
    }[];
  };
}
interface ConsumerParticipant {
  participantId: string;
  firstName: string;
  lastName: string;
  token: string;
  email: string;
  phone: string;
  avatarURL: string;
  time: string;
  timeL: number;
  consumerName: string;
  dialogId: string;
}

interface Transfer {
  timeL: number;
  time: string;
  assignedAgentId: string;
  targetSkillId: number;
  targetSkillName: string;
  reason: string;
  by: string;
  sourceSkillId: number;
  sourceSkillName: string;
  sourceAgentId: string;
  sourceAgentFullName: string;
  sourceAgentLoginName: string;
  sourceAgentNickname: string;
  dialogId: string;
}
interface Interaction {
  assignedAgentId: string;
  assignedAgentFullName: string;
  assignedAgentLoginName: string;
  assignedAgentNickname: string;
  interactionTimeL: number;
  interactionTime: string;
  interactiveSequence: number;
  dialogId: string;
}
interface Dialog {
  dialogId: string;
  status: string;
  dialogType: string;
  dialogChannelType: string;
  startTime: string;
  startTimeL: number;
  endTime: string;
  endTimeL: number;
  closeReason: string;
  closeReasonDescription: string;
  skillId: number;
  skillName: string;
}
export interface MessageScore {
  messageId: string;
  messageRawScore: number;
  mcs: number;
  time: string;
  timeL: number;
}
interface MessageStatus {
  messageId: string;
  seq: number;
  time: string;
  timeL: number;
  participantId: string;
  participantType: string;
  messageDeliveryStatus: string;
  dialogId: string;
}
export interface ConversationSurvey {
  surveyType: string;
  surveyStatus: string;
  dialogId: string;
  surveyData: {
    answer: string;
    answerId: string;
    answerSeq: number;
    isValidAnswer: boolean;
    question: string;
    questionFormat: string;
    questionId: string;
    questionName: string;
    questionType: string;
  }[];
}
interface CoBrowseSession {
  sessionId: string;
  startTime: string;
  startTimeL: number;
  endTime: string;
  endTimeL: number;
  endReason: string;
  duration: number;
  type: string;
  capabilities?: string[];
  agentId: string;
  interactive: boolean;
}
interface CoBrowseSessions {
  coBrowseSessionsList: CoBrowseSession[];
}

export interface CustomerInfoSde {
  serverTimeStamp: string;
  customerInfo: {
    companyBranch: string;
    customerId: string;
    customerStatus: string;
    customerType: string;
  };
}

export interface SDE {
  customerInfo?: CustomerInfoSde;
  personalInfo?: {
    originalTimeStamp: string;
    personalInfo: {
      contacts: {
        personalContact: {
          email: string;
          phone: string;
        };
      }[];
      name: string;
      surname: string;
    };
    serverTimeStamp: string;
  };
  sdeType: string;
  serverTimeStamp: string;
}

export interface SDEs {
  events: SDE[];
}
interface ResponseTime {
  latestEffectiveResponseDueTime: number;
  configuredResponseTime: number;
}
interface Summary {
  text: string;
  lastUpdatedTime: number;
}
interface Intent {
  selectedClassification: {
    confidenceScore: number;
    intentLabel: string;
    intentName: string;
    versions: {
      modelName: string;
      modelVersion: string;
    }[];
  };
  allClassifications: {
    confidenceScore: number;
    intentLabel: string;
    intentName: string;
    versions: {
      modelName: string;
      modelVersion: string;
    }[];
  }[];
  messageId: string;
}
interface LatestAgentSurvey {
  surveyStatus: string;
  statusReason: string;
  dialogId: string;
  surveyId: string;
  acSurveyId: string;
  acSurveyName: string;
  acSurveyRevision: number;
  surveySkillId: number;
  surveySkillName: string;
  assignedAgentId: string;
  assignedAgentNickName: string;
  assignedAgentName: string;
  lastUpdateTime: number;
  submittedAnswers: {
    answers: {
      answer: string;
      answerId: string;
    }[];
    questionCategory: string;
    questionDefinition: string;
    questionId: string;
    questionText: string;
  }[];
}
interface PreviousAgentSurvey {
  surveyStatus: string;
  statusReason: string;
  dialogId: string;
  surveyId: string;
  acSurveyId: string;
  acSurveyName: string;
  acSurveyRevision: number;
  surveySkillId: number;
  surveySkillName: string;
  assignedAgentId: string;
  assignedAgentNickName: string;
  assignedAgentName: string;
  performedByAgentId: string;
  performedByAgentNickName: string;
  performedByAgentName: string;
  lastUpdateTime: number;
  submittedAnswers: {
    answers: {
      answer: string;
      answerId: string;
    }[];
    questionCategory: string;
    questionDefinition: string;
    questionId: string;
    questionText: string;
  }[];
}
export interface ConversationHistoryRecord {
  info: Info;
  campaigns: Campaign[];
  monitoring: Monitoring;
  messages: MessageRecord[];
  agentParticipants: AgentParticipant[];
  consumerParticipants: ConsumerParticipant[];
  transfers: Transfer[];
  interactions: Interaction[];
  dialogs: Dialog[];
  messageRecords: MessageRecord[];
  messageScores: MessageScore[];
  messageStatuses: MessageStatus[];
  conversationSurveys: ConversationSurvey[];
  coBrowseSessions: CoBrowseSessions;
  sdes: SDEs;
  responseTime: ResponseTime;
  summary: Summary;
  intents: Intent[];
  latestAgentSurvey?: LatestAgentSurvey | null; // Optional field
  previouslySubmittedAgentSurveys?: PreviousAgentSurvey[]; // Optional field
}

export interface ConversationHistoryResponse {
  _metadata: {
    count: number;
    self: {
      href: string;
      rel: string;
    };
    shardsStatusResult: {
      partialResult: boolean;
    };
  };
  conversationHistoryRecords: ConversationHistoryRecord[];
}
