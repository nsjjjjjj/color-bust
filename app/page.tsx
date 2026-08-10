import { getChatGPTUser } from "./chatgpt-auth";
import { GameApp } from "./game-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <GameApp initialUser={user} />;
}

