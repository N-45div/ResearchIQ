import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ChatOpenAI } from "@langchain/openai"; // Changed from ChatGroq
import { DynamicTool } from "@langchain/core/tools";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { SERPGoogleScholarAPITool } from "@langchain/community/tools/google_scholar";
import { createReactAgent, Command } from "@langchain/langgraph/prebuilt"; // Added for ReAct Agent
import { MemorySaver } from "@langchain/langgraph/checkpoint"; // For HITL
import { interrupt } from "@langchain/langgraph"; // For HITL
import { v4 as uuidv4 } from 'uuid'; // For thread IDs
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
        throw new Error(`Google Scholar search failed: ${error instanceof Error ? error.message : String(error)}`);
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
        throw new Error(`Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Define a type for the structured return of the research worker
type ResearchWorkerOutput = {
    status: 'completed' | 'interrupted' | 'error';
    message?: string; // Used for completed answer or error message
    thread_id: string;
    interrupt_data?: any;
    provider?: string;
};

// Internal function containing the core agent logic
async function _executeResearchAgent(
    query: string,
    messageHistory: any[] = [],
    thread_id_input?: string,
    isResume?: boolean,
    resume_payload?: any
): Promise<ResearchWorkerOutput> {
    const current_thread_id = thread_id_input || uuidv4();
    try {
        const openrouterApiKey = process.env.OPENROUTER_API_KEY;
        if (!openrouterApiKey) {
            console.error("OPENROUTER_API_KEY is not set. Langchain agent will not function correctly.");
            throw new Error("API configuration error: OpenRouter API key is not set.");
        }

        const modelName = "mistralai/mistral-7b-instruct:free"; // Default OpenRouter model

        const llm = new ChatOpenAI({
            modelName: modelName,
            openAIApiKey: openrouterApiKey,
            configuration: {
                baseURL: "https://openrouter.ai/api/v1",
            },
            temperature: 0.2,
        });
        const model = llm;

        const wikipediaToolForAgent = new DynamicTool({
            name: "search_wikipedia",
            description: "Search Wikipedia for general information, definitions, and facts. Input should be a concise search query. This tool may require human approval for the proposed search query.",
            func: async (inputQuery: string) => {
                console.log(`Wikipedia tool: Proposed query by LLM: ${inputQuery}`);
                const humanFeedback = await interrupt(
                    { // Data to send to the client for the human to review
                        type: "tool_confirmation",
                        tool_name: "search_wikipedia",
                        proposed_query: inputQuery,
                    }
                );

                // humanFeedback is what we get when the graph is resumed.
                // For this initial setup, assume humanFeedback IS the query string to use if it's a string.
                // Or it could be an object like { approvedQuery: "..." } or { status: "rejected" }
                console.log("Wikipedia tool: Received human feedback:", humanFeedback);

                let queryToExecute = "";
                if (typeof humanFeedback === 'string' && humanFeedback.trim() !== "") {
                    queryToExecute = humanFeedback;
                } else if (humanFeedback && typeof (humanFeedback as any).approvedQuery === 'string') {
                    queryToExecute = (humanFeedback as any).approvedQuery;
                } else if (humanFeedback && (humanFeedback as any).status === 'rejected') {
                    console.log("Wikipedia tool: Human rejected the query.");
                    return "Human chose not to proceed with Wikipedia search.";
                } else {
                    console.log("Wikipedia tool: Human did not provide a valid query or rejected. Using original LLM query.");
                    // Fallback to original query if feedback is not actionable or not provided in expected format.
                    // Or, could return a message indicating rejection/no action.
                    // For this iteration, let's be strict: if feedback isn't an approved query string, reject.
                    return "Wikipedia search was not executed due to unclear or missing human approval for the query.";
                }

                console.log(`Wikipedia tool: Executing with query: ${queryToExecute}`);
                return safeWebSearch(queryToExecute);
            },
        });

        const scholarToolForAgent = new DynamicTool({
            name: "search_google_scholar",
            description: "Search Google Scholar for academic papers, research articles, and citations. Input should be a concise search query.",
            func: async (input: string) => safeAcademicSearch(input),
        });
        const tools = [wikipediaToolForAgent, scholarToolForAgent];

        const agentSystemPromptText =
`You are a helpful research assistant. Your goal is to answer the user's query accurately and comprehensively by gathering information using the available tools.

Available Tools:
1.  **search_wikipedia**: Use this for general information, definitions, facts, and overviews.
2.  **search_google_scholar**: Use this for academic research, papers, specific studies, and in-depth scholarly information.

Follow these steps:
1.  Analyze the user's query to understand the information needed.
2.  Decide which tool is most appropriate. If unsure, you can try Wikipedia first for general context. For academic topics, prefer Google Scholar. You can use multiple tools if necessary.
3.  Formulate a concise and effective search query for the chosen tool.
4.  Execute the search using the tool.
5.  Review the search results. If the initial search is not sufficient, refine your query or try the other tool.
6.  Once you have gathered enough information, synthesize it into a comprehensive answer to the user's original query.
7.  If you use information from a tool, briefly mention which tool it came from (e.g., "According to Wikipedia..." or "A study found on Google Scholar indicates..."). Do not cite the tool directly as if it's a person.
Please provide the final answer directly without explaining your internal thought process too much, unless the thought process itself is the answer (e.g. "how to research X topic").`;

        const checkpointer = new MemorySaver();

        const reactAgent = createReactAgent({
            llm: model,
            tools,
            checkpointer,
            // System prompt for ReAct agent is typically part of the initial messages.
        });

        let threadIdToUse = thread_id || uuidv4();
        const agentConfig = { configurable: { thread_id: threadIdToUse } };

        const agentMessages: BaseMessage[] = [ // Ensure BaseMessage type for array
            new SystemMessage(agentSystemPromptText),
            ...messageHistory.map((msg: any) =>
                msg.role === "user" || msg.role === "human"
                    ? new HumanMessage({ content: msg.content })
                    : new AIMessage({ content: msg.content })
            ),
            // If resuming, the human_input (resume_payload) might be the user's feedback.
            // For initial query, it's the main query.
            // The Command for resume is handled by passing it as the first arg to stream/batch.
        ];

        // Add the current query if it's not a resume operation
        // For resume, the Command object takes the place of messages.
        let streamInput: any;
        // Ensure BaseMessage array for initial messages
        const initialMessagesForNewRun: BaseMessage[] = [
            new SystemMessage(agentSystemPromptText),
            ...messageHistory.map((msg: any) =>
                msg.role === "user" || msg.role === "human"
                    ? new HumanMessage({ content: msg.content })
                    : new AIMessage({ content: msg.content })
            ),
            new HumanMessage({ content: query })
        ];

        if (isResume) {
            console.log(`Resuming ReAct agent with thread ID: ${threadIdToUse}. Resume payload:`, resume_payload);
            streamInput = new Command({ resume: resume_payload === undefined ? null : resume_payload });
        } else {
            console.log(`Starting new ReAct agent run with thread ID: ${threadIdToUse}. Query:`, query?.substring(0,50) + "...");
            streamInput = { messages: initialMessagesForNewRun };
        }

        const stream = await reactAgent.stream(streamInput, agentConfig);
        let lastMessageContent: string | null = null;

        for await (const event of stream) {
            if (event.event === "on_chain_end" && event.name === "LangGraph") {
                if (event.data?.output?.messages) {
                    const messagesOutput: BaseMessage[] = event.data.output.messages;
                    if (messagesOutput.length > 0) {
                        const lastMsg = messagesOutput[messagesOutput.length - 1];
                        if (lastMsg._getType() === "ai" && lastMsg.content) {
                            lastMessageContent = lastMsg.content.toString();
                        }
                    }
                }
            }
        }

        const snapshot = await checkpointer.get(agentConfig);
        if (snapshot && snapshot.status === "suspended") {
             console.log("Agent suspended, HITL required. Thread ID:", threadIdToUse);
             // Attempt to extract the interrupt data (payload passed to interrupt() in the tool)
             let extractedInterruptPayload: any = {
                message: "Waiting for human input.",
                details: "Tool execution paused for review. Specific query details might not be available in this snapshot."
             };

            // The `snapshot.values.messages` should contain the history, including the AIMessage that decided to call the tool.
            const messagesInState = snapshot.values?.messages as AIMessage[] | undefined;
            if (messagesInState && Array.isArray(messagesInState) && messagesInState.length > 0) {
                const lastAiMessage = [...messagesInState].reverse().find(msg => msg._getType() === "ai" && msg.tool_calls && msg.tool_calls.length > 0) as AIMessage | undefined;

                if (lastAiMessage && lastAiMessage.tool_calls && lastAiMessage.tool_calls.length > 0) {
                    const lastToolCall = lastAiMessage.tool_calls[lastAiMessage.tool_calls.length - 1];
                    if (lastToolCall && lastToolCall.name === "search_wikipedia") {
                         let proposedQueryFromArgs = "";
                         if (typeof lastToolCall.args === 'string') {
                             proposedQueryFromArgs = lastToolCall.args;
                         } else if (lastToolCall.args && typeof lastToolCall.args.input === 'string') {
                             proposedQueryFromArgs = lastToolCall.args.input;
                         } else if (lastToolCall.args && typeof lastToolCall.args.query === 'string') { // Common for search tools
                             proposedQueryFromArgs = lastToolCall.args.query;
                         } else if (lastToolCall.args && Object.keys(lastToolCall.args).length > 0) {
                            const argKeys = Object.keys(lastToolCall.args);
                            if (argKeys.length === 1 && typeof (lastToolCall.args as any)[argKeys[0]] === 'string') {
                                proposedQueryFromArgs = (lastToolCall.args as any)[argKeys[0]];
                            } else {
                                // Fallback for complex args, though DynamicTool usually takes simple string or object with known keys
                                proposedQueryFromArgs = JSON.stringify(lastToolCall.args);
                            }
                         }

                         if (proposedQueryFromArgs) {
                             extractedInterruptPayload = {
                                 type: "tool_confirmation",
                                 tool_name: "search_wikipedia", // This is known as we are in the Wikipedia tool's logic path
                                 proposed_query: proposedQueryFromArgs,
                             };
                             console.log("Extracted interrupt_data from last AIMessage tool_call:", extractedInterruptPayload);
                         } else {
                             console.warn("Could not determine proposed_query from last tool_call args for search_wikipedia:", lastToolCall.args);
                         }
                    }
                }
            }
            return {
                 type: "interrupted",
                 thread_id: threadIdToUse,
                 interrupt_data: extractedInterruptPayload
            };
        }

        if (lastMessageContent) {
            return { type: "completed", answer: lastMessageContent, thread_id: threadIdToUse };
        } else {
             console.warn("No final answer found from ReAct agent stream. Thread ID:", threadIdToUse);
            // This might happen if the graph was interrupted and not handled above, or if it ended unexpectedly.
            // If it was a valid interruption, the `snapshot.status === "suspended"` should catch it.
            // If it's not suspended but no AIMessage, it's an issue.
            if (snapshot && snapshot.status === "error") {
                throw new Error(`Agent graph error for thread ${threadIdToUse}: ${snapshot.error}`);
            }
             return { type: "completed", answer: "Agent finished but no content found.", thread_id: threadIdToUse };
        }

    } catch (error) {
        console.error("Error in ReAct research agent:", error);
        // Ensure the return type matches what POST handler expects, even for errors.
        // This specific error is from within createResearchAgent, not an HTTP error.
        throw error;
    }
}

// Exportable worker function
export async function invokeResearchWorker(input: {
    query: string,
    messages?: BaseMessage[],
    thread_id?: string,
    resume_payload?: any,
    isResume?: boolean
}): Promise<ResearchWorkerOutput> {
    const { query, messages = [], thread_id, resume_payload, isResume = false } = input;
    const workerThreadId = thread_id || uuidv4(); // Use provided or generate new

    try {
        // API key check should be done before calling _executeResearchAgent or inside it early.
        // _executeResearchAgent already throws if OPENROUTER_API_KEY is not set.

        const result = await _executeResearchAgent(
            query,
            messages,
            workerThreadId,
            isResume,
            resume_payload
        );

        // Adapt the result from _executeResearchAgent to ResearchWorkerOutput
        if (result.type === "interrupted") {
            return {
                status: 'interrupted',
                thread_id: result.thread_id,
                interrupt_data: result.interrupt_data,
                provider: 'LangGraph ReAct Agent (HITL)'
            };
        } else if (result.type === "completed") {
            return {
                status: 'completed',
                message: result.answer,
                thread_id: result.thread_id,
                provider: 'LangGraph ReAct Agent (HITL)'
            };
        }
        // This case should ideally not be reached if _executeResearchAgent is robust.
        console.error("invokeResearchWorker: Unknown result type from _executeResearchAgent", result);
        return {
            status: 'error',
            message: 'Unknown error or result type from agent execution.',
            thread_id: workerThreadId,
            provider: 'LangGraph ReAct Agent (HITL)'
        };

    } catch (error: any) {
        console.error('invokeResearchWorker: Error during agent execution:', error);
        return {
            status: 'error',
            message: error.message || 'An unexpected error occurred in the research worker.',
            thread_id: workerThreadId,
            provider: 'LangGraph ReAct Agent (HITL)'
        };
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, messages, thread_id, resume_payload } = body;

        const isResume = !!(thread_id && resume_payload !== undefined); // resume_payload can be null

        if (!isResume && !query) {
            return NextResponse.json({ error: 'Query is required for new conversations' }, { status: 400 });
        }
        if (!process.env.OPENROUTER_API_KEY) {
            return NextResponse.json(
                { error: 'API configuration error: OpenRouter API key is not set.' },
                { status: 500 }
            );
        }

        const workerInput = {
            query: query || "", // query can be empty for resume, but worker might need it based on design
            messages: messages || [],
            thread_id: thread_id, // Pass along; invokeResearchWorker will generate if null/undefined
            resume_payload: resume_payload,
            isResume: isResume
        };

        const result = await invokeResearchWorker(workerInput);

        if (result.status === "interrupted") {
            return NextResponse.json({
                type: "interrupted", // Keep 'type' for client compatibility if needed, or switch to 'status'
                thread_id: result.thread_id,
                interrupt_data: result.interrupt_data,
                provider: result.provider
            });
        } else if (result.status === "completed") {
            return NextResponse.json({
                text: result.message, // 'text' for client compatibility
                provider: result.provider,
                thread_id: result.thread_id
            });
        } else { // status === 'error'
            return NextResponse.json({
                error: result.message,
                thread_id: result.thread_id
            }, { status: 500 });
        }

    } catch (error: any) {
        console.error('LangChain Agent API POST Error:', error);
        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
} 