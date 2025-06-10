import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, MessagesState } from "@langchain/langgraph"; // Using MessagesState for simplicity
import { START, END, interrupt, Command } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph/checkpoint";
import { v4 as uuidv4 } from 'uuid';

import { invokeResearchWorker, ResearchWorkerOutput } from '../langchain-agent/route';
import { invokeReasoningWorker } from '../reasoning-agent/route';

// Define the state for the supervisor graph
// MessagesState is { messages: { value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y), default: () => [] } }
// We might extend this if we need more specific state fields for HITL later.
const graphStateDefinition = MessagesState;

// Initialize Supervisor LLM
const openrouterApiKey = process.env.OPENROUTER_API_KEY;
let supervisorLlm: ChatOpenAI;
if (openrouterApiKey) {
    supervisorLlm = new ChatOpenAI({
        modelName: "meta-llama/llama-3-8b-instruct:free", // Or another capable model
        openAIApiKey: openrouterApiKey,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
        temperature: 0.2,
        streaming: true, // Important for stream()
    });
} else {
    console.error("OPENROUTER_API_KEY is not set. Supervisor LLM cannot be initialized.");
    // Subsequent calls will fail if supervisorLlm is not initialized.
    // The POST handler should also check for the API key.
}

// Initialize Checkpointer
const checkpointer = new MemorySaver();

// Supervisor Node: Decides the next action
async function supervisorNode(state: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }> {
    if (!supervisorLlm) {
        throw new Error("Supervisor LLM not initialized due to missing API key.");
    }
    console.log("Supervisor Node: Evaluating state...", state.messages.slice(-3));

    const lastMessage = state.messages[state.messages.length - 1];
    let userQuery = "";
    if (lastMessage instanceof HumanMessage) {
        userQuery = lastMessage.content.toString();
    } else if (state.messages.length === 1 && lastMessage instanceof HumanMessage) { // Initial call
        userQuery = lastMessage.content.toString();
    } else {
        // If last message isn't human (e.g. worker response), supervisor needs to decide based on history
        userQuery = "Review the conversation and decide the next step.";
    }

    const supervisorPrompt = `You are a supervisor coordinating two specialist workers:
1.  ResearchWorker: Call this worker by responding with "DELEGATE: research_worker; TASK: [detailed research query]". Use for web research, data gathering using Wikipedia or Google Scholar. This worker may pause for human input. If it pauses, you will be informed before its output is passed back to you.
2.  ReasoningWorker: Call this worker by responding with "DELEGATE: reasoning_worker; TASK: [detailed reasoning query, potentially including text from ResearchWorker]". Use for logical analysis, summarization, or refining information.

Based on the user's query and conversation history:
- If the query needs information lookup or new data, delegate to ResearchWorker.
- If the query needs analysis, summarization of existing information (e.g., from ResearchWorker or user), or logical reasoning, delegate to ReasoningWorker.
- If enough information is gathered and analyzed, respond with "FINALIZE: [your comprehensive answer to the user]".
- If a worker (like ResearchWorker) was interrupted for human input, and you are now being asked to decide after it was resumed, the worker's output will be in the history. Use it to decide the next step.

User Query/Last Input: ${userQuery}
Conversation History (last 3 messages):
${state.messages.slice(-3).map(msg => `${msg._getType()}: ${msg.content}`).join("\n")}

Your decision (DELEGATE: research_worker; TASK: ..., DELEGATE: reasoning_worker; TASK: ..., or FINALIZE: ...):`;

    const response = await supervisorLlm.invoke([new HumanMessage(supervisorPrompt)]);
    console.log("Supervisor Node LLM Response:", response.content.toString());
    return { messages: [new AIMessage({ content: response.content.toString(), name: "supervisorDecision" })] };
}

// Research Worker Node
async function researchWorkerNode(state: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }> {
    console.log("Research Worker Node: Processing...");
    const lastMessage = state.messages[state.messages.length - 1];
    let task = "";
    if (lastMessage.name === "supervisorDecision" && typeof lastMessage.content === 'string' && lastMessage.content.includes("DELEGATE: research_worker; TASK:")) {
        task = lastMessage.content.split("TASK:")[1]?.trim() || "";
    }

    if (!task) {
        console.log("Research Worker Node: No valid task found from supervisor.");
        return { messages: [new AIMessage("ResearchWorker: No task provided or error in task format.")] };
    }

    console.log("Research Worker Node: Invoking with task - ", task);
    // For research worker, we might not need to pass full message history,
    // as it starts its own LangGraph ReAct agent which has its own memory.
    // However, the supervisor's task (query) is crucial.
    const workerResult: ResearchWorkerOutput = await invokeResearchWorker({ query: task });

    if (workerResult.status === 'interrupted') {
        console.log("Research Worker Node: Interrupted. Payload for client:", workerResult.interrupt_data);
        // Signal graph interruption. The supervisor's graph needs to be suspended.
        // The payload passed to interrupt() here is what the client needs to see for THIS interruption.
        await interrupt(workerResult.interrupt_data || { message: "Research worker interrupted" });
        // After interrupt, the graph pauses. When resumed, the value provided to resume
        // will NOT directly come back here. This node will re-run if the supervisor routes back.
        // For now, we indicate interruption. The supervisor will see the graph is suspended.
        // The actual interrupt_data for the client should be handled by the main POST handler
        // when it detects the 'suspended' state after this node calls interrupt().
        return { messages: [new AIMessage({ content: `ResearchWorker: Interrupted. Waiting for human input. Worker Thread ID: ${workerResult.thread_id}`, name: "research_worker_output" })] };
    } else if (workerResult.status === 'error') {
        console.error("Research Worker Node: Error - ", workerResult.message);
        return { messages: [new AIMessage({ content: `ResearchWorker Error: ${workerResult.message}`, name: "research_worker_output" })] };
    } else {
        console.log("Research Worker Node: Completed. Result - ", workerResult.message?.substring(0,100));
        return { messages: [new AIMessage({ content: workerResult.message || "ResearchWorker: No content.", name: "research_worker_output" })] };
    }
}

// Reasoning Worker Node
async function reasoningWorkerNode(state: { messages: BaseMessage[] }): Promise<{ messages: BaseMessage[] }> {
    console.log("Reasoning Worker Node: Processing...");
    const lastSupervisorMessage = state.messages.find(msg => msg.name === "supervisorDecision");
    const researchWorkerOutputMessages = state.messages.filter(msg => msg.name === "research_worker_output");

    let task = "";
    let contextText = "";

    if (lastSupervisorMessage && typeof lastSupervisorMessage.content === 'string' && lastSupervisorMessage.content.includes("DELEGATE: reasoning_worker; TASK:")) {
        task = lastSupervisorMessage.content.split("TASK:")[1]?.trim() || "";
    }

    if (researchWorkerOutputMessages.length > 0) {
        contextText = researchWorkerOutputMessages.map(msg => msg.content.toString()).join("\n\n");
    }

    if (!task) {
        // If no explicit task, maybe summarize or reason about the last content from research worker or user.
        const lastMessageContent = state.messages[state.messages.length -1]?.content.toString();
        if (lastMessageContent && lastMessageContent !== state.messages.findLast(m => m.name === "supervisorDecision")?.content.toString()) {
            task = `Analyze and summarize the following: ${lastMessageContent}`;
        } else {
             console.log("Reasoning Worker Node: No valid task or context found.");
            return { messages: [new AIMessage("ReasoningWorker: No task or sufficient context provided.")] };
        }
    }

    console.log("Reasoning Worker Node: Invoking with task - ", task.substring(0,100), " and context length - ", contextText.length);
    const workerResult = await invokeReasoningWorker({ query: task, context_text: contextText });

    if (workerResult.error) {
        console.error("Reasoning Worker Node: Error - ", workerResult.error);
        return { messages: [new AIMessage({ content: `ReasoningWorker Error: ${workerResult.error}`, name: "reasoning_worker_output" })] };
    } else {
        console.log("Reasoning Worker Node: Completed. Result - ", workerResult.answer.substring(0,100));
        return { messages: [new AIMessage({ content: workerResult.answer, name: "reasoning_worker_output" })] };
    }
}

// Conditional Router
function router(state: { messages: BaseMessage[] }): "research_worker" | "reasoning_worker" | "END" {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && lastMessage.name === "supervisorDecision" && typeof lastMessage.content === 'string') {
        const content = lastMessage.content;
        console.log("Router: Evaluating supervisor decision - ", content.substring(0,100));
        if (content.startsWith("DELEGATE: research_worker")) {
            return "research_worker";
        } else if (content.startsWith("DELEGATE: reasoning_worker")) {
            return "reasoning_worker";
        } else if (content.startsWith("FINALIZE:")) {
            return END;
        }
    }
    console.log("Router: Defaulting to END or re-prompt supervisor if stuck.");
    // If no clear decision, or if a worker just finished, it might loop back to supervisor implicitly if edge is set.
    // If stuck, could add a path back to supervisor or end. For now, ending if no clear path.
    // However, edges are research_worker -> supervisor, reasoning_worker -> supervisor. So supervisor runs again.
    // This router is primarily for supervisor's decision.
    return END; // Should ideally not be reached if supervisor always makes a valid choice.
}


// Define the graph
const workflow = new StateGraph<SupervisorState>({ channels: graphStateDefinition });

workflow.addNode("supervisor", supervisorNode);
workflow.addNode("research_worker", researchWorkerNode);
workflow.addNode("reasoning_worker", reasoningWorkerNode);

workflow.addEntryPoint("supervisor");

workflow.addConditionalEdges(
    "supervisor",
    router,
    {
        "research_worker": "research_worker",
        "reasoning_worker": "reasoning_worker",
        [END]: END,
    }
);

workflow.addEdge("research_worker", "supervisor");
workflow.addEdge("reasoning_worker", "supervisor");

// Compile the graph
const app = workflow.compile({ checkpointer });

// POST handler
export async function POST(req: NextRequest) {
    let requestBody;
    try {
        requestBody = await req.json();
    } catch (e) {
        return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    const { query, messages: messageHistory = [], thread_id, resume_payload } = requestBody;
    const isResume = !!(thread_id && resume_payload !== undefined);
    const currentThreadId = thread_id || uuidv4();

    if (!openrouterApiKey) {
         return NextResponse.json({ error: "API configuration error: OpenRouter API key is not set for the supervisor." }, { status: 500 });
    }
    if (!isResume && !query) {
        return NextResponse.json({ error: "Query is required for new conversations." }, { status: 400 });
    }

    const config = { configurable: { thread_id: currentThreadId } };
    let finalOutput: any = null;
    let outputMessages: BaseMessage[] = [];

    try {
        if (isResume) {
            console.log(`Supervisor POST: Resuming thread ${currentThreadId} with payload:`, resume_payload);
            // For resuming, the input to stream can be the resume_payload directly if the interrupt is waiting for a value,
            // or null if the Command handles it. LangGraph's `Command` is typically used as the input itself.
            const stream = await app.stream(new Command({ resume: resume_payload }), config);
            for await (const event of stream) {
                // Stream events on resume might be minimal until the graph produces new messages or ends.
                if (event.messages) {
                    outputMessages.push(...event.messages);
                }
            }
        } else {
            console.log(`Supervisor POST: Starting new thread ${currentThreadId} with query: ${query}`);
            const initialMessages: BaseMessage[] = [new HumanMessage({ content: query })];
            if (messageHistory.length > 0) {
                initialMessages.unshift(...messageHistory); // Add history before current query for context
            }
            const stream = await app.stream({ messages: initialMessages }, config);
            for await (const event of stream) {
                 // Assuming 'messages' is the key for message events from the stream
                if (event.messages) {
                    outputMessages.push(...event.messages);
                }
            }
        }

        const snapshot = await checkpointer.get(config);
        if (snapshot && snapshot.status === "suspended") {
            console.log("Supervisor POST: Graph suspended for thread", currentThreadId);
            // Extract the specific data passed to interrupt() by research_worker_node
            // This is challenging as it's not directly in the snapshot's top-level.
            // For now, the client needs to remember the context of the interruption.
            // The research_worker_node's interrupt call defined the payload.
            // The 'interrupt_data' here should ideally be that payload.
            // This requires a mechanism for the research_worker_node to actually output this data
            // when it calls interrupt.
            // For now, we'll use a placeholder or try to get it from the last AIMessage if it contains it.

            // A potential way: If the research_worker_node, before calling interrupt(),
            // adds its interrupt_payload to the state, we could retrieve it here.
            // Let's assume the `interrupt_data` from `research_worker_node` is in the last message if it interrupted.
            const lastMsg = outputMessages[outputMessages.length -1];
            let returnedInterruptData = { message: "Waiting for human input via supervisor." };
            if (lastMsg && lastMsg.name === "research_worker_output" && lastMsg.content.toString().includes("Interrupted")) {
                // This is a weak inference. Better to have structured data.
                // The research_worker_node should have passed the actual interrupt_data to its interrupt call.
                // That data is what needs to be sent to the client.
                // This current logic doesn't properly capture it.
                // TODO: Refine interrupt_data propagation from worker node's interrupt() call.
            // For now, we will try to extract it from the last AI message if it was a tool call leading to interrupt.
            // This assumes the interrupt happened in the research_worker_node for the wikipedia tool.
            let finalInterruptData = { message: "Waiting for human input via supervisor.", details: "A worker requires attention." };

            const messagesInState = snapshot.values?.messages as AIMessage[] | undefined;
            if (messagesInState && Array.isArray(messagesInState) && messagesInState.length > 0) {
                const lastAiMessage = [...messagesInState].reverse().find(msg => msg._getType() === "ai" && msg.tool_calls && msg.tool_calls.length > 0) as AIMessage | undefined;
                if (lastAiMessage && lastAiMessage.tool_calls && lastAiMessage.tool_calls.length > 0) {
                    const lastToolCall = lastAiMessage.tool_calls[lastAiMessage.tool_calls.length - 1];
                    // This logic is specific to the research_worker's wikipedia tool being the source of interruption
                    if (lastToolCall && lastToolCall.name === "search_wikipedia") {
                         let proposedQueryFromArgs = "";
                         if (typeof lastToolCall.args === 'string') {
                             proposedQueryFromArgs = lastToolCall.args;
                         } else if (lastToolCall.args && typeof lastToolCall.args.input === 'string') {
                             proposedQueryFromArgs = lastToolCall.args.input;
                         } else if (lastToolCall.args && typeof lastToolCall.args.query === 'string') {
                             proposedQueryFromArgs = lastToolCall.args.query;
                         } else if (lastToolCall.args && Object.keys(lastToolCall.args).length > 0) {
                            const argKeys = Object.keys(lastToolCall.args);
                            if (argKeys.length === 1 && typeof (lastToolCall.args as any)[argKeys[0]] === 'string') {
                                proposedQueryFromArgs = (lastToolCall.args as any)[argKeys[0]];
                            } else {
                                proposedQueryFromArgs = JSON.stringify(lastToolCall.args);
                            }
                         }
                         if (proposedQueryFromArgs) {
                             finalInterruptData = {
                                 type: "tool_confirmation", // This structure matches what research_worker's tool expects
                                 tool_name: "search_wikipedia",
                                 proposed_query: proposedQueryFromArgs,
                             };
                             console.log("Supervisor POST: Extracted interrupt_data from snapshot:", finalInterruptData);
                         } else {
                            console.warn("Supervisor POST: Could not determine proposed_query from last tool_call for interrupt_data:", lastToolCall.args);
                         }
                    }
                }
            }

            return NextResponse.json({
                type: "interrupted",
                thread_id: currentThreadId,
                interrupt_data: finalInterruptData,
                messages: outputMessages // Send current messages for context
            });
        }

        // If not suspended, find the final response from the supervisor
        const lastAIMessage = [...outputMessages].reverse().find(m => m._getType() === "ai" && m.name !== "supervisorDecision");
        let responseText = "No final response from supervisor.";
        if (lastAIMessage && typeof lastAIMessage.content === 'string' && lastAIMessage.content.startsWith("FINALIZE:")) {
            responseText = lastAIMessage.content.replace("FINALIZE:", "").trim();
        } else if (lastAIMessage) {
            responseText = lastAIMessage.content.toString(); // Fallback to last AI message if not strictly "FINALIZE:"
        }

        return NextResponse.json({
            text: responseText,
            thread_id: currentThreadId,
            messages: outputMessages // Send full history for client to update
        });

    } catch (error: any) {
        console.error("Supervisor API Error:", error);
        return NextResponse.json(
            { error: "Internal server error: " + error.message, thread_id: currentThreadId },
            { status: 500 }
        );
    }
}
