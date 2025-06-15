import { NextRequest, NextResponse } from "next/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "${API_KEY_REF}",
  });

  const response = streamText({
    model: openrouter("mistralai/devstral-small:free"),
    prompt: `Provide a concise overview of AI based on your knowledge: ${query}. Respond in plain text.`,
  });

  await response.consumeStream();
  const result = await response.text;
  console.log(`Raw response at 02:49 PM IST, June 15, 2025:`, result); // Debug log
  return NextResponse.json({ result });
}