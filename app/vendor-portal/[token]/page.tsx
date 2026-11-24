import ExternalPage from "../../exchange/public";
export const metadata = {
  title: "Fornost · Supplier assurance",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <ExternalPage token={(await params).token} />;
}
