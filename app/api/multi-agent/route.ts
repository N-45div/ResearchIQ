import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from "@langchain/groq";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicTool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { SERPGoogleScholarAPITool } from "@langchain/community/tools/google_scholar";
import { z } from 'zod';

// Usage limits
const ANONYMOUS_LIMIT = 3;
const LOGGED_IN_LIMIT = 10;

// In-memory fallback when Redis is unavailable
const memoryUsageStore = new Map<string, number>();

// Initialize Groq model
const getGroqModel = () => {
    try {
        if (!process.env.GROQ_API_KEY) {
            console.warn("GROQ_API_KEY is not set");
            return null;
        }

        return new ChatGroq({
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            apiKey: process.env.GROQ_API_KEY,
        });
    } catch (error) {
        console.warn("Error initializing Groq model:", error);
        return null;
    }
};

// Initialize Together.ai model with ChatGroq adapter
const getTogetherModel = () => {
    try {
        if (!process.env.TOGETHER_API_KEY) {
            console.warn("TOGETHER_API_KEY is not set");
            return null;
        }

        return new ChatGroq({
            model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
            temperature: 0.2,
            apiKey: process.env.TOGETHER_API_KEY,
            baseURL: "https://api.together.xyz/v1",
        });
    } catch (error) {
        console.warn("Error initializing Together.ai model:", error);
        return null;
    }
};

// Tool for searching Wikipedia
const createWikipediaTool = () => {
    return new WikipediaQueryRun({
        topKResults: 3,
        maxDocContentLength: 4000,
    });
};

// Tool for searching Google Scholar
const createGoogleScholarTool = () => {
    if (!process.env.SERPAPI_API_KEY) {
        console.warn("SERPAPI_API_KEY is not set. Using a fallback academic search tool.");
        return new DynamicTool({
            name: "search_academic_papers",
            description: "Search for academic papers related to a query",
            func: async (query: string) => {
                return "No academic papers found. API key for Google Scholar is not configured.";
            },
        });
    }

    return new SERPGoogleScholarAPITool({
        apiKey: process.env.SERPAPI_API_KEY,
    });
};

// Create the multi-agent system
const createMultiAgentSystem = async (query: string) => {
    try {
        // Check if any model is available
        const groqModel = getGroqModel();
        let togetherModel = null;

        try {
            togetherModel = getTogetherModel();
        } catch (error) {
            console.warn("Error initializing Together.ai model:", error);
        }

        // If neither model is available, throw an error
        if (!groqModel && !togetherModel) {
            throw new Error("No AI models available. Please check your API keys for Groq and Together.ai.");
        }

        // If Groq is not available, use Together.ai for all agents
        const primaryModel = groqModel || togetherModel;

        // Create tools for Wikipedia search
        const wikipediaTool = new WikipediaQueryRun({
            topKResults: 3,
            maxDocContentLength: 4000,
        });

        // Create tool for Google Scholar search
        let scholarTool = null;
        if (process.env.SERPAPI_API_KEY) {
            scholarTool = new SERPGoogleScholarAPITool({
                apiKey: process.env.SERPAPI_API_KEY,
            });
        } else {
            scholarTool = new DynamicTool({
                name: "search_academic_papers",
                description: "Search for academic papers related to a query",
                func: async (query: string) => {
                    return "No academic papers found. API key for Google Scholar is not configured.";
                },
            });
        }

        // Create specialized agents for different research tasks

        // Wikipedia researcher agent
        const wikipediaResearcher = createReactAgent({
            llm: primaryModel,
            tools: [wikipediaTool],
            prompt: `You are a specialized research agent focused on finding general knowledge information from Wikipedia.
            
Your task is to:
1. Research the query thoroughly using Wikipedia
2. Extract key facts, definitions, and contextual information
3. Organize the information in a clear, structured format
4. Include important dates, figures, and statistics when relevant
5. Cite your sources properly

Respond with comprehensive, factual information from Wikipedia.`,
            name: "wikipedia_researcher",
        });

        // Google Scholar researcher agent
        const scholarResearcher = createReactAgent({
            llm: togetherModel || primaryModel,
            tools: [scholarTool],
            prompt: `You are a specialized research agent focused on finding academic information from scholarly sources.
            
Your task is to:
1. Research the query thoroughly using Google Scholar
2. Extract key findings from academic papers and research
3. Identify important theories, methodologies, and conclusions
4. Note the authors and publication dates of significant papers
5. Highlight consensus views and areas of academic debate

Respond with rigorous, academic information with proper citations.`,
            name: "scholar_researcher",
        });

        // Fact checker agent
        const factChecker = createReactAgent({
            llm: primaryModel,
            tools: [],
            prompt: `You are a specialized fact-checking agent with critical thinking abilities.
            
Your task is to:
1. Analyze information provided by other research agents
2. Identify any factual inconsistencies or contradictions between sources
3. Highlight areas where sources disagree on facts, figures, or conclusions
4. Assess the reliability and potential biases of different information sources
5. Flag any claims that appear unsupported or questionable

Focus specifically on finding contradictions and differences between sources.`,
            name: "fact_checker",
        });

        // Synthesizer agent
        const synthesizer = createReactAgent({
            llm: primaryModel,
            tools: [],
            prompt: `You are a specialized synthesis agent that creates comprehensive answers from multiple sources.
            
Your task is to:
1. Integrate information from all research sources into a coherent whole
2. Explicitly highlight contradictions and differences between sources
3. Present multiple perspectives when sources disagree
4. Organize information in a logical, easy-to-follow structure
5. Create a balanced, nuanced response that acknowledges complexity

Your final answer should clearly indicate when different sources provide conflicting information.`,
            name: "synthesizer",
        });

        // Create the supervisor to coordinate the agents
        const supervisor = createSupervisor({
            agents: [wikipediaResearcher, scholarResearcher, factChecker, synthesizer],
            llm: primaryModel,
            prompt: `You are a research supervisor coordinating a team of specialized agents to answer a research query.

Your team consists of:
1. wikipedia_researcher - Finds general knowledge from Wikipedia
2. scholar_researcher - Finds academic information from Google Scholar
3. fact_checker - Identifies contradictions and inconsistencies between sources
4. synthesizer - Creates a final comprehensive answer

Your task is to coordinate these agents effectively:
1. First, assign the query to the wikipedia_researcher and scholar_researcher to gather information
2. Once they've completed their research, send their findings to the fact_checker to identify contradictions
3. Finally, send all information (research findings and contradiction analysis) to the synthesizer

The synthesizer will create the final answer, which MUST explicitly highlight any contradictions or differences between sources.

The user's query is: "${query}"

Important: Work with one agent at a time. Wait for each agent to complete their task before moving to the next agent.`,
        }).compile();

        // Execute the supervisor
        const result = await supervisor.invoke({
            messages: [{
                role: "user",
                content: query
            }]
        });

        // Extract the final answer
        const finalMessage = result.messages[result.messages.length - 1];
        return finalMessage.content.toString();
    } catch (error) {
        console.error("Error in multi-agent system:", error);
        return "Sorry, there was an error processing your request with the multi-agent system.";
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

        const { query } = await req.json();
        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // Check if required API keys are set
        if (!process.env.GROQ_API_KEY && !process.env.TOGETHER_API_KEY) {
            return NextResponse.json(
                { error: 'API configuration error: No AI provider API keys are set. Please set either GROQ_API_KEY or TOGETHER_API_KEY in your environment variables.' },
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

        // Record tool calls for demonstration
        const toolCalls = [
            {
                name: 'multiAgentResearch',
                args: { query: query }
            }
        ];

        // Generate a thread ID for this conversation
        const generatedThreadId = `thread-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

        // Run the multi-agent system
        console.log("Starting multi-agent research for query:", query.substring(0, 50) + "...");
        const result = await createMultiAgentSystem(query);

        // Increment usage count
        memoryUsageStore.set(userId, usageCount + 1);

        return NextResponse.json({
            text: result,
            toolCalls,
            provider: 'Multi-Agent Research System',
            threadId: generatedThreadId,
            usage: {
                count: usageCount + 1,
                limit: limit,
                remaining: limit - (usageCount + 1)
            }
        });
    } catch (error) {
        console.error('Multi-Agent API error:', error);

        // Provide more informative error messages
        let errorMessage = 'Internal server error';
        let statusCode = 500;

        if (error instanceof Error) {
            // Check for specific error types
            if (error.message.includes('API key')) {
                errorMessage = 'API authentication error. Please check your API keys in the environment variables.';
                statusCode = 401;
            } else if (error.message.includes('rate limit')) {
                errorMessage = 'Rate limit exceeded for one of the AI providers. Please try again later.';
                statusCode = 429;
            } else {
                errorMessage = `Error processing request: ${error.message}`;
            }
        }

        return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
} 