import { redirect } from "next/navigation";

export default function LegacySettingsAppsRedirect() {
  redirect("/dashboard");
}
