"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, isSystemAdmin } from "@/lib/user-context";

export function SystemSettingsGuard({
  appId,
  children,
}: {
  appId: string;
  children: React.ReactNode;
}) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!isSystemAdmin(user)) {
      router.replace(`/dashboard/${appId}`);
    }
  }, [user, router, appId]);

  if (!isSystemAdmin(user)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Redirecting...
      </div>
    );
  }

  return <>{children}</>;
}
