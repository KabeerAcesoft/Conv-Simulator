import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import {
  AccountConfigDto,
  ConversationTopicRequestDto,
} from 'src/common/dto/shared.dto';

class Message {
  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty()
  @IsString()
  role: string;
}

class MockConversation {
  @ApiProperty()
  @IsString()
  experience: string;

  @ApiProperty()
  @IsArray()
  messages: Message[];
}

export class ConversationSampleRequestDto extends MockConversation {
  @ApiProperty()
  @IsString()
  account_id: string;

  @ApiProperty()
  @IsString()
  topic_id: string;
}

export class ConversationSampleDto extends ConversationSampleRequestDto {
  static readonly collectionName = 'conversation_samples';

  @ApiPropertyOptional()
  @IsString()
  id: string;
}

export class ConversationTopicDto extends ConversationTopicRequestDto {
  static readonly collectionName = 'conversation_topics';
  @ApiPropertyOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsArray()
  config: AccountConfigDto[];

  @ApiPropertyOptional()
  @IsArray()
  conversations: ConversationSampleDto[];

  @ApiPropertyOptional()
  @IsString()
  created_by?: string;

  @ApiPropertyOptional()
  @IsString()
  updated_by?: string;

  @ApiPropertyOptional()
  @IsNumber()
  created_at?: number;

  @ApiPropertyOptional()
  @IsNumber()
  updated_at?: number;
}

export class TaskRequest {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsNumber()
  maxConversations: number;

  @ApiProperty()
  @IsNumber()
  concurrentConversations: number;
}

export class ConversationCreationRequest {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty({
    description: 'The skill_id of the conversation',
    default: '-1',
  })
  @IsString()
  skillId: string;

  @ApiProperty({
    description: 'The messages of the conversation',
    default: [],
  })
  @IsArray()
  messages: any[];
}

export class WebViewCommand {
  @ApiProperty({
    description: 'The command',
    default: 'command',
  })
  @IsString()
  command: string;

  @ApiProperty({
    description: 'The site ID',
    default: 'site_id',
  })
  @IsString()
  site_id: string;

  @ApiProperty({
    description: 'The conversation ID',
    default: 'conversationId',
  })
  @IsString()
  conversation_id: string;

  @ApiProperty({
    description: 'The user ID',
    default: 'userId',
  })
  @IsString()
  user_id: string;

  @ApiProperty({
    description: 'The payload',
    default: { name: 'value' },
  })
  payload: any;

  @ApiProperty({
    description: 'The bot ID',
    default: 'botId',
  })
  botId: string;
}

export class WebViewRequest {
  @ApiProperty({
    description: 'The conversation ID',
    default: 'conversationId',
  })
  @IsString()
  conversationId: string;

  @ApiProperty({
    description: 'The user ID',
    default: 'userId',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'The bot ID',
    default: 'botId',
  })
  @IsString()
  botId: string;

  @ApiProperty({
    description: 'The message',
    default: 'message',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'The context variables',
    default: { name: 'value' },
  })
  contextVariables: any;
}

export class AISMessage {
  @ApiProperty()
  @IsString()
  speaker: string;

  @ApiProperty()
  @IsString()
  text: string;

  @ApiProperty()
  @IsNumber()
  time: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string; // Optional ID for the message

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  tokens?: number; // Optional token count for the message
}

export class AISConversationRequestDto {
  @ApiProperty()
  @IsString()
  flow_id: string;

  @ApiProperty()
  @IsBoolean()
  saved: boolean;

  @ApiProperty()
  @IsString()
  source: string;

  @ApiProperty()
  @IsString()
  conversation_cloud_skill_id: string;

  @ApiProperty()
  @IsBoolean()
  conversation_cloud_rest_api: boolean;
}

export class InvokeFlowRequestDto {
  @ApiProperty()
  @IsString()
  flow_id: string;

  @ApiProperty()
  @IsBoolean()
  save_answer: boolean;

  @ApiProperty()
  @IsBoolean()
  save_conv: boolean;

  @ApiProperty()
  @IsBoolean()
  engagement_attributes_in_response: boolean;

  @ApiProperty()
  @IsBoolean()
  debug: boolean;

  @ApiProperty()
  @ApiPropertyOptional()
  @IsObject()
  bot_context_vars?: Record<string, any>;
}
