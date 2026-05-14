/**
 * 积分流水 `credit_transaction.reason` 机器可读码（便于各端本地化展示）。
 * 请勿随意改名；若需新增类型在此扩展常量并在各前端映射表中同步。
 */
export const CreditReasonCode = {
  /** 公开 ClearBG 抠图 API 成功排队后扣 1 分 */
  ClearbgApiDeduct: 'clearbg.api.deduct',
  /** 上游抠图失败后退回 1 分 */
  ClearbgApiRefund: 'clearbg.api.refund',
  /** 公开可灵生图 API 排队前扣 1 分 */
  KlingImageApiDeduct: 'kling_image.api.deduct',
  /** 可灵生图上游失败后退回 1 分 */
  KlingImageApiRefund: 'kling_image.api.refund',
  /** 公开 DDColor 上色 API 调用前扣 1 分 */
  DdcolorApiDeduct: 'ddcolor.api.deduct',
  /** DDColor 上色上游失败后退回 1 分 */
  DdcolorApiRefund: 'ddcolor.api.refund',
  /** 公开图片超分去模糊 API 调用前扣 1 分 */
  UpscaleApiDeduct: 'upscale.api.deduct',
  /** 图片超分上游失败后退回 1 分 */
  UpscaleApiRefund: 'upscale.api.refund',
  /** 公开房间装修图 API（可灵）：按主题数扣减（1～4 分/次） */
  RoomDecorationApiDeduct: 'room_decoration.api.deduct',
  /** 装修图上游失败后按原 breakdown 退回 */
  RoomDecorationApiRefund: 'room_decoration.api.refund',
  /** UTC 每日 0 点将 promo（每日免费）池重置为 1 */
  SchedulerDailyPromoReset: 'scheduler.daily_promo_reset',
  /** 订阅账单周期边界：将 subscription（月度赠送）池清零 */
  SchedulerMonthlySubExpire: 'scheduler.monthly_sub_expire',
} as const;
