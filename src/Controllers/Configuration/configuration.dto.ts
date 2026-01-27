import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { ApiKeyDto } from 'src/common/dto/shared.dto';
import { PromptConfigurationDto } from 'src/constants/common.dtos';
import {
  DTODefaults,
  RecordBasic,
  SIMULATION_TYPES,
} from 'src/constants/constants';
import { TaskRequestDto } from 'src/Controllers/Simulation/simulation.dto';

import { UserDto } from '../AccountConfig/account-config.dto';

export class IdArray {
  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class PersonaDto extends DTODefaults {
  static readonly collectionName = 'personas';
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  template?: boolean;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsString()
  traits: string;

  @ApiProperty()
  @IsString()
  commonComments: string;
}

export class Influence {
  @ApiProperty()
  @IsString()
  value: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class InfluencesDto extends DTODefaults {
  static readonly collectionName = 'influences';
  @ApiProperty()
  @IsArray()
  influences: Influence[];
}

export class SimulationCategory extends RecordBasic {
  static readonly collectionName = 'simulation_categories';

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class ApplicationSettingDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({
    description:
      'The value of the application setting, can be a string, number, boolean, or object',
  })
  value: any;

  @ApiProperty()
  @IsString()
  createdBy: number;

  @ApiProperty()
  @IsString()
  updatedBy: number;

  @ApiProperty()
  @IsNumber()
  createdAt: number;

  @ApiProperty()
  @IsNumber()
  updatedAt: number;
}

export class ApplicationSettingDtoRequestDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  value: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedBy?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  createdAt?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  updatedAt?: number;
}

export class ApplicationSettingsDto extends RecordBasic {
  static readonly collectionName = 'application_settings';

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  defaultPrompt?: ApplicationSettingDto;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  initialSetup?: ApplicationSettingDto;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  zone?: ApplicationSettingDto;
}

export class ConsumerMessageDelayRange {
  @ApiProperty()
  @IsNumber()
  min: number;
  @ApiProperty()
  @IsNumber()
  max: number;
}

export class SimulationConfigurationDto extends TaskRequestDto {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsIn(Object.values(SIMULATION_TYPES))
  type: SIMULATION_TYPES;

  // ConsumerMessageDelayRange
  @ApiProperty()
  @IsObject()
  @Type(() => ConsumerMessageDelayRange)
  @ValidateNested()
  consumerMessageDelayRange: ConsumerMessageDelayRange;

  @ApiProperty()
  @IsArray()
  scenarios: string[];

  @ApiProperty()
  @IsArray()
  personas: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  createdAt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  updatedAt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedBy?: number;

  // @ApiPropertyOptional()
  // @IsObject()
  // @IsOptional()
  // simulationConfigurations?: SimulationConfigurationDto;

  @ApiProperty()
  @IsObject()
  @Type(() => PromptConfigurationDto)
  @ValidateNested()
  prompts: PromptConfigurationDto;
}

export class SimulationPromptRequestDto {
  static readonly collectionName = 'prompts';
  @ApiProperty()
  @IsString()
  accountId: string;
  @ApiProperty()
  @IsString()
  prompt: string;
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class SimulationPromptDto extends SimulationPromptRequestDto {
  static readonly collectionName = 'prompts';
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  template: boolean;

  @ApiProperty({
    description: 'Created at timestamp',
    type: Number,
    required: false,
  })
  createdAt: number;

  @ApiProperty({
    description: 'Created by user ID',
    type: Number,
    required: false,
  })
  createdBy: number;

  @ApiProperty({
    description: 'updated at timestamp',
    type: Number,
    required: false,
  })
  updatedAt: number;

  @ApiProperty({
    description: 'updated by user ID',
    type: Number,
    required: false,
  })
  updatedBy: number;
}

export class ServiceWorker {
  @ApiProperty()
  @IsObject()
  appKey: ApiKeyDto;
  @ApiProperty()
  @IsObject()
  user: UserDto;
}

export class ServiceWorkerDto {
  static readonly collectionName = 'service_workers';
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty({
    description: 'Encrypted configuration string for the service worker',
    type: String,
  })
  @IsString()
  config: string;
}

export class ServiceWorkerConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;
  @ApiProperty()
  @IsString()
  username: string;
  @ApiProperty()
  @IsString()
  appKey: string;
  @ApiProperty()
  @IsString()
  secret: string;
  @ApiProperty()
  @IsString()
  accessToken: string;
  @ApiProperty()
  @IsString()
  accessTokenSecret: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bearer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiry?: number;
}
