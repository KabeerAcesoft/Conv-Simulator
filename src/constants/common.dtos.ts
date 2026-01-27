import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';

export class PromptConfigurationDto {
  @ApiProperty()
  @IsString()
  syntheticCustomer: string;

  @ApiProperty()
  @IsString()
  agentTraining: string;

  @ApiProperty()
  @IsString()
  botTesting: string;

  @ApiProperty()
  @IsString()
  qualityAssurance: string;

  @ApiProperty()
  @IsString()
  changeManagement: string;

  @ApiProperty()
  @IsString()
  conversationAssessment: string;

  @ApiProperty()
  @IsString()
  agentAssessment: string;

  @ApiProperty()
  @IsString()
  simulationAssessment: string;
}
