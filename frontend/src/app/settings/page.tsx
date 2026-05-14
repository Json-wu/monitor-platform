import { redirect } from "next/navigation";

/** 系统设置已并入各应用内路由：/dashboard/[appId]/settings/… */
export default function LegacySettingsRedirect() {
  redirect("/dashboard");
}
