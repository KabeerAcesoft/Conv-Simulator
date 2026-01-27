import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { DTODefaults, RecordBasic } from 'src/constants/constants';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

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

class SuccessCriteria {
  @ApiProperty()
  @IsString()
  value: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  required?: boolean;
}

export class ScenarioDto extends DTODefaults {
  static readonly collectionName = 'scenarios';
  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  vertical?: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  topic: string;

  @ApiProperty()
  @IsObject()
  skill: {
    id: string;
    name: string;
  };

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  template?: boolean;

  @ApiProperty()
  @IsBoolean()
  topicEnabled: boolean;

  @ApiProperty()
  @IsString()
  scenario: string;

  @ApiProperty()
  @IsArray()
  @Type(() => SuccessCriteria)
  @ValidateNested({ each: true })
  successCriteria: SuccessCriteria[];
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

export class GlobalApplicationSettingsDto {
  static readonly collectionName = 'global_application_settings';

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

export class ApplicationSettingsDto extends RecordBasic {
  static readonly collectionName = 'application_settings';

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsArray()
  settings: ApplicationSettingDto[];
}

export class ConsumerMessageDelayRange {
  @ApiProperty()
  @IsNumber()
  min: number;
  @ApiProperty()
  @IsNumber()
  max: number;
}

export class PersistentIdentityRequestDto extends DTODefaults {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  categories: string[];

  @ApiProperty()
  @IsString()
  personaId: string;

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  idtoken: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerType?: string;
}

export class PersistentIdentityDto extends PersistentIdentityRequestDto {
  static readonly collectionName = 'identities';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id: string;
}
