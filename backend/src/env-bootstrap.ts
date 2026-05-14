/**
 * 必须在任何读取 process.env 的模块（尤其 AuthModule / JwtModule）之前执行。
 * 若只在 bootstrap() 里 loadDotenv，而 main 顶部已 import AppModule，
 * 则 JwtModule.register 会用默认密钥签名，JwtStrategy 却用 .env 里的 JWT_SECRET 校验 → 登录后 /auth/profile 恒 401。
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '..', '..', '.env'),
  resolve(__dirname, '..', '.env'),
];

for (const p of candidates) {
  if (existsSync(p)) {
    loadEnv({ path: p });
    break;
  }
}
