import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
