# 🧠 ResearchIQ – Voice-Powered Multi-Agent Research Assistant

ResearchIQ is an advanced research assistant built with Next.js, enabling sophisticated, voice-driven, multi-agent research workflows. It leverages a supervisor agent to coordinate specialized research and reasoning workers, incorporates Human-in-the-Loop (HITL) for query refinement, persists chat history for authenticated users, and primarily uses OpenRouter to access a variety of powerful Large Language Models. Voice interaction is powered by Vapi AI.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Supabase Setup](#supabase-setup)
  - [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Deployment](#deployment)

---

## Overview

ResearchIQ aims to provide a seamless and intelligent research experience. Users can interact with the system via voice or text to ask complex questions. An advanced supervisor agent then breaks down these queries and delegates tasks to specialized worker agents: a Research Worker for information gathering (using Wikipedia and Google Scholar) and a Reasoning Worker for analysis, summarization, and logical deduction. The system supports Human-in-the-Loop (HITL) interaction, allowing users to approve or refine search queries proposed by the Research Worker. Chat history is saved for authenticated users, and rate limiting is in place for fair usage.

---

## Key Features

-   **🗣️ Voice-Powered Interaction:** Seamless voice input and output facilitated by Vapi AI.
-   **🤖 Advanced Supervisor Agent:** Orchestrates tasks between specialized worker agents using LangGraph.
-   **🔍 Specialized Research Agent:** Gathers information using tools like Wikipedia and Google Scholar. Features Human-in-the-Loop (HITL) for confirming/editing search queries.
-   **💡 Specialized Reasoning Agent:** Performs logical analysis, summarization, and critical thinking on provided text or research findings.
-   **🎤 VoiceXpert Multi-Agent System:** A distinct mode utilizing multiple agents for in-depth research and comparison, accessible via voice.
-   **✋ Human-in-the-Loop (HITL):** Allows users to review and approve/edit search queries proposed by the Research Agent, ensuring more accurate and relevant information retrieval.
-   **💾 Chat Persistence:** Authenticated users have their conversation history saved via Supabase, allowing them to resume or review past research sessions.
-   **⏱️ Request Rate Limiting:** Implemented for both anonymous and authenticated users using Upstash Redis to ensure fair usage.
-   **🔄 Multi-LLM Access:** Primarily uses OpenRouter to access a variety of state-of-the-art LLMs for different agent capabilities.

---

## Tech Stack

-   **Frontend:** Next.js, React, Tailwind CSS (styling via CSS Modules)
-   **Backend:** Next.js API Routes
-   **AI/Agents:** LangChain.js, LangGraph.js
-   **LLM Access:** OpenRouter (primary for core agents)
-   **Voice:** Vapi AI
-   **Database & Auth:** Supabase
    -   Authentication (Supabase Auth)
    -   Chat Persistence (Supabase Postgres)
-   **Rate Limiting & Checkpointing:** Redis (Upstash)
-   **Deployment:** Vercel (example)

---

## Getting Started

Follow these instructions to set up and run ResearchIQ locally.

### Prerequisites

-   Node.js (>= 18.x recommended)
-   npm, yarn, pnpm, or bun (npm is used in examples)
-   Git
-   A [Supabase](https://supabase.com/) project (for Authentication and Database)
-   An [Upstash](https://upstash.com/) Redis instance (or other Redis provider compatible with `@upstash/redis`)
-   API Keys (see Environment Variables section)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/researchiq.git # Replace with actual URL
    ```
2.  Navigate to the project directory:
    ```bash
    cd researchiq
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

### Environment Variables

1.  Copy the `.env.example` file to a new file named `.env.local`:
    ```bash
    cp .env.example .env.local
    ```
2.  Update `.env.local` with your specific credentials and API keys. Refer to `.env.example` for the full list. Key variables include:

    *   `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
    *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase project anon key.
    *   `OPENROUTER_API_KEY`: **Primary API key for most agents.** Used to access various LLMs via OpenRouter.
    *   `SERPAPI_API_KEY`: For Google Scholar search functionality within the Research Agent.
    *   `UPSTASH_REDIS_REST_URL`: URL for your Upstash Redis instance (for rate limiting and LangGraph checkpointer).
    *   `UPSTASH_REDIS_REST_TOKEN`: Access token for your Upstash Redis instance.
    *   `NEXT_PUBLIC_VAPI_API_KEY`: Your Vapi public API key for client-side voice features.
    *   `NEXT_PUBLIC_VAPI_ASSISTANT_ID`: Your Vapi assistant ID.
    *   `NEXT_PUBLIC_BASE_URL`: The base URL of your application (default: `http://localhost:3000`).
    *   *Optional/Legacy Keys (for the standalone `/api/research` route if used):*
        *   `MISTRAL_API_KEY`: For direct Mistral API usage.
        *   `GROQ_API_KEY`: For direct Groq API usage.
        *   `TOGETHER_API_KEY`: For direct Together.ai API usage.

### Supabase Setup

1.  Log into your [Supabase account](https://app.supabase.io) and create a new project if you haven't already.
2.  Navigate to the **SQL Editor** in your Supabase project dashboard (usually under "Database").
3.  Run the following SQL commands to create the `chat_messages` table and enable Row Level Security (RLS) for chat persistence:

    ```sql
    -- Required: Enable UUID extension if not already enabled
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

    -- Table for storing chat messages
    CREATE TABLE IF NOT EXISTS public.chat_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES auth.users(id) NOT NULL,
        conversation_id UUID NOT NULL,
        message_order INTEGER NOT NULL,
        role TEXT NOT NULL, -- 'user', 'assistant', 'system', 'human'
        content TEXT NOT NULL,
        provider TEXT, -- e.g., 'Advanced Supervisor', 'ResearchWorker', 'User'
        tool_calls JSONB,
        thread_id TEXT, -- Agent-specific thread_id (e.g., for LangGraph supervisor or workers)
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        metadata JSONB,

        UNIQUE (conversation_id, message_order)
    );

    -- Enable Row Level Security (RLS)
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

    -- Policy: Users can only manage their own messages.
    CREATE POLICY "User can manage own chat messages"
    ON public.chat_messages
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_chat_messages_user_conv_order ON public.chat_messages (user_id, conversation_id, message_order);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_user_updated_at ON public.chat_messages (user_id, updated_at DESC); -- For listing conversations

    -- Function to update updated_at timestamp
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Trigger to update updated_at on row modification
    CREATE TRIGGER handle_chat_messages_updated_at
    BEFORE UPDATE ON public.chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
    ```

### Running the Application

1.  Start the development server:
    ```bash
    npm run dev
    ```
2.  Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

-   `/app/api`: Backend API routes, including agents and supervisor.
    -   `/app/api/advanced-supervisor`: The main supervisor agent.
    -   `/app/api/langchain-agent`: Research worker with HITL.
    -   `/app/api/reasoning-agent`: Reasoning worker.
    -   `/app/api/multi-agent`: VoiceXpert multi-agent system.
    -   `/app/api/chat/conversations`: Chat persistence endpoints.
-   `/app/components`: React components for the UI.
    -   `ChatContent.tsx`: Core chat interface component.
-   `/app/context`: React context providers (e.g., `AuthContext`).
-   `/app/lib`: Utility functions and Supabase client setup.
-   `/middleware.ts`: Handles request middleware, including rate limiting.

---

## Troubleshooting

-   **Missing API Keys:** Ensure all required API keys (especially `OPENROUTER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SERPAPI_API_KEY`, `NEXT_PUBLIC_VAPI_API_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID`) are correctly set in your `.env.local` file.
-   **Supabase RLS:** Double-check that Row Level Security is enabled for the `chat_messages` table and the policy is correctly applied.
-   **Redis Connection:** Verify your Upstash Redis URL and Token are correct if rate limiting or checkpointer features are failing.
-   **OAuth Callbacks:** If using social logins with Supabase, ensure your callback URLs are correctly configured in your Supabase project settings and any relevant OAuth provider dashboards.
-   **Database Schema:** Make sure you've run the SQL provided in the "Supabase Setup" section.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Deployment

The easiest way to deploy this Next.js application is using [Vercel](https://vercel.com/new).

-   Connect your Git repository to Vercel.
-   Configure all the necessary Environment Variables in your Vercel project settings.
-   Ensure your Supabase and Upstash instances are accessible from Vercel's servers.
-   Build command: `npm run build` (or equivalent for your package manager).
-   Output directory: `.next` (standard for Next.js).

---
