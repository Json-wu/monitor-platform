import { IsOptional, IsString } from 'class-validator';

/** multipart 字段 `image`：文件二进制，或同名字段为文本（URL / base64 / data URL），由服务端解析 */
export class V1ClearbgMultipartFieldsDto {
  @IsOptional()
  @IsString()
  image?: string;
}
