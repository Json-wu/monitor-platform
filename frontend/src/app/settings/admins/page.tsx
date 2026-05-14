import { redirect } from "next/navigation";

export default function LegacySettingsAdminsRedirect() {
  redirect("/dashboard");
}
