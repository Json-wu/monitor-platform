"use client";

import { useEffect, useMemo, useState } from "react";
import { AppWindow } from "lucide-react";
import { domainFaviconCandidates } from "@/lib/domain-favicon";

type AppDomainLogoProps = {
  domain: string | null | undefined;
  /** 图标尺寸类名，如 h-5 w-5 */
  iconClassName?: string;
  /** 外层容器类名（卡片列表用圆角背景） */
  wrapperClassName?: string;
  /** 为 true 时渲染带背景的容器（应用选择卡片样式） */
  withWrapper?: boolean;
};

export function AppDomainLogo({
  domain,
  iconClassName = "h-5 w-5",
  wrapperClassName = "rounded-xl bg-accent/20 p-2.5 text-accent",
  withWrapper = false,
}: AppDomainLogoProps) {
  const candidates = useMemo(() => domainFaviconCandidates(domain), [domain]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [domain, candidates]);

  const showFallback = candidates.length === 0 || index >= candidates.length;

  const inner = showFallback ? (
    <AppWindow className={iconClassName} aria-hidden />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- 任意第三方域名 favicon，不走 next/image 白名单
    <img
      src={candidates[index]}
      alt=""
      className={`${iconClassName} object-contain`}
      referrerPolicy="no-referrer"
      onError={() => setIndex((i) => i + 1)}
    />
  );

  if (withWrapper) {
    return (
      <div className={`flex shrink-0 items-center justify-center ${wrapperClassName}`}>
        {inner}
      </div>
    );
  }

  return inner;
}
