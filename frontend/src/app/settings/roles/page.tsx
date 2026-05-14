import { redirect } from "next/navigation";

export default function LegacySettingsRolesRedirect() {
  redirect("/dashboard");
}
