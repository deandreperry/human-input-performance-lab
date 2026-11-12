import { UsabilityParticipant } from "@/components/usability-participant";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <UsabilityParticipant id={(await params).id} />;
}
