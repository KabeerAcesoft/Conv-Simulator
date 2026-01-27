import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { PromptConfigurationDto } from 'src/constants/common.dtos';
import {
  CONVERSATION_SIMULATION_STATES,
  CONVERSATION_STATE,
  DIALOG_TYPES,
  SIMULATION_STATUS,
  SYNTHETIC_CUSTOMER_SOURCE,
} from 'src/constants/constants';
import { AISMessage } from 'src/Controllers/AIStudio/ai-studio.dto';

export class ScenarioAssessment {
  @ApiProperty()
  @Expose()
  @IsString()
  scenarioId: string;

  @ApiProperty()
  @Expose()
  @IsString()
  scenarioName: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  mcs: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  csat: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  nps: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  fcr: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  avg_ai_score: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  duration: number | null;

  @ApiPropertyOptional()
  @Exclude()
  @Expose()
  @IsOptional()
  @IsString()
  ai_assessment: string | null;
}

export class AgentScenarioOutcome {
  @ApiProperty()
  @Expose()
  @IsString()
  scenarioId: string;

  @ApiPropertyOptional()
  @IsArray()
  scores: number[];

  @ApiPropertyOptional()
  @IsNumber()
  minScore: number;

  @ApiPropertyOptional()
  @IsNumber()
  maxScore: number;

  @ApiPropertyOptional()
  @IsNumber()
  avgScore: number;

  @ApiPropertyOptional()
  @IsArray()
  outcomes: string[];
}

export class Assessment {
  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  score?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  assessment: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  mcs?: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  csat?: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  fcr?: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  nps?: number | null;
}

export class AgentAssessment {
  @ApiProperty()
  @Expose()
  @IsString()
  agent: string;

  @ApiProperty()
  @Expose()
  @IsString()
  agentId: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  mcs: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  csat: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  nps: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  fcr: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  avg_ai_score: number | null;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  duration: number | null;

  @ApiPropertyOptional()
  @Exclude()
  @Expose()
  @IsOptional()
  @IsString()
  ai_assessment: string | null;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  feedback?: string | null;

  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  scenarioAssessments?: string[] | null;

  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  @Type(() => AgentScenarioOutcome)
  @ValidateNested({ each: true })
  agentScenarioOutcomes?: AgentScenarioOutcome[];
}

export class ConversationMetadata {
  // state
  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  state?: CONVERSATION_STATE;

  // latestAgentNickname
  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  latestAgentNickname: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  latestSkillId: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  latestQueueState: string;

  @ApiProperty()
  @Expose()
  @IsArray()
  @IsOptional()
  conversationSurveys: any[];

  @ApiProperty()
  @Expose()
  @IsString()
  closeReasonDescription: string;

  @ApiProperty()
  @Expose()
  @IsString()
  closeReason: string;

  @ApiProperty()
  @Expose()
  @IsNumber()
  startTimeL: number;

  @ApiProperty()
  @Expose()
  @IsNumber()
  endTimeL: number;

  @ApiProperty()
  @Expose()
  @IsNumber()
  duration: number;

  @ApiProperty()
  @Expose()
  @IsString()
  latestAgentId: string;

  @ApiProperty()
  @Expose()
  @IsString()
  latestAgentFullName: string;

  @ApiProperty()
  @Expose()
  @IsString()
  latestSkillName: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  mcs?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  csat?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsBoolean()
  @IsOptional()
  fcr?: boolean;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  nps?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  assessment?: {
    assessment: string;
    score?: number;
  };

  @ApiProperty()
  @Expose()
  @IsNumber()
  latestAgentGroupId: number;
  @ApiProperty()
  @Expose()
  @IsString()
  latestAgentGroupName: string;
  @ApiProperty()
  @Expose()
  @IsArray()
  mcsTrend: number[];
  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  aiSentiment?: number[];
  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  agentMessagesSent?: number;
  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  consumerMessagesSent?: number;
  @ApiPropertyOptional({ type: Object })
  @Expose()
  @IsOptional()
  personalInfo?: any;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  @IsOptional()
  customerInfo?: any;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  scenario?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  persona?: string;

  @ApiPropertyOptional({ type: Object })
  @Expose()
  @IsOptional()
  operational_factors?: any;

  @ApiProperty()
  @Expose()
  @IsString()
  conversationId: string;
}

export class ConsumerMessageDelayRange {
  @ApiProperty()
  @IsNumber()
  min: number;
  @ApiProperty()
  @IsNumber()
  max: number;
}

export class QueuedConversation {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsString()
  requestId: string;

  @ApiProperty()
  @IsString()
  id: string;
}

export class SimulationConversation {
  static readonly collectionName = 'conversation_simulations';

  @ApiProperty()
  @Expose()
  @IsNumber()
  llmErrorCount: number;

  @ApiProperty()
  @Expose()
  @IsNumber()
  updatedAt: number;

  @ApiProperty()
  @Expose()
  @IsBoolean()
  active: boolean;

  @ApiPropertyOptional()
  @Exclude()
  @IsBoolean()
  @IsOptional()
  pendingConsumer?: boolean;

  @ApiProperty()
  @Expose()
  @IsNumber()
  createdBy: number;

  @ApiProperty()
  @Expose()
  @IsNumber()
  createdAt: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  firstAssignedAgent: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  lasstAssignedAgent: number;

  @ApiPropertyOptional()
  @Exclude()
  @IsNumber()
  @IsOptional()
  pendingConsumerRespondTime?: number;

  @ApiProperty()
  @Expose()
  @IsEnum(CONVERSATION_SIMULATION_STATES)
  state: CONVERSATION_SIMULATION_STATES;

  @ApiProperty()
  @Expose()
  @IsEnum(CONVERSATION_STATE)
  stage: CONVERSATION_STATE;

  @ApiProperty()
  @Expose()
  @IsEnum(CONVERSATION_STATE)
  status: CONVERSATION_STATE;

  @ApiProperty()
  @Expose()
  @IsString()
  accountId: string;

  @ApiProperty()
  @Expose()
  @IsString()
  requestId: string;

  @ApiProperty()
  @Expose()
  @IsString()
  consumerName: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  customerId: string;

  @ApiProperty()
  @Expose()
  @IsString()
  consumerToken: string;

  @ApiProperty()
  @Expose()
  @IsString()
  id?: string;

  @ApiProperty()
  @Expose()
  @IsString()
  dialogId?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  dialogType?: DIALOG_TYPES;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  flowId?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  flowRequest?: any;

  @ApiProperty()
  @Expose()
  @IsObject()
  promptVariables?: any;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  skillId: number;

  @ApiProperty()
  @Expose()
  @IsNumber()
  agentTurns: number;

  @ApiProperty()
  @Expose()
  @IsNumber()
  customerTurns: number;

  @ApiPropertyOptional()
  @Exclude()
  @IsOptional()
  @IsString()
  source?: SYNTHETIC_CUSTOMER_SOURCE;

  @ApiPropertyOptional()
  @Exclude()
  @IsOptional()
  @IsString()
  syntheticCustomerflowId?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsBoolean()
  @IsOptional()
  queued?: boolean;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  lastAgentMessageTime?: number;

  @ApiProperty()
  @IsNumber()
  agentMessagesSentCount: number;

  @ApiProperty()
  @Expose()
  @IsArray()
  @IsOptional()
  agentMessages: any[];

  @ApiPropertyOptional()
  @Exclude()
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty()
  @Expose()
  @IsArray()
  @IsOptional()
  @Type(() => AISMessage)
  @ValidateNested({ each: true })
  messages: AISMessage[];

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  aisConversationId?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  scenario?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  persona?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  scenarioName?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  personaName?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  operational_factors?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsObject()
  @IsOptional()
  @Type(() => Assessment)
  @ValidateNested()
  assessment?: Assessment;

  @ApiPropertyOptional()
  @Expose()
  @IsObject()
  @IsOptional()
  @Type(() => ConversationMetadata)
  @ValidateNested()
  metadata?: ConversationMetadata;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  csat?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  fcr?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  nps?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  mcs?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  latestAgentFullName?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  latestAgentId?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  latestSkillName?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  latestAgentGroupId?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  latestAgentGroupName?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  mcsTrend?: number[];

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  startTimeL?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  endTimeL?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  closeReason?: string;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  latestSkillId?: string;
}

export class SimulationConversationCompleted extends SimulationConversation {
  static readonly collectionName = 'conversation_simulations';
  // final conversation document state when simulation is complete
}

export class TaskRequestDto {
  static readonly collectionName = 'task_requests';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  createdBy?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  updatedBy?: number;

  @ApiPropertyOptional()
  @Expose()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  createdAt?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  updatedAt?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  brandIndustry?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiProperty()
  @IsObject()
  @Type(() => ConsumerMessageDelayRange)
  @ValidateNested({ each: true })
  consumerMessageDelayRange: ConsumerMessageDelayRange;

  @ApiProperty({
    description:
      'Use a preconfigured template for the task describing the simulation',
    type: Boolean,
    required: false,
  })
  @IsBoolean()
  useTemplate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional()
  @Exclude()
  @IsOptional()
  @IsString()
  source?: SYNTHETIC_CUSTOMER_SOURCE;

  @ApiPropertyOptional()
  @Exclude()
  @IsOptional()
  @IsString()
  syntheticCustomerflowId?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  skillId?: number;

  @ApiProperty()
  @IsNumber()
  maxConversations: number;

  @ApiProperty()
  @IsNumber()
  concurrentConversations: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  useDelays: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  useFakeNames: boolean;

  @ApiProperty()
  @IsString()
  flowId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskName: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  batchAgentMessages: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  batchAgentMessagesDelay: number;

  @ApiProperty()
  @IsString()
  brandName: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  maxTurns?: number;

  @ApiProperty()
  @IsArray()
  personas: string[];

  @ApiProperty()
  @IsArray()
  identities: string[];

  @ApiProperty()
  @IsArray()
  scenarios: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  influences?: string[];

  @ApiProperty()
  @IsObject()
  @Type(() => PromptConfigurationDto)
  @ValidateNested({ each: true })
  prompts: PromptConfigurationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  configurationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originalConfigurationName?: string;
}

export class TaskStatus extends TaskRequestDto {
  static readonly collectionName = 'task_requests';

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsEnum(SYNTHETIC_CUSTOMER_SOURCE)
  source?: SYNTHETIC_CUSTOMER_SOURCE;

  @ApiPropertyOptional()
  @Exclude()
  @IsOptional()
  @IsString()
  syntheticCustomerflowId?: string;

  @ApiProperty()
  @IsObject()
  @Type(() => ConsumerMessageDelayRange)
  @ValidateNested({ each: true })
  consumerMessageDelayRange: ConsumerMessageDelayRange;

  @ApiProperty()
  @IsArray()
  @IsOptional()
  conversations: SimulationConversation[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flowId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skillId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  status: SIMULATION_STATUS;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorReason?: string;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  completedConversations: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  inFlightConversations: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  remaining?: number;

  @ApiProperty()
  @IsArray()
  @IsOptional()
  completedConvIds: string[];

  @ApiProperty()
  @IsArray()
  @IsOptional()
  conversationIds: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  convIdAndData: any[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  token: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  consumerToken?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  appJwt?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  mcs?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  csat?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  fcr?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  nps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  report?: string | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isComplete?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  init?: boolean;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  personas: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  identities: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  scenarios: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  influences?: string[];

  @ApiProperty()
  @IsNumber()
  llmErrorCount: number;

  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  @Type(() => AgentAssessment)
  @ValidateNested({ each: true })
  agentAssessments?: AgentAssessment[];

  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  @Type(() => AgentProfile)
  @ValidateNested({ each: true })
  agentProfiles?: AgentProfile[];

  @ApiPropertyOptional()
  @Expose()
  @IsArray()
  @IsOptional()
  @Type(() => ScenarioAssessment)
  @ValidateNested({ each: true })
  scenarioAnalysis?: ScenarioAssessment;
}

export class IntialRequest {
  taskName: string;
  requestId: string;
  useTemplate?: boolean;
  consumerMessageDelayRange: ConsumerMessageDelayRange;
  updatedAt: number;
  updatedBy: number;
  createdBy: number;
  createdAt: number;
  status: SIMULATION_STATUS;
  accountId: string;
  brandName: string;
  personas: string[];
  identities: string[];
  influences?: string[];
  scenarios: string[];
  maxConversations: number;
  concurrentConversations: number;
  completedConvIds: string[];
  conversationIds: string[];
  completedConversations: number;
  inFlightConversations: 0;
  conversations: [];
  convIdAndData: [];
  useDelays: boolean;
  batchAgentMessages: boolean;
  batchAgentMessagesDelay: number;
  useFakeNames: boolean;
  flowId: string;
  source?: SYNTHETIC_CUSTOMER_SOURCE;
  syntheticCustomerflowId?: string | null;
  token: string;
  userId: string;
  skillId?: number;
  maxTurns: number;
  type: string;
  prompts: {
    agentAssessment: string;
    agentTraining: string;
    botTesting: string;
    changeManagement: string;
    conversationAssessment: string;
    qualityAssurance: string;
    simulationAssessment: string;
    syntheticCustomer: string;
  };
  llmErrorCount: number;
  constructor(
    init: TaskRequestDto & {
      inFlightConversations: number;
      requestId: string;
      status: SIMULATION_STATUS;
      userId: number;
      useTemplate?: boolean;
    },
  ) {
    Object.assign(this, init);
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.updatedAt = Date.now();
    this.updatedBy = init.userId;
    this.createdBy = init.userId;
    this.llmErrorCount = 0;
  }
}

export class ConversationRequest {
  active: true;
  createdBy: number;
  createdAt: number;
  state: CONVERSATION_SIMULATION_STATES;
  stage: CONVERSATION_STATE;
  status: CONVERSATION_STATE;
  syntheticCustomerflowId?: string;
  accountId: string;
  id: string;
  aisConversationId: string;
  requestId: string;
  consumerName: string;
  customerId: string | null;
  consumerToken: string;
  scenario: string;
  scenarioName?: string;
  persona: string;
  personaName?: string;
  agentTurns: number;
  customerTurns: number;
  promptVariables: {
    consumerName: string;
    consumerToken?: string;
    customer_name: string;
    operational_factors?: string[];
  };
  lastAgentMessageTime: number;
  agentMessages: any[];
  messages: any[];
  skillId: number;
  agentMessagesSentCount: number;
  dialogId?: string;
  dialogType?: string;
  flowId?: string;
  flowRequest?: any;
  prompt?: string;

  constructor(init: {
    accountId: string;
    agentTurns: number;
    aisConversationId: string;
    consumerName: string;
    consumerToken: string;
    createdAt: number;
    createdBy: number;
    customerId: string | null;
    customerTurns: number;
    dialogId?: string;
    dialogType?: string;
    flowId?: string;
    flowRequest?: any;
    id: string;
    persona: string;
    personaName?: string;
    prompt?: string;
    promptVariables: Record<string, string[] | boolean | number | string>;
    requestId: string;
    scenario: string;
    scenarioName?: string;
    skillId: number;
    syntheticCustomerflowId?: string;
  }) {
    Object.assign(this, init);
    this.active = true;
    this.state = CONVERSATION_SIMULATION_STATES.ACTIVE;
    this.status = CONVERSATION_STATE.OPEN;
    this.stage = CONVERSATION_STATE.OPEN;
    this.lastAgentMessageTime = Date.now();
    this.agentMessages = [];
    this.messages = [];
    this.skillId = init.skillId;
    this.agentMessagesSentCount = 0;
    this.createdAt = init.createdAt || Date.now();
    if (this.syntheticCustomerflowId)
      this.syntheticCustomerflowId = init.syntheticCustomerflowId;
  }
}

export class TaskProgress {
  @ApiProperty()
  @IsNumber()
  inflightConversations: number;
  @ApiProperty()
  @IsNumber()
  completedConversations: number;
  @ApiProperty()
  @IsNumber()
  remainingConversations: number;
  @ApiProperty()
  @IsNumber()
  maxConversations: number;
  @ApiProperty()
  @IsBoolean()
  isComplete: boolean;
  @ApiProperty()
  @IsNumber()
  conversationsToQueue: number;
  @ApiProperty()
  @IsNumber()
  pendingConversations: number;
  @ApiProperty()
  @IsNumber()
  totalConversationRecords: number;
  @ApiProperty()
  @IsNumber()
  maxAdditionalConversations: number;
}

export interface PerformanceMetrics {
  agentId?: string;
  agent?: string;
  mcs?: number | null;
  csat?: number | null;
  nps?: number | null;
  fcr?: number | null;
  avg_ai_score?: number | null;
  ai_assessments?: string | null;
  duration?: number | null;
  agentScenarioOutcomes?: AgentScenarioOutcome[];
}

export interface ScenarioPerformanceMetrics {
  scenarioId?: string;
  scenarioName?: string;
  conversations?: number;
  mcs?: number | null;
  mcsCount?: number | null;
  mcs_avg?: number | null;
  csat?: number | null;
  csatCount?: number | null;
  csat_avg?: number | null;
  nps?: number | null;
  npsCount?: number | null;
  nps_avg?: number | null;
  fcr?: number | null;
  fcrCount?: number | null;
  fcr_avg?: number | null;
  avg_ai_score?: number | null;
  avg_ai_scoreCount?: number | null;
  ai_score?: number | null;
  ai_score_count?: number | null;
  ai_score_avg?: number | null;
  duration?: number | null;
  duration_avg?: number | null;
  ai_assessment?: string | null;
  ai_assessments?: string[];
  turns?: number | null;
  turns_avg?: number | null;
  feedback?: string[] | null;
}

export class AgentProfile {
  static readonly collectionName = 'agent_profiles';
  @ApiProperty()
  @IsString()
  id: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  comments?: string[];

  @ApiPropertyOptional()
  @Expose()
  @IsNumber()
  @IsOptional()
  avg_ai_score?: number | null;

  @ApiPropertyOptional()
  @Exclude()
  @Expose()
  @IsOptional()
  @IsString()
  ai_assessment?: string | null;

  @ApiProperty()
  @IsObject()
  totals: {
    ai_score?: number | null;
    ai_scoreCount?: number | null;
    conversations: number;
    csat?: number | null;
    csatCount?: number | null;
    duration: number;
    fcr?: number | null;
    fcrCount?: number | null;
    feedback?: string[] | null;
    mcs?: number | null;
    mcsCount?: number | null;
    nps?: number | null;
    npsCount?: number | null;
    turns?: number | null;
  };
  @ApiProperty()
  @IsObject()
  averages: {
    ai_score?: number;
    csat?: number;
    duration?: number;
    fcr?: number;
    feedback?: number;
    mcs?: number;
    nps?: number;
    turns?: number;
  };

  @ApiProperty()
  @IsObject()
  scenarios: any;
}
