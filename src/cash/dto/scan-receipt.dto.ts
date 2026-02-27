import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class ScanReceiptDto {
  @IsString()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'base64Image must be a valid data:image/*;base64 payload',
  })
  @MaxLength(10_000_000, {
    message: 'base64Image exceeds max allowed size',
  })
  base64Image: string;

  @IsString()
  @IsIn(['por', 'eng'])
  language: 'por' | 'eng' = 'por';
}
