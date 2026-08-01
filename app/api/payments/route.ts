import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { payments } from "../../../db/schema";

export async function GET() {
  try {
    const rows = await getDb().select().from(payments).orderBy(desc(payments.createdAt), desc(payments.id)).limit(500);
    return Response.json({ payments: rows });
  } catch {
    return Response.json({ payments: [] });
  }
}

export async function POST(request: Request) {
  const body = await request.json() as { amount?: number; receiver?: string; note?: string; createdAt?: string };
  if (!body.amount || body.amount <= 0 || !body.receiver || !body.createdAt) return Response.json({ error: "Invalid payment" }, { status: 400 });
  try {
    const [payment] = await getDb().insert(payments).values({ amount: Math.round(body.amount), receiver: body.receiver, note: body.note?.trim() ?? "", createdAt: body.createdAt }).returning();
    return Response.json({ payment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save payment" }, { status: 500 });
  }
}
