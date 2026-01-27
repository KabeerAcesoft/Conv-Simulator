import { ApiProperty } from '@nestjs/swagger';

import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

import { SimulationConversation } from 'src/Controllers/Simulation/simulation.dto';

export class TaskRequest {
  static readonly collectionName = 'task_requests';

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsNumber()
  maxConversations: number;

  @ApiProperty()
  @IsNumber()
  concurrentConversations: number;

  @ApiProperty()
  @IsBoolean()
  useDelays: boolean;

  @ApiProperty()
  @IsArray()
  @IsOptional()
  conversations: SimulationConversation[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  requestId: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  status: string;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  completedConversations: number;
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
