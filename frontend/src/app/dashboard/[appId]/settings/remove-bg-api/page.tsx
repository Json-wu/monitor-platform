import { redirect } from "next/navigation";

type Props = { params: Promise<{ appId: string }> };

/** 旧路径保留：跳转到统一「集成」页并锚点到抠图区块 */
export default async function SettingsRemoveBgApiRedirect({ params }: Props) {
  const { appId } = await params;
  redirect(`/dashboard/${appId}/settings/integrations#clearbg`);
}
