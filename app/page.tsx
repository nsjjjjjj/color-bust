import { getCurrentUser } from "@/lib/server/auth";
import { GameApp } from "./game-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  return <GameApp initialUser={user} />;
}
