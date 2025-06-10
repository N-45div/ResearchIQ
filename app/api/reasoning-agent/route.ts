import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from '@ai-sdk/openai'; // Vercel AI SDK
import { WikipediaQueryRun } from '@langchain/community/tools/wikipedia_query_run';

// Add TypeScript declaration for global variable
declare global {
    var lastSearchTime: number;
    var wikipediaSearchCache: Map<string, string>;
}

// Initialize global cache if not exists
if (!global.wikipediaSearchCache) {
    global.wikipediaSearchCache = new Map<string, string>();
}

// Initialize OpenRouter using OpenAI compatibility with Vercel AI SDK
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseURL: 'https://openrouter.ai/api/v1',
    // Headers like HTTP-Referer are typically managed by the SDK or underlying fetch.
    // If specific headers are needed per request, they can be added to the .create call.
    // For OpenRouter, an X-Title header isn't standard for their API itself.
});

// Define the list of new target OpenRouter models
const openRouterModels = [
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-7b-it:free",
  "meta-llama/llama-3-8b-instruct:free"
];

// Tool for searching the web via Wikipedia
const createWebSearchTool = () => {
    return new WikipediaQueryRun({
        topKResults: 3,
        maxDocContentLength: 4000,
    });
};

// Helper function to safely execute Wikipedia searches with rate limiting
const safeWebSearch = async (query: string) => {
    try {
        const webSearchTool = createWebSearchTool();

        // Check if we have a cached result
        const cacheKey = query.toLowerCase().trim();
        if (global.wikipediaSearchCache.has(cacheKey)) {
            console.log("Using cached Wikipedia search result for:", query.substring(0, 30) + "...");
            return global.wikipediaSearchCache.get(cacheKey) || "";
        }

        // Add delay to avoid rate limiting
        const now = Date.now();
        const lastSearchTime = global.lastSearchTime || 0;
        const timeElapsed = now - lastSearchTime;

        if (timeElapsed < 3000) {
            // If less than 3 seconds since last search, wait
            const waitTime = 3000 - timeElapsed;
            console.log(`Rate limiting: waiting ${waitTime}ms before next Wikipedia search`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Execute the search
        const rawResults = await webSearchTool.invoke(query);

        // Update the last search time
        global.lastSearchTime = Date.now();

        // Cache the result
        global.wikipediaSearchCache.set(cacheKey, rawResults);

        return rawResults;
    } catch (error) {
        console.error("Wikipedia search error:", error);
        return "No Wikipedia results found for this query.";
    }
};

export async function POST(req: NextRequest) {
    try {
        const { query, messages } = await req.json();

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // Check if required API keys are set
        if (!process.env.OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: 'API configuration error: OpenRouter API key is not set. Please set OPENROUTER_API_KEY in your environment variables.' },
                { status: 500 }
            );
        }

        // Get context for the agent from Wikipedia
        let context = "";
        try {
            // Limit the query to 300 characters
            const limitedQuery = query.substring(0, 300);
            const wikipediaResults = await safeWebSearch(limitedQuery);

            if (wikipediaResults && wikipediaResults.length > 0) {
                context = "Wikipedia search results:\n" + wikipediaResults;
            }
        } catch (error) {
            console.warn('Wikipedia search error:', error);
            // Add a fallback message to the context
            context += "Wikipedia search results could not be retrieved. Proceeding with available information.\n\n";
        }

        // New System Prompt
        const systemPromptContent = `You are an advanced reasoning agent. Your goal is to provide clear, concise, and well-summarized logical analyses.

Context for your reasoning:
${context || "No additional context provided."}

Please adhere to the following guidelines:
1.  **Summarize Key Findings:** Do not provide lengthy explanations unless absolutely necessary. Focus on a summarized version of the logical steps and conclusions.
2.  **Clarity and Precision:** Use precise language. Avoid ambiguity.
3.  **Step-by-Step (Brief):** Briefly outline the main steps in your reasoning, but keep it high-level.
4.  **Direct Answer:** Provide a direct and synthesized answer to the query based on your reasoning.
5.  **Logical Soundness:** Ensure all conclusions are logically sound and well-supported by the provided context or general knowledge.

Respond with a refined and summarized logical analysis.`;

        // Format previous messages for context if available
        const formattedMessages = messages?.length > 0
            ? messages.slice(-5).map((msg: any) => ({ // Keep last 5 messages for context
                role: msg.role === 'assistant' ? 'assistant' : 'user', // Ensure role is 'user' or 'assistant'
                content: msg.content
            }))
            : [];

        // Generate a thread ID for this conversation
        const generatedThreadId = `thread-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

        // Select a model (starting with the first one for now)
        const modelName = openRouterModels[0]; // "mistralai/mistral-7b-instruct:free"

        // Use the Vercel AI SDK to access OpenRouter
        const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
                { role: "system", content: systemPromptContent },
                ...formattedMessages, // Add user's previous messages if any
                { role: "user", content: query } // Current user query
            ],
            temperature: 0.7, // Adjust temperature as needed
            // The Vercel SDK's OpenAI provider typically doesn't need response_format for standard chat.
            // If specific headers like HTTP-Referer are strictly needed and not automatically handled,
            // they might be passed via `fetchOptions` in the OpenAI client constructor if supported,
            // or directly in the `create` call if the SDK allows.
            // For now, relying on standard behavior.
        });

        // Record tool calls for demonstration
        const toolCalls = [
            {
                name: 'wikipediaSearch',
                args: { query: query.substring(0, 300) }
            },
            {
                name: 'logicalReasoning',
                args: { model: modelName }
            }
        ];

        return NextResponse.json({
            text: completion.choices[0].message.content,
            toolCalls,
            provider: 'Advanced Agent (Reasoning)',
            threadId: generatedThreadId
        });
    } catch (error) {
        console.error('Reasoning Agent API error:', error);
        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
} 