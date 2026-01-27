import { ApiProperty } from '@nestjs/swagger';

import { IsArray, IsBoolean, IsNumber, IsString } from 'class-validator';

import { APP_ROLES } from 'src/constants/constants';

import { UserDto } from '../AccountConfig/account-config.dto';

export class AppUserDto extends UserDto {
  static readonly collectionName = 'users';

  @ApiProperty()
  @IsString()
  account_id: string;

  @ApiProperty()
  @IsNumber()
  createdBy: number;

  @ApiProperty()
  @IsArray()
  roles: APP_ROLES[];

  @ApiProperty()
  @IsNumber()
  updatedBy: number;

  @ApiProperty()
  @IsNumber()
  createdAt: number;

  @ApiProperty()
  @IsNumber()
  updatedAt: number;

  @ApiProperty()
  @IsArray()
  permissions: string[];

  @ApiProperty()
  @IsBoolean()
  is_cc_user: boolean;

  @ApiProperty()
  @IsBoolean()
  is_lpa: boolean;

  @ApiProperty()
  @IsBoolean()
  terms_agreed: boolean;
}
