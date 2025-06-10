import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ChatOpenAI } from "@langchain/openai"; // LangChain OpenAI integration
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages"; // Ensure all needed message types
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

// Define the list of new target OpenRouter models for this agent
const newOpenRouterModels = [
  "microsoft/phi-3-medium-128k-instruct:free", // Good for reasoning
  "qwen/qwen-72b-chat:free",                   // Powerful Qwen model
  "mistralai/mistral-large-latest:free"        // High-tier Mistral
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
        const cacheKey = query.toLowerCase().trim();
        if (global.wikipediaSearchCache.has(cacheKey)) {
            console.log("Using cached Wikipedia search result for:", query.substring(0, 30) + "...");
            return global.wikipediaSearchCache.get(cacheKey) || "";
        }
        const now = Date.now();
        const lastSearchTime = global.lastSearchTime || 0;
        const timeElapsed = now - lastSearchTime;
        if (timeElapsed < 3000) {
            const waitTime = 3000 - timeElapsed;
            console.log(`Rate limiting: waiting ${waitTime}ms before next Wikipedia search`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        const rawResults = await webSearchTool.invoke(query);
        global.lastSearchTime = Date.now();
        global.wikipediaSearchCache.set(cacheKey, rawResults);
        return rawResults;
    } catch (error) {
        console.error("Wikipedia search error:", error);
        // Modified to throw error as per previous subtask, but for this worker,
        // it might be better to return a string indicating failure if context is optional.
        // For now, let it throw, and the caller can decide.
        throw new Error(`Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Internal function containing the core agent logic
async function _executeReasoningLogic(
    query: string,
    context_text?: string,
    messagesHistoryInput?: BaseMessage[] // Renamed to avoid conflict
): Promise<string> { // Returns string content or throws error
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
        console.error("OPENROUTER_API_KEY is not set. Reasoning agent will fail.");
        throw new Error("API configuration error: OpenRouter API key is not set.");
    }

    const modelName = newOpenRouterModels[0]; // Defaults to microsoft/phi-3-medium-128k-instruct:free

    const llm = new ChatOpenAI({
        modelName: modelName,
        openAIApiKey: openrouterApiKey,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
        temperature: 0.7,
    });

    let finalContext = context_text || "";
    if (!context_text) { // Fetch context only if not provided
        try {
            const limitedQuery = query.substring(0, 300);
            const wikipediaResults = await safeWebSearch(limitedQuery);
            if (wikipediaResults && wikipediaResults.length > 0) {
                finalContext = "Wikipedia search results:\n" + wikipediaResults;
            }
        } catch (error) {
            console.warn('Wikipedia search error during context fetching:', error);
            finalContext = "Wikipedia search results could not be retrieved. Proceeding with available information.\n\n";
        }
    }

    const systemPromptContent = `You are an advanced reasoning agent. Your goal is to provide clear, concise, and well-summarized logical analyses.

Context for your reasoning:
${finalContext || "No additional context provided."}

Please adhere to the following guidelines:
1.  **Summarize Key Findings:** Do not provide lengthy explanations unless absolutely necessary. Focus on a summarized version of the logical steps and conclusions.
2.  **Clarity and Precision:** Use precise language. Avoid ambiguity.
3.  **Step-by-Step (Brief):** Briefly outline the main steps in your reasoning, but keep it high-level.
4.  **Direct Answer:** Provide a direct and synthesized answer to the query based on your reasoning.
5.  **Logical Soundness:** Ensure all conclusions are logically sound and well-supported by the provided context or general knowledge.

Respond with a refined and summarized logical analysis.`;

    const formattedMessages: BaseMessage[] = messagesHistoryInput?.length > 0
        ? messagesHistoryInput.slice(-5).map((msg: any) => // Ensure msg has content and role
            msg.role === 'assistant'
                ? new AIMessage({ content: msg.content || "" })
                : new HumanMessage({ content: msg.content || "" })
          )
        : [];

    const llmMessages: BaseMessage[] = [
        new SystemMessage({ content: systemPromptContent }),
        ...formattedMessages,
        new HumanMessage({ content: query })
    ];

    const completion = await llm.invoke(llmMessages);
    return completion.content.toString();
}

// Exportable worker function
export async function invokeReasoningWorker(input: {
    query: string,
    context_text?: string,
    messages?: BaseMessage[] // Changed from any[] to BaseMessage[] for clarity
}): Promise<{ answer: string; error?: string; provider?: string }> {
    try {
        const answer = await _executeReasoningLogic(input.query, input.context_text, input.messages);
        return { answer, provider: 'ReasoningWorker (OpenRouter)' };
    } catch (error: any) {
        console.error('invokeReasoningWorker error:', error);
        return {
            answer: "", // Ensure answer is always defined
            error: error.message || "An unexpected error occurred in the reasoning worker.",
            provider: 'ReasoningWorker (OpenRouter)'
        };
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, messages, context_text } = body; // messages and context_text are optional

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }
        // API key check is implicitly handled by _executeReasoningLogic, which throws if not set.
        // For a more immediate check in POST:
        if (!process.env.OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: 'API configuration error: OpenRouter API key is not set.' },
                { status: 500 }
            );
        }

        const result = await invokeReasoningWorker({
            query,
            context_text,
            messages: messages as BaseMessage[] | undefined // Cast if necessary, ensure type safety
        });

        if (result.error) {
            return NextResponse.json({ error: result.error, provider: result.provider }, { status: 500 });
        }

        // For client compatibility, the 'toolCalls' and 'threadId' might be expected.
        // Since this worker is simplified, we'll omit 'toolCalls' unless specifically reconstructed.
        // A threadId can be generated if needed for consistency, though this worker is stateless per call.
        const generatedThreadId = `thread-reasoning-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        const modelName = newOpenRouterModels[0]; // The model used

        return NextResponse.json({
            text: result.answer,
            provider: result.provider,
            // Minimal toolCalls representation if client expects it
            toolCalls: [
                { name: 'contextLookup', args: { query: query.substring(0,100) + (context_text ? " (context provided)" : " (context fetched)")}},
                { name: 'logicalReasoning', args: { model: modelName }}
            ],
            threadId: generatedThreadId
        });
    } catch (error: any) { // Catch errors from invokeReasoningWorker if it re-throws or from req.json()
        console.error('Reasoning Agent POST API error:', error);
        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
} 