import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

// Common DTO classes shared across multiple modules

export class ConversationTopicRequestDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsArray()
  config: AccountConfigDto[];

  @ApiProperty()
  @IsString()
  categoryName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsBoolean()
  active: boolean;
}

export class AccountConfigDto {
  @ApiProperty()
  @IsBoolean()
  active: boolean;

  @ApiProperty()
  @IsString()
  account_id: string;

  @ApiProperty()
  @IsInt()
  skill_id: number;

  @ApiProperty()
  @IsString()
  skill_name: string;
}

class SkillRoutingConfiguration {
  priority: number;
  splitPercentage: number;
  agentGroupId: number;
}

class SkillTransferList {
  id: number;
}

export class SkillDto {
  id: number;
  skillOrder: number;
  description: string;
  workingHoursId: number;
  specialOccasionId: number;
  name: string;
  maxWaitTime: number;
  deleted: boolean;
  dateUpdated: string;
  canTransfer: boolean;
  skillTransferList: SkillTransferList[];
  lobIds: number[];
  skillRoutingConfiguration: SkillRoutingConfiguration[];
}

export class PredefinedContentDto {
  id: number;
  deleted: boolean;
  enabled: boolean;
  hotkey: {
    prefix: string;
    suffix: string;
  };
  type: number;
  data: any[];
  categoriesIds: number[];
  skillIds: number[];
  lobIds: number[];
}

export class CampaignDto {
  id: number;
  name: string;
  description: string;
  startDate: string;
  startDateTimeZoneOffset: number;
  startTimeInMinutes: number;
  goalId: number;
  status: number;
  isDeleted: boolean;
  weight: number;
  priority: number;
  engagementIds: number[];
  timeZone: string;
  type: number;
}

class DisplayInstance {
  events: {
    click: {
      enabled: boolean;
      target: string;
    };
  };
  presentation: {
    background: {
      color: string;
      image: string;
    };
    border: {
      color: string;
      radius: number;
      width: number;
    };
    elements: {
      images: {
        alt: string;
        css: {
          left: number;
          top: number;
          zIndex: number;
        };
        imageUrl: string;
      }[];
      labels: {
        css: {
          color: string;
          fontFamily: string;
          fontSize: number;
          fontStyle: string;
          fontWeight: string;
          left: number;
          top: number;
          transform: string;
          whiteSpace: string;
          zIndex: number;
        };
        text: string;
      }[];
    };
    size: {
      height: string;
      width: string;
    };
  };
  macros: any[];
  displayInstanceType: number;
  enabled: boolean;
}

class Position {
  left: number;
  top: number;
  type: number;
}

export class EngagementDto {
  deleted: boolean;
  id: number;
  name: string;
  description: string;
  modifiedDate: string;
  createdDate: string;
  channel: number;
  type: number;
  onsiteLocations: number[];
  visitorBehaviors: number[];
  enabled: boolean;
  language: string;
  position: Position;
  displayInstances: DisplayInstance[];
  skillId: number;
  skillName: string;
  timeInQueue: number;
  followMePages: number;
  followMeTime: number;
  windowId: number;
  isPopOut: boolean;
  isUnifiedWindow: boolean;
  useSystemRouting: boolean;
  allowUnauthMsg: boolean;
  zones: any[];
  subType: number;
  source: number;
  connectorId: number;
  availabilityPolicy: number;
  availabilityPolicyForMessaging: number;
  renderingType: number;
  conversationType: number;
}

export class CampaignDetailedDto {
  id: number;
  accountId: string;
  createdDate: string;
  modifiedDate: string;
  visitorProfiles: number[];
  engagementCollectionRevision: number;
  engagements: EngagementDto[];
  name: string;
  description: string;
  startDate: string;
  startDateTimeZoneOffset: number;
  startTimeInMinutes: number;
  goalId: number;
  status: number;
  controlGroup: {
    percentage: number;
  };
  isDeleted: boolean;
  deleted: boolean;
  weight: number;
  priority: number;
  engagementIds: number[];
  timeZone: string;
  timeZoneOffset: number;
  type: number;
}

export class ApiKeyDto {
  @ApiProperty()
  @IsString()
  developerID: string;

  @ApiProperty()
  @IsString()
  appName: string;

  @ApiProperty()
  @IsString()
  appDescription: string;

  @ApiProperty()
  @IsString()
  purpose: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  privileges: {
    data: string;
    type: string;
  }[];

  @ApiProperty()
  @IsString()
  keyId: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsString()
  appSecret: string;

  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  tokenSecret: string;

  @ApiProperty()
  @IsString()
  creationTime: string;

  @ApiProperty()
  @IsString()
  keyType: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  ipRanges: string[];
}

export class Engagement {
  @ApiProperty()
  @IsBoolean()
  designEngagement: boolean;

  @ApiProperty()
  @IsBoolean()
  designWindow: boolean;

  @ApiProperty()
  @IsArray()
  entryPoint: string[];

  @ApiProperty()
  @IsArray()
  visitorBehavior: string[];

  @ApiProperty()
  @IsArray()
  targetAudience: string[];

  @ApiProperty()
  @IsArray()
  goal: string[];

  @ApiProperty()
  @IsArray()
  consumerIdentity: string[];

  @ApiProperty()
  @IsBoolean()
  languageSelection: boolean;
}

export class Webhooks {
  @ApiProperty()
  @IsString()
  endpoint: string;

  @ApiProperty()
  @IsNumber()
  maxRetries: number;
}

export class Capabilities {
  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  Engagement?: Engagement;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  webhooks?: Webhooks;
}

export class AppInstallDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsBoolean()
  deleted: boolean;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsArray()
  grantTypes: string[];

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiProperty()
  @IsString()
  clientName: string;

  @ApiProperty()
  @IsString()
  clientSecret: string;

  @ApiProperty()
  @IsNumber()
  clientSecretExpiresAt: number;

  @ApiProperty()
  @IsNumber()
  clientIdIssuedAt: number;

  @ApiProperty()
  @IsString()
  scope: string;

  @ApiProperty()
  @IsObject()
  @IsOptional()
  capabilities?: Capabilities;

  @ApiProperty()
  @IsString()
  logoUri: string;

  @ApiProperty()
  @IsBoolean()
  isInternal: boolean;
}

export class MessageIntRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  latestConversationQueueState?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  latestAgentIds?: number[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  skillIds?: number[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  status?: string[];

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  start?: {
    from: number;
    to: number;
  };

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  end?: {
    from: number;
    to: number;
  };
}
