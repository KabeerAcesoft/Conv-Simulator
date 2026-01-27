import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

import { LE_USER_ROLES } from 'src/constants/constants';

export class ManagerOf {
  agentGroupId: string;
  assignmentDate: string;
}

export class MemberOf {
  agentGroupId: string;
  assignmentDate: string;
}

export class Profile {
  roleTypeId: number;
  name: LE_USER_ROLES;
  id: number;
}

export interface IUserDto {
  id: string;
  deleted: boolean;
  loginName: string;
  fullName: string;
  nickname: string;
  passwordSh: string;
  isEnabled: boolean;
  maxChats: number;
  email: string;
  pictureUrl?: string;
  disabledManually: boolean;
  skillIds: number[];
  profiles: Profile[];
  profileIds: number[];
  lobIds: number[];
  changePwdNextLogin: boolean;
  memberOf: MemberOf;
  managerOf: ManagerOf[];
  permissionGroups: string[];
  description: string;
  mobileNumber: string;
  employeeId: string;
  maxAsyncChats: number;
  backgndImgUri: string;
  pnCertName: string;
  dateUpdated: string;
  lastPwdChangeDate: string;
  isApiUser: boolean;
  userTypeId: number;
}

export class SkillBasic {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  name: string;
}

export class UserDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  pid?: string;

  @ApiProperty()
  @IsBoolean()
  deleted: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  uid?: number;

  @ApiProperty()
  @IsString()
  loginName: string;

  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty()
  @IsString()
  nickname: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passwordSh?: string;

  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty()
  @IsNumber()
  maxChats: number;

  @ApiProperty()
  @IsString()
  email: string;

  @ApiProperty()
  @IsString()
  allowedAppKeys?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pictureUrl?: string;

  @ApiProperty()
  @IsString()
  dateCreated?: string;

  @ApiProperty()
  @IsBoolean()
  lpaCreatedUser: boolean;

  @ApiProperty()
  @IsBoolean()
  disabledManually: boolean;

  @ApiProperty()
  @IsArray()
  skillIds: number[];

  @ApiProperty()
  @IsArray()
  lobs: number[];

  @ApiProperty()
  @IsArray()
  profileIds: number[];

  @ApiPropertyOptional()
  @IsArray()
  @IsOptional()
  lobIds?: number[];

  @ApiProperty()
  @IsBoolean()
  changePwdNextLogin: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => SkillBasic)
  skills?: SkillBasic[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => SkillBasic)
  profiles?: SkillBasic[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => SkillBasic)
  managedAgentGroups?: SkillBasic[];

  @ApiProperty()
  @IsObject()
  @IsOptional()
  @Type(() => MemberOf)
  memberOf: MemberOf;

  @ApiProperty()
  @IsArray()
  @IsOptional()
  @Type(() => ManagerOf)
  managerOf: ManagerOf[];

  @ApiProperty()
  @IsArray()
  permissionGroups: number[];

  @ApiProperty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  maxAsyncChats?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pnCertName?: string;

  @ApiProperty()
  @IsString()
  dateUpdated: string;

  @ApiProperty()
  @IsString()
  lastPwdChangeDate: string;

  @ApiProperty()
  @IsBoolean()
  isApiUser: boolean;

  @ApiProperty()
  @IsBoolean()
  resetMfaSecret: boolean;

  @ApiProperty()
  @IsNumber()
  userTypeId: number;
}

export class ApiKeyBasic {
  keyId: string;
  appSecret: string;
  token: string;
  tokenSecret: string;
}

export class IApiKeyDto {
  developerID: string;
  appName: string;
  appDescription: string;
  purpose: string;
  privileges: {
    data: string;
    type: string;
  }[];
  keyId: string;
  enabled: boolean;
  appSecret: string;
  token: string;
  tokenSecret: string;
  creationTime: string;
  keyType: string;
  ipRanges: any[];
}

export class ServiceWorkerData {
  static readonly collectionName = 'service_workers';
  id: string;
  user_id: string;
  account_id: string;
  appName: string;
  created_at: number;
  updated_at: number;
  created_by: string;
  updated_by: string;
  app_key: string;
}
