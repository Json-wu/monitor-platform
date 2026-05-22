/** 全站集成表 `global_integration_setting.name` 取值 */
export const GLOBAL_INTEGRATION_LINKME_PAY = 'linkmePay' as const;
export const GLOBAL_INTEGRATION_REMOVE_BACKGROUND = 'removeBackground' as const;
export const GLOBAL_INTEGRATION_SMTP = 'smtp' as const;
/** 可灵图像生成（可灵开放平台 HTTP API + JWT 鉴权） */
export const GLOBAL_INTEGRATION_KLING_IMAGE = 'klingImage' as const;
/** Replicate 统一配置（上色 + 超分 + inpainting + 证件照） */
export const GLOBAL_INTEGRATION_REPLICATE = 'replicate' as const;
/** Gumroad（产品支付链接 + Ping/Webhook） */
export const GLOBAL_INTEGRATION_GUMROAD = 'gumroad' as const;

export type GlobalIntegrationName =
  | typeof GLOBAL_INTEGRATION_LINKME_PAY
  | typeof GLOBAL_INTEGRATION_REMOVE_BACKGROUND
  | typeof GLOBAL_INTEGRATION_SMTP
  | typeof GLOBAL_INTEGRATION_KLING_IMAGE
  | typeof GLOBAL_INTEGRATION_REPLICATE
  | typeof GLOBAL_INTEGRATION_GUMROAD;
