import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ChatGroq } from "@langchain/groq";
import { DynamicTool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { SERPGoogleScholarAPITool } from "@langchain/community/tools/google_scholar";
import { z } from 'zod';

// Add TypeScript declaration for global variable
declare global {
    var lastSearchTime: number;
    var wikipediaSearchCache: Map<string, string>;
    var googleScholarCache: Map<string, string>;
}

// Initialize global cache if not exists
if (!global.wikipediaSearchCache) {
    global.wikipediaSearchCache = new Map<string, string>();
}

if (!global.googleScholarCache) {
    global.googleScholarCache = new Map<string, string>();
}

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

// Initialize Together.ai model
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

// Tool for searching academic papers via Google Scholar
const createAcademicSearchTool = () => {
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

// Tool for searching the web via Wikipedia
const createWebSearchTool = () => {
    return new WikipediaQueryRun({
        topKResults: 3,
        maxDocContentLength: 4000,
    });
};

// Helper function to safely execute Google Scholar searches with rate limiting
const safeAcademicSearch = async (query: string) => {
    try {
        // Check if we have a cached result
        const cacheKey = query.toLowerCase().trim();
        if (global.googleScholarCache.has(cacheKey)) {
            console.log("Using cached Google Scholar result for:", query.substring(0, 30) + "...");
            return global.googleScholarCache.get(cacheKey) || "";
        }

        const scholarTool = createAcademicSearchTool();

        // Add delay to avoid rate limiting
        const now = Date.now();
        const lastSearchTime = global.lastSearchTime || 0;
        const timeElapsed = now - lastSearchTime;

        if (timeElapsed < 3000) {
            // If less than 3 seconds since last search, wait
            const waitTime = 3000 - timeElapsed;
            console.log(`Rate limiting: waiting ${waitTime}ms before next Google Scholar search`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Execute the search
        const results = await scholarTool.invoke({ query: query, maxResults: 5 });

        // Update the last search time
        global.lastSearchTime = Date.now();

        // Cache the result
        global.googleScholarCache.set(cacheKey, results);

        return results;
    } catch (error) {
        console.error("Google Scholar search error:", error);
        return "No academic papers found. There was an error with the Google Scholar search.";
    }
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

// Create the research agent
const createResearchAgent = async (query: string, context: string, messages: any[] = []) => {
    try {
        // Get the models
        const groqModel = getGroqModel();
        const togetherModel = getTogetherModel();

        // If neither model is available, throw an error
        if (!groqModel && !togetherModel) {
            throw new Error("No AI models available. Please check your API keys for Groq and Together.ai.");
        }

        // Use Groq if available, otherwise fall back to Together.ai
        const model = groqModel || togetherModel;

        // Create tools
        const academicSearchTool = createAcademicSearchTool();

        // Use a simpler sequential approach instead of a complex graph
        // First, get web search results
        console.log("Starting Wikipedia research for query:", query.substring(0, 50) + "...");
        let webResults = "No Wikipedia results available.";
        try {
            // Limit query to 300 characters for Wikipedia
            const limitedQuery = query.substring(0, 300);
            const wikipediaResults = await safeWebSearch(limitedQuery);

            // Wikipedia results are already formatted as text
            if (wikipediaResults && wikipediaResults.length > 0) {
                webResults = "Wikipedia search results:\n" + wikipediaResults;
            }
        } catch (error) {
            console.error("Error in Wikipedia research:", error);
            webResults = "Wikipedia search encountered an error.";
        }

        // Then, get academic search results
        console.log("Starting Google Scholar research for query:", query.substring(0, 50) + "...");
        let academicResults = "No academic results available.";
        try {
            // Limit query to a reasonable size
            const limitedQuery = query.substring(0, 300);
            const scholarResults = await safeAcademicSearch(limitedQuery);

            if (scholarResults && scholarResults.length > 0) {
                academicResults = "Google Scholar results:\n" + scholarResults;
            }
        } catch (error) {
            console.error("Error in Google Scholar research:", error);
            academicResults = "Google Scholar search encountered an error.";
        }

        // Combine results
        const combinedResults = `
Wikipedia Research Results:
${webResults}

Academic Research Results:
${academicResults}

Context:
${context}
`;

        // Generate a final response using the model
        console.log("Generating final response...");
        const response = await model.invoke([
            new SystemMessage(`You are a research agent that helps users find information.
Your goal is to provide comprehensive, accurate answers to research questions.
Think step by step and break down complex questions into smaller parts.
When you provide information, explain your reasoning process and cite your sources.
You have access to Wikipedia content and Google Scholar results to enhance your answers.`),
            ...messages.map((msg: any) =>
                msg.role === "user"
                    ? new HumanMessage(msg.content)
                    : new AIMessage(msg.content)
            ),
            new HumanMessage(`Question: ${query}\n\nHere is the research I've gathered:\n${combinedResults}
            
Please synthesize this information into a comprehensive answer to my question.`)
        ]);

        return response.content.toString();
    } catch (error) {
        console.error("Error in research agent:", error);
        return "Sorry, there was an error processing your request with the research agent.";
    }
};

export async function POST(req: NextRequest) {
    try {
        const { query, messages } = await req.json();

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

        // Record tool calls for demonstration
        const toolCalls = [
            {
                name: 'searchWikipedia',
                args: { query: query.substring(0, 300) } // Limit display query
            },
            {
                name: 'searchGoogleScholar',
                args: { query: query.substring(0, 300) } // Limit display query
            }
        ];

        // Get context for the agent
        let context = "";

        // Try to get results from Wikipedia
        try {
            // Limit the query to 300 characters
            const limitedQuery = query.substring(0, 300);
            const wikipediaResults = await safeWebSearch(limitedQuery);

            if (wikipediaResults && wikipediaResults.length > 0) {
                context += "Wikipedia search results:\n" + wikipediaResults;
            }
        } catch (error) {
            console.warn('Wikipedia search error:', error);
            // Add a fallback message to the context
            context += "Wikipedia search results could not be retrieved. Proceeding with available information.\n\n";
        }

        // Get Google Scholar results
        try {
            const limitedQuery = query.substring(0, 300);
            const scholarResults = await safeAcademicSearch(limitedQuery);

            if (scholarResults && scholarResults.length > 0) {
                context += "\nGoogle Scholar results:\n" + scholarResults;
            }
        } catch (error) {
            console.error('Error fetching Google Scholar results:', error);
        }

        // Generate a thread ID for this conversation
        const generatedThreadId = `thread-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

        // Run the research agent
        const result = await createResearchAgent(query, context, messages || []);

        return NextResponse.json({
            text: result,
            toolCalls,
            provider: 'LangChain Research Agent',
            threadId: generatedThreadId
        });
    } catch (error) {
        console.error('LangChain Agent API error:', error);
        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
} 