import ShopApp from "./ShopApp";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <ShopApp userName={user.displayName} userEmail={user.email} />;
}
