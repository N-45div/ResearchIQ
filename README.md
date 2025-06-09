Here’s an improved and polished version of your README for **ResearchIQ**, incorporating your voice agent and multi-agent system while removing the “multi-modal” references:

---

# 🧠 ResearchIQ – Voice-Powered Multi-Agent Research Assistant

ResearchIQ is an advanced research assistant built with [Next.js](https://nextjs.org), enabling voice-driven, multi-agent research workflows. Powered by Vapi AI and leading LLM providers, it retrieves and compares scholarly information from sources like Wikipedia and Google Scholar—making expert research accessible through natural conversation.

---

## 🚀 Getting Started

### 1. Set Up Environment Variables

1. Copy `.env.example` to `.env.local`
2. Add the required API keys:

* [OpenRouter](https://openrouter.ai/) – for accessing multiple free models
* [Groq](https://groq.com/) – for LLaMA 3.3 70B model (preferred)
* [Together.ai](https://together.ai/) – fallback for Mixtral model
* [SerpAPI](https://serpapi.com/) – required for Google Scholar integration

> ⚠️ **Required for functionality**
> You must include at least one of:

* `GROQ_API_KEY`
* `TOGETHER_API_KEY`

For Google Scholar features:

* `SERPAPI_API_KEY`

Without these, fallback will be Wikipedia search only.

---

### 2. Start the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔧 AI Provider Configuration

### 🧩 OpenRouter

* API Key: `OPENROUTER_API_KEY`
* Models available:

  * deepseek/deepseek-r1
  * mistralai/devstral-small
  * meta-llama/llama-3.3-8b-instruct
  * qwen/qwen3-30b-a3b
  * others

### ⚡ Groq (Preferred for Expert Comparison)

* API Key: `GROQ_API_KEY`
* Optimal for high-speed LLaMA-3-based reasoning

### 🔁 Together.ai (Fallback)

* API Key: `TOGETHER_API_KEY`
* Supports Mixtral and other open models

### 🔍 SerpAPI

* API Key: `SERPAPI_API_KEY`
* Enables Google Scholar search support

---

## 🧠 Core Features

### 🔊 Voice-Powered Agent

Interact with the assistant using your voice, powered by [Vapi AI](https://www.vapi.ai/), for a seamless spoken research experience.

### 🧩 Multi-Agent Research System

Uses multiple specialized agents with LangChain to analyze, cross-check, and refine research results from varied sources.

### 📊 Expert Comparison Engine

Highlights differences and agreements across AI-generated expert responses, helping you evaluate complex topics critically.

---

## 🛠️ Troubleshooting

### API Key Errors

* Ensure your `.env.local` has the right keys.
* Check API key validity and quota.

### Groq Fallbacks

* If Groq is down, the system will auto-switch to Together.ai.

---

## 📚 Learn More

* [Next.js Docs](https://nextjs.org/docs)
* [Next.js Tutorial](https://nextjs.org/learn)
* [Next.js GitHub](https://github.com/vercel/next.js)

---

## ▲ Deploy on Vercel

Deploy easily using [Vercel](https://vercel.com/new?utm_source=create-next-app&utm_campaign=create-next-app-readme).

---

Let me know if you’d like to include usage examples, UI screenshots, or contribution guidelines too.
