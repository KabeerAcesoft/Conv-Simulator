import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';

export class BaseUriDto {
  @ApiProperty()
  @IsString()
  service: string;
  @ApiProperty()
  @IsString()
  account: string;
  @ApiProperty()
  @IsString()
  baseURI: string;
}
