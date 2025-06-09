import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
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

// Usage limits
const ANONYMOUS_LIMIT = 3;
const LOGGED_IN_LIMIT = 10;

// In-memory fallback when Redis is unavailable
const memoryUsageStore = new Map<string, number>();

// Initialize OpenRouter using OpenAI compatibility
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
        'X-Title': 'Deepest Research'
    }
});

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
        // Get user ID from cookie JWT (if available)
        let userId = 'anonymous-' + (req.headers.get('x-forwarded-for') || 'unknown');
        let isAuthenticated = false;

        // Check if we have an authenticated session
        const authHeader = req.headers.get('cookie') || '';
        if (authHeader.includes('supabase-auth-token')) {
            try {
                // Create Supabase client
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    {
                        global: { headers: { cookie: authHeader } },
                        auth: { persistSession: false }
                    }
                );

                // Try to get the session
                const { data } = await supabase.auth.getSession();
                if (data.session?.user?.id) {
                    userId = data.session.user.id;
                    isAuthenticated = true;
                }
            } catch (error) {
                console.error('Error getting auth session:', error);
            }
        }

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

        // Get current usage count (with memory fallback)
        let usageCount = memoryUsageStore.get(userId) || 0;

        // Check if user has exceeded their limit
        const limit = isAuthenticated ? LOGGED_IN_LIMIT : ANONYMOUS_LIMIT;
        if (usageCount >= limit) {
            return NextResponse.json(
                {
                    error: isAuthenticated
                        ? 'You have reached your free research limit'
                        : 'Please log in to continue using the research feature',
                    isLimited: true,
                    usageCount,
                    limit
                },
                { status: 429 }
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

        // Create a system prompt that includes context and instructions for reasoning
        const systemPrompt = `You are an advanced reasoning agent that helps users with logical analysis and critical thinking.
        
Your task is to:
1. Analyze the query thoroughly using logical reasoning
2. Break down complex problems into smaller parts
3. Identify logical fallacies and reasoning errors
4. Provide step-by-step logical analysis
5. Draw well-supported conclusions based on available evidence

Here is some context that may help with your reasoning:
${context}

Think carefully and reason step by step to provide a comprehensive, logical answer.`;

        // Format previous messages for context if available
        const formattedMessages = messages?.length > 0
            ? messages.map((msg: any) => ({
                role: msg.role,
                content: msg.content
            }))
            : [];

        // Generate a thread ID for this conversation
        const generatedThreadId = `thread-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

        // Use one of OpenRouter's free reasoning models
        // Options: "microsoft/phi-4-reasoning-plus:free", "qwen/qwen3-30b-a3b:free", "nvidia/llama-3.1-nemotron-ultra-253b:free"
        const modelName = "microsoft/phi-4-reasoning-plus:free";

        // Use the OpenAI compatibility layer to access OpenRouter
        const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
                { role: "system", content: systemPrompt },
                ...formattedMessages,
                { role: "user", content: query }
            ],
            temperature: 0.7,
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

        // Increment usage count
        memoryUsageStore.set(userId, usageCount + 1);

        return NextResponse.json({
            text: completion.choices[0].message.content,
            toolCalls,
            provider: 'Advanced Agent (Reasoning)',
            threadId: generatedThreadId,
            usage: {
                count: usageCount + 1,
                limit: limit,
                remaining: limit - (usageCount + 1)
            }
        });
    } catch (error) {
        console.error('Reasoning Agent API error:', error);
        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
} 