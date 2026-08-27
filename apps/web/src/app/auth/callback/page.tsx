import { MagicLinkCallback } from "../../../components/magic-link-callback";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <MagicLinkCallback {...(token ? { token } : {})} />;
}
