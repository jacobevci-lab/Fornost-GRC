import { BoardPage } from "../../exchange/board-ui";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  return (
    <BoardPage
      id={(await params).id}
      slides={(await searchParams).format === "slides"}
    />
  );
}
