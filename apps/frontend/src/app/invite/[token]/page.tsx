import { InviteLinkView } from '@/components/events/InviteLinkView';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteLinkView token={token} />;
}
