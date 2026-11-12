import { notFound } from "next/navigation";
import Workspace from "@/components/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const path = (await params).view?.join("/") ?? "overview";
  if (
    ![
      "overview",
      "studies",
      "participants",
      "sessions",
      "moderated",
      "analysis",
      "reports",
      "protocol",
      "builder",
    ].includes(path)
  )
    notFound();
  return <Workspace view={path} />;
}
