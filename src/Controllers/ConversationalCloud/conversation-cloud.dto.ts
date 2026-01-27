import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Expose } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

import { CONVERSATION_STATE } from 'src/constants/constants';

export class ManagerOf {
  agentGroupId: string;
  assignmentDate: string;
}

export class MemberOf {
  agentGroupId: string;
  assignmentDate: string;
}

export class ApiKeyBasic {
  keyId: string;
  appSecret: string;
  token: string;
  tokenSecret: string;
}

class PromptVersionDetails {
  version: number;
  createdBy: number;
  createdAt: number;
}

class PromptVariables {
  name: string;
  sourceType: string;
  value?: string;
}

class PromptClientConfig {
  maxConversationTurns: number;
  maxConversationMessages: number;
  maxConversationTokens: number;
  includeLastUserMessage: boolean;
}

class PromptGenericConfig {
  llmProvider: string;
  llm: string;
  llmSubscriptionName: string;
  samplingTemperature?: number;
  maxResponseTokens?: number;
  maxPromptTokens?: number;
  completionsNumber?: number;
}

class PromptConfiguration {
  genericConfig: PromptGenericConfig;
  clientConfig: PromptClientConfig;
  variables: PromptVariables[];
}

export class PromptDto {
  accountId: string;
  id: string;
  name: string;
  clientType: string;
  description: string;
  langCode: string;
  promptHeader: string;
  createdBy: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  status: string;
  default: boolean;
  configuration: PromptConfiguration;
  versionDetails: PromptVersionDetails[];
}

export class PromptResponseDto {
  success: boolean;
  statusCode: number;
  successResult: {
    prompts: PromptDto[];
  };
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
